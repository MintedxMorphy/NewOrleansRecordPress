-- Press Operation Shift Log
create table if not exists press_log (
  id uuid primary key default gen_random_uuid(),
  operator_name text not null,
  shift text not null check (shift in ('day','night')),
  press_id text,
  job_ref text,
  records_pressed integer,
  duration_hours numeric(5,2),
  compound text,
  downtime_minutes integer,
  issues text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists press_log_created_at_idx on press_log(created_at desc);
create index if not exists press_log_operator_idx on press_log(operator_name);
