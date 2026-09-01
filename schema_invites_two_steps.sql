-- Invitation en deux temps : creer le compte d'abord, envoyer le mail plus tard.
--
-- Jusqu'ici "Inviter un professeur" reservait la place ET envoyait le mail dans la foulee. Le
-- collegue recevait donc son invitation avant que quoi que ce soit ait ete prepare pour lui.
--
-- On separe : l'administrateur reserve la place quand il veut, prepare les classes du collegue
-- (voir schema_assigned_classes.sql), puis declenche l'envoi le jour ou c'est pret.
--
-- Ces fonctions restent reservees au service serveur : aucune capacite d'administration ne doit
-- etre atteignable depuis la page web ou l'application.

-- Places reservees dont personne n'a encore reclame le compte.
create or replace function public.eps_pending_invites(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  ctx = eps_admin_target(p_actor);
  return coalesce(
    (select jsonb_agg(jsonb_build_object('email', i.email, 'name', i.display_name, 'created_at', i.created_at)
                      order by i.created_at)
     from eps_teacher_invites i
     where i.institution_id = (ctx->>'institution_id')::uuid and i.claimed_by is null),
    '[]'::jsonb
  );
end $$;

-- Verifie qu'un mail correspond bien a une place reservee de l'etablissement de l'administrateur,
-- avant d'accepter de lui envoyer une invitation. Sans ce controle, l'action d'envoi deviendrait
-- un moyen d'expedier des mails a n'importe quelle adresse.
create or replace function public.eps_pending_invite_exists(p_actor uuid, p_email text)
returns boolean language plpgsql security definer set search_path=public as $$
declare ctx jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  ctx = eps_admin_target(p_actor);
  return exists(
    select 1 from eps_teacher_invites
    where institution_id = (ctx->>'institution_id')::uuid
      and email = lower(trim(p_email))
      and claimed_by is null
  );
end $$;

revoke all on function public.eps_pending_invites(uuid), public.eps_pending_invite_exists(uuid, text)
  from public, anon, authenticated;
