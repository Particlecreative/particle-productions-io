-- Default User Groups
-- Run: docker exec -i particleproductionsio-db-1 psql -U cpanel cpanel < db/migrations/default_user_groups.sql

INSERT INTO user_groups (id, name, description, role, members, page_access) VALUES
  (gen_random_uuid(), 'Admins', 'Full system access — manage users, settings, all data', 'Admin', '{}', '{}'),
  (gen_random_uuid(), 'Producers', 'Production team — manage productions, budgets, logistics, scripts', 'Editor', '{}', '{}'),
  (gen_random_uuid(), 'Studio Team', 'Studio members — access to productions, scripts, links, and Monday tickets only', 'Studio', '{}', ARRAY['/', '/links', '/studio-tickets', '/scripts', '/manual']),
  (gen_random_uuid(), 'Accounting', 'Finance team — access to budgets, payments, invoices, and history only', 'Accounting', '{}', ARRAY['/financial', '/accounting', '/invoices', '/history']),
  (gen_random_uuid(), 'Viewers', 'Read-only access to all visible pages', 'Viewer', '{}', '{}')
ON CONFLICT DO NOTHING;
