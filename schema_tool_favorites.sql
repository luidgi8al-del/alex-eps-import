-- Favoris d'outils, partages entre l'application et le site : un outil mis en favori sur l'un
-- doit reapparaitre sur l'autre. Meme forme que teacher_profiles (schema_teacher_profile.sql) :
-- une ligne par professeur, un revision pour eviter qu'un enregistrement en retard n'ecrase un
-- ajout plus recent fait depuis l'autre appareil.
begin;
create table if not exists public.tool_favorites (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.tool_favorites enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='tool_favorites' and policyname='own tool favorites') then
    create policy "own tool favorites" on public.tool_favorites for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
  end if;
end $$;
grant select,insert,update on public.tool_favorites to authenticated;

create or replace function public.save_tool_favorites(p_revision bigint, p_favorites jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare new_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_favorites) <> 'array' then raise exception 'Invalid favorites'; end if;
  if p_revision = 0 then
    insert into public.tool_favorites(user_id, favorites) values(auth.uid(), p_favorites)
    on conflict(user_id) do update set favorites = excluded.favorites, revision = tool_favorites.revision + 1, updated_at = now()
    returning revision into new_revision;
  else
    update public.tool_favorites set favorites = p_favorites, revision = revision + 1, updated_at = now()
    where user_id = auth.uid() and revision = p_revision returning revision into new_revision;
  end if;
  return jsonb_build_object('saved', new_revision is not null, 'revision', new_revision);
end $$;
revoke all on function public.save_tool_favorites(bigint, jsonb) from public;
grant execute on function public.save_tool_favorites(bigint, jsonb) to authenticated;
commit;
