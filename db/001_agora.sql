-- Agora: user posts that go live only after a moderator approves them.
-- Only the API function touches this schema (owner role); the Data API stays off.
create schema if not exists pw;

create table if not exists pw.posts (
  id uuid primary key default gen_random_uuid(),
  quote_id text not null check (char_length(quote_id) between 4 and 40),
  school text not null check (school in ('stoic', 'existential', 'eastern', 'absurd', 'socratic')),
  body text not null check (char_length(body) between 10 and 500),
  name text check (name is null or char_length(name) between 1 and 32),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  phew integer not null default 0 check (phew >= 0),
  ip_hash text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);
create index if not exists posts_feed on pw.posts (status, created_at desc);
create index if not exists posts_school_feed on pw.posts (school, status, created_at desc);
create index if not exists posts_by_ip on pw.posts (ip_hash, created_at desc);

-- one phew per visitor per post
create table if not exists pw.phews (
  post_id uuid not null references pw.posts (id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, ip_hash)
);

-- readers flag a wrong translation or attribution
create table if not exists pw.reports (
  id bigint generated always as identity primary key,
  quote_id text not null check (char_length(quote_id) between 4 and 40),
  note text not null check (char_length(note) between 3 and 500),
  ip_hash text,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists reports_open on pw.reports (status, created_at desc);
