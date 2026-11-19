create table public.enrollment_form_details (
  application_id uuid primary key references public.enrollment_applications(id) on delete cascade,
  details jsonb not null,
  submitted_at timestamptz not null default now()
);

alter table public.enrollment_form_details enable row level security;
revoke all on public.enrollment_form_details from public, anon, authenticated;
grant select on public.enrollment_form_details to authenticated;
create policy enrollment_form_details_read on public.enrollment_form_details for select to authenticated
  using (exists (
    select 1 from public.enrollment_applications a
    where a.id = enrollment_form_details.application_id
      and (a.guardian_id = (select auth.uid()) or (select enrollment_private.is_staff()))
  ));

create function enrollment_private.save_enrollment_form(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text, p_details jsonb
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_child uuid;
  v_status public.enrollment_status;
  v_saved record;
begin
  select c.id into v_child from public.enrollment_children c
    where c.id = p_child and c.guardian_id = (select auth.uid()) for no key update;
  if not found then
    raise exception using errcode = '42501', message = 'Cadastro da criança indisponível.';
  end if;

  select a.status into v_status from public.enrollment_applications a
    where a.child_id = v_child and a.guardian_id = (select auth.uid()) and a.school_year = 2027 for update;
  if v_status is distinct from 'documents' then
    raise exception using errcode = '40001', message = 'A ficha não está na etapa de matrícula.';
  end if;

  if jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text) > 20000 then
    raise exception using errcode = '22023', message = 'Confira os dados da matrícula.';
  end if;
  if exists (
    select 1 from jsonb_each(p_details) as field(key, value)
    where field.key not in ('sex', 'address', 'cep', 'district', 'studentDocument', 'birthCertificate', 'birthplace', 'birthState', 'nationality', 'addressBlock', 'addressNumber', 'residesWith', 'otherResident', 'sus', 'studentNis', 'guardianNis', 'foodAllergy', 'foodAllergyDetail', 'medicineAllergy', 'medicineAllergyDetail', 'otherAllergies', 'healthCondition', 'healthConditionDetail', 'medicalReport', 'medicalReportDetail', 'treatment', 'treatmentDetail', 'medication', 'medicationDetail', 'disability', 'disabilityDetail', 'feverMedication', 'arrival', 'departure', 'motherName', 'motherJob', 'motherContact', 'motherReligion', 'fatherName', 'fatherJob', 'fatherContact', 'fatherReligion', 'householdSize', 'guardianJob', 'guardianReligion', 'observations', 'imageConsent', 'consentName', 'consentCpf', 'declarationAccepted')
       or jsonb_typeof(field.value) <> 'string' or char_length(field.value #>> '{}') > 1000
  ) or not coalesce(
    p_details->>'declarationAccepted' = 'Sim'
    and p_details->>'sex' in ('Feminino', 'Masculino', 'Prefiro não informar')
    and char_length(btrim(p_details->>'address')) between 1 and 180
    and char_length(btrim(p_details->>'district')) between 1 and 80
    and p_details->>'imageConsent' in ('Sim', 'Não')
    and (p_details->>'imageConsent' = 'Não' or (
      char_length(btrim(p_details->>'consentName')) between 1 and 120
      and regexp_replace(p_details->>'consentCpf', '[^0-9]', '', 'g') ~ '^[0-9]{11}$'
    )), false
  ) then
    raise exception using errcode = '22023', message = 'Confira os dados obrigatórios da matrícula.';
  end if;

  select * into strict v_saved from enrollment_private.save_current_enrollment(
    v_child, p_expected_updated_at, p_child_name, p_birth_date,
    p_schedule, p_unit, p_guardian_name, p_relationship, p_phone
  );

  insert into public.enrollment_form_details (application_id, details, submitted_at)
    values (v_saved.id, p_details, clock_timestamp())
    on conflict (application_id) do update
      set details = excluded.details, submitted_at = excluded.submitted_at;

  return query select v_saved.id, v_saved.protocol, v_saved.created, v_saved.updated_at;
end;
$$;

create function public.save_enrollment_form(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text, p_details jsonb
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$
  select * from enrollment_private.save_enrollment_form(
    p_child, p_expected_updated_at, p_child_name, p_birth_date,
    p_schedule, p_unit, p_guardian_name, p_relationship, p_phone, p_details
  )
$$;

revoke execute on function enrollment_private.save_enrollment_form(uuid, timestamptz, text, date, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.save_enrollment_form(uuid, timestamptz, text, date, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function enrollment_private.save_enrollment_form(uuid, timestamptz, text, date, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.save_enrollment_form(uuid, timestamptz, text, date, text, text, text, text, text, jsonb)
  to authenticated;
