-- Accounts: an optional sign-in (Google, or a code sent by email) so a reader's lamp, notebook, collection and
-- settings follow them to every device. Additive: nothing here touches the Agora's tables. Only the API function
-- reads or writes these (owner role); the Data API stays off. Every secret is stored hashed: session tokens as
-- sha256, sign-in and device-link codes as an HMAC keyed by SESSION_SECRET (a copy of the table reveals no code).

create table if not exists pw.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and char_length(email) between 3 and 254),
  google_sub text unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- one row per code sent, kept a day for the send limits: a code used (or its account deleted) is spent, its hash wiped
create table if not exists pw.login_codes (
  id bigint generated always as identity primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  ip_hash text
);
create index if not exists login_codes_email on pw.login_codes (email, created_at desc);
create index if not exists login_codes_ip on pw.login_codes (ip_hash, created_at desc);
create index if not exists login_codes_created on pw.login_codes (created_at);

-- one row per signed-in device: the cookie holds the token, this table only its sha256
create table if not exists pw.sessions (
  token_hash text primary key,
  user_id uuid not null references pw.users (id) on delete cascade,
  method text not null check (method in ('email', 'google', 'link')),
  label text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_user on pw.sessions (user_id);
create index if not exists sessions_expiry on pw.sessions (expires_at);

-- the reader's saved progress: one JSON document, versioned for optimistic concurrency
create table if not exists pw.user_state (
  user_id uuid primary key references pw.users (id) on delete cascade,
  state jsonb not null,
  rev integer not null default 1 check (rev > 0),
  updated_at timestamptz not null default now()
);

-- "light your lamp on another device": a single-use code shown as a QR (long) and typed by hand (short)
create table if not exists pw.link_codes (
  code_hash text primary key,
  short_hash text not null unique,
  user_id uuid not null references pw.users (id) on delete cascade,
  session_hash text, -- the device showing the code, which waits to hear it was claimed
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists link_codes_user on pw.link_codes (user_id, created_at desc);
create index if not exists link_codes_created on pw.link_codes (created_at);

-- attempts counted for the hourly limits (Google sign-ins and code checks per visitor, links per account)
create table if not exists pw.auth_hits (
  kind text not null,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists auth_hits_key on pw.auth_hits (kind, key, at desc);
create index if not exists auth_hits_at on pw.auth_hits (at);
