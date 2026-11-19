create function enrollment_private.edit_enrollment_application(
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
    and btrim(p_guardian_email) ~ '^[^[:space:]@]+@[^[:space:]@]+$', false
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

create function public.edit_enrollment_application(
  p_application uuid, p_expected_updated_at timestamptz,
  p_child_name text, p_birth_date date, p_school_year smallint, p_schedule text,
  p_guardian_name text, p_guardian_relationship text, p_guardian_phone text, p_guardian_email text
) returns void
language sql security invoker set search_path = ''
as $$
  select enrollment_private.edit_enrollment_application(
    p_application, p_expected_updated_at, p_child_name, p_birth_date, p_school_year, p_schedule,
    p_guardian_name, p_guardian_relationship, p_guardian_phone, p_guardian_email
  )
$$;

revoke execute on function enrollment_private.edit_enrollment_application(uuid, timestamptz, text, date, smallint, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.edit_enrollment_application(uuid, timestamptz, text, date, smallint, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function enrollment_private.edit_enrollment_application(uuid, timestamptz, text, date, smallint, text, text, text, text, text)
  to authenticated;
grant execute on function public.edit_enrollment_application(uuid, timestamptz, text, date, smallint, text, text, text, text, text)
  to authenticated;
