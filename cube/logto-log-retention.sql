-- Deletes every row of Logto's sign-in log older than 30 days, the retention the privacy policy
-- states for it (#196 item 5, #235), and answers how many rows it deleted. Run once a day by
-- logto-log-retention.sh, as Logto's role `logto`, on Logto's database `logto`.
--
-- `logs` and its `created_at` are as Logto 1.46.0 defines them (packages/schemas/tables/logs.sql).
-- It holds the audit log of every sign-in, registration and Management API call, with the request's
-- IP address and user agent (packages/core/src/middleware/koa-audit-log.ts), and the webhook
-- deliveries (keys `TriggerHook.*`), which go with it. `logto` owns the table, so Logto's row level
-- security, which is not forced on the owner, lets it delete every tenant's rows.
WITH deleted AS (
  DELETE FROM logs WHERE created_at < now() - interval '30 days' RETURNING 1
)
SELECT count(*) FROM deleted;
