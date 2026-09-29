-- Apply BEFORE deploying the website and eps-as-slot-email.
-- Existing registration dates cannot be inferred from updated_at.
begin;
alter table public.unss_memberships add column if not exists enrolled_at timestamptz;
create or replace function public.eps_preserve_membership_enrolled_at()
returns trigger language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    NEW.enrolled_at := coalesce(NEW.enrolled_at, now());
  else
    -- Preserve even NULL (unknown legacy date), including during upsert retries.
    NEW.enrolled_at := OLD.enrolled_at;
  end if;
  return NEW;
end;
$$;
drop trigger if exists eps_membership_enrolled_at on public.unss_memberships;
create trigger eps_membership_enrolled_at
before insert or update on public.unss_memberships
for each row execute function public.eps_preserve_membership_enrolled_at();
comment on column public.unss_memberships.enrolled_at is
  'Immutable registration time. NULL for legacy memberships with unknown registration date; never substitute updated_at.';
commit;
