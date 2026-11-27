-- ============================================================================
-- SCOLIA — Phase 7 : messagerie, annonces, absences, tableau de bord.
--
-- Messagerie  : conversations parents–enseignants (par élève). RLS :
--   l'enseignant (affectations / titulaire), le parent, l'élève, le directeur
--   en LECTURE seule ; l'écriture passe par les RPCs (jamais de grammaire
--   INSERT directe).
-- Annonces    : publication direction / économe (« Seule la direction peut
--   publier une annonce. »), auteur dérivé du rôle (« Économat » / « Direction »).
-- Absences    : vie scolaire, limitée au surveillant (listAbsences + addAbsence
--   du front), en écriture uniquement si l'abonnement autorise.
-- Dashboard   : admin_dashboard() renvoie les mêmes données que getAdminStats
--   (direction et économe « finance »), calculées 100 % serveur.
-- La messagerie reste utilisable en mode lecture seule (canal de communication) ;
-- annonces et absences, elles, exigent school_is_writable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers messagerie : identité « acteur » (parent, enseignant, élève, compte
-- administratif) et périmètre de lecture d'une conversation.
-- ----------------------------------------------------------------------------
create or replace function public.message_actor_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select case public.current_role()
    when 'parent' then public.current_parent_id()
    when 'eleve' then public.current_student_id()
    when 'instituteur' then public.current_teacher_id()
    when 'professeur' then public.current_teacher_id()
    else auth.uid()
  end::uuid
$$;

create or replace function public.can_see_conversation(p_conversation_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and c.school_id = public.current_school_id()
      and user_can_query_data()
      and (
        public.current_role() = 'directeur'
        or (public.current_teacher_id() is not null and c.teacher_id = public.current_teacher_id())
        or (public.current_parent_id() is not null and c.parent_id = public.current_parent_id())
        or (public.current_student_id() is not null and c.student_id = public.current_student_id())
      )
  )
$$;

-- ----------------------------------------------------------------------------
-- list_conversations() : parité messageService.listConversations / countUnread
-- (noms lisibles, messages, non-lus du point de vue de l'acteur).
-- ----------------------------------------------------------------------------
create or replace function public.list_conversations()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(q.item order by q.last_msg desc nulls last), '[]'::jsonb)
  from (
    select
      jsonb_build_object(
        'id', conv.id,
        'schoolId', conv.school_id,
        'teacherId', conv.teacher_id,
        'parentId', conv.parent_id,
        'studentId', conv.student_id,
        'subject', conv.subject,
        'teacherName', coalesce(t.first_name || ' ' || t.last_name, 'Enseignant'),
        'parentName', coalesce(p.first_name || ' ' || p.last_name, 'Parent'),
        'studentName', coalesce(s.first_name || ' ' || s.last_name, ''),
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object('id', m.id, 'senderId', m.sender_id, 'text', m.text, 'at', m.created_at) order by m.created_at)
          from public.messages m
          where m.conversation_id = conv.id
        ), '[]'::jsonb),
        'lastReadAt', coalesce((
          select jsonb_object_agg(r.actor_id, r.last_read_at)
          from public.conversation_reads r
          where r.conversation_id = conv.id
        ), '{}'::jsonb),
        'unread', (
          select count(*)
          from public.messages m2
          where m2.conversation_id = conv.id
            and m2.sender_id <> public.message_actor_id()
            and m2.created_at >= coalesce((
              select r2.last_read_at
              from public.conversation_reads r2
              where r2.conversation_id = conv.id and r2.actor_id = public.message_actor_id()
            ), 'epoch'::timestamptz)
        )
      ) as item,
      (select max(m3.created_at) from public.messages m3 where m3.conversation_id = conv.id) as last_msg
    from public.conversations conv
    left join public.teachers t on t.id = conv.teacher_id
    left join public.parents p on p.id = conv.parent_id
    left join public.students s on s.id = conv.student_id
    where public.can_see_conversation(conv.id)
  ) q
$$;

revoke execute on function public.list_conversations() from anon, public;
grant execute on function public.list_conversations() to authenticated;

-- ----------------------------------------------------------------------------
-- start_conversation : ouverture (ou reprise) d'un fil + premier message.
-- Règles de contact, parité messageService.listContacts :
--   - enseignant   : son trio, élève d'une de ses classes (affectation ou
--                    classe dont il est titulaire) ;
--   - parent       : son trio, enseignant affecté à la classe de l'enfant ;
--   - élève        : son trio, enseignant affecté à sa classe ;
--   - tout autre rôle (directeur, économe, surveillant) : refus, il ne fait
--                    que superviser.
-- ----------------------------------------------------------------------------
create or replace function public.start_conversation(
  p_teacher_id uuid,
  p_parent_id uuid,
  p_student_id uuid,
  p_subject text,
  p_text text
)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.current_role();
  v_school uuid := public.current_school_id();
  v_tech uuid;
  v_par uuid;
  v_std uuid;
  v_class_id uuid;
  v_conversation uuid;
  v_text text;
  v_subject text;
begin
  if v_school is null or not public.user_can_query_data() then
    raise exception 'Conversation indisponible.';
  end if;
  if v_role not in ('instituteur','professeur','parent','eleve') then
    raise exception 'Conversation indisponible.';
  end if;

  select t.id into v_tech
  from public.teachers t
  where t.id = p_teacher_id and t.school_id = v_school;
  select p.id into v_par
  from public.parents p
  where p.id = p_parent_id and p.school_id = v_school;
  select s.id, s.class_id, s.parent_id into v_std, v_class_id, v_par
  from public.students s
  where s.id = p_student_id and s.school_id = v_school;
  if v_tech is null or v_std is null or v_par is null or v_par <> p_parent_id then
    raise exception 'Conversation indisponible.';
  end if;

  if (v_role = 'instituteur' or v_role = 'professeur')
     and (public.current_teacher_id() is null or public.current_teacher_id() <> v_tech) then
    raise exception 'Conversation indisponible.';
  end if;
  if (v_role = 'instituteur' or v_role = 'professeur')
     and not exists (
       select 1 from public.teaching_assignments a
       where a.class_id = v_class_id and a.teacher_id = v_tech
     )
     and not exists (
       select 1 from public.class_rooms c
       where c.id = v_class_id and c.head_teacher_id = v_tech
     ) then
    raise exception 'Conversation indisponible.';
  end if;
  if v_role = 'parent'
     and (public.current_parent_id() is null or public.current_parent_id() <> v_par) then
    raise exception 'Conversation indisponible.';
  end if;
  if (v_role = 'parent' or v_role = 'eleve')
     and not exists (
       select 1 from public.teaching_assignments a
       where a.class_id = v_class_id and a.teacher_id = v_tech
     ) then
    raise exception 'Conversation indisponible.';
  end if;
  if v_role = 'eleve'
     and (public.current_student_id() is null or public.current_student_id() <> v_std) then
    raise exception 'Conversation indisponible.';
  end if;

  v_text := coalesce(trim(p_text), '');
  if v_text = '' or length(v_text) > 4000 then
    raise exception 'Message vide.';
  end if;
  v_subject := coalesce(trim(p_subject), '');
  if length(v_subject) > 200 then
    raise exception 'Objet trop long (200 caractères maximum).';
  end if;

  insert into public.conversations (school_id, teacher_id, parent_id, student_id, subject)
  values (v_school, v_tech, v_par, v_std, v_subject)
  on conflict (school_id, teacher_id, parent_id, student_id) do nothing
  returning id into v_conversation;
  if not found then
    select c.id into v_conversation
    from public.conversations c
    where c.school_id = v_school and c.teacher_id = v_tech
      and c.parent_id = v_par and c.student_id = v_std;
  end if;

  insert into public.messages (school_id, conversation_id, sender_id, text)
  values (v_school, v_conversation, public.message_actor_id(), v_text);

  insert into public.conversation_reads (conversation_id, actor_id, last_read_at)
  values (v_conversation, public.message_actor_id(), now())
  on conflict (conversation_id, actor_id) do update set last_read_at = excluded.last_read_at;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'conversation_started', 'conversations', v_conversation,
          jsonb_build_object('teacherId', v_tech, 'parentId', v_par, 'studentId', v_std));

  return v_conversation;
end;
$$;

revoke execute on function public.start_conversation(uuid, uuid, uuid, text, text) from anon, public;
grant execute on function public.start_conversation(uuid, uuid, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- send_message : participer au fil. Le directeur supervise en lecture seule,
-- tout comme le front (sendMessage refuse le directeur).
-- ----------------------------------------------------------------------------
create or replace function public.send_message(p_conversation_id uuid, p_text text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.current_role();
  v_school uuid := public.current_school_id();
  v_text text;
begin
  if not public.can_see_conversation(p_conversation_id) or v_role not in ('instituteur','professeur','parent','eleve') then
    raise exception 'Conversation indisponible.';
  end if;
  v_text := coalesce(trim(p_text), '');
  if v_text = '' or length(v_text) > 4000 then
    raise exception 'Message vide.';
  end if;

  insert into public.messages (school_id, conversation_id, sender_id, text)
  values (v_school, p_conversation_id, public.message_actor_id(), v_text);

  insert into public.conversation_reads (conversation_id, actor_id, last_read_at)
  values (p_conversation_id, public.message_actor_id(), now())
  on conflict (conversation_id, actor_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke execute on function public.send_message(uuid, text) from anon, public;
grant execute on function public.send_message(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- mark_conversation_read : remet le compteur de non-lus à 0 (sans le directeur).
-- ----------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.can_see_conversation(p_conversation_id) then
    return; -- silencieux, comme le front
  end if;
  insert into public.conversation_reads (conversation_id, actor_id, last_read_at)
  values (p_conversation_id, public.message_actor_id(), now())
  on conflict (conversation_id, actor_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from anon, public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Annonces ciblées. Publication par la direction / l'économe, auteur dérivé
-- du rôle ; audience reçue du client mais restreinte aux rôles connus.
-- ----------------------------------------------------------------------------
create or replace function public.post_announcement(
  p_title text,
  p_body text,
  p_audience_all boolean,
  p_audience_roles text[]
)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_role text := public.current_role();
  v_school uuid := public.current_school_id();
  v_title text;
  v_body text;
  v_author text;
  v_roles text[];
  v_row public.announcements%rowtype;
begin
  if v_role not in ('directeur','econome') then
    raise exception 'Seule la direction peut publier une annonce.';
  end if;
  if not public.school_is_writable(v_school) then
    raise exception 'Mode lecture seule : l''abonnement de votre école est expiré. Les modifications sont désactivées.';
  end if;

  v_title := coalesce(trim(p_title), '');
  v_body := coalesce(trim(p_body), '');
  if v_title = '' or v_body = '' then
    raise exception 'Titre et contenu requis.';
  end if;
  if length(v_title) > 200 or length(v_body) > 4000 then
    raise exception 'Annonce trop longue (200 / 4000 caractères maximum).';
  end if;

  v_author := case when v_role = 'econome' then 'Économat' else 'Direction' end;
  v_roles := coalesce(p_audience_roles, '{}');
  if v_roles is not null then
    -- Ne garder que les rôles connus (jamais de valeur injectée par le client).
    select coalesce(array_agg(x), '{}') into v_roles
    from (select unnest(v_roles) as x) u
    where x in ('parent','eleve','directeur','econome','instituteur','professeur','surveillant');
  end if;

  insert into public.announcements (school_id, title, body, author, audience_all, audience_roles)
  values (v_school, v_title, v_body, v_author, coalesce(p_audience_all, true), coalesce(v_roles, '{}'))
  returning * into v_row;

  insert into public.audit_log (school_id, actor_id, actor_role, action, entity, entity_id, payload)
  values (v_school, auth.uid(), v_role, 'announcement_published', 'announcements', v_row.id,
          jsonb_build_object('audienceAll', coalesce(p_audience_all, true), 'roles', v_roles));

  return jsonb_build_object(
    'id', v_row.id,
    'schoolId', v_row.school_id,
    'title', v_row.title,
    'body', v_row.body,
    'at', v_row.created_at,
    'author', v_row.author,
    'audience', case when v_row.audience_all then to_jsonb('all'::text) else to_jsonb(v_row.audience_roles) end
  );
end;
$$;

revoke execute on function public.post_announcement(text, text, boolean, text[]) from anon, public;
grant execute on function public.post_announcement(text, text, boolean, text[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Tableau de bord direction / économe (parité statsService.getAdminStats).
-- p_period_id : période (« semestre1 » / « semestre2 ») pour la moyenne
-- générale calculée via class_report_cards (100 % serveur).
-- ----------------------------------------------------------------------------
create or replace function public.admin_dashboard(p_period_id text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_role text := public.current_role();
  v_school uuid := public.current_school_id();
  v_period text;
  v_settings record;
  v_y1 int;
  v_y2 int;
  v_m int;
  v_year int;
  v_month int;
  v_labels constant text[] := array[
    'Octobre','Novembre','Décembre','Janvier','Février','Mars','Avril','Mai','Juin','Juillet'
  ];
  v_avg numeric := 0;
  v_avg_count int := 0;
  v_card record;
  v_class record;
begin
  if v_school is null or v_role not in ('directeur','econome') or not public.user_can_query_data() then
    raise exception 'Tableau de bord indisponible.';
  end if;
  select * into v_settings from public.school_settings where school_id = v_school;
  v_y1 := left(v_settings.school_year, 4)::int;
  v_y2 := right(v_settings.school_year, 4)::int;

  -- (M13) Le front envoie 'semestre1' / 'trimestre2', mais class_report_cards
  -- n'accepte que les codes S1..S3 / T1..T3. Anciennement
  -- coalesce(p_period_id, 'semestre1') → « Période invalide » dès que le
  -- paramètre était fourni.
  v_period := case lower(trim(coalesce(p_period_id, 'semestre1')))
    when 'semestre1' then 'S1'
    when 'semestre2' then 'S2'
    when 'trimestre1' then 'T1'
    when 'trimestre2' then 'T2'
    when 'trimestre3' then 'T3'
    when 's1' then 'S1'
    when 's2' then 'S2'
    when 't1' then 'T1'
    when 't2' then 'T2'
    when 't3' then 'T3'
    else 'S1'
  end;

  -- Moyenne générale de l'école : moyenne des moyennes de classes (bulletins).
  -- Reprise du calcul serveur (class_report_cards), comme le front.
  for v_class in
    select c.id from public.class_rooms c where c.school_id = v_school
  loop
    for v_card in
      select jn
      from jsonb_array_elements(
        public.class_report_cards(v_class.id, v_period)
      ) jn
    loop
      if jsonb_typeof(v_card.jn->'generalAverage') = 'number' then
        v_avg := v_avg + (v_card.jn->'generalAverage')::text::numeric;
        v_avg_count := v_avg_count + 1;
      end if;
    end loop;
  end loop;

  -- Mois scolaires : octobre → juillet de l'année scolaire.
  v_year := v_y1;
  v_month := 10;
  drop table if exists dash_months;
  create temporary table dash_months (ordering int, label text, y int, m int) on commit drop;
  for v_m in 1..10 loop
    insert into dash_months values (v_m-3, v_labels[v_m], v_year, v_month);
    if v_m = 3 then
      v_year := v_y2;
      v_month := 0;
    end if;
    v_month := v_month + 1;
  end loop;

  return jsonb_build_object(
    'totalStudents', (select count(*) from public.students s where s.school_id = v_school),
    'byCycle', (
      select jsonb_agg(jsonb_build_object('cycle', cyc, 'count', cnt) order by cyc)
      from (
        select cyc, count(s.id) cnt
        from (values ('elementaire'),('moyen'),('secondaire')) v(cyc)
        join public.class_rooms c on c.cycle = v.cyc and c.school_id = v_school
        left join public.students s on s.class_id = c.id
        group by cyc
      ) t
    ),
    'expected', coalesce((
      select sum(pn.amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'collected', coalesce((
      select sum(pn.paid_amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'unpaidTotal', coalesce((
      select sum(pn.amount - pn.paid_amount) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date
    ), 0),
    'unpaidStudents', (
      select count(distinct pn.student_id) from public.payments pn
      where pn.school_id = v_school and pn.due_date <= current_date and pn.paid_amount < pn.amount
    ),
    'generalAverage', case when v_avg_count > 0 then public.round2(v_avg / v_avg_count) else null end,
    'paymentsByMonth', (
      select jsonb_agg(jsonb_build_object('month', left(dm.label, 4) || '.', 'attendu', d.worth, 'encaisse', d.summed) order by dm.ordering)
      from dash_months dm
      left join (
        select extract('year' from p1.due_date) yr, extract('month' from p1.due_date) mo,
               sum(p1.amount) worth, sum(p1.paid_amount) summed
        from public.payments p1
        where p1.school_id = v_school and p1.kind = 'mensualite'
        group by 1, 2
      ) d on d.yr = dm.y and d.mo = dm.m
    ),
    'studentsByClass', (
      select jsonb_agg(jsonb_build_object('name', c.name, 'cycle', c.cycle, 'effectif', coalesce(n.nb, 0)) order by c.level_id, c.name)
      from public.class_rooms c
      left join (
        select s2.class_id cid, count(*) nb
        from public.students s2 where s2.school_id = v_school
        group by 1
      ) n on n.cid = c.id
      where c.school_id = v_school
    ),
    'latestPayments', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'id', pn.id,
          'studentId', pn.student_id,
          'kind', pn.kind,
          'label', pn.label,
          'dueDate', pn.due_date,
          'amount', pn.amount,
          'paidAmount', pn.paid_amount,
          'status', pn.status,
          'method', pn.method,
          'paidAt', pn.paid_at,
          'reference', pn.reference,
          'studentName', coalesce(s.first_name || ' ' || s.last_name, '—'),
          'className', coalesce(cr.name, '—'),
          'parentName', coalesce(pr.first_name || ' ' || pr.last_name, '—'),
          'parentPhone', coalesce(pr.phone, '')
        ) order by pn.paid_at desc nulls last
      ), '[]'::jsonb)
      from (
        select * from public.payments
        where school_id = v_school and paid_amount > 0 and paid_at is not null and kind <> 'inscription'
        order by paid_at desc
        limit 6
      ) pn
      left join public.students s on s.id = pn.student_id
      left join public.class_rooms cr on cr.id = s.class_id
      left join public.parents pr on pr.id = s.parent_id
    ),
    'conflictCount', (select count(*) from public.assignment_conflicts()),
    'conflictErrorCount', (select count(*) from public.assignment_conflicts() where severity = 'error')
  );
end;
$$;

revoke execute on function public.admin_dashboard(text) from anon, public;
grant execute on function public.admin_dashboard(text) to authenticated;

-- ============================================================================
-- RLS — messagerie (lecture), annonces (lecture filtrée), absences (surveillant).
-- ============================================================================
create policy "conversations_select_scoped" on public.conversations
  for select to authenticated
  using (public.can_see_conversation(id));

create policy "messages_select_scoped" on public.messages
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and public.can_see_conversation(conversation_id)
  );

create policy "announcements_select_targeted" on public.announcements
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and user_can_query_data()
    and (
      audience_all = true
      or public.current_role() = any (audience_roles)
    )
  );

create policy "absences_select_surveillant" on public.absences
  for select to authenticated
  using (
    school_id = public.current_school_id()
    and public.current_role() = 'surveillant'
    and user_can_query_data()
  );

create policy "absences_insert_surveillant" on public.absences
  for insert to authenticated
  with check (
    school_id = public.current_school_id()
    and public.current_role() = 'surveillant'
    and user_can_query_data()
    and public.school_is_writable(school_id)
    and exists (
      select 1 from public.students s
      where s.id = student_id and s.school_id = public.current_school_id()
    )
  );

-- conversation_reads : lecture de ses propres marqueurs de lecture uniquement.
create policy "conversation_reads_select_self" on public.conversation_reads
  for select to authenticated
  using (actor_id = auth.uid());

-- ============================================================================
-- Privilèges : messagerie / annonces en lecture directe (sous politiques),
-- écritures par RPCs uniquement.
-- ============================================================================
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.conversation_reads to authenticated;
grant select on public.announcements to authenticated;
grant select, insert on public.absences to authenticated;
