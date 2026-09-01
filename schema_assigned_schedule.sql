-- Emploi du temps d'une classe attribuee a un collegue.
--
-- L'administrateur peut deja creer les creneaux d'une classe qu'il a preparee : ils lui
-- appartiennent, et le collegue les voit puisque le planning est partage a l'echelle de
-- l'etablissement. Ce qu'il ne pouvait pas faire, c'est les modifier - un emploi du temps
-- prepare pour lui restait donc fige.
--
-- Un creneau suit desormais sa classe : qui peut acceder a la classe peut ajuster ses creneaux.
-- Le professeur attribue corrige son horaire lui-meme, sans que personne ait a se connecter a sa
-- place. La lecture, elle, ne change pas : elle etait deja ouverte a tout l'etablissement.

drop policy if exists eps_update on class_schedule_slots;
drop policy if exists eps_delete on class_schedule_slots;

create policy eps_update on class_schedule_slots for update to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)))
  with check (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)));

create policy eps_delete on class_schedule_slots for delete to authenticated
  using (eps_account_active() and (user_id = auth.uid() or eps_can_access_class(class_id)));

-- Meme raisonnement pour les activites posees sur ces creneaux : un emploi du temps prepare
-- serait inutilisable si le collegue ne pouvait pas choisir l'APSA de chaque periode.
drop policy if exists eps_update on period_activities;
drop policy if exists eps_delete on period_activities;

create policy eps_update on period_activities for update to authenticated
  using (eps_account_active() and (user_id = auth.uid()
    or exists(select 1 from class_schedule_slots s where s.id = period_activities.slot_id and eps_can_access_class(s.class_id))))
  with check (eps_account_active() and (user_id = auth.uid()
    or exists(select 1 from class_schedule_slots s where s.id = period_activities.slot_id and eps_can_access_class(s.class_id))));

create policy eps_delete on period_activities for delete to authenticated
  using (eps_account_active() and (user_id = auth.uid()
    or exists(select 1 from class_schedule_slots s where s.id = period_activities.slot_id and eps_can_access_class(s.class_id))));
