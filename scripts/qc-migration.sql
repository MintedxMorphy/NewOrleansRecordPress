create table if not exists qc_log (
  id uuid default gen_random_uuid() primary key,
  worker_name text not null,
  shift text not null,
  job_ref text,
  task_types text[],
  duration_hours numeric,
  quantity integer,
  status text,
  notes text,
  is_director boolean default false,
  created_at timestamptz default now()
);

create table if not exists qc_sticky (
  id integer primary key default 1,
  message text,
  updated_by text,
  updated_at timestamptz default now()
);
