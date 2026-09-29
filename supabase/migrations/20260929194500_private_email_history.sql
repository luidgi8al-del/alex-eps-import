begin;

drop policy if exists eps_email_campaign_read on public.eps_email_campaigns;
create policy eps_email_campaign_read on public.eps_email_campaigns for select to authenticated
  using (
    eps_account_active()
    and institution_id = eps_institution()
    and (user_id = auth.uid() or eps_is_admin(eps_institution()))
  );

drop policy if exists eps_email_delivery_read on public.eps_email_deliveries;
create policy eps_email_delivery_read on public.eps_email_deliveries for select to authenticated
  using (
    eps_account_active()
    and institution_id = eps_institution()
    and exists (
      select 1 from public.eps_email_campaigns c
      where c.id = campaign_id
        and c.institution_id = eps_institution()
        and (c.user_id = auth.uid() or eps_is_admin(eps_institution()))
    )
  );

comment on policy eps_email_campaign_read on public.eps_email_campaigns is
  'Chaque professeur lit ses envois. Un administrateur peut lire ceux de son établissement.';
comment on policy eps_email_delivery_read on public.eps_email_deliveries is
  'Le détail suit exactement la visibilité de la campagne.';

commit;
