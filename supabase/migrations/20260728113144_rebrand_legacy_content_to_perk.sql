update public.settings
set
  data = replace(data::text, 'Perk' || 'Up', 'Perk')::jsonb,
  updated_at = timezone('utc'::text, now())
where id = 'legal-pages'
  and data::text like ('%Perk' || 'Up%');

select vault.update_secret(
  secret_id := id,
  new_name := 'perk_billing_worker_url'
)
from vault.secrets
where name = 'perk' || 'up_billing_worker_url';

select vault.update_secret(
  secret_id := id,
  new_name := 'perk_billing_cron_secret'
)
from vault.secrets
where name = 'perk' || 'up_billing_cron_secret';

do $$
declare
  old_job cron.job%rowtype;
  new_job_id bigint;
begin
  select *
  into old_job
  from cron.job
  where jobname = 'perk' || 'up-subscription-billing-hourly';

  if found then
    new_job_id := cron.schedule(
      'perk-subscription-billing-hourly',
      old_job.schedule,
      replace(
        replace(
          old_job.command,
          'perk' || 'up_billing_worker_url',
          'perk_billing_worker_url'
        ),
        'perk' || 'up_billing_cron_secret',
        'perk_billing_cron_secret'
      )
    );

    perform cron.alter_job(
      job_id := new_job_id,
      active := old_job.active
    );
    perform cron.unschedule(old_job.jobid);
  end if;
end;
$$;
