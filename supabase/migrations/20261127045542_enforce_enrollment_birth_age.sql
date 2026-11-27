create function enrollment_private.birth_date_is_eligible(p_birth date, p_year integer)
returns boolean
language sql immutable strict set search_path = ''
as $$
  select p_birth between make_date(p_year - 5, 1, 1) and make_date(p_year - 2, 12, 31);
$$;

create function enrollment_private.enforce_enrollment_birth_age()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.birth_date, new.school_year) is not distinct from (old.birth_date, old.school_year) then
      return new;
    end if;
  end if;

  if not coalesce(enrollment_private.birth_date_is_eligible(new.birth_date, new.school_year), false) then
    raise exception using errcode = 'P2001',
      message = 'A criança precisa completar de 2 a 5 anos no ano letivo da matrícula.';
  end if;
  return new;
end;
$$;

revoke execute on function enrollment_private.birth_date_is_eligible(date, integer),
  enrollment_private.enforce_enrollment_birth_age() from public, anon, authenticated;

create trigger enrollment_birth_age
before insert or update of birth_date, school_year on public.enrollment_applications
for each row execute function enrollment_private.enforce_enrollment_birth_age();
