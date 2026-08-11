-- Dreamsdesk → Supabase schema
-- Maps the old Google Sheets tables 1:1 so the new backend can read/write
-- the same data the frontend already expects.
-- Run this in Supabase → SQL Editor.

-- ============ TEAM (old "Team" sheet) ============
create table if not exists team (
  employee_id   text primary key,      -- e.g. EMP-001
  full_name     text not null,
  email_address text unique not null,
  password_token text,                 -- replaced by supabase.auth later
  department    text,
  phone         text,
  joined_date   text,
  is_active     boolean default true,
  role          text default 'Employee',
  status        text
);

-- ============ TASKS (old "Tasks" sheet, 27 cols) ============
create table if not exists tasks (
  task_id                 text primary key,
  client                  text,
  month                   text,
  task_title              text,
  task_type               text,
  main_task_id            text,
  description             text,
  assigned_by             text,
  assigned_to             text,
  employee_ids            text,
  assigned_emails         text,
  department              text,
  assigned_date           text,
  due_date                text,
  priority                text default 'Medium',
  status                  text default 'Pending',
  status_updated_on       text,
  time_taken              text,
  days_overdue            text,
  remarks                 text,
  post                    text,
  attachment              text,
  is_recurring            text default 'false',
  recurring_schedule      text,
  recurring_day           text,
  recurring_months        text,
  last_auto_generated_date text
);

-- ============ CLIENTS (old "Clients" sheet) ============
create table if not exists clients (
  client_id                text primary key,
  project_name             text,
  client_name              text,
  contact_email            text,
  phone                    text,
  project_start_date       text,
  industry                 text,
  is_active                boolean default true,
  services                 text,
  project_completion_date  text,
  drive_folder_link        text,
  important_links          text
);

-- ============ PAYMENTS (old "Payment" sheet) ============
create table if not exists payments (
  client_id               text,
  project                 text,
  client                  text,
  emails                  text,
  phone_no                text,
  project_start_date      text,
  industry                text,
  is_active               text,
  services                text,
  project_end_date        text,
  gst_non_gst             text,
  gst_amount_new          text,
  gst_pct                 text,
  recurring               text,
  recurring_type          text,
  total_cost              text,
  payment_date            text,
  payment_amount          text,
  payment_note            text,
  pending_amount          text,
  data_entry_date_and_time text,
  note                    text
);

-- ============ ACTIVITY (old "Activity" sheet) ============
create table if not exists activity (
  employee_id          text,
  full_name            text,
  role                 text,
  department           text,
  login_date_and_time  text,
  logout_date_and_time text
);

-- ============ CHAT (old "Chat" / "group_*" sheets) ============
create table if not exists chat_messages (
  id          text primary key,
  action      text,
  room_id     text,
  sender_id   text,
  sender_name text,
  message     text,
  timestamp   text,
  type        text,
  group_name  text
);

-- ============ FILES (replaces Drive uploads; S3 / Supabase Storage) ============
create table if not exists files (
  id           uuid primary key default gen_random_uuid(),
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  storage_path text,        -- bucket + key in Supabase Storage / MinIO
  project_name text,
  department   text,
  uploaded_by  text,
  uploaded_at  timestamptz default now()
);

-- Basic indexes for the queries the frontend makes
create index if not exists idx_tasks_status    on tasks(status);
create index if not exists idx_tasks_department on tasks(department);
create index if not exists idx_tasks_client    on tasks(client);
create index if not exists idx_clients_active  on clients(is_active);
create index if not exists idx_payments_client on payments(client_id);
create index if not exists idx_chat_room       on chat_messages(room_id);
