// Gestion du personnel de l'école : comptes d'accès et enseignants.
import { useState } from "react";
import { AsyncView } from "@/components/ui/AsyncView";
import { Avatar } from "@/components/ui/Brand";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSheet } from "@/components/ui/FilterSheet";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { StaffCredentialsModal } from "@/features/staff/StaffCredentialsModal";
import { StaffForm, type StaffFormValue } from "@/features/staff/StaffForm";
import { useCurrentUser } from "@/context/AuthContext";
import { useSchool } from "@/context/SchoolContext";
import { useToast } from "@/context/ToastContext";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import { createStaffAccount, deleteStaffAccount, listStaff, resetStaffPassword, setStaffActive, updateStaff, type StaffCredentials, type StaffRow } from "@/services/authService";
import { getSchoolOverview } from "@/services/schoolService";
import { deleteTeacher, listTeacherRows, type TeacherRow } from "@/services/teacherService";
import { STAFF_ROLE_LABELS, STAFF_ROLES } from "@/utils/permissions";
import { cn } from "@/utils/cn";
import { isValidEmail, pluralize } from "@/utils/format";
import { HeroBar, HeroCard, HeroLegend, KpiTile, PanelHeading } from "@/features/admin/adminUi";

type Tab = "comptes" | "enseignants";

/** /app/enseignants — directeur uniquement : accès du personnel et enseignants. */
export default function StaffPage() {
  const user = useCurrentUser();
  const { schoolId, school, readOnly } = useSchool();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("comptes");
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [role, setRole] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<StaffCredentials | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: "staff"; row: StaffRow } | { kind: "teacher"; row: TeacherRow } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Trois sources indépendantes : chargées en parallèle (et non en
  // séquence ×3) pour afficher la page beaucoup plus vite.
  const state = useAsync(async () => {
    const [staff, overview, teachers] = await Promise.all([listStaff(schoolId), getSchoolOverview(schoolId), listTeacherRows(schoolId)]);
    return { staff, overview, teachers };
  }, [schoolId]);

  const staff = state.data?.staff ?? [];
  const teachers = state.data?.teachers ?? [];
  const subjects = (state.data?.overview.subjects ?? []).filter((s) => s.cycles.some((c) => c !== "elementaire")).map((s) => ({ id: s.id, name: s.name }));

  // Les rôles de personnel (enseignants, économe, secrétaire, surveillant)
  // sont disponibles dès le plan Découverte (gratuit) : la direction a besoin
  // de créer les accès pour que l'administration et les enseignants puissent
  // écrire des notes, gérer les élèves, etc.
  const allowedRoles = STAFF_ROLES;

  const filteredStaff = staff.filter((s) => (!role || s.role === role) && `${s.firstName} ${s.lastName} ${s.email}`.toLowerCase().includes(dq.trim().toLowerCase()));
  const filteredTeachers = teachers.filter((t) => `${t.firstName} ${t.lastName} ${t.email}`.toLowerCase().includes(dq.trim().toLowerCase()));

  // Répartition des comptes par rôle pour le bandeau de synthèse.
  const countByRole = (r: string) => staff.filter((s) => s.role === r).length;
  const activeCount = staff.filter((s) => s.status === "ACTIF").length;
  const pendingPassword = staff.filter((s) => s.mustChangePassword).length;
  const withoutAccount = teachers.filter((t) => !t.userId).length;
  const validEmails = staff.filter((s) => isValidEmail(s.email)).length;

  const submit = async (value: StaffFormValue) => {
    setBusy(true);
    try {
      if (editing) {
        await updateStaff(user, editing.userId, { firstName: value.firstName, lastName: value.lastName, email: value.email, phone: value.phone, specialties: value.specialties });
        toast("Accès mis à jour.");
        setOpen(false);
        setEditing(null);
      } else {
        const created = await createStaffAccount(user, { role: value.role, firstName: value.firstName, lastName: value.lastName, email: value.email, phone: value.phone, specialties: value.role === "professeur" ? value.specialties : [], password: value.password });
        setCredentials(created);
        setOpen(false);
        toast("Accès créé. Communiquez les identifiants à l'intéressé.");
      }
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const reset = async (row: StaffRow) => {
    const next = window.prompt(
      `Nouveau mot de passe pour ${row.firstName} ${row.lastName}\n(min. 8 caractères, une majuscule, une minuscule, un chiffre) :`
    );
    if (!next) return; // annulé par le directeur
    // Validation rapide côté client avant d'appeler l'API.
    const missing: string[] = [];
    if (next.length < 8) missing.push("8 caractères minimum");
    if (!/[a-z]/.test(next)) missing.push("une minuscule");
    if (!/[A-Z]/.test(next)) missing.push("une majuscule");
    if (!/\d/.test(next)) missing.push("un chiffre");
    if (missing.length) {
      toast(`Mot de passe invalide : il manque ${missing.join(", ")}.`, "error");
      return;
    }
    setBusy(true);
    try {
      const creds = await resetStaffPassword(user, row.userId, next);
      setCredentials(creds);
      toast("Mot de passe réinitialisé. Communiquez-le à l'intéressé hors ligne.");
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Réinitialisation impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (row: StaffRow) => {
    setBusy(true);
    try {
      await setStaffActive(user, row.userId, row.status !== "ACTIF");
      toast(row.status === "ACTIF" ? "Compte désactivé : cet utilisateur ne peut plus se connecter." : "Compte réactivé.");
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Modification impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const removeStaffAccount = async (row: StaffRow) => {
    setDeleting(true);
    try {
      await deleteStaffAccount(user, row.userId);
      setConfirmDelete(null);
      toast(`Accès de ${row.firstName} ${row.lastName} supprimé : il ne peut plus se connecter.`);
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const removeTeacher = async (row: TeacherRow) => {
    setDeleting(true);
    try {
      await deleteTeacher(user, row.id);
      setConfirmDelete(null);
      toast(`Enseignant ${row.firstName} ${row.lastName} supprimé.`);
      state.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suppression impossible.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const roleFilter = <Select compact aria-label="Filtrer par rôle" placeholder="Tous les rôles" value={role} onChange={(e) => setRole(e.target.value)} options={Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => ({ value, label }))} />;

  const staffCols: Column<StaffRow>[] = [
    { key: "who", header: "Personnel", render: (s) => (<div className="flex items-center gap-3"><Avatar name={`${s.firstName} ${s.lastName}`} size={38} /><div><p className="font-semibold">{s.firstName} {s.lastName}</p><p className="text-xs text-neutral-500">{s.email}</p></div></div>) },
    { key: "role", header: "Rôle", render: (s) => <Badge tone={s.role === "instituteur" ? "info" : "lime"}>{STAFF_ROLE_LABELS[s.role as keyof typeof STAFF_ROLE_LABELS] ?? s.role}</Badge> },
    { key: "phone", header: "Téléphone", render: (s) => s.phone },
    { key: "status", header: "Statut", render: (s) => (<span className="flex flex-wrap gap-1.5">{s.status === "DESACTIVE" ? <Badge tone="danger">Désactivé</Badge> : <Badge tone="success">Actif</Badge>}{s.mustChangePassword && <Badge tone="warning">Mot de passe à changer</Badge>}</span>) },
    {
      key: "actions",
      align: "right",
      header: <span className="sr-only">Actions</span>,
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" aria-label={`Modifier ${s.firstName}`} onClick={() => { setEditing(s); setOpen(true); }}>
            <Icon name="edit" className="text-[18px]" />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Réinitialiser le mot de passe de ${s.firstName}`} loading={busy} disabled={busy} onClick={() => void reset(s)}>
            <Icon name="key" className="text-[18px]" />
          </Button>
          <Button size="sm" variant={s.status === "ACTIF" ? "ghost" : "outline"} loading={busy} disabled={busy} onClick={() => void toggleActive(s)}>
            {s.status === "ACTIF" ? "Désactiver" : "Réactiver"}
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Supprimer l'accès de ${s.firstName} ${s.lastName}`} title="Supprimer cet accès" className="text-danger hover:bg-red-50" onClick={() => setConfirmDelete({ kind: "staff", row: s })}>
            <Icon name="delete" className="text-[18px]" />
          </Button>
        </div>
      ),
    },
  ];

  const teacherCols: Column<(typeof teachers)[number]>[] = [
    { key: "who", header: "Enseignant", render: (t) => (<div className="flex items-center gap-3"><Avatar name={`${t.firstName} ${t.lastName}`} size={38} /><div><p className="font-semibold">{t.firstName} {t.lastName}</p><p className="text-xs text-neutral-500">{t.email}</p></div></div>) },
    { key: "kind", header: "Fonction", render: (t) => <Badge tone={t.kind === "instituteur" ? "info" : "lime"}>{t.kind === "instituteur" ? "Instituteur" : "Professeur"}</Badge> },
    { key: "classes", header: "Classes", render: (t) => (t.classNames.length ? t.classNames.join(", ") : <span className="text-neutral-400">Aucune</span>) },
    { key: "subjects", header: "Matières", render: (t) => (t.kind === "instituteur" ? "Toutes les matières" : t.subjectNames.join(", ") || "—") },
    { key: "head", header: "Responsabilité", render: (t) => (t.headOf.length ? <Badge tone="dark">{t.kind === "instituteur" ? "Titulaire" : "Principal"} · {t.headOf.join(", ")}</Badge> : "—") },
    { key: "account", header: "Accès", render: (t) => (t.userId ? <Badge tone="success">Compte actif</Badge> : <Badge tone="neutral">Sans accès</Badge>) },
    {
      key: "actions",
      align: "right",
      header: <span className="sr-only">Actions</span>,
      render: (t) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" aria-label={`Supprimer ${t.firstName} ${t.lastName}`} title="Supprimer cet enseignant" className="text-danger hover:bg-red-50" onClick={() => setConfirmDelete({ kind: "teacher", row: t })}>
            <Icon name="delete" className="text-[18px]" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Personnel de l'école"
        subtitle="Créez les accès du personnel : enseignants, secrétaires, économe et surveillant. Un compte désactivé ne peut plus se connecter."
        actions={<Button icon="person_add" onClick={() => { setEditing(null); setOpen(true); }} disabled={readOnly}>Créer un accès</Button>}
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <HeroCard
          eyebrow="Personnel de l'école"
          icon="badge"
          value={staff.length}
          label={`compte${staff.length > 1 ? "s" : ""} d'accès · ${teachers.length} enseignant${teachers.length > 1 ? "s" : ""}`}
          footnote={`${activeCount} actif${activeCount > 1 ? "s" : ""} · ${validEmails}/${staff.length} e-mails valides`}
        >
          <HeroBar
            segments={[
              { pct: staff.length > 0 ? Math.round((countByRole("instituteur") / staff.length) * 100) : 0, className: "bg-lime" },
              { pct: staff.length > 0 ? Math.round((countByRole("professeur") / staff.length) * 100) : 0, className: "bg-emerald-300/90" },
              { pct: staff.length > 0 ? Math.round((countByRole("econome") / staff.length) * 100) : 0, className: "bg-amber-300/90" },
              { pct: staff.length > 0 ? Math.round((countByRole("secretaire") / staff.length) * 100) : 0, className: "bg-sky-300/90" },
              { pct: staff.length > 0 ? Math.round((countByRole("surveillant") / staff.length) * 100) : 0, className: "bg-violet-300/90" },
            ]}
          />
          <HeroLegend
            items={[
              { dot: "bg-lime", label: `Instituteurs · ${countByRole("instituteur")}` },
              { dot: "bg-emerald-300", label: `Professeurs · ${countByRole("professeur")}` },
              { dot: "bg-amber-300", label: `Économes · ${countByRole("econome")}` },
              { dot: "bg-sky-300", label: `Secrétaires · ${countByRole("secretaire")}` },
              { dot: "bg-violet-300", label: `Surveillants · ${countByRole("surveillant")}` },
            ]}
            trailing={
              <>
                <Icon name="verified_user" className="text-[14px]" />
                {activeCount} actifs
              </>
            }
          />
        </HeroCard>

        <div className="grid gap-3 sm:grid-cols-2">
          <KpiTile tone="lime" icon="key" label="Comptes d'accès" value={staff.length} note="Tous rôles confondus" />
          <KpiTile tone="sky" icon="school" label="Enseignants" value={teachers.length} note={`${withoutAccount} sans accès`} />
          <KpiTile tone={pendingPassword > 0 ? "amber" : "neutral"} icon="password" label="Mot de passe temporaire" value={pendingPassword} note="À changer par l'utilisateur" />
          <KpiTile tone="violet" icon="verified_user" label="Titulaires" value={teachers.filter((t) => t.headOf.length > 0).length} note="Classes dirigées" />
        </div>
      </div>

      <Card className="mb-4">
        <PanelHeading
          icon="filter_alt_off"
          title="Rechercher et filtrer"
          subtitle={`${tab === "comptes" ? filteredStaff.length : filteredTeachers.length} ${pluralize(tab === "comptes" ? filteredStaff.length : filteredTeachers.length, "résultat", "résultats")}`}
          action={role ? <Badge tone="lime">1 filtre</Badge> : undefined}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Input aria-label="Rechercher" icon="search" placeholder="Nom, e-mail…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="hidden md:contents">{roleFilter}</div>
        </div>
        <div className="mt-3 flex items-center gap-2 md:hidden">
          <button type="button" onClick={() => setFiltersOpen(true)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-forest">
            <Icon name="tune" className="text-[20px]" />
            Filtres
            {role && <span className="grid min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-bold leading-6 text-forest">1</span>}
          </button>
          {role && (
            <button type="button" onClick={() => setRole("")} className="min-h-12 rounded-2xl px-3 text-sm font-semibold text-neutral-600">
              Réinitialiser
            </button>
          )}
        </div>
      </Card>
      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        footer={<button type="button" onClick={() => setFiltersOpen(false)} className="min-h-12 w-full rounded-full bg-forest text-sm font-semibold text-white">Afficher les résultats</button>}
      >
        {roleFilter}
      </FilterSheet>
      <Tabs
        className="mb-4"
        label="Vue du personnel"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        items={[
          { id: "comptes", label: "Comptes d'accès", icon: "key", badge: staff.length },
          { id: "enseignants", label: "Enseignants", icon: "badge", badge: teachers.length },
        ]}
      />
      <AsyncView state={state} skeleton={<SkeletonTable />}>
        {() =>
          tab === "comptes" ? (
            filteredStaff.length === 0 ? (
              <EmptyState icon="badge" title="Aucun accès" text="Créez un accès pour un membre du personnel : enseignant, secrétaire, économe ou surveillant." action={<Button icon="person_add" onClick={() => setOpen(true)}>Créer un accès</Button>} />
            ) : (
              <Card padded={false} className="overflow-hidden px-2 pb-2">
                <div className="px-3 pt-4 sm:px-4">
                  <PanelHeading icon="key" title="Comptes d'accès" subtitle={`${filteredStaff.length} ${pluralize(filteredStaff.length, "compte", "comptes")} · ${activeCount} actif${activeCount > 1 ? "s" : ""}`} />
                </div>
                <div className="mt-3">
                  <Table caption="Comptes d'accès du personnel" columns={staffCols} rows={filteredStaff} rowKey={(s) => s.userId} stagger />
                </div>
              </Card>
            )
          ) : filteredTeachers.length === 0 ? (
            <EmptyState icon="person_search" title="Aucun enseignant" text="Modifiez votre recherche." />
          ) : (
            <Card padded={false} className="overflow-hidden px-2 pb-2">
              <div className="px-3 pt-4 sm:px-4">
                <PanelHeading icon="school" title="Enseignants" subtitle={`${filteredTeachers.length} enseignant${filteredTeachers.length > 1 ? "s" : ""} · ${withoutAccount} sans accès`} />
              </div>
              <div className="mt-3">
                <Table caption="Liste des enseignants" columns={teacherCols} rows={filteredTeachers} rowKey={(t) => t.id} stagger />
              </div>
            </Card>
          )
        }
      </AsyncView>

      <Modal open={open} onClose={() => { setOpen(false); setEditing(null); }} title={editing ? `Modifier l'accès de ${editing.firstName}` : "Créer un accès du personnel"} size="lg">
        <StaffForm
          subjects={subjects}
          initial={editing ? { role: editing.role as StaffFormValue["role"], firstName: editing.firstName, lastName: editing.lastName, email: editing.email, phone: editing.phone, specialties: teachers.find((t) => t.id === editing.teacherId)?.specialties ?? [], password: "" } : undefined}
          submitLabel={editing ? "Enregistrer" : "Créer l'accès"}
          busy={busy}
          onCancel={() => { setOpen(false); setEditing(null); }}
          onSubmit={submit}
          allowedRoles={allowedRoles}
        />
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete?.kind === "teacher" ? "Supprimer cet enseignant ?" : "Supprimer cet accès ?"}
        message={
          confirmDelete?.kind === "teacher"
            ? `Voulez-vous vraiment supprimer l'enseignant ${confirmDelete.row.firstName} ${confirmDelete.row.lastName} ? Ses affectations aux classes et aux matières seront retirées. Cette action est irréversible.`
            : confirmDelete
              ? `Voulez-vous vraiment supprimer l'accès de ${confirmDelete.row.firstName} ${confirmDelete.row.lastName} (${confirmDelete.row.email}) ? Cette personne ne pourra plus se connecter. Cette action est irréversible.`
              : ""
        }
        confirmLabel="Oui, supprimer"
        loading={deleting}
        onConfirm={() => {
          if (!confirmDelete) return;
          void (confirmDelete.kind === "teacher" ? removeTeacher(confirmDelete.row) : removeStaffAccount(confirmDelete.row));
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      <StaffCredentialsModal open={!!credentials} credentials={credentials} school={school} onClose={() => setCredentials(null)} />

      {readOnly && (
        <p className={cn("mt-4 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-900")}>
          École en lecture seule (abonnement expiré) : la création de comptes est désactivée.
        </p>
      )}
      {staff.some((s) => s.mustChangePassword) && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-900">
          <Icon name="info" className="text-[20px]" />
          Certains comptes n'ont pas encore changé leur mot de passe temporaire. Rappelez-le lors de votre prochain point.
        </p>
      )}
      <p className="mt-4 text-xs text-neutral-500">Adresses e-mail valides uniquement : {staff.filter((s) => isValidEmail(s.email)).length}/{staff.length} comptes conformes.</p>
    </>
  );
}