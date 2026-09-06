-- ---------------------------------------------------------------------------------------------
-- L'AS s'organise autour du creneau, plus du groupe.
--
-- Il y avait deux objets qui disaient presque la meme chose : le creneau (activite, jour,
-- horaire, lieu), qui ne servait qu'aux voeux, et le groupe (activite, jour, horaire,
-- responsable), qui portait les eleves, les seances et les appels. Creer une activite demandait
-- donc de la saisir deux fois, a deux endroits, sans lien entre les deux.
--
-- Desormais le creneau porte tout : ses eleves, ses seances, ses appels, son bilan de presence.
--
-- La table unss_groups n'est pas supprimee : elle cesse simplement d'etre utilisee. Effacer une
-- table est irreversible, et la garder ne coute rien.
--
-- Idempotent : le relancer ne casse rien. A coller en entier dans le SQL Editor.
-- ---------------------------------------------------------------------------------------------
begin;

-- 1. Le creneau reprend ce que le groupe savait de plus que lui ------------------------------
alter table public.unss_slots add column if not exists responsible_teacher text not null default '';

-- 2. Les eleves et les seances se rattachent au creneau ---------------------------------------
-- group_id reste en place et devient facultatif : les lignes deja enregistrees gardent leur
-- rattachement, et rien n'est perdu si l'on doit revenir en arriere.
alter table public.unss_memberships add column if not exists slot_id text references public.unss_slots(id) on delete cascade;
alter table public.unss_sessions   add column if not exists slot_id text references public.unss_slots(id) on delete cascade;
alter table public.unss_memberships alter column group_id drop not null;
alter table public.unss_sessions   alter column group_id drop not null;

-- 3. Reprise de l'existant ---------------------------------------------------------------------
-- Chaque groupe deja saisi devient un creneau, s'il n'en existe pas deja un qui lui ressemble.
-- Sans cela, les eleves et les appels deja enregistres resteraient orphelins.
insert into public.unss_slots (id, user_id, institution_id, activity_name, day_of_week,
                               start_time, end_time, location, responsible_teacher, updated_at, deleted)
select g.id, g.user_id, eps_institution(g.user_id), g.activity_name,
       upper(g.day_of_week), g.start_time, g.end_time, '', g.responsible_teacher, now(), false
from public.unss_groups g
where g.deleted = false
  and not exists (select 1 from public.unss_slots s where s.id = g.id)
  and not exists (
    select 1 from public.unss_slots s
    where lower(s.activity_name) = lower(g.activity_name)
      and upper(s.day_of_week) = upper(g.day_of_week)
      and s.start_time = g.start_time
      and s.deleted = false)
on conflict (id) do nothing;

-- Les eleves et les seances suivent leur groupe vers le creneau correspondant.
update public.unss_memberships m
set slot_id = coalesce(
      (select s.id from public.unss_slots s where s.id = m.group_id),
      (select s.id from public.unss_slots s
         join public.unss_groups g on g.id = m.group_id
        where lower(s.activity_name) = lower(g.activity_name)
          and upper(s.day_of_week) = upper(g.day_of_week)
          and s.deleted = false
        limit 1)),
    updated_at = now()
where m.slot_id is null and m.group_id is not null;

update public.unss_sessions x
set slot_id = coalesce(
      (select s.id from public.unss_slots s where s.id = x.group_id),
      (select s.id from public.unss_slots s
         join public.unss_groups g on g.id = x.group_id
        where lower(s.activity_name) = lower(g.activity_name)
          and upper(s.day_of_week) = upper(g.day_of_week)
          and s.deleted = false
        limit 1)),
    updated_at = now()
where x.slot_id is null and x.group_id is not null;

-- 4. Lire "les eleves d'un creneau" et "les seances d'un creneau" doit rester rapide -----------
create index if not exists unss_memberships_slot_idx on public.unss_memberships(slot_id) where deleted = false;
create index if not exists unss_sessions_slot_idx on public.unss_sessions(slot_id) where deleted = false;

-- Un eleve n'est inscrit qu'une fois au meme creneau : deux clics de suite ne doivent pas
-- creer deux inscriptions, comme pour les dispenses.
create unique index if not exists unss_memberships_sans_doublon
  on public.unss_memberships(slot_id, student_id) where deleted = false and slot_id is not null;

analyze public.unss_memberships;
analyze public.unss_sessions;
analyze public.unss_slots;

-- Le marqueur : le site et l'application ne basculent sur le creneau qu'une fois ce fichier
-- passe. Tant qu'il n'est pas la, ils continuent de fonctionner comme avant.
insert into public.eps_schema_marks (name) values ('as_creneaux')
  on conflict (name) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------------------------
-- Verification, a lancer apres :
--   select name, applied_at from public.eps_schema_marks where name = 'as_creneaux';
--   select count(*) filter (where slot_id is not null) as rattaches,
--          count(*) filter (where slot_id is null) as orphelins
--     from public.unss_memberships where deleted = false;
-- ---------------------------------------------------------------------------------------------
