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

-- Ajouter les tables à la publication Realtime si elle existe.
-- (ADD TABLE IF EXISTS n'existe pas en PostgreSQL : on vérifie chaque table
--  individuellement dans pg_publication_tables avant de l'ajouter.)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'announcements') then
      execute 'alter publication supabase_realtime add table public.announcements';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
      execute 'alter publication supabase_realtime add table public.messages';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'absences') then
      execute 'alter publication supabase_realtime add table public.absences';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'grades') then
      execute 'alter publication supabase_realtime add table public.grades';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'timetables') then
      execute 'alter publication supabase_realtime add table public.timetables';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'timetable_courses') then
      execute 'alter publication supabase_realtime add table public.timetable_courses';
    end if;
  end if;
end
$$;

-- Index pour accélérer les filtres Realtime par school_id (déjà présents sur
-- la plupart des tables, on s'assure qu'ils existent).
create index if not exists idx_announcements_school_id on public.announcements(school_id);
create index if not exists idx_messages_school_id on public.messages(school_id);
create index if not exists idx_grades_school_id on public.grades(school_id);
create index if not exists idx_timetables_school_id on public.timetables(school_id);
create index if not exists idx_timetable_courses_school_id on public.timetable_courses(timetable_id);
