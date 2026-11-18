begin;

create schema if not exists enrollment_private;
revoke all on schema enrollment_private from public, anon, authenticated;
grant usage on schema enrollment_private to authenticated, service_role;

create type public.enrollment_status as enum (
  'received', 'review', 'documents', 'waitlist', 'approved', 'declined', 'enrolled'
);

create table enrollment_private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table enrollment_private.staff enable row level security;

create function enrollment_private.is_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from enrollment_private.staff where user_id = (select auth.uid())
  )
$$;

create function public.is_enrollment_staff() returns boolean
language sql stable security invoker set search_path = ''
as $$ select enrollment_private.is_staff() $$;

create table public.enrollment_children (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  birth_date date not null check (birth_date >= date '1900-01-01' and birth_date <= current_date),
  created_at timestamptz not null default now()
);

create unique index enrollment_children_one_profile
  on public.enrollment_children (guardian_id, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')), birth_date);

create table public.enrollment_applications (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique default upper(replace(gen_random_uuid()::text, '-', '')),
  child_id uuid not null references public.enrollment_children(id) on delete cascade,
  guardian_id uuid not null references auth.users(id) on delete restrict,
  child_name text not null,
  birth_date date not null,
  guardian_name text not null check (char_length(btrim(guardian_name)) between 1 and 120),
  guardian_relationship text not null check (char_length(btrim(guardian_relationship)) between 1 and 80),
  guardian_phone text not null check (
    char_length(guardian_phone) <= 24 and guardian_phone ~ '^\+?[0-9 ()-]+$'
    and char_length(regexp_replace(guardian_phone, '[^0-9]', '', 'g')) between 10 and 13
  ),
  guardian_email text not null,
  school_year smallint not null check (school_year between 2020 and 2100),
  schedule text not null check (schedule in ('Tempo Parcial (Matutino)', 'Tempo Parcial (Vespertino)', 'Tempo Integral')),
  status public.enrollment_status not null default 'received',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(child_id, school_year)
);
create index enrollment_applications_guardian on public.enrollment_applications (guardian_id, id);
create index enrollment_applications_year on public.enrollment_applications (school_year, id);

create table public.enrollment_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.enrollment_applications(id) on delete cascade,
  status public.enrollment_status not null,
  family_message text not null default '' check (char_length(family_message) <= 500),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);
create index enrollment_history_application on public.enrollment_history (application_id, id);

revoke all on public.enrollment_children, public.enrollment_applications, public.enrollment_history
  from public, anon, authenticated;
grant select on public.enrollment_children, public.enrollment_applications to authenticated;
grant insert (full_name, birth_date), update (full_name, birth_date) on public.enrollment_children to authenticated;
grant select (id, application_id, status, family_message, changed_at) on public.enrollment_history to authenticated;

alter table public.enrollment_children enable row level security;
alter table public.enrollment_applications enable row level security;
alter table public.enrollment_history enable row level security;

create policy enrollment_children_read on public.enrollment_children for select to authenticated
  using (guardian_id = (select auth.uid()));
create policy enrollment_children_create on public.enrollment_children for insert to authenticated
  with check (guardian_id = (select auth.uid()));
create policy enrollment_children_update on public.enrollment_children for update to authenticated
  using (guardian_id = (select auth.uid())) with check (guardian_id = (select auth.uid()));
create policy enrollment_applications_read on public.enrollment_applications for select to authenticated
  using (guardian_id = (select auth.uid()) or (select enrollment_private.is_staff()));
create policy enrollment_history_read on public.enrollment_history for select to authenticated
  using (exists (select 1 from public.enrollment_applications a where a.id = application_id));

create function enrollment_private.submit_enrollment(
  p_child uuid, p_year smallint, p_schedule text,
  p_guardian_name text, p_relationship text, p_phone text
) returns table (id uuid, protocol text, created boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  v_child public.enrollment_children%rowtype;
  v_application public.enrollment_applications%rowtype;
  v_email text;
begin
  select * into v_child from public.enrollment_children c
    where c.id = p_child and c.guardian_id = (select auth.uid()) for no key update;
  if not found then
    raise exception using errcode = '42501', message = 'Cadastro da criança não encontrado.';
  end if;

  select email into v_email from auth.users where auth.users.id = (select auth.uid()) and email_confirmed_at is not null;
  if v_email is null then
    raise exception using errcode = '42501', message = 'Confirme o e-mail da conta.';
  end if;

  if p_year is null or p_year not between extract(year from timezone('America/Fortaleza', now()))::int
    and extract(year from timezone('America/Fortaleza', now()))::int + 1 then
    raise exception using errcode = '22023', message = 'Ano letivo inválido.';
  end if;

  insert into public.enrollment_applications as a (
    child_id, guardian_id, child_name, birth_date, guardian_name, guardian_relationship,
    guardian_phone, guardian_email, school_year, schedule
  ) values (
    p_child, v_child.guardian_id, btrim(v_child.full_name), v_child.birth_date, btrim(p_guardian_name),
    btrim(p_relationship), btrim(p_phone), v_email, p_year, p_schedule
  ) on conflict (child_id, school_year) do nothing returning a.* into v_application;

  if found then
    insert into public.enrollment_history (application_id, status, changed_by)
      values (v_application.id, 'received', v_child.guardian_id);
    return query select v_application.id, v_application.protocol, true;
  else
    return query select a.id, a.protocol, false
      from public.enrollment_applications a where a.child_id = p_child and a.school_year = p_year;
  end if;
end;
$$;

create function enrollment_private.decide_enrollment(
  p_application uuid, p_expected public.enrollment_status, p_next public.enrollment_status, p_message text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.enrollment_status;
  v_message text := btrim(coalesce(p_message, ''));
begin
  if not enrollment_private.is_staff() then
    raise exception using errcode = '42501', message = 'Acesso exclusivo da secretaria.';
  end if;
  select status into v_status from public.enrollment_applications where id = p_application for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solicitação não encontrada.';
  end if;
  if v_status is distinct from p_expected then
    raise exception using errcode = '40001', message = 'A situação já mudou. Atualize a lista.';
  end if;
  if not coalesce(case v_status
    when 'received' then p_next in ('review','documents','waitlist','approved','declined')
    when 'review' then p_next in ('documents','waitlist','approved','declined')
    when 'documents' then p_next in ('review','waitlist','approved','declined')
    when 'waitlist' then p_next in ('review','documents','approved','declined')
    when 'approved' then p_next in ('review','documents','enrolled','declined')
    when 'declined' then p_next = 'review'
    else false
  end, false) then
    raise exception using errcode = '22023', message = 'A mudança de situação não é permitida.';
  end if;
  if char_length(v_message) > 500 or (p_next = 'documents' and v_message = '') then
    raise exception using errcode = '22023', message = 'Informe à família quais documentos estão pendentes.';
  end if;
  update public.enrollment_applications set status = p_next, updated_at = now() where id = p_application;
  insert into public.enrollment_history (application_id, status, family_message, changed_by)
    values (p_application, p_next, v_message, (select auth.uid()));
end;
$$;

create function public.submit_enrollment(
  p_child uuid, p_year smallint, p_schedule text, p_guardian_name text, p_relationship text, p_phone text
) returns table (id uuid, protocol text, created boolean)
language sql security invoker set search_path = ''
as $$ select * from enrollment_private.submit_enrollment(p_child, p_year, p_schedule, p_guardian_name, p_relationship, p_phone) $$;

create function public.decide_enrollment(
  p_application uuid, p_expected public.enrollment_status, p_next public.enrollment_status, p_message text
) returns void
language sql security invoker set search_path = ''
as $$ select enrollment_private.decide_enrollment(p_application, p_expected, p_next, p_message) $$;

revoke execute on function enrollment_private.is_staff() from public, anon, authenticated;
revoke execute on function enrollment_private.submit_enrollment(uuid, smallint, text, text, text, text) from public, anon, authenticated;
revoke execute on function enrollment_private.decide_enrollment(uuid, public.enrollment_status, public.enrollment_status, text) from public, anon, authenticated;
grant execute on function enrollment_private.is_staff() to authenticated;
grant execute on function enrollment_private.submit_enrollment(uuid, smallint, text, text, text, text) to authenticated;
grant execute on function enrollment_private.decide_enrollment(uuid, public.enrollment_status, public.enrollment_status, text) to authenticated;

revoke execute on function public.is_enrollment_staff() from public, anon, authenticated;
revoke execute on function public.submit_enrollment(uuid, smallint, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.decide_enrollment(uuid, public.enrollment_status, public.enrollment_status, text) from public, anon, authenticated;
grant execute on function public.is_enrollment_staff() to authenticated;
grant execute on function public.submit_enrollment(uuid, smallint, text, text, text, text) to authenticated;
grant execute on function public.decide_enrollment(uuid, public.enrollment_status, public.enrollment_status, text) to authenticated;

commit;
