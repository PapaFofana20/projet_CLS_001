-- ============================================================================
-- 0056 — Activation de Supabase Realtime sur les tables scolaires
--
-- Permet au front de s'abonner en temps réel aux changements (INSERT/UPDATE/DELETE)
-- des tables suivantes, filtrés par school_id (chaque école ne reçoit que ses
-- propres données).
--
-- Tables concernées :
--   announcements   (nouvelle annonce → push immédiat à toute l'école)
--   messages        (nouveau message → push immédiat aux participants)
--   absences        (appel d'absence → push immédiat à la vie scolaire/direction)
--   grades          (note saisie → push immédiat aux enseignants/direction/parents)
--   timetables      (modification emploi du temps → push immédiat)
--   timetable_courses (modification d'un cours → push immédiat)
--
-- ⚠️  Après avoir appliqué cette migration, il faut aussi activer la réplication
--     côté Supabase (dashboard > Realtime > Tables, ou API REST) pour que les
--     changements soient effectivement diffusés sur le canal WebSocket.
-- ============================================================================

-- Replica identity FULL : recevoir à la fois l'ancienne et la nouvelle valeur
-- (utile pour UPDATE et DELETE).
alter table if exists public.announcements replica identity full;
alter table if exists public.messages replica identity full;
alter table if exists public.absences replica identity full;
alter table if exists public.grades replica identity full;
alter table if exists public.timetables replica identity full;
alter table if exists public.timetable_courses replica identity full;

-- Index pour accélérer les filtres Realtime par school_id (déjà présents sur
-- la plupart des tables, on s'assure qu'ils existent).
create index if not exists idx_announcements_school_id on public.announcements(school_id);
create index if not exists idx_messages_school_id on public.messages(school_id);
create index if not exists idx_grades_school_id on public.grades(school_id);
create index if not exists idx_timetables_school_id on public.timetables(school_id);
create index if not exists idx_timetable_courses_school_id on public.timetable_courses(timetable_id);
