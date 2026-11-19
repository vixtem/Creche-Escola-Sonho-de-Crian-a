create function public.create_current_enrollment(
  p_child_name text, p_birth_date date, p_schedule text, p_unit text,
  p_guardian_name text, p_relationship text, p_phone text
) returns table (id uuid, child_id uuid, protocol text, created boolean, updated_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_child uuid;
begin
  insert into public.enrollment_children as c (full_name, birth_date)
    values (btrim(p_child_name), p_birth_date) returning c.id into strict v_child;

  return query select saved.id, v_child, saved.protocol, saved.created, saved.updated_at
    from enrollment_private.save_current_enrollment(
      v_child, null, p_child_name, p_birth_date, p_schedule, p_unit, p_guardian_name, p_relationship, p_phone
    ) saved;
end;
$$;

revoke execute on function public.create_current_enrollment(text, date, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_current_enrollment(text, date, text, text, text, text, text)
  to authenticated;
