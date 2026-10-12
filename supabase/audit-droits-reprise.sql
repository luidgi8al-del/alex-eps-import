-- Lecture seule : état des droits déployés. Ne lit aucune fiche élève et ne modifie rien.
select schemaname,tablename,rowsecurity from pg_tables
where schemaname='public' and tablename in
('classes','students','evaluations','evaluation_criteria','evaluation_scores','eps_test_sessions','eps_test_results','health_dispensations','class_documents','eps_lesson_archives','sport_installation_incidents','eps_installation_managers');
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in
('classes','students','evaluation_scores','health_dispensations','eps_lesson_archives','sport_installation_incidents','eps_installation_managers')
order by tablename,policyname;
select table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') and table_name in
('eps_lesson_archives','eps_installation_managers','evaluation_scores','health_dispensations')
order by table_name,grantee,privilege_type;
-- Le résultat documente la configuration, pas la réussite d'un test multi-comptes.
