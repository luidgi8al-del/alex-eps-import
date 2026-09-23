-- "Divers EPS" : les travaux enregistres depuis les outils (groupes Acrosport, rotations,
-- observations, tournois, mesures, impacts, vitesse...) ne partaient jusqu'ici que dans la
-- memoire locale du navigateur (site) ou la base locale du telephone (app) - jamais vers le
-- serveur. Un changement d'appareil, de navigateur ou une reinstallation les effacait sans
-- retour possible. Cette table les fait passer par le meme circuit que les autres donnees EPS
-- (lireTable/enregistrerLigne cote site, SupabaseSyncManager cote app), avec suppression douce
-- comme partout ailleurs.
begin;
create table if not exists public.eps_saved_tool_works (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null default '',
  -- JSON serialise en texte, comme les autres charges libres du site (input_unit des tests,
  -- etc.) : evite toute ambiguite d'encodage jsonb cote client.
  payload text not null default '{}',
  class_id text references public.classes(id) on delete set null,
  period_number int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);
create index if not exists idx_eps_saved_tool_works_user on public.eps_saved_tool_works(user_id);
create index if not exists idx_eps_saved_tool_works_type on public.eps_saved_tool_works(type);
create index if not exists idx_eps_saved_tool_works_updated on public.eps_saved_tool_works(updated_at);

alter table public.eps_saved_tool_works enable row level security;
drop policy if exists "own saved tool works" on public.eps_saved_tool_works;
create policy "own saved tool works" on public.eps_saved_tool_works
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.eps_saved_tool_works to authenticated;
commit;
