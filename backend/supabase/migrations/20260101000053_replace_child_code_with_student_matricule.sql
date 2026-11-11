-- ============================================================================
-- 000053 — Remplacer le child_code par le matricule élève pour le rattachement parent
--
-- Le parent doit désormais s'identifier à son enfant via le matricule de
-- l'élève (ex. EC260001) et non plus via le code élève à 6 caractères
-- (child_code). Les deux RPC concernées sont réécrites en conséquence.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- finish_parent_registration : p_child_code → p_student_matricule,
--                              recherche par matricule au lieu de child_code
-- ----------------------------------------------------------------------------
create or replace function public.finish_parent_registration(
  p_user_id uuid,
  p_school_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_student_matricule text
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_child record;
  v_request_id uuid;
  v_parent_id uuid;
  v_approved boolean := false;
  v_school record;
begin
  if p_user_id is null then raise exception 'Compte introuvable.'; end if;
  select coalesce(trim(p_student_matricule), '')::text into p_student_matricule;
  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'École introuvable.'; end if;
  if not v_school.registration_open then
    raise exception 'Les inscriptions sont fermées dans cette école.';
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Un compte existe déjà avec cet e-mail.';
  end if;

  select * into v_child
  from public.students
  where school_id = p_school_id and upper(matricule) = upper(trim(p_student_matricule))
  limit 1;
  if not found then
    raise exception 'Matricule élève introuvable dans cette école. Vérifiez le matricule reçu auprès de l''école.';
  end if;

  insert into public.parents (school_id, first_name, last_name, phone, email, address)
  values (p_school_id, trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email), '')
  returning id into v_parent_id;

  insert into public.profiles (id, school_id, role, status, first_name, last_name, phone, email, parent_id)
  values (p_user_id, p_school_id, 'parent', 'EN_ATTENTE', trim(p_first_name), trim(p_last_name), trim(p_phone), trim(p_email), v_parent_id);

  insert into public.registration_requests
    (school_id, user_id, role, first_name, last_name, email, phone, class_id, child_code)
  values
    (p_school_id, p_user_id, 'parent', trim(p_first_name), trim(p_last_name), trim(p_email), trim(p_phone),
     v_child.class_id, v_child.child_code)
  returning id into v_request_id;

  if v_school.auto_approve_students then
    v_approved := true;
    update public.profiles set status = 'ACTIF' where id = p_user_id;
    update public.registration_requests set status = 'APPROUVEE', decided_at = current_date where id = v_request_id;
    insert into public.audit_log (school_id, actor_id, action, entity, entity_id, payload)
    values (p_school_id, p_user_id, 'auto_approve_parent', 'registration_requests', v_request_id, jsonb_build_object('student_id', v_child.id));
  end if;

  return jsonb_build_object(
    'request_id', v_request_id,
    'approved', v_approved,
    'child_id', v_child.id,
    'child_name', v_child.first_name || ' ' || v_child.last_name
  );
end;
$$;

revoke execute on function public.finish_parent_registration(uuid, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.finish_parent_registration(uuid, uuid, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- link_child : p_child_code → p_student_matricule, recherche par matricule
-- ----------------------------------------------------------------------------
create or replace function public.link_child(p_student_matricule text)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profil record;
  v_child record;
begin
  perform public.assert_active_account();

  select * into v_profil from public.profiles where id = v_uid;
  if not found or v_profil.role <> 'parent' or v_profil.parent_id is null then
    raise exception 'Action réservée aux comptes parents.';
  end if;
  if not public.school_is_writable(v_profil.school_id) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  select * into v_child
  from public.students
  where school_id = v_profil.school_id
    and matricule = upper(coalesce(trim(p_student_matricule), ''))
  limit 1;
  if not found then
    raise exception 'Matricule élève introuvable dans votre école. Vérifiez le matricule reçu auprès de l''école.';
  end if;
  if v_child.parent_id = v_profil.parent_id then
    raise exception 'Cet enfant est déjà rattaché à votre compte.';
  end if;
  if v_child.parent_id is not null then
    raise exception 'Cet enfant est déjà rattaché à une autre famille. Contactez l''école.';
  end if;

  update public.students set parent_id = v_profil.parent_id where id = v_child.id;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id)
  values (v_profil.school_id, v_uid, v_profil.role, 'link_child', 'students', v_child.id);

  return v_child.id;
end;
$$;

revoke execute on function public.link_child(text) from anon, public;
grant execute on function public.link_child(text) to authenticated;
