alter table public.enrollment_form_details
  add column photo text,
  add column photo_saved boolean not null default false,
  add column registration_date date,
  add column grade text check (char_length(grade) <= 80),
  add column record_updated_at timestamptz not null default now();

alter policy enrollment_form_details_read on public.enrollment_form_details to authenticated using (exists (
  select 1 from public.enrollment_applications a
  where a.id = enrollment_form_details.application_id
    and (a.guardian_id = (select auth.uid()) or (select enrollment_private.is_staff()))
));

create function enrollment_private.validate_record_photo(p_photo text) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_photo is not null and (
    octet_length(p_photo) > 450000
    or p_photo !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'
  ) then
    raise exception using errcode = '22023', message = 'Foto 3×4 inválida.';
  end if;
end;
$$;

create function enrollment_private.save_family_enrollment_record(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text,
  p_details jsonb, p_photo text, p_is_enrollment boolean
) returns table (id uuid, child_id uuid, protocol text, created boolean, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_child uuid := p_child;
  v_saved record;
  v_base_keys text[] := array['sex', 'address', 'cep', 'district'];
begin
  if v_owner is null or (v_child is not null and not exists (
    select 1 from public.enrollment_children c where c.id = v_child and c.guardian_id = v_owner
  )) then
    raise exception using errcode = '42501', message = 'Ficha indisponível nesta conta.';
  end if;

  perform enrollment_private.validate_record_photo(p_photo);
  if jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text) > 20000
    or not coalesce(
      p_details->>'sex' in ('Feminino', 'Masculino', 'Prefiro não informar')
      and char_length(btrim(p_details->>'address')) between 1 and 180
      and char_length(btrim(p_details->>'district')) between 1 and 80
      and (not (p_details ? 'cep') or p_details->>'cep' ~ '^[0-9]{5}[- ]?[0-9]{3}$'),
      false
    ) then
    raise exception using errcode = '22023', message = 'Confira os dados da criança.';
  end if;

  if p_is_enrollment then
    select * into strict v_saved from enrollment_private.save_enrollment_form(
      v_child, p_expected_updated_at, p_child_name, p_birth_date, p_schedule, p_unit,
      p_guardian_name, p_relationship, p_phone, p_details
    );
  else
    if exists (select 1 from jsonb_each(p_details) f where not (f.key = any(v_base_keys)) or jsonb_typeof(f.value) <> 'string') then
      raise exception using errcode = '22023', message = 'Confira os dados da pré-matrícula.';
    end if;
    if v_child is null then
      select * into strict v_saved from public.create_current_enrollment(
        p_child_name, p_birth_date, p_schedule, p_unit, p_guardian_name, p_relationship, p_phone
      );
      v_child := v_saved.child_id;
    else
      select * into strict v_saved from enrollment_private.save_current_enrollment(
        v_child, p_expected_updated_at, p_child_name, p_birth_date, p_schedule, p_unit,
        p_guardian_name, p_relationship, p_phone
      );
    end if;
  end if;

  insert into public.enrollment_form_details (application_id, details, photo, photo_saved, record_updated_at)
    values (v_saved.id, p_details, p_photo, true, clock_timestamp())
    on conflict (application_id) do update set
      details = case when p_is_enrollment then excluded.details
        else (enrollment_form_details.details - v_base_keys) || excluded.details end,
      photo = excluded.photo, photo_saved = true, record_updated_at = excluded.record_updated_at;

  return query select v_saved.id, v_child, v_saved.protocol, v_saved.created, v_saved.updated_at;
end;
$$;

create function public.save_family_enrollment_record(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text,
  p_details jsonb, p_photo text, p_is_enrollment boolean
) returns table (id uuid, child_id uuid, protocol text, created boolean, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$
  select * from enrollment_private.save_family_enrollment_record(
    p_child, p_expected_updated_at, p_child_name, p_birth_date, p_schedule, p_unit, p_guardian_name,
    p_relationship, p_phone, p_details, p_photo, p_is_enrollment
  )
$$;

create function enrollment_private.edit_enrollment_record(
  p_application uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_guardian_relationship text,
  p_guardian_phone text, p_guardian_email text, p_details jsonb, p_photo text, p_registration_date date, p_grade text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_application public.enrollment_applications%rowtype;
begin
  if not enrollment_private.is_staff() then
    raise exception using errcode = '42501', message = 'Acesso exclusivo da secretaria.';
  end if;
  select a.* into v_application from public.enrollment_applications a where a.id = p_application;
  if not found then
    raise exception using errcode = 'P0002', message = 'Solicitação não encontrada.';
  end if;
  perform 1 from public.enrollment_children c
    where c.id = v_application.child_id and c.guardian_id = v_application.guardian_id for no key update;

  perform enrollment_private.validate_record_photo(p_photo);
  if jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text) > 20000 then
    raise exception using errcode = '22023', message = 'Confira os dados da ficha.';
  end if;
  if exists (select 1 from jsonb_each(p_details) f
      where jsonb_typeof(f.value) <> 'string' or char_length(f.value #>> '{}') > 1000
        or f.key not in ('sex', 'address', 'cep', 'district', 'studentDocument', 'birthCertificate', 'birthplace', 'birthState', 'nationality', 'addressBlock', 'addressNumber', 'residesWith', 'otherResident', 'sus', 'studentNis', 'guardianNis', 'foodAllergy', 'foodAllergyDetail', 'medicineAllergy', 'medicineAllergyDetail', 'otherAllergies', 'healthCondition', 'healthConditionDetail', 'medicalReport', 'medicalReportDetail', 'treatment', 'treatmentDetail', 'medication', 'medicationDetail', 'disability', 'disabilityDetail', 'feverMedication', 'arrival', 'departure', 'motherName', 'motherJob', 'motherContact', 'motherReligion', 'fatherName', 'fatherJob', 'fatherContact', 'fatherReligion', 'householdSize', 'guardianJob', 'guardianReligion', 'observations', 'imageConsent', 'consentName', 'consentCpf', 'declarationAccepted'))
    or (p_unit is not null and p_unit not in ('jardim-eldorado','parque-vitoria'))
    or (p_registration_date is not null and p_registration_date < date '1900-01-01')
    or (p_grade is not null and char_length(btrim(p_grade)) > 80) then
    raise exception using errcode = '22023', message = 'Confira os dados da ficha.';
  end if;

  perform enrollment_private.edit_enrollment_application(
    p_application, p_expected_updated_at, p_child_name, p_birth_date, v_application.school_year,
    p_schedule, p_guardian_name, p_guardian_relationship, p_guardian_phone, p_guardian_email
  );
  update public.enrollment_applications a set unit = p_unit where a.id = p_application;
  update public.enrollment_children c set full_name = btrim(p_child_name), birth_date = p_birth_date
    where c.id = v_application.child_id and c.guardian_id = v_application.guardian_id
      and (c.full_name, c.birth_date) is distinct from (btrim(p_child_name), p_birth_date);
  insert into public.enrollment_form_details (application_id, details, photo, photo_saved, registration_date, grade, record_updated_at)
    values (p_application, p_details, p_photo, true, p_registration_date, nullif(btrim(p_grade), ''), clock_timestamp())
    on conflict (application_id) do update set
      details = excluded.details, photo = excluded.photo, photo_saved = true, registration_date = excluded.registration_date,
      grade = excluded.grade, record_updated_at = excluded.record_updated_at;
end;
$$;

create function public.edit_enrollment_record(
  p_application uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_guardian_relationship text,
  p_guardian_phone text, p_guardian_email text, p_details jsonb, p_photo text, p_registration_date date, p_grade text
) returns void
language sql security invoker set search_path = ''
as $$
  select enrollment_private.edit_enrollment_record(
    p_application, p_expected_updated_at, p_child_name, p_birth_date, p_schedule, p_unit, p_guardian_name,
    p_guardian_relationship, p_guardian_phone, p_guardian_email, p_details, p_photo, p_registration_date, p_grade
  )
$$;

revoke execute on function enrollment_private.validate_record_photo(text) from public, anon, authenticated;
revoke execute on function enrollment_private.save_family_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, jsonb, text, boolean),
  public.save_family_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, jsonb, text, boolean),
  enrollment_private.edit_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, text, jsonb, text, date, text),
  public.edit_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, text, jsonb, text, date, text)
  from public, anon, authenticated;
grant execute on function enrollment_private.save_family_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, jsonb, text, boolean),
  public.save_family_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, jsonb, text, boolean),
  enrollment_private.edit_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, text, jsonb, text, date, text),
  public.edit_enrollment_record(uuid, timestamptz, text, date, text, text, text, text, text, text, jsonb, text, date, text)
  to authenticated;
