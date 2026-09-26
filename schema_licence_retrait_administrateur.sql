-- Retirer la licence AS : reserve a l'administrateur de l'etablissement.
--
-- Accorder une licence coche un eleve deja present et reste ouvert a chacun - c'est le geste
-- ordinaire d'un professeur qui inscrit les siens. Le retirer est l'inverse : il sort l'eleve de
-- l'association sportive, et rien ne le distinguait jusqu'ici d'une simple correction de fiche.
--
-- Pourquoi un declencheur et non une regle RLS : une regle ne voit qu'une seule version de la
-- ligne a la fois - l'ancienne dans USING, la nouvelle dans WITH CHECK - et ne peut donc pas
-- dire "cette colonne a change". Interdire "licensed = false" dans WITH CHECK bloquerait au
-- passage toute modification d'un eleve non licencie, c'est-a-dire l'essentiel du repertoire.
--
-- Le declencheur s'applique a tout le monde, y compris a la cle de service : aucun chemin ne le
-- contourne. Accorder une licence, corriger une fiche et inscrire a un creneau restent ouverts.
--
-- Idempotent : ce fichier peut etre relance sans risque.
begin;

create or replace function public.eps_garde_retrait_licence()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.licensed and not new.licensed
     and not public.eps_is_admin(public.eps_institution()) then
    raise exception 'Seul l''administrateur de l''etablissement peut retirer une licence AS'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists eps_garde_retrait_licence on public.unss_students;
create trigger eps_garde_retrait_licence
  before update on public.unss_students
  for each row execute function public.eps_garde_retrait_licence();

insert into public.eps_schema_marks (name) values ('licence_retrait_admin')
  on conflict (name) do update set applied_at = now();

commit;

-- Verification apres coup :
-- select tgname from pg_trigger where tgrelid = 'public.unss_students'::regclass
--   and not tgisinternal;
