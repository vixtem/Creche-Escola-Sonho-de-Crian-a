create function enrollment_private.save_family_enrollment(
  p_child uuid, p_year smallint, p_expected_updated_at timestamptz, p_child_name text,
  p_birth_date date, p_schedule text, p_guardian_name text, p_relationship text, p_phone text, p_email text
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_application public.enrollment_applications%rowtype;
  v_id uuid;
  v_new boolean;
  v_email text;
begin
  perform 1 from public.enrollment_children c where c.id = p_child and c.guardian_id = v_owner for no key update;
  if not found then
    raise exception using errcode = '42501', message = 'Cadastro da criança indisponível.';
  end if;

  select u.email into v_email from auth.users u where u.id = v_owner and u.email_confirmed_at is not null;
  if v_email is null then
    raise exception using errcode = '42501', message = 'Confirme o e-mail da conta.';
  end if;
  v_email := coalesce(nullif(btrim(p_email), ''), v_email);
  if not coalesce(p_birth_date between date '1900-01-01' and timezone('America/Fortaleza', now())::date
    and char_length(btrim(p_child_name)) between 1 and 120
    and char_length(v_email) <= 254 and v_email ~ '^[^[:space:]@]+@[^[:space:]@]+$', false) then
    raise exception using errcode = '22023', message = 'Confira os dados da ficha.';
  end if;

  select a.* into v_application from public.enrollment_applications a
    where a.child_id = p_child and a.guardian_id = v_owner and a.school_year = p_year for no key update;
  v_new := not found;
  if v_application.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'A ficha foi atualizada desde que foi aberta.';
  end if;

  if v_new or (v_application.child_name, v_application.birth_date) is distinct from (btrim(p_child_name), p_birth_date) then
    update public.enrollment_children c set full_name = btrim(p_child_name), birth_date = p_birth_date
      where c.id = p_child and c.guardian_id = v_owner;
  end if;

  if v_new then
    select s.id into strict v_id from enrollment_private.submit_enrollment(
      p_child, p_year, p_schedule, p_guardian_name, p_relationship, p_phone
    ) s;
  else
    v_id := v_application.id;
  end if;

  update public.enrollment_applications a
    set child_name = btrim(p_child_name), birth_date = p_birth_date, schedule = p_schedule,
        guardian_name = btrim(p_guardian_name), guardian_relationship = btrim(p_relationship),
        guardian_phone = btrim(p_phone), guardian_email = v_email, updated_at = clock_timestamp()
    where a.id = v_id and a.guardian_id = v_owner returning a.* into strict v_application;

  return query select v_application.id, v_application.protocol, v_new, v_application.updated_at;
end;
$$;

create function public.save_family_enrollment(
  p_child uuid, p_year smallint, p_expected_updated_at timestamptz, p_child_name text,
  p_birth_date date, p_schedule text, p_guardian_name text, p_relationship text, p_phone text, p_email text
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$
  select * from enrollment_private.save_family_enrollment(
    p_child, p_year, p_expected_updated_at, p_child_name, p_birth_date, p_schedule,
    p_guardian_name, p_relationship, p_phone, p_email
  )
$$;

revoke execute on function enrollment_private.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function enrollment_private.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text)
  to authenticated;
grant execute on function public.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text)
  to authenticated;
