alter table public.enrollment_applications add column unit text
  check (unit in ('jardim-eldorado', 'parque-vitoria'));

create function enrollment_private.enforce_enrollment_year() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.school_year is distinct from 2027)
    or (tg_op = 'UPDATE' and new.school_year is distinct from old.school_year) then
    raise exception using errcode = '22023', message = 'O ano letivo é definido pela escola.';
  end if;
  return new;
end;
$$;

revoke execute on function enrollment_private.enforce_enrollment_year() from public, anon, authenticated;
create trigger enrollment_fixed_year before insert or update of school_year on public.enrollment_applications
  for each row execute function enrollment_private.enforce_enrollment_year();

create function enrollment_private.save_current_enrollment(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare
  v_saved record;
begin
  if p_unit is null or p_unit not in ('jardim-eldorado', 'parque-vitoria') then
    raise exception using errcode = '22023', message = 'Selecione uma unidade da escola.';
  end if;

  select * into strict v_saved from enrollment_private.save_family_enrollment(
    p_child, 2027::smallint, p_expected_updated_at, p_child_name, p_birth_date,
    p_schedule, p_guardian_name, p_relationship, p_phone, null
  );

  update public.enrollment_applications a set unit = p_unit
    where a.id = v_saved.id and a.guardian_id = (select auth.uid());

  return query select v_saved.id, v_saved.protocol, v_saved.created, v_saved.updated_at;
end;
$$;

create function public.save_current_enrollment(
  p_child uuid, p_expected_updated_at timestamptz, p_child_name text, p_birth_date date,
  p_schedule text, p_unit text, p_guardian_name text, p_relationship text, p_phone text
) returns table (id uuid, protocol text, created boolean, updated_at timestamptz)
language sql security invoker set search_path = ''
as $$
  select * from enrollment_private.save_current_enrollment(
    p_child, p_expected_updated_at, p_child_name, p_birth_date,
    p_schedule, p_unit, p_guardian_name, p_relationship, p_phone
  )
$$;

revoke execute on function enrollment_private.save_current_enrollment(uuid, timestamptz, text, date, text, text, text, text, text)
  from public, anon, authenticated;
revoke execute on function public.save_current_enrollment(uuid, timestamptz, text, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function enrollment_private.save_current_enrollment(uuid, timestamptz, text, date, text, text, text, text, text)
  to authenticated;
grant execute on function public.save_current_enrollment(uuid, timestamptz, text, date, text, text, text, text, text)
  to authenticated;

revoke execute on function public.submit_enrollment(uuid, smallint, text, text, text, text),
  enrollment_private.submit_enrollment(uuid, smallint, text, text, text, text),
  public.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text),
  enrollment_private.save_family_enrollment(uuid, smallint, timestamptz, text, date, text, text, text, text, text)
  from authenticated;
