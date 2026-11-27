-- A Secretaria pode registrar uma matrícula sem uma conta de responsável.
alter table public.enrollment_children alter column guardian_id drop not null;
alter table public.enrollment_applications alter column guardian_id drop not null,
  add column archived_at timestamptz;

create unique index enrollment_children_one_staff_profile on public.enrollment_children
  (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')), birth_date)
  where guardian_id is null;

create or replace function enrollment_private.edit_enrollment_application(
  p_application uuid, p_expected_updated_at timestamptz,
  p_child_name text, p_birth_date date, p_school_year smallint, p_schedule text,
  p_guardian_name text, p_guardian_relationship text, p_guardian_phone text, p_guardian_email text
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not enrollment_private.is_staff() then
    raise exception using errcode = '42501', message = 'Acesso exclusivo da secretaria.';
  end if;

  if not coalesce(
    char_length(btrim(p_child_name)) between 1 and 120
    and p_birth_date between date '1900-01-01' and timezone('America/Fortaleza', now())::date
    and p_school_year between 2020 and 2100
    and p_schedule in ('Tempo Parcial (Matutino)', 'Tempo Parcial (Vespertino)', 'Tempo Integral')
    and char_length(btrim(p_guardian_name)) between 1 and 120
    and char_length(btrim(p_guardian_relationship)) between 1 and 80
    and char_length(btrim(p_guardian_phone)) <= 24
    and btrim(p_guardian_phone) ~ '^\+?[0-9 ()-]+$'
    and char_length(regexp_replace(p_guardian_phone, '[^0-9]', '', 'g')) between 10 and 13
    and char_length(btrim(p_guardian_email)) <= 254
    and (
      btrim(p_guardian_email) ~ '^[^[:space:]@]+@[^[:space:]@]+$'
      or (btrim(p_guardian_email) = '' and exists (
        select 1 from public.enrollment_applications a where a.id = p_application and a.guardian_id is null
      ))
    ), false
  ) then
    raise exception using errcode = '22023', message = 'Confira os dados informados na ficha.';
  end if;

  update public.enrollment_applications
    set child_name = btrim(p_child_name), birth_date = p_birth_date,
        school_year = p_school_year, schedule = p_schedule,
        guardian_name = btrim(p_guardian_name), guardian_relationship = btrim(p_guardian_relationship),
        guardian_phone = btrim(p_guardian_phone), guardian_email = btrim(p_guardian_email),
        updated_at = clock_timestamp()
    where id = p_application and updated_at = p_expected_updated_at;

  if not found then
    if not exists (select 1 from public.enrollment_applications where id = p_application) then
      raise exception using errcode = 'P0002', message = 'Solicitação não encontrada.';
    end if;
    raise exception using errcode = '40001', message = 'A ficha mudou desde que foi aberta.';
  end if;
end;
$$;

create or replace function enrollment_private.queue_status_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'received' and exists (
    select 1 from public.enrollment_applications a
    where a.id = new.application_id and a.guardian_id is not null
  ) then
    insert into enrollment_private.notifications (history_id) values (new.id);
  end if;
  return new;
end;
$$;

create function enrollment_private.create_staff_enrollment_record(
  p_child_name text, p_birth_date date, p_schedule text, p_unit text,
  p_guardian_name text, p_guardian_relationship text, p_guardian_phone text, p_guardian_email text,
  p_details jsonb, p_photo text, p_registration_date date, p_grade text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_child uuid;
  v_application public.enrollment_applications%rowtype;
  v_email text := btrim(coalesce(p_guardian_email, ''));
begin
  if not enrollment_private.is_staff() then
    raise exception using errcode = '42501', message = 'Acesso exclusivo da secretaria.';
  end if;
  if p_unit is null then
    raise exception using errcode = '22023', message = 'Informe a unidade.';
  end if;

  insert into public.enrollment_children (guardian_id, full_name, birth_date)
    values (null, btrim(p_child_name), p_birth_date) returning id into v_child;
  insert into public.enrollment_applications (
    child_id, guardian_id, child_name, birth_date, guardian_name, guardian_relationship,
    guardian_phone, guardian_email, school_year, schedule, unit, status
  ) values (
    v_child, null, btrim(p_child_name), p_birth_date, btrim(p_guardian_name), btrim(p_guardian_relationship),
    btrim(p_guardian_phone), v_email, 2027, p_schedule, p_unit, 'enrolled'
  ) returning * into v_application;

  perform enrollment_private.edit_enrollment_record(
    v_application.id, v_application.updated_at, p_child_name, p_birth_date, p_schedule, p_unit,
    p_guardian_name, p_guardian_relationship, p_guardian_phone, v_email, p_details, p_photo,
    p_registration_date, p_grade
  );
  insert into public.enrollment_history (application_id, status, changed_by)
    values (v_application.id, 'enrolled', (select auth.uid()));
  return v_application.id;
end;
$$;

create function public.create_staff_enrollment_record(
  p_child_name text, p_birth_date date, p_schedule text, p_unit text,
  p_guardian_name text, p_guardian_relationship text, p_guardian_phone text, p_guardian_email text,
  p_details jsonb, p_photo text, p_registration_date date, p_grade text
) returns uuid
language sql security invoker set search_path = ''
as $$
  select enrollment_private.create_staff_enrollment_record(
    p_child_name, p_birth_date, p_schedule, p_unit, p_guardian_name, p_guardian_relationship,
    p_guardian_phone, p_guardian_email, p_details, p_photo, p_registration_date, p_grade
  )
$$;

create function enrollment_private.manage_staff_enrollment_record(
  p_application uuid, p_expected_updated_at timestamptz, p_action text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_application public.enrollment_applications%rowtype;
begin
  if not enrollment_private.is_staff() then
    raise exception using errcode = '42501', message = 'Acesso exclusivo da secretaria.';
  end if;
  if p_action is null or p_action not in ('archive', 'restore', 'delete') then
    raise exception using errcode = '22023', message = 'Ação inválida.';
  end if;

  select a.* into v_application from public.enrollment_applications a where a.id = p_application for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Matrícula não encontrada.';
  end if;
  if v_application.updated_at is distinct from p_expected_updated_at
    or (v_application.archived_at is null) <> (p_action = 'archive') then
    raise exception using errcode = '40001', message = 'A ficha mudou ou não está na lista correta.';
  end if;

  if p_action = 'delete' then
    delete from public.enrollment_applications where id = p_application and archived_at is not null;
    -- Preserve o perfil da família e quaisquer outras matrículas da criança.
    if v_application.guardian_id is null then
      delete from public.enrollment_children c where c.id = v_application.child_id and c.guardian_id is null
        and not exists (select 1 from public.enrollment_applications a where a.child_id = c.id);
    end if;
  else
    update public.enrollment_applications
      set archived_at = case when p_action = 'archive' then clock_timestamp() end, updated_at = clock_timestamp()
      where id = p_application;
  end if;
end;
$$;

create function public.manage_staff_enrollment_record(
  p_application uuid, p_expected_updated_at timestamptz, p_action text
) returns void
language sql security invoker set search_path = ''
as $$
  select enrollment_private.manage_staff_enrollment_record(p_application, p_expected_updated_at, p_action)
$$;

revoke execute on function
  enrollment_private.create_staff_enrollment_record(text, date, text, text, text, text, text, text, jsonb, text, date, text),
  public.create_staff_enrollment_record(text, date, text, text, text, text, text, text, jsonb, text, date, text),
  enrollment_private.manage_staff_enrollment_record(uuid, timestamptz, text),
  public.manage_staff_enrollment_record(uuid, timestamptz, text)
  from public, anon, authenticated;

grant execute on function
  enrollment_private.create_staff_enrollment_record(text, date, text, text, text, text, text, text, jsonb, text, date, text),
  public.create_staff_enrollment_record(text, date, text, text, text, text, text, text, jsonb, text, date, text),
  enrollment_private.manage_staff_enrollment_record(uuid, timestamptz, text),
  public.manage_staff_enrollment_record(uuid, timestamptz, text)
  to authenticated;
