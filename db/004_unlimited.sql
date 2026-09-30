-- Pulls without flames for accounts the owner names (a friend, a tester): the app reads the flag from /api/me and
-- /api/state, and never spends a flame for them. Grant with:
--   update pw.users set unlimited = true where email = 'someone@example.com';
alter table pw.users add column if not exists unlimited boolean not null default false;
