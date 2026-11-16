-- Row-level security, the app role, and append-only triggers (03 §9, 05 §2, §5).
--
-- Applied by `migrate()` after the Drizzle migrations, on every start. Every
-- statement is idempotent. Keep the table list in step with TENANT_TABLES in
-- src/schema.ts (a test checks they match).
--
-- How isolation works:
-- * Tenant queries run only through `withOrg()`, which opens a transaction and
--   sets two transaction-local settings in one statement:
--     set_config('app.org_id', <org>, true)
--     set_config('role', 'dueproof_app', true)
-- * `dueproof_app` is a NOLOGIN role without BYPASSRLS. Superusers and table
--   owners bypass RLS, so switching to this role is what makes the policies
--   bite even when the connection logs in as the owner (PGlite, a dev
--   Postgres, the Neon owner role).
-- * FORCE ROW LEVEL SECURITY covers a connection that logs in as the owner
--   without switching role.
-- * With `app.org_id` unset, `current_setting(..., true)` is NULL and no rows
--   match: the default is deny.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dueproof_app') THEN
    CREATE ROLE dueproof_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;
--> statement-breakpoint

-- The connecting user must be able to SET ROLE dueproof_app.
DO $$
BEGIN
  IF NOT pg_has_role(current_user, 'dueproof_app', 'MEMBER') THEN
    EXECUTE format('GRANT dueproof_app TO %I', current_user);
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO dueproof_app;
--> statement-breakpoint

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'org_settings', 'holidays', 'clients', 'registrations', 'contacts', 'cases',
    'documents', 'pages', 'document_events', 'findings', 'evidence', 'finding_edits',
    'deadlines', 'demands', 'comments', 'notifications', 'saved_views', 'document_passwords', 'push_subscriptions',
    'ai_settings', 'ai_runs', 'audit'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I AS PERMISSIVE FOR ALL '
      'USING (org_id = current_setting(''app.org_id'', true)) '
      'WITH CHECK (org_id = current_setting(''app.org_id'', true))',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO dueproof_app', t);
  END LOOP;
END
$$;
--> statement-breakpoint

-- bigserial ids (document_events, finding_edits, audit).
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dueproof_app;
--> statement-breakpoint

-- Append-only tables: edits and the audit trail are never changed or removed.
REVOKE UPDATE, DELETE, TRUNCATE ON finding_edits, audit FROM dueproof_app;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION dueproof_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS finding_edits_append_only ON finding_edits;
--> statement-breakpoint
CREATE TRIGGER finding_edits_append_only BEFORE UPDATE OR DELETE ON finding_edits
  FOR EACH ROW EXECUTE FUNCTION dueproof_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS finding_edits_no_truncate ON finding_edits;
--> statement-breakpoint
CREATE TRIGGER finding_edits_no_truncate BEFORE TRUNCATE ON finding_edits
  FOR EACH STATEMENT EXECUTE FUNCTION dueproof_append_only();
--> statement-breakpoint

DROP TRIGGER IF EXISTS audit_append_only ON audit;
--> statement-breakpoint
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit
  FOR EACH ROW EXECUTE FUNCTION dueproof_append_only();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_no_truncate ON audit;
--> statement-breakpoint
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit
  FOR EACH STATEMENT EXECUTE FUNCTION dueproof_append_only();
