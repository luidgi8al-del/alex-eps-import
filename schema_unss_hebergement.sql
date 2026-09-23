-- Hebergement AS : un eleve licencie peut proposer d'heberger un(e) camarade lors des
-- deplacements (competitions, sorties). S'ajoute a la fiche de licence, a cote du vœu et de la
-- taille de maillot. Script idempotent a executer dans l'editeur SQL Supabase.
begin;

alter table unss_students add column if not exists host_available boolean not null default false;
-- Nombre de places (eleves) que la famille peut accueillir.
alter table unss_students add column if not exists host_capacity int;
-- Age souhaite des eleves accueillis, en annees - une fourchette large (12 a 16 ans) plutot
-- qu'un age precis, et facultative : beaucoup de familles ne se prononcent pas dessus.
alter table unss_students add column if not exists host_age_min int;
alter table unss_students add column if not exists host_age_max int;
-- Sexe des eleves accueillis : 'F', 'M', ou vide/NULL si indifferent.
alter table unss_students add column if not exists host_sex_pref text;

-- Dossier administratif de la licence : ce qu'il manque encore pour que l'inscription soit
-- complete. Deux cases a cocher plutot qu'un texte libre, pour les repérer d'un coup d'oeil
-- dans la liste des licencies (badge) sans avoir a rouvrir chaque fiche.
alter table unss_students add column if not exists payment_missing boolean not null default false;
alter table unss_students add column if not exists medical_certificate_missing boolean not null default false;

commit;
