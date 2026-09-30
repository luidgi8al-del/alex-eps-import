-- Raccorder les dispenses du professeur et de l'infirmerie a la meme personne.
--
-- Le repertoire nomme une classe « 2-01 » tandis que le professeur peut l'avoir nommee
-- « 2nde1 ». La classe n'est donc pas une identite. Le raccord fiable est nom + prenom + date
-- de naissance ; une fois trouve, les deux identifiants sont conserves sur la dispense.
begin;

alter table public.health_dispensations
  add column if not exists student_identity_key text;

create or replace function public.eps_health_name_key(value text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(lower(trim(coalesce(value, ''))), '[^[:alnum:]]', '', 'g')
$$;

-- Les anciennes dispenses de l'infirmerie ne portent parfois que l'identifiant du repertoire.
-- On les rattache a l'eleve de classe seulement lorsqu'une correspondance unique existe.
with correspondances as (
  select d.id as dispense_id,
         min(s.id) as student_id,
         min(s.class_id) as class_id,
         min(c.name) as class_name
  from public.health_dispensations d
  join public.unss_students u on u.id = d.unss_student_id
  join public.students s
    on public.eps_health_name_key(s.last_name) = public.eps_health_name_key(u.last_name)
   and public.eps_health_name_key(s.first_name) = public.eps_health_name_key(u.first_name)
   and s.birth_date_epoch_millis is not null
   and s.birth_date_epoch_millis = u.birth_date_epoch_millis
   and s.deleted = false
  join public.profiles p on p.id = s.user_id and p.institution_id = d.institution_id
  join public.classes c on c.id = s.class_id and c.deleted = false
  where d.student_id is null and d.unss_student_id is not null
  group by d.id
  having count(*) = 1
)
update public.health_dispensations d
set student_id = x.student_id,
    class_id = x.class_id,
    class_name = x.class_name,
    updated_at = now()
from correspondances x
where d.id = x.dispense_id;

-- Et inversement : une saisie du professeur garde aussi le lien vers le repertoire. La prochaine
-- saisie de l'infirmerie sera ainsi reconnue comme la meme personne avant meme de regarder la
-- facon dont la classe est ecrite.
with correspondances as (
  select d.id as dispense_id, min(u.id) as unss_student_id
  from public.health_dispensations d
  join public.students s on s.id = d.student_id
  join public.unss_students u
    on u.institution_id = d.institution_id
   and public.eps_health_name_key(u.last_name) = public.eps_health_name_key(s.last_name)
   and public.eps_health_name_key(u.first_name) = public.eps_health_name_key(s.first_name)
   and u.birth_date_epoch_millis is not null
   and u.birth_date_epoch_millis = s.birth_date_epoch_millis
   and u.deleted = false
  where d.unss_student_id is null and d.student_id is not null
  group by d.id
  having count(*) = 1
)
update public.health_dispensations d
set unss_student_id = x.unss_student_id,
    updated_at = now()
from correspondances x
where d.id = x.dispense_id;

create or replace function public.eps_health_dispense_identity(
  p_institution uuid,
  p_student_id text,
  p_unss_student_id text,
  p_last_name text,
  p_first_name text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last text := p_last_name;
  v_first text := p_first_name;
  v_birth bigint;
begin
  if p_student_id is not null then
    select s.last_name, s.first_name, s.birth_date_epoch_millis
      into v_last, v_first, v_birth
    from public.students s where s.id = p_student_id;
  end if;
  if v_birth is null and p_unss_student_id is not null then
    select coalesce(v_last, u.last_name), coalesce(v_first, u.first_name), u.birth_date_epoch_millis
      into v_last, v_first, v_birth
    from public.unss_students u where u.id = p_unss_student_id;
  end if;
  if v_birth is not null then
    return coalesce(p_institution::text, '') || '|' || public.eps_health_name_key(v_last)
      || '|' || public.eps_health_name_key(v_first) || '|' || v_birth::text;
  end if;
  -- Sans naissance, ne jamais rapprocher deux homonymes par supposition.
  if p_student_id is not null then return 'student:' || p_student_id; end if;
  if p_unss_student_id is not null then return 'directory:' || p_unss_student_id; end if;
  return null;
end
$$;

update public.health_dispensations d
set student_identity_key = public.eps_health_dispense_identity(
  d.institution_id, d.student_id, d.unss_student_id, d.student_last_name, d.student_first_name
);

-- L'ancien index ne comparait que student_id et seulement des dates strictement identiques.
-- Il ne pouvait voir ni un recouvrement, ni la meme personne venue du repertoire.
drop index if exists public.uq_health_dispense_sans_doublon;

-- Regrouper les anciens recouvrements. La ligne supprimee reste dans la base (deleted=true), donc
-- aucune information n'est detruite et elle demeure recuperable en cas de besoin.
do $$
declare
  garde public.health_dispensations%rowtype;
  autre public.health_dispensations%rowtype;
begin
  loop
    select a, b into garde, autre
    from public.health_dispensations a
    join public.health_dispensations b
      on b.id <> a.id
     and b.deleted = false
     and b.student_identity_key = a.student_identity_key
     and daterange(b.start_date, b.end_date, '[]') && daterange(a.start_date, a.end_date, '[]')
    where a.deleted = false and a.student_identity_key is not null
    order by case when a.entered_by is null then 0 else 1 end,
             a.updated_at desc, a.id
    limit 1;
    exit when not found;

    update public.health_dispensations
    set start_date = least(garde.start_date, autre.start_date),
        end_date = greatest(garde.end_date, autre.end_date),
        student_id = coalesce(garde.student_id, autre.student_id),
        class_id = coalesce(garde.class_id, autre.class_id),
        unss_student_id = coalesce(garde.unss_student_id, autre.unss_student_id),
        student_last_name = coalesce(garde.student_last_name, autre.student_last_name),
        student_first_name = coalesce(garde.student_first_name, autre.student_first_name),
        class_name = coalesce(garde.class_name, autre.class_name),
        reason_kind = case
          when garde.reason_kind = 'CERTIFICAT' or autre.reason_kind = 'CERTIFICAT' then 'CERTIFICAT'
          else coalesce(garde.reason_kind, autre.reason_kind)
        end,
        reason = case
          when nullif(trim(coalesce(garde.reason, '')), '') is null then autre.reason
          when nullif(trim(coalesce(autre.reason, '')), '') is null or garde.reason = autre.reason then garde.reason
          else garde.reason || ' · ' || autre.reason
        end,
        aptitude = coalesce(garde.aptitude, autre.aptitude,
          case when garde.reason_kind = 'INAPTITUDE_PARTIELLE'
                  or autre.reason_kind = 'INAPTITUDE_PARTIELLE' then 'SPORT_ADAPTE' end),
        adapted_activities = coalesce(garde.adapted_activities, autre.adapted_activities),
        updated_at = now()
    where id = garde.id;

    update public.health_dispensations
    set deleted = true, updated_at = now()
    where id = autre.id;
  end loop;
end
$$;

create or replace function public.eps_health_reconcile_dispense()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id text;
  v_class_id text;
  v_class_name text;
  v_unss_id text;
  v_count integer;
begin
  -- Repertoire -> classe, sans tenir compte de « 2-01 » / « 2nde1 ».
  if new.student_id is null and new.unss_student_id is not null then
    select min(s.id), min(s.class_id), min(c.name), count(*)
      into v_student_id, v_class_id, v_class_name, v_count
    from public.unss_students u
    join public.students s
      on public.eps_health_name_key(s.last_name) = public.eps_health_name_key(u.last_name)
     and public.eps_health_name_key(s.first_name) = public.eps_health_name_key(u.first_name)
     and s.birth_date_epoch_millis is not null
     and s.birth_date_epoch_millis = u.birth_date_epoch_millis
     and s.deleted = false
    join public.profiles p on p.id = s.user_id and p.institution_id = new.institution_id
    join public.classes c on c.id = s.class_id and c.deleted = false
    where u.id = new.unss_student_id;
    if v_count = 1 then
      new.student_id := v_student_id;
      new.class_id := v_class_id;
      new.class_name := v_class_name;
    end if;
  end if;

  -- Classe -> repertoire, pour que les deux portes portent ensuite les deux identifiants.
  if new.unss_student_id is null and new.student_id is not null then
    select min(u.id), count(*) into v_unss_id, v_count
    from public.students s
    join public.unss_students u
      on u.institution_id = new.institution_id
     and public.eps_health_name_key(u.last_name) = public.eps_health_name_key(s.last_name)
     and public.eps_health_name_key(u.first_name) = public.eps_health_name_key(s.first_name)
     and u.birth_date_epoch_millis is not null
     and u.birth_date_epoch_millis = s.birth_date_epoch_millis
     and u.deleted = false
    where s.id = new.student_id;
    if v_count = 1 then new.unss_student_id := v_unss_id; end if;
  end if;

  new.student_identity_key := public.eps_health_dispense_identity(
    new.institution_id, new.student_id, new.unss_student_id,
    new.student_last_name, new.student_first_name
  );

  if new.deleted = false and new.student_identity_key is not null and exists (
    select 1 from public.health_dispensations d
    where d.id <> new.id and d.deleted = false
      and d.student_identity_key = new.student_identity_key
      and daterange(d.start_date, d.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'Une dispense existe deja pour cet eleve sur cette periode'
      using errcode = '23505';
  end if;
  return new;
end
$$;

drop trigger if exists eps_health_dispense_reconcile on public.health_dispensations;
create trigger eps_health_dispense_reconcile
  before insert or update on public.health_dispensations
  for each row execute function public.eps_health_reconcile_dispense();

create index if not exists health_dispense_identity_period_idx
  on public.health_dispensations (student_identity_key, start_date, end_date)
  where deleted = false;

insert into public.eps_schema_marks (name) values ('sante_8')
  on conflict (name) do update set applied_at = now();

analyze public.health_dispensations;
commit;
