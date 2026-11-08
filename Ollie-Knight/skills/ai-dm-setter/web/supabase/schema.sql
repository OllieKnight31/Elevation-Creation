-- Ainable Setter: Supabase tables.
-- Run once in the Supabase SQL editor (or let `npm run setup` do it). Safe to run again.
-- Every row belongs to a workspace. Only the service key can read or write: row level security is on with no public policies.

create table if not exists setter_workspaces (
  id text primary key,
  name text,
  data jsonb not null,
  label_queue jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists setter_leads (
  id text primary key,
  workspace_id text not null,
  platform text not null,
  external_id text,
  name text not null,
  handle text,
  profile_url text,
  origin text,
  stage text not null,
  stage_name text,
  tags text[] not null default '{}',
  status text,
  ai_mode text,
  assigned_to text,
  assigned_name text,
  situation text,
  goal text,
  pain text,
  objections text[] not null default '{}',
  budget text,
  email text,
  phone text,
  summary text,
  next_step text,
  notes text,
  loss_reason text,
  unread boolean not null default false,
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz not null default now(),
  data jsonb not null
);
create index if not exists setter_leads_ws on setter_leads (workspace_id, last_message_at desc);
create index if not exists setter_leads_stage on setter_leads (workspace_id, stage);
create index if not exists setter_leads_tags on setter_leads using gin (tags);

create table if not exists setter_messages (
  id text primary key,
  workspace_id text not null,
  lead_id text not null,
  direction text not null,
  sender text not null,
  member_id text,
  body text not null,
  sent_at timestamptz not null,
  source text,
  external_id text
);
create index if not exists setter_messages_lead on setter_messages (lead_id, sent_at);
create index if not exists setter_messages_ws on setter_messages (workspace_id, sent_at desc);

create table if not exists setter_events (
  id text primary key,
  workspace_id text not null,
  lead_id text,
  type text not null,
  stage text,
  detail text,
  actor text,
  member_id text,
  at timestamptz not null,
  data jsonb not null
);
create index if not exists setter_events_ws on setter_events (workspace_id, at desc);
create index if not exists setter_events_lead on setter_events (lead_id, at);

alter table setter_workspaces enable row level security;
alter table setter_leads enable row level security;
alter table setter_messages enable row level security;
alter table setter_events enable row level security;
