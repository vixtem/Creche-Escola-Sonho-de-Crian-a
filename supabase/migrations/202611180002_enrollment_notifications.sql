begin;

create table enrollment_private.notifications (
  history_id bigint primary key references public.enrollment_history(id) on delete cascade,
  queued_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempts smallint not null default 0,
  delivered_at timestamptz,
  abandoned_at timestamptz
);
alter table enrollment_private.notifications enable row level security;
create index enrollment_notifications_pending on enrollment_private.notifications (next_attempt_at)
  where delivered_at is null and abandoned_at is null;

create function enrollment_private.queue_status_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status <> 'received' then
    insert into enrollment_private.notifications (history_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke execute on function enrollment_private.queue_status_email() from public, anon, authenticated;
create trigger enrollment_queue_email after insert on public.enrollment_history
  for each row execute function enrollment_private.queue_status_email();

create function enrollment_private.claim_notifications() returns table (id bigint, email text, attempt smallint)
language sql security definer set search_path = ''
as $$
  with batch as (
    select n.history_id from enrollment_private.notifications n
      where n.delivered_at is null and n.abandoned_at is null
        and n.next_attempt_at <= now() and n.attempts < 4
        and n.queued_at > now() - interval '1 day'
      order by n.next_attempt_at, n.history_id
      limit 20 for update skip locked
  ), claimed as (
    update enrollment_private.notifications n
      set attempts = n.attempts + 1, next_attempt_at = now() + interval '10 minutes'
      from batch where n.history_id = batch.history_id
      returning n.history_id, n.attempts
  )
  select c.history_id, u.email, c.attempts
    from claimed c join public.enrollment_history h on h.id = c.history_id
    join public.enrollment_applications a on a.id = h.application_id
    left join auth.users u on u.id = a.guardian_id and u.email_confirmed_at is not null
$$;

create function enrollment_private.finish_notification(p_id bigint, p_attempt smallint, p_result text) returns void
language sql security definer set search_path = ''
as $$
  update enrollment_private.notifications
    set delivered_at = case when p_result = 'delivered' then now() end,
        abandoned_at = case when p_result = 'skip' or (p_result = 'failed' and attempts >= 4) then now() end
    where history_id = p_id and attempts = p_attempt and delivered_at is null and abandoned_at is null
      and p_result in ('delivered', 'skip', 'failed')
$$;

create function public.claim_enrollment_notifications() returns table (id bigint, email text, attempt smallint)
language sql security invoker set search_path = ''
as $$ select * from enrollment_private.claim_notifications() $$;

create function public.finish_enrollment_notification(p_id bigint, p_attempt smallint, p_result text) returns void
language sql security invoker set search_path = ''
as $$ select enrollment_private.finish_notification(p_id, p_attempt, p_result) $$;

revoke execute on function enrollment_private.claim_notifications() from public, anon, authenticated;
revoke execute on function enrollment_private.finish_notification(bigint, smallint, text) from public, anon, authenticated;
grant execute on function enrollment_private.claim_notifications() to service_role;
grant execute on function enrollment_private.finish_notification(bigint, smallint, text) to service_role;

revoke execute on function public.claim_enrollment_notifications() from public, anon, authenticated;
revoke execute on function public.finish_enrollment_notification(bigint, smallint, text) from public, anon, authenticated;
grant execute on function public.claim_enrollment_notifications() to service_role;
grant execute on function public.finish_enrollment_notification(bigint, smallint, text) to service_role;

commit;
