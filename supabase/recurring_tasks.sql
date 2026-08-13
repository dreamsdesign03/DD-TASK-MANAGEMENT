-- ─────────────────────────────────────────────────────────────
-- Dreamsdesk → Recurring task auto-generation
--
-- Every day a scheduled job scans tasks where is_recurring = 'true',
-- computes the NEXT cycle due date (Weekly / Monthly / Yearly) strictly
-- after last_auto_generated_date, and creates a new task instance with:
--   • a fresh task id
--   • the computed due date
--   • next-cycle month / last_auto_generated_date on the new instance
-- The template's last_auto_generated_date is bumped so each cycle is
-- generated exactly once (idempotent — safe alongside the app-side runner).
--
-- Run this once in Supabase → SQL Editor. Requires pg_cron.
-- ─────────────────────────────────────────────────────────────

-- Safe date parse: accepts ISO + lenient formats like 'Aug 13, 2026'.
create or replace function safe_date(t text) returns date as $$
begin
  if t is null or trim(t) = '' then return null; end if;
  begin
    return t::date;
  exception when others then
    return null;
  end;
end;
$$ language plpgsql;

-- Next occurrence date strictly after p_last (mirrors frontend computeRecurringDueDate).
create or replace function recurring_next_date(p_schedule text, p_day text, p_months text, p_last date)
returns date as $$
declare
  d date := p_last;
  i int;
  mon3 text;
  mnum int;
begin
  if p_schedule = 'Weekly' then
    if p_day is null or trim(p_day) = '' then return null; end if;
    for i in 1..30 loop
      d := d + 1;
      if lower(to_char(d, 'FMDay')) = lower(trim(p_day)) then
        return d;
      end if;
    end loop;
    return null;
  end if;

  if p_schedule = 'Monthly' then
    if p_months is null or trim(p_months) = '' then return null; end if;
    for i in 1..16 loop
      d := d + interval '1 month';
      foreach mon3 in array string_to_array(p_months, ',') loop
        mnum := case substring(lower(trim(mon3)), 1, 3)
          when 'jan' then 1 when 'feb' then 2 when 'mar' then 3 when 'apr' then 4
          when 'may' then 5 when 'jun' then 6 when 'jul' then 7 when 'aug' then 8
          when 'sep' then 9 when 'oct' then 10 when 'nov' then 11 when 'dec' then 12
          else 0 end;
        if mnum = extract(month from d) then
          d := date_trunc('month', d)::date;
          if extract(dow from d) = 0 then d := d + 1; end if; -- Sunday -> Monday
          return d;
        end if;
      end loop;
    end loop;
    return null;
  end if;

  if p_schedule = 'Yearly' then
    d := (date_trunc('year', d) + interval '1 year')::date;
    if extract(dow from d) = 0 then d := d + 1; end if; -- Sunday -> Monday
    return d;
  end if;

  return null;
end;
$$ language plpgsql;

-- Generate due recurring task instances. Returns number of templates processed.
create or replace function generate_recurring_tasks() returns int as $$
declare
  r record;
  nxt date;
  new_id text;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  month_label text;
  processed int := 0;
begin
  for r in select * from tasks
    where is_recurring is not null and lower(is_recurring) = 'true'
  loop
    nxt := recurring_next_date(
      r.recurring_schedule,
      r.recurring_day,
      r.recurring_months,
      coalesce(safe_date(r.last_auto_generated_date),
               safe_date(r.assigned_date),
               r.created_at::date)
    );

    if nxt is not null and nxt <= today then
      -- Atomic claim of this cycle (idempotency guard).
      update tasks set last_auto_generated_date = to_char(nxt, 'YYYY-MM-DD')
        where task_id = r.task_id
          and (last_auto_generated_date is null
               or safe_date(last_auto_generated_date) < nxt);

      if found then
        select 'T-' || lpad((coalesce(max(nullif(regexp_replace(task_id, '[^0-9]', '', 'g'), '')::bigint), 0) + 1)::text, 7, '0')
          into new_id from tasks;
        month_label := to_char(nxt, 'FMMonth YYYY');

        insert into tasks (
          task_id, client, month, task_title, task_type, main_task_id, description,
          assigned_by, assigned_to, employee_ids, assigned_emails, department,
          assigned_date, due_date, priority, status, status_updated_on, time_taken,
          days_overdue, remarks, post, attachment, is_recurring, recurring_schedule,
          recurring_day, recurring_months, last_auto_generated_date
        ) values (
          new_id, r.client, month_label, r.task_title, r.task_type, r.main_task_id, r.description,
          r.assigned_by, r.assigned_to, r.employee_ids, r.assigned_emails, r.department,
          to_char(today, 'YYYY-MM-DD'), to_char(nxt, 'YYYY-MM-DD'), r.priority, 'Pending',
          to_char(today, 'YYYY-MM-DD'), '0h 0m', 'No', r.remarks, r.post, r.attachment,
          'AUTO_GENERATED', r.recurring_schedule, r.recurring_day, r.recurring_months,
          to_char(nxt, 'YYYY-MM-DD')
        );

        processed := processed + 1;
      end if;
    end if;
  end loop;

  return processed;
end;
$$ language plpgsql;

-- Schedule it to run every day at 05:30 IST (00:00 UTC).
create extension if not exists pg_cron;
select cron.unschedule('generate-recurring-tasks')
  where exists (select 1 from cron.job where jobname = 'generate-recurring-tasks');
select cron.schedule('generate-recurring-tasks', '0 0 * * *', $$ select generate_recurring_tasks(); $$);

-- Manual test:
-- select generate_recurring_tasks();
