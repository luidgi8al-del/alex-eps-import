-- Vérification séparée pour rendre le résultat de l'import visible dans le journal de déploiement.
do $$
declare imported_count integer;
begin
  select count(*) into imported_count
    from public.institution_calendar_events
   where id like 'lvh-2026-2027-%' and deleted = false;
  raise warning 'AUDIT_CALENDRIER_LVH: %/80 événements propres au PDF sont présents ; % doublon(s) ou ligne(s) déjà existante(s) ont été écartés',
    imported_count, 80 - imported_count;
end $$;
