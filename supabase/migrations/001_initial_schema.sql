create extension if not exists "uuid-ossp";

create table clients (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null,
  name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table client_configs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  config_type text not null,
  encrypted_value text not null,
  constraint valid_config_type check (config_type in ('stripe_webhook_secret', 'sender_name'))
);

create table pending_tasks (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  task_type text not null,
  context_json jsonb not null default '{}',
  prompt_template text,
  ai_response text,
  status text not null default 'pending',
  created_at timestamptz default now(),
  processed_at timestamptz,
  constraint valid_task_type check (task_type in ('failed_payment', 'onboarding_j0', 'onboarding_j3', 'onboarding_j7')),
  constraint valid_status check (status in ('pending', 'processing', 'sent', 'failed'))
);

create table activity_logs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  action_type text not null,
  payload_json jsonb default '{}',
  status text not null,
  created_at timestamptz default now()
);

create table scheduled_jobs (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  job_type text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending',
  payload_json jsonb default '{}',
  constraint valid_job_status check (status in ('pending', 'processing', 'done', 'failed'))
);

create table settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null
);

-- Index pour les requêtes fréquentes
create index idx_pending_tasks_status on pending_tasks(status);
create index idx_pending_tasks_client on pending_tasks(client_id);
create index idx_scheduled_jobs_scheduled_for on scheduled_jobs(scheduled_for) where status = 'pending';
create index idx_activity_logs_client on activity_logs(client_id);
