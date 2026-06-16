SELECT cron.unschedule('mj-apply-match-plan');
SELECT cron.schedule(
  'mj-apply-match-plan',
  '* * * * *',
  $$SELECT public._mj_apply_batch(1500);$$
);