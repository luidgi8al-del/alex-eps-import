begin;

create table if not exists public.eps_email_campaigns (
  id uuid primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  sender_email text,
  sender_name text,
  source text not null default 'AS',
  channel text not null check (channel in ('as_account', 'gmail')),
  reason text,
  recipient_filter text,
  audience text,
  subject text not null,
  message_template text not null,
  attachment_name text,
  status text not null default 'sending' check (status in ('sending', 'sent', 'partial', 'failed')),
  sent_count integer not null default 0 check (sent_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  missing_count integer not null default 0 check (missing_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.eps_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.eps_email_campaigns(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  student_id text,
  student_name text,
  division text,
  recipient_email text,
  recipient_type text check (recipient_type in ('student', 'parent', 'unknown')),
  subject_text text,
  message_text text,
  status text not null check (status in ('sent', 'failed', 'missing')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, student_id, recipient_email)
);

create index if not exists eps_email_campaigns_institution_date
  on public.eps_email_campaigns(institution_id, created_at desc);
create index if not exists eps_email_deliveries_campaign
  on public.eps_email_deliveries(campaign_id, created_at);

create or replace function public.eps_prepare_email_campaign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    new.user_id := auth.uid();
    new.institution_id := eps_institution();
  end if;
  if new.user_id is null or new.institution_id is null then
    raise exception 'Compte ou établissement introuvable';
  end if;
  return new;
end;
$$;

drop trigger if exists eps_prepare_email_campaign on public.eps_email_campaigns;
create trigger eps_prepare_email_campaign
before insert on public.eps_email_campaigns
for each row execute function public.eps_prepare_email_campaign();

create or replace function public.eps_prepare_email_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.eps_email_campaigns;
begin
  select * into c from public.eps_email_campaigns where id = new.campaign_id;
  if c.id is null then raise exception 'Campagne introuvable'; end if;
  if auth.role() <> 'service_role' and c.user_id <> auth.uid() then
    raise exception 'Cette campagne appartient à un autre compte';
  end if;
  new.institution_id := c.institution_id;
  return new;
end;
$$;

drop trigger if exists eps_prepare_email_delivery on public.eps_email_deliveries;
create trigger eps_prepare_email_delivery
before insert or update on public.eps_email_deliveries
for each row execute function public.eps_prepare_email_delivery();

alter table public.eps_email_campaigns enable row level security;
alter table public.eps_email_deliveries enable row level security;

drop policy if exists eps_email_campaign_read on public.eps_email_campaigns;
create policy eps_email_campaign_read on public.eps_email_campaigns for select to authenticated
  using (eps_account_active() and institution_id = eps_institution());
drop policy if exists eps_email_campaign_insert on public.eps_email_campaigns;
create policy eps_email_campaign_insert on public.eps_email_campaigns for insert to authenticated
  with check (eps_account_active() and user_id = auth.uid() and institution_id = eps_institution());
drop policy if exists eps_email_campaign_update on public.eps_email_campaigns;
create policy eps_email_campaign_update on public.eps_email_campaigns for update to authenticated
  using (eps_account_active() and user_id = auth.uid())
  with check (eps_account_active() and user_id = auth.uid() and institution_id = eps_institution());

drop policy if exists eps_email_delivery_read on public.eps_email_deliveries;
create policy eps_email_delivery_read on public.eps_email_deliveries for select to authenticated
  using (eps_account_active() and institution_id = eps_institution());
drop policy if exists eps_email_delivery_insert on public.eps_email_deliveries;
create policy eps_email_delivery_insert on public.eps_email_deliveries for insert to authenticated
  with check (eps_account_active() and institution_id = eps_institution()
    and exists (select 1 from public.eps_email_campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
drop policy if exists eps_email_delivery_update on public.eps_email_deliveries;
create policy eps_email_delivery_update on public.eps_email_deliveries for update to authenticated
  using (exists (select 1 from public.eps_email_campaigns c where c.id = campaign_id and c.user_id = auth.uid()))
  with check (eps_account_active() and institution_id = eps_institution());

grant select, insert, update on public.eps_email_campaigns to authenticated;
grant select, insert, update on public.eps_email_deliveries to authenticated;

comment on table public.eps_email_campaigns is 'Historique partagé par établissement des campagnes e-mail envoyées depuis EPS.';
comment on table public.eps_email_deliveries is 'Résultat et contenu personnalisé de chaque destinataire d’une campagne e-mail.';

commit;
