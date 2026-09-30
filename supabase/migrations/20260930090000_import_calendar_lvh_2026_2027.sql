-- Calendrier Campus Victor Hugo 2026-2027, extrait du PDF établissement.
-- Les vacances et jours fériés déjà intégrés dans planning.js ne sont volontairement pas
-- dupliqués ici. L'import est rejouable : une date/intitulé déjà présent est conservé.
begin;

create temporary table eps_calendar_lvh_import (
  source_id text primary key,
  start_date date not null,
  end_date date not null,
  label text not null,
  kind text not null,
  comment text not null default 'Calendrier établissement LVH 2026-2027'
) on commit drop;

insert into eps_calendar_lvh_import(source_id,start_date,end_date,label,kind) values
('sep08-pedago','2026-09-08','2026-09-08','Conseil pédagogique de rentrée scolaire','BANALISEE'),
('sep14-15-parents','2026-09-14','2026-09-15','Rencontres PP-Parents','AUTRE'),
('sep17-parents','2026-09-17','2026-09-17','Rencontres PP-Parents','AUTRE'),
('sep22-cvl-elus','2026-09-22','2026-09-22','CVL et réunion des élus personnels','BANALISEE'),
('sep24-conseil-ecole','2026-09-24','2026-09-24','Conseil d’école','BANALISEE'),
('sep28-elections-delegues','2026-09-28','2026-09-28','Élections des délégués élèves','AUTRE'),
('sep29-conseil-etudiant','2026-09-29','2026-09-29','Conseil d’établissement et tournée L’Étudiant LVH','BANALISEE'),
('oct06-ag-delegues','2026-10-06','2026-10-06','Assemblée générale des délégués élèves','AUTRE'),
('oct08-elections','2026-10-08','2026-10-08','Élections CVL, délégués CE et personnels','AUTRE'),
('oct09-elections-parents','2026-10-09','2026-10-09','Élections des parents','AUTRE'),
('oct12-formation-pp','2026-10-12','2026-10-12','Formation PP - Comprendre Parcours Avenir','AUTRE'),
('oct13-cesce','2026-10-13','2026-10-13','CESCE','BANALISEE'),
('oct15-etudes-sup','2026-10-15','2026-10-15','Présentation des études supérieures aux parents de 1ère et Terminale','AUTRE'),
('nov02-reunion-elus','2026-11-02','2026-11-02','Réunion des élus personnels','BANALISEE'),
('nov03-cvl-ecole','2026-11-03','2026-11-03','CVL et conseil d’école','BANALISEE'),
('nov10-conseil-t1','2026-11-10','2026-11-10','Conseil d’établissement T1','BANALISEE'),
('nov15-bulletins','2026-11-15','2026-11-15','Rencontres parents et remise des bulletins 6e-5e','AUTRE'),
('nov16-24-stage-stmg','2026-11-16','2026-11-24','Stages STMG Terminale','AUTRE'),
('nov23-25-integration','2026-11-23','2026-11-25','Intégration STMG Agadir','SORTIE'),
('nov25-elus-parents','2026-11-25','2026-11-25','Réunion des élus parents','BANALISEE'),
('nov26-27-salon','2026-11-26','2026-11-27','Salon Avenir France','SORTIE'),
('nov26-chs','2026-11-26','2026-11-26','CHS et CHSCT n°1','BANALISEE'),
('nov28-fin-t1','2026-11-28','2026-11-28','Fin du 1er trimestre','AUTRE'),
('dec01-11-conseils','2026-12-01','2026-12-11','Conseils de classe T1 (6e à Terminale)','BANALISEE'),
('dec18-parcoursup-info','2026-12-18','2026-12-18','Parcoursup : ouverture du site d’information 2027','AUTRE'),
('jan04-galette','2027-01-04','2027-01-04','Galette et vœux','AUTRE'),
('jan12-elus','2027-01-12','2027-01-12','Réunion des élus personnels','BANALISEE'),
('jan18-22-stages','2027-01-18','2027-01-22','Stage découverte 3e et stage STMG 1ère','AUTRE'),
('jan18-parcoursup','2027-01-18','2027-01-18','Parcoursup : ouverture des inscriptions et formulation des vœux','AUTRE'),
('jan19-epo','2027-01-19','2027-01-19','2e EPO Terminales','EXAMEN'),
('jan21-parcoursup-parents','2027-01-21','2027-01-21','Présentation Parcoursup aux parents de Terminale','AUTRE'),
('jan25-terminales','2027-01-25','2027-01-25','Séances Terminales - phase 2','AUTRE'),
('jan29-bac-francais','2027-01-29','2027-01-29','Bac blanc de français 1ères','EXAMEN'),
('feb01-03-bac-blanc','2027-02-01','2027-02-03','Bac blanc GT : spécialités Terminale, philosophie et 1er EPO Premières','EXAMEN'),
('feb04-maths-stmg','2027-02-04','2027-02-04','Épreuves blanches de mathématiques et speed dating STMG','EXAMEN'),
('feb05-rapports','2027-02-05','2027-02-05','Remise des rapports de stage 3e','AUTRE'),
('feb11-12-speed','2027-02-11','2027-02-12','Speed dating STMG','AUTRE'),
('mar11-parcoursup','2027-03-11','2027-03-11','Parcoursup : dernier jour de formulation des vœux','AUTRE'),
('mar13-fin-t2','2027-03-13','2027-03-13','Fin du 2e trimestre','AUTRE'),
('mar15-conseils-etlv','2027-03-15','2027-03-15','Conseils de classe T2 et ETLV Terminale STMG','BANALISEE'),
('mar16-conseils-cvl','2027-03-16','2027-03-16','Conseils de classe T2, CVL et réunion des élus personnels','BANALISEE'),
('mar17-conseils','2027-03-17','2027-03-17','Conseils de classe T2','BANALISEE'),
('mar18-conseils-ecole','2027-03-18','2027-03-18','Conseils de classe T2 et conseil d’école','BANALISEE'),
('mar19-conseils-mismun','2027-03-19','2027-03-19','Conseils de classe T2 et MISMUN','BANALISEE'),
('mar20-21-mismun','2027-03-20','2027-03-21','MISMUN','SORTIE'),
('mar22-second-degre','2027-03-22','2027-03-22','Conseil du second degré','BANALISEE'),
('mar23-conseil-t2','2027-03-23','2027-03-23','Conseil d’établissement T2','BANALISEE'),
('mar24-dnb','2027-03-24','2027-03-24','DNB blanc','EXAMEN'),
('mar25-dnb-bfi','2027-03-25','2027-03-25','DNB blanc et BFI blanc','EXAMEN'),
('mar26-bfi','2027-03-26','2027-03-26','BFI blanc','EXAMEN'),
('mar29-epo','2027-03-29','2027-03-29','2e EPO Premières','EXAMEN'),
('apr01-parcoursup','2027-04-01','2027-04-01','Parcoursup : dernier jour de confirmation des vœux et finalisation des dossiers','AUTRE'),
('apr02-oraux-dnb','2027-04-02','2027-04-02','Oraux blancs DNB','EXAMEN'),
('apr05-07-francais','2027-04-05','2027-04-07','Oraux blancs de français 1ère','EXAMEN'),
('apr08-09-llcer','2027-04-08','2027-04-09','Oraux blancs LLCER','EXAMEN'),
('apr10-orientation','2027-04-10','2027-04-10','Forum de l’Orientation 2ndes - 4e édition','AUTRE'),
('apr12-eaf-eam','2027-04-12','2027-04-12','EAF et EAM blanc 1ère','EXAMEN'),
('apr14-16-bfi','2027-04-14','2027-04-16','Oraux Bac blanc BFI','EXAMEN'),
('may10-assr-grand-oral','2027-05-10','2027-05-10','ASSR collège et oral blanc du Grand Oral Terminale','EXAMEN'),
('may11-12-grand-oral','2027-05-11','2027-05-12','Oral blanc du Grand Oral Terminale','EXAMEN'),
('may13-csd','2027-05-13','2027-05-13','CSD n°2','BANALISEE'),
('may14-gestion','2027-05-14','2027-05-14','Oral de gestion 1STMG et épreuve coefficient 5 1ères SDGN','EXAMEN'),
('may15-chs','2027-05-15','2027-05-15','CHS et CHSCT n°2 et réunion des élus personnels','BANALISEE'),
('may20-21-pix','2027-05-20','2027-05-21','PIX Terminale','EXAMEN'),
('may24-25-pix','2027-05-24','2027-05-25','PIX Terminale','EXAMEN'),
('may28-fin-t3-term','2027-05-28','2027-05-28','Fin du 3e trimestre Terminale','AUTRE'),
('may31-conseils-term','2027-05-31','2027-05-31','Conseils de classe T3 Terminale','BANALISEE'),
('jun02-parcoursup','2027-06-02','2027-06-02','Parcoursup : réponses des formations','AUTRE'),
('jun04-fin-t3','2027-06-04','2027-06-04','Fin du 3e trimestre 3e, 2GT et 1ère','AUTRE'),
('jun08-10-conseils-lycee','2027-06-08','2027-06-10','Conseils de classe T3 Lycée','BANALISEE'),
('jun11-fin-t3','2027-06-11','2027-06-11','Fin du 3e trimestre 6e, 5e et 4e','AUTRE'),
('jun14-conseils-college','2027-06-14','2027-06-14','Conseils de classe T3 Collège','BANALISEE'),
('jun15-chs','2027-06-15','2027-06-15','CHS et CHSCT n°2 et réunion des élus personnels','BANALISEE'),
('jun16-conseils-college','2027-06-16','2027-06-16','Conseils de classe T3 Collège','BANALISEE'),
('jun17-cvl-ecole','2027-06-17','2027-06-17','CVL et conseil d’école','BANALISEE'),
('jun18-conseils-college','2027-06-18','2027-06-18','Conseils de classe T3 Collège','BANALISEE'),
('jun21-elus-parents','2027-06-21','2027-06-21','Réunion des élus parents','BANALISEE'),
('jun24-conseil-t3','2027-06-24','2027-06-24','Conseil d’établissement T3','BANALISEE'),
('jun28-cesce','2027-06-28','2027-06-28','CESCE','BANALISEE'),
('jun29-pedago','2027-06-29','2027-06-29','Conseil pédagogique','BANALISEE');

do $$
declare
  owner_id uuid;
  institution_count integer;
  duplicate_row record;
  inserted_count integer;
begin
  select count(*) into institution_count
    from public.institutions where created_by is not null;
  select created_by into owner_id
    from public.institutions where created_by is not null limit 1;
  if institution_count <> 1 or owner_id is null then
    raise exception 'Import LVH interrompu : un établissement administré unique était attendu, trouvé %', institution_count;
  end if;

  for duplicate_row in
    select s.start_date, s.end_date, s.label
      from eps_calendar_lvh_import s
      join public.institution_calendar_events e
        on e.deleted = false
       and e.start_date_epoch_millis = extract(epoch from s.start_date::timestamp) * 1000
       and e.end_date_epoch_millis = extract(epoch from s.end_date::timestamp) * 1000
       and lower(regexp_replace(e.label, '[^[:alnum:]]', '', 'g')) = lower(regexp_replace(s.label, '[^[:alnum:]]', '', 'g'))
  loop
    raise notice 'DOUBLON_CALENDRIER: % au % - %', duplicate_row.start_date, duplicate_row.end_date, duplicate_row.label;
  end loop;

  insert into public.institution_calendar_events(
    id,user_id,label,kind,start_date_epoch_millis,end_date_epoch_millis,comment,updated_at,deleted
  )
  select
    'lvh-2026-2027-' || s.source_id,
    owner_id,
    s.label,
    s.kind,
    (extract(epoch from s.start_date::timestamp) * 1000)::bigint,
    (extract(epoch from s.end_date::timestamp) * 1000)::bigint,
    s.comment,
    now(),
    false
  from eps_calendar_lvh_import s
  where not exists (
    select 1 from public.institution_calendar_events e
     where e.deleted = false
       and e.start_date_epoch_millis = extract(epoch from s.start_date::timestamp) * 1000
       and e.end_date_epoch_millis = extract(epoch from s.end_date::timestamp) * 1000
       and lower(regexp_replace(e.label, '[^[:alnum:]]', '', 'g')) = lower(regexp_replace(s.label, '[^[:alnum:]]', '', 'g'))
  )
  on conflict (id) do nothing;
  get diagnostics inserted_count = row_count;
  raise notice 'IMPORT_CALENDRIER_LVH: % événement(s) ajouté(s)', inserted_count;
end $$;

commit;
