begin;
-- No incident descriptions/photos in push payloads; recipient is computed by the database.
create table if not exists public.eps_push_config (
 id boolean primary key default true check(id), vapid_public_key text,
 firebase_android jsonb not null default '{}'::jsonb
);
insert into public.eps_push_config(id) values(true) on conflict do nothing;
alter table public.eps_push_config enable row level security;
revoke all on public.eps_push_config from anon,authenticated;

create table if not exists public.eps_push_devices (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 device_key text not null unique, platform text not null check(platform in ('web','android')),
 subscription jsonb not null, updated_at timestamptz not null default now()
);
alter table public.eps_push_devices enable row level security;
revoke all on public.eps_push_devices from anon,authenticated;
create table if not exists public.eps_push_events (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 incident_id uuid not null references public.sport_installation_incidents(id) on delete cascade,
 kind text not null, created_at timestamptz not null default now(), sent_at timestamptz,
 lease_until timestamptz, attempts int not null default 0, last_error text
);
alter table public.eps_push_events enable row level security;
revoke all on public.eps_push_events from anon,authenticated;
create index if not exists eps_push_pending on public.eps_push_events(created_at) where sent_at is null;
create table if not exists public.eps_push_deliveries (
 event_id uuid references public.eps_push_events(id) on delete cascade,
 device_id uuid references public.eps_push_devices(id) on delete cascade,
 primary key(event_id,device_id)
);
alter table public.eps_push_deliveries enable row level security;
revoke all on public.eps_push_deliveries from anon,authenticated;
grant all on public.eps_push_config,public.eps_push_devices,public.eps_push_events,public.eps_push_deliveries to service_role;

create or replace function public.eps_push_public_config() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('vapid_public_key',vapid_public_key,'firebase_android',firebase_android) from public.eps_push_config where id;
$$;
revoke all on function public.eps_push_public_config() from public;
grant execute on function public.eps_push_public_config() to authenticated;

create or replace function public.eps_push_register(p_device_key text,p_platform text,p_subscription jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not public.eps_account_active() or public.eps_installation_scope() is null then raise exception 'Account not authorized'; end if;
 if length(p_device_key)>512 or length(p_device_key)<16 or octet_length(p_subscription::text)>8192 then raise exception 'Invalid device'; end if;
 if p_platform='web' then
  if (p_subscription->>'endpoint') !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/' or
     coalesce(length(p_subscription#>>'{keys,p256dh}'),0)<20 or coalesce(length(p_subscription#>>'{keys,auth}'),0)<10 then raise exception 'Invalid subscription'; end if;
 elsif p_platform='android' then
  if coalesce(length(p_subscription->>'token'),0)<20 then raise exception 'Invalid token'; end if;
 else raise exception 'Invalid platform'; end if;
 insert into public.eps_push_devices(device_key,user_id,platform,subscription)
 values(p_device_key,auth.uid(),p_platform,p_subscription)
 on conflict(device_key) do update set user_id=auth.uid(),platform=excluded.platform,subscription=excluded.subscription,updated_at=now();
end; $$;
create or replace function public.eps_push_unregister(p_device_key text) returns void language sql security definer set search_path=public as $$
 delete from public.eps_push_devices where device_key=p_device_key and user_id=auth.uid();
$$;
revoke all on function public.eps_push_register(text,text,jsonb),public.eps_push_unregister(text) from public;
grant execute on function public.eps_push_register(text,text,jsonb),public.eps_push_unregister(text) to authenticated;

create or replace function public.eps_queue_installation_push() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.deleted then return new; end if;
 if (tg_op='INSERT' and new.status='SIGNALE') or (tg_op='UPDATE' and new.status='SIGNALE' and old.status is distinct from new.status) then
  insert into public.eps_push_events(user_id,incident_id,kind)
  select user_id,new.id,'SIGNALE' from public.eps_installation_managers where institution_id=new.institution_id;
 elsif tg_op='UPDATE' and new.status in ('EN_COURS','RESOLU') and old.status is distinct from new.status then
  insert into public.eps_push_events(user_id,incident_id,kind) values(new.user_id,new.id,new.status);
 end if;
 return new;
end; $$;
drop trigger if exists eps_installation_push_queue on public.sport_installation_incidents;
create trigger eps_installation_push_queue after insert or update on public.sport_installation_incidents for each row execute function public.eps_queue_installation_push();

create or replace function public.eps_push_claim() returns setof public.eps_push_events language sql security definer set search_path=public as $$
 update public.eps_push_events e set lease_until=now()+interval '2 minutes',attempts=attempts+1
 where e.id in (select id from public.eps_push_events where sent_at is null and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 30)
 returning e.*;
$$;
revoke all on function public.eps_push_claim() from public,anon,authenticated;
grant execute on function public.eps_push_claim() to service_role;

create or replace function public.eps_push_recipient_active(p_user uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.eps_account_active(p_user);
$$;
revoke all on function public.eps_push_recipient_active(uuid) from public,anon,authenticated;
grant execute on function public.eps_push_recipient_active(uuid) to service_role;
commit;
