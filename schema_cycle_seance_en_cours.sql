-- Seance en cours d'un cycle, partagee entre l'application et le site.
--
-- L'application tient ce compteur depuis toujours (TeachingCycleEntity.currentSessionNumber) mais
-- ne l'envoyait pas : la table "cycles" n'avait que session_count. Le site ne pouvait donc pas
-- afficher "Seance 3/8", ni surtout avancer le compteur sans que l'application le contredise au
-- prochain rapprochement.
--
-- Les trois colonnes ci-dessous existent deja cote application. Les ajouter ici ne change rien a
-- ce qui est enregistre : elles se remplissent au premier envoi, et gardent leur valeur par
-- defaut pour les cycles anciens.
--
-- A lancer une fois dans l'editeur SQL de Supabase.

begin;

-- Numero de la prochaine seance a mener, 1-indexe. La borne haute suit session_count, qui est
-- deja contraint entre 1 et 20 : inutile de la repeter ici, et le laisser libre evite qu'une
-- reduction du nombre de seances fasse echouer un envoi legitime.
alter table cycles add column if not exists current_session_number int not null default 1;

-- Rattachement d'un cycle a une periode du planning ("planning-period-3"). L'application s'en
-- sert pour distinguer un cycle cree depuis le planning d'un cycle libre portant la meme APSA.
alter table cycles add column if not exists priority_objective text;

-- Installation prevue pour le cycle. Distincte de period_activities.installation_name, qui porte
-- l'installation du creneau : un cycle d'evaluation libre n'a pas de creneau.
alter table cycles add column if not exists installation text;

-- Garde-fou, pose une seule fois : relancer ce fichier ne doit jamais echouer.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cycles_current_session_positive') then
    alter table cycles add constraint cycles_current_session_positive check (current_session_number >= 1);
  end if;
end $$;

commit;
