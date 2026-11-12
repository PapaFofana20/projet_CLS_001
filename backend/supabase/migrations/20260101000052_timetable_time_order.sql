-- ============================================================================
-- 00052 — Contraintes d'intégrité emplois du temps (audit strict, 08/11/2026).
--
-- timetable_courses (00034) n'avait aucune contrainte end_time > start_time
-- ni protection contre les créneaux invalides : un cours pouvait finir avant
-- de commencer. Contrainte ajoutée NOT VALID : les nouvelles écritures sont
-- bloquées, les données historiques éventuellement invalides ne font pas
-- échouer la migration (à valider après nettoyage, comme les contraintes
-- NOT VALID existantes du schéma).
--
-- L'anti-chevauchement (même enseignant, même jour) est appliqué côté API
-- (routes/timetables.js) car il exige une lecture métier ; la contrainte
-- temporelle, elle, est garantie par la base.
--
-- Idempotente.
-- ============================================================================

alter table public.timetable_courses drop constraint if exists timetable_courses_time_order;
alter table public.timetable_courses
  add constraint timetable_courses_time_order check (end_time > start_time) not valid;
