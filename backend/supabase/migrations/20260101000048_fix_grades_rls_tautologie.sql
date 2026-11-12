-- ============================================================================
-- 00048 — Correction RÉGRESSION tautologie RLS (audit strict, 08/11/2026).
--
-- 00015 avait corrigé les tautologies des politiques RLS grades/report_metas
-- (« a.class_id = class_id » se résout en « a.class_id = a.class_id », toujours
-- vrai, car la colonne non qualifiée se lie à la table INTERNE de la
-- sous-requête). 00041 puis 00043 ont réintroduit les colonnes NON QUALIFIÉES
-- dans grades_select_scoped (/ a.class_id = class_id and a.subject_id =
-- subject_id), sans contrôle a.school_id = grades.school_id.
--
-- Effet : tout enseignant avec ≥1 affectation lisait TOUTES les notes de son
-- école, toutes classes et matières confondues.
--
-- Correction : qualification explicite de toutes les colonnes de la ligne
-- filtrée (grades./report_metas.), restauration du contrôle d'école sur
-- l'affectation enseignant et sur la branche titulaire de report_metas,
-- conservation du rôle 'secretaire' (00043) et du blocage bulletins (00041).
--
-- Idempotente.
-- ============================================================================

drop policy if exists "grades_select_scoped" on public.grades;
create policy "grades_select_scoped" on public.grades
  for select to authenticated
  using (
    user_can_query_data()
    and grades.school_id = current_school_id()
    and (
      -- direction / économie / surveillant / secrétariat : toujours
      (current_teacher_id() is null and public.current_role() in ('directeur','econome','surveillant','secretaire'))
      -- enseignant affecté : toujours (classe + matière + école de la ligne)
      or (current_teacher_id() is not null and (
        exists (select 1 from public.class_rooms c
                where c.id = grades.class_id
                  and c.school_id = grades.school_id
                  and c.head_teacher_id = current_teacher_id())
        or exists (select 1 from public.teaching_assignments a
                   where a.teacher_id = current_teacher_id()
                     and a.school_id = grades.school_id
                     and a.class_id = grades.class_id
                     and a.subject_id = grades.subject_id)))
      -- élève / parent : seulement si les bulletins ne sont pas bloqués
      or (
        coalesce((select ss.block_student_bulletins from public.school_settings ss
                  where ss.school_id = grades.school_id), false) = false
        and (
          (current_parent_id() is not null and exists (
            select 1 from public.students s
            where s.school_id = grades.school_id
              and s.id = grades.student_id
              and s.parent_id = current_parent_id()))
          or (current_student_id() is not null and grades.student_id = current_student_id())
        )
      )
    )
  );

drop policy if exists "report_metas_select_scoped" on public.report_metas;
create policy "report_metas_select_scoped" on public.report_metas
  for select to authenticated
  using (
    user_can_query_data()
    and report_metas.school_id = current_school_id()
    and (
      (current_teacher_id() is null and public.current_role() in ('directeur','econome','surveillant','secretaire'))
      or (current_teacher_id() is not null and exists (
        select 1 from public.students s
        join public.class_rooms c on c.id = s.class_id
        where s.id = report_metas.student_id
          and s.school_id = report_metas.school_id
          and c.school_id = report_metas.school_id
          and c.head_teacher_id = current_teacher_id()))
      or (
        coalesce((select ss.block_student_bulletins from public.school_settings ss
                  where ss.school_id = report_metas.school_id), false) = false
        and (
          (current_parent_id() is not null and exists (
            select 1 from public.students mps
            where mps.school_id = report_metas.school_id
              and mps.id = report_metas.student_id
              and mps.parent_id = current_parent_id()))
          or (current_student_id() is not null and report_metas.student_id = current_student_id())
        )
      )
    )
  );
