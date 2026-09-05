-- ---------------------------------------------------------------------------------------------
-- Sante / Dispenses, deuxieme vague.
--
-- Trois manques, tous constates a l'usage :
--   1. On pouvait enregistrer deux fois la meme dispense sur le meme eleve et la meme periode.
--   2. La dispense ne disait pas de quoi il s'agissait : impossible de prevenir, a l'appel AS,
--      qu'un eleve ne peut pas faire la seance, ni de dire pourquoi.
--   3. Chacun ne voyait que ses propres dispenses : aucun bilan d'equipe.
--
-- Le fichier est idempotent : le relancer ne casse rien. A coller en entier dans le SQL Editor.
-- ---------------------------------------------------------------------------------------------
begin;

-- 1. Le motif, et son intitule court -----------------------------------------------------------
alter table public.health_dispensations add column if not exists reason text;
alter table public.health_dispensations add column if not exists reason_kind text;

-- Une famille de motif, pour pouvoir compter et filtrer plus tard sans relire du texte libre.
-- 'AUTRE' accepte tout le reste : mieux vaut une case fourre-tout qu'un enseignant bloque.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'health_dispense_reason_kind') then
    alter table public.health_dispensations add constraint health_dispense_reason_kind
      check (reason_kind is null or reason_kind in
        ('BLESSURE','MALADIE','CERTIFICAT','INAPTITUDE_PARTIELLE','AUTRE'));
  end if;
end $$;

-- 2. Le garde-fou contre le doublon ------------------------------------------------------------
-- Deux fois la meme dispense sur le meme eleve et les memes dates n'a aucun sens : c'est une
-- double saisie. On l'empeche au niveau de la base, pas seulement dans l'ecran, parce que le
-- site et l'application ecrivent tous les deux ici, et qu'une saisie hors connexion arrive plus
-- tard. Les lignes effacees ne comptent pas : on doit pouvoir ressaisir apres une suppression.
create unique index if not exists uq_health_dispense_sans_doublon
  on public.health_dispensations (student_id, start_date, end_date)
  where deleted = false;

-- 3. La lecture partagee entre collegues du meme etablissement ---------------------------------
-- Meme regle que le planning : on lit tout l'etablissement, on n'ecrit que ses propres lignes.
-- Sans cela, "Tous les dispenses" ne montrerait jamais que les siennes.
drop policy if exists health_dispensations_read on public.health_dispensations;
create policy health_dispensations_read on public.health_dispensations
  for select to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_institution(user_id) = eps_institution()));

-- L'ecriture, la modification et l'effacement restent personnels : on ne touche pas a la
-- dispense saisie par un collegue.
drop policy if exists health_dispensations_insert on public.health_dispensations;
create policy health_dispensations_insert on public.health_dispensations
  for insert to authenticated with check (user_id = auth.uid() and eps_account_active());
drop policy if exists health_dispensations_update on public.health_dispensations;
create policy health_dispensations_update on public.health_dispensations
  for update to authenticated using (user_id = auth.uid() and eps_account_active())
  with check (user_id = auth.uid() and eps_account_active());
drop policy if exists health_dispensations_delete on public.health_dispensations;
create policy health_dispensations_delete on public.health_dispensations
  for delete to authenticated using (user_id = auth.uid() and eps_account_active());

-- Lire "les dispenses en cours de l'etablissement" doit rester rapide quand il y en aura mille.
create index if not exists idx_health_dispense_periode
  on public.health_dispensations (end_date desc, start_date desc) where deleted = false;

analyze public.health_dispensations;

-- Le marqueur : le site et l'application n'allument le motif et les onglets qu'une fois ce
-- fichier passe. Tant qu'il n'est pas la, ils continuent de fonctionner comme avant.
insert into public.eps_schema_marks (name) values ('sante_2')
  on conflict (name) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------------------------
-- Verification, a lancer apres :
--   select name, applied_at from public.eps_schema_marks where name = 'sante_2';
--   select column_name from information_schema.columns
--    where table_name = 'health_dispensations' and column_name in ('reason','reason_kind');
-- ---------------------------------------------------------------------------------------------
