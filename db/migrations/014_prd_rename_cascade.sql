-- 014_prd_rename_cascade.sql
-- Allow renaming a production's PRD code (the primary key, productions.id).
--
-- Problem: every child table references productions(id) with ON DELETE CASCADE
-- but NO "ON UPDATE" rule. Postgres' default ON UPDATE NO ACTION therefore
-- REJECTS any attempt to change productions.id whenever child rows exist, so
-- editing a PRD code in the UI silently fails (backend returns 500).
--
-- Fix: rebuild every FK that references productions(id) to add ON UPDATE CASCADE.
-- Idempotent — skips constraints that already have an ON UPDATE rule.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname                      AS name,
           con.conrelid::regclass::text      AS tbl,
           pg_get_constraintdef(con.oid)     AS def
    FROM   pg_constraint con
    JOIN   pg_class ref ON ref.oid = con.confrelid
    WHERE  con.contype = 'f'
      AND  ref.relname = 'productions'
      AND  position('ON UPDATE' IN upper(pg_get_constraintdef(con.oid))) = 0
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.name);
    EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s ON UPDATE CASCADE',
                   r.tbl, r.name, r.def);
  END LOOP;
END $$;
