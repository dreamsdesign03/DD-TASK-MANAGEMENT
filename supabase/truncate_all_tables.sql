-- Dreamsdesk → Empty / Truncate All Supabase Database Tables
-- Run this script in your Supabase Dashboard → SQL Editor to remove all records from all tables.
-- Table definitions, columns, and indexes will be preserved.

TRUNCATE TABLE 
  tasks,
  team,
  clients,
  payments,
  activity,
  chat_messages,
  files
RESTART IDENTITY CASCADE;

-- Optional: Verify all tables are empty
SELECT 'tasks' AS table_name, COUNT(*) FROM tasks
UNION ALL
SELECT 'team', COUNT(*) FROM team
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'activity', COUNT(*) FROM activity
UNION ALL
SELECT 'chat_messages', COUNT(*) FROM chat_messages
UNION ALL
SELECT 'files', COUNT(*) FROM files;
