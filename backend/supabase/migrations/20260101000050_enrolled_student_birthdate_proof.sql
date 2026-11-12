-- ============================================================================
-- 00050 — Preuve d'identité pour le compte élève (audit strict, 08/11/2026).
--
-- finish_enrolled_student_registration (00044) ne demandait que le matricule
-- élève SÉQUENTIEL (EC260001, …), semi-public (imprimé sur les bulletins) :
-- quiconque devinait un matricule créait un compte ACTIF sur la fiche d'un
-- enfant réel (usurpation d'identité d'élève).
--
-- Correction :
--   1. Exigence de la DATE DE NAISSANCE de la fiche (connaissance personnelle,
--      non publique) en plus du matricule.
--   2. Garde d'abonnement : school_is_writable(service_role) doit être VRAI
--      (fail-closed — toute erreur/NULL bloque), comme registerStudent/Parent.
--   3. Nouvelle signature (6 args) ; l'ancienne (5 args, sans preuve) est
--      SUPPRIMÉE pour qu'aucun appelant ne puisse plus l'utiliser.
--
-- Note : les fiches legacy avec birth_date par défaut ('2015-01-01', cf.
-- 00006:341) ne correspondront pas à la vraie date de naissance ; la
-- direction devra corriger ces fiches avant que l'élève crée son compte.
--
-- Idempotente.
-- ============================================================================

drop function if exists public.finish_enrolled_student_registration(uuid, uuid, text, text, text);

create or replace function public.finish_enrolled_student_registration(
  p_user_id uuid,
  p_school_id uuid,
  p_student_matricule text,
  p_birth_date date,
  p_email text,
  p_phone text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_student record;
  v_school record;
begin
  if p_user_id is null then raise exception 'Compte introuvable.'; end if;
  if p_birth_date is null then
    raise exception 'Date de naissance requise pour créer ce compte.';
  end if;
  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'École introuvable.'; end if;

  -- Garde d'abonnement fail-closed : l'école doit être writable.
  if public.school_is_writable(p_school_id) is distinct from true then
    raise exception 'L''abonnement de cette école n''est pas actif.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Un compte existe déjà avec cet e-mail.';
  end if;

  select * into v_student
  from public.students
  where school_id = p_school_id and upper(matricule) = upper(trim(p_student_matricule))
  limit 1;
  if not found then
    raise exception 'Matricule élève introuvable dans cette école. Vérifiez le matricule reçu auprès de l''école.';
  end if;

  -- Preuve d'identité : la date de naissance doit correspondre à la fiche.
  -- Message générique (même que « matricule introuvable ») pour ne pas
  -- servir d'oracle d'énumération.
  if v_student.birth_date is distinct from p_birth_date then
    raise exception 'Vérification d''identité échouée. Vérifiez le matricule et la date de naissance auprès de l''école.';
  end if;

  if exists (select 1 from public.profiles where student_id = v_student.id) then
    raise exception 'Un compte existe déjà pour cet élève. Connectez-vous avec votre e-mail et votre mot de passe.';
  end if;

  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email, student_id)
  values (p_user_id, p_school_id, 'eleve', 'ACTIF', v_student.first_name, v_student.last_name, trim(coalesce(p_phone, '')), trim(p_email), v_student.id);

  insert into public.audit_log (school_id, actor_id, action, entity, entity_id, payload)
  values (p_school_id, p_user_id, 'student_account_created_by_matricule', 'students', v_student.id,
          jsonb_build_object('student_matricule', v_student.matricule));

  return jsonb_build_object(
    'student_id', v_student.id,
    'first_name', v_student.first_name,
    'last_name', v_student.last_name,
    'class_id', v_student.class_id,
    'student_matricule', v_student.matricule
  );
end;
$$;

revoke execute on function public.finish_enrolled_student_registration(uuid, uuid, text, date, text, text)
  from anon, authenticated, public;
grant execute on function public.finish_enrolled_student_registration(uuid, uuid, text, date, text, text)
  to service_role;
