-- VITS Library Duty Tools & Scheduling — Idempotent Seed Data

insert into public.library_sections (id, code, name, location) values
  ('sec-circulation', 'CIR-1F', 'Circulation', 'Main Library 1F — Lobby Desk'),
  ('sec-periodicals', 'PER-2F', 'Periodicals', 'Main Library 2F — East Wing'),
  ('sec-reference', 'REF-3F', 'Reference', 'Main Library 3F — North Reading Room')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  location = excluded.location;

insert into public.profiles (id, university_id, email, full_name, role, department, done_hours, required_hours) values
  ('11111111-1111-4111-8111-111111111101', '2024-10001', 'juan.delacruz@university.edu', 'Juan Dela Cruz', 'STUDENT', 'BS Information Technology', 24, 60),
  ('11111111-1111-4111-8111-111111111102', '2024-10482', 'maria.santos@university.edu', 'Maria Santos', 'STUDENT', 'BS Library & Information Science', 30, 60),
  ('11111111-1111-4111-8111-111111111103', '2024-11904', 'paolo.lim@university.edu', 'Paolo Lim', 'STUDENT', 'BA History', 18, 60),
  ('11111111-1111-4111-8111-111111111104', 'OIC-08119', 'reyes.oic@university.edu', 'Ms. Reyes', 'OIC', 'University Main Library', 0, 0)
on conflict (university_id) do update set
  email = excluded.email,
  full_name = excluded.full_name,
  role = excluded.role,
  department = excluded.department,
  done_hours = excluded.done_hours,
  required_hours = excluded.required_hours;

insert into public.shifts (id, day_label, shift_date, start_time, end_time, section, section_id, oic_name, student_name, student_profile_id, status) values
  (1, 'Mon', 'Oct 26', '08:00', '12:00', 'Circulation', 'sec-circulation', 'Ms. Reyes', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 'Completed'),
  (2, 'Tue', 'Oct 27', '13:00', '17:00', 'Periodicals', 'sec-periodicals', 'Ms. Reyes', 'Maria Santos', '11111111-1111-4111-8111-111111111102', 'Completed'),
  (3, 'Wed', 'Oct 28', '09:00', '13:00', 'Circulation', 'sec-circulation', 'Ms. Reyes', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 'Scheduled'),
  (4, 'Wed', 'Oct 28', '13:00', '17:00', 'Reference', 'sec-reference', 'Ms. Reyes', 'Maria Santos', '11111111-1111-4111-8111-111111111102', 'Scheduled'),
  (5, 'Thu', 'Oct 29', '08:00', '12:00', 'Reference', 'sec-reference', 'Ms. Reyes', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 'Scheduled'),
  (6, 'Fri', 'Oct 30', '10:00', '14:00', 'Circulation', 'sec-circulation', 'Ms. Reyes', 'Paolo Lim', '11111111-1111-4111-8111-111111111103', 'Scheduled')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.shifts', 'id'), coalesce((select max(id) from public.shifts), 1), true);

insert into public.attendance_logs (student_name, student_profile_id, is_active, scanned_by)
select 'Maria Santos', '11111111-1111-4111-8111-111111111102', true, 'Ms. Reyes'
where not exists (select 1 from public.attendance_logs where student_name = 'Maria Santos' and is_active = true);

insert into public.attendance_logs (student_name, student_profile_id, is_active, scanned_by)
select 'Paolo Lim', '11111111-1111-4111-8111-111111111103', true, 'Ms. Reyes'
where not exists (select 1 from public.attendance_logs where student_name = 'Paolo Lim' and is_active = true);

insert into public.tasks (id, title, type, section, assigned_to, assigned_to_profile_id, shift_id, status, created_by) values
  (1, 'Shelve returned books (300s)', 'Shelving', 'Circulation', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 3, 'In Progress', 'Ms. Reyes'),
  (2, 'Process overdue notices', 'Circulation', 'Circulation', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 3, 'Assigned', 'Ms. Reyes'),
  (3, 'Inventory of periodicals shelf B', 'Inventory', 'Periodicals', 'Maria Santos', '11111111-1111-4111-8111-111111111102', 2, 'Done', 'Ms. Reyes'),
  (4, 'Reference desk assistance', 'Circulation', 'Reference', 'Paolo Lim', '11111111-1111-4111-8111-111111111103', 6, 'Assigned', 'Ms. Reyes')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.tasks', 'id'), coalesce((select max(id) from public.tasks), 1), true);

insert into public.duty_requests (id, kind, shift_id, shift_label, reason, requester, requester_profile_id, submitted_on, status) values
  (1, 'Swap', 5, 'Thu Oct 29, 08:00-12:00', 'Class conflict', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 'Oct 27', 'Pending OIC'),
  (2, 'Leave', 1, 'Mon Oct 26, 08:00-12:00', 'Medical appointment', 'Juan Dela Cruz', '11111111-1111-4111-8111-111111111101', 'Oct 24', 'Approved'),
  (3, 'Swap', 4, 'Wed Oct 28, 13:00-17:00', 'Exam review', 'Maria Santos', '11111111-1111-4111-8111-111111111102', 'Oct 27', 'Pending OIC'),
  (4, 'Leave', 6, 'Fri Oct 30, 10:00-14:00', 'Family event', 'Paolo Lim', '11111111-1111-4111-8111-111111111103', 'Oct 26', 'Endorsed')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.duty_requests', 'id'), coalesce((select max(id) from public.duty_requests), 1), true);

insert into public.visitor_entries (id, name, kind, detail, entry_time, returned, section, recorded_by) values
  (1, 'Dr. Alvarez', 'Visitor', 'Faculty, Reference section', '09:10', null, 'Reference', 'Ms. Reyes'),
  (2, 'Kim Dizon', 'Baggage', 'Locker 12, black backpack', '09:25', null, 'Circulation', 'Juan Dela Cruz'),
  (3, 'Ana Cruz', 'Paper', 'Thesis: Coastal Erosion Study (2019), ID 2021-0457', '10:05', false, 'Reference', 'Juan Dela Cruz'),
  (4, 'Leo Tan', 'Paper', 'Journal: Marine Ecology Vol. 12, ID 2020-0112', '10:40', true, 'Reference', 'Maria Santos')
on conflict (id) do nothing;

select setval(pg_get_serial_sequence('public.visitor_entries', 'id'), coalesce((select max(id) from public.visitor_entries), 1), true);
