// Fiche détaillée d'un établissement côté admin.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { LinkButton } from "@/components/ui/Button";
import { useAsync } from "@/hooks/useAsync";
import {
  updateAdminSchool,
  setAdminSchoolStatus,
  deleteAdminSchool,
  getAdminSchoolDetail,
  type AdminSchoolDetail,
  type SchoolClassRow,
  type SchoolTeacherRow,
} from "@/services/admin";
import type { AdminSchool } from "@/types";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { Modal } from "@/components/ui/Modal";
import { Table } from "@/components/ui/Table";
import { formatCurrency, formatDate } from "@/utils/format";
import {
  EntityAvatar,
  KpiTile,
  MonoChip,
  Notice,
  PanelHeading,
  StatusDot,
} from "@/features/admin/adminUi";

const CYCLE_LABELS: Record<string, string> = {
  elementaire: "Élémentaire",
  moyen: "Moyen",
  secondaire: "Secondaire",
};

// Composant principal de la page.
export default function AdminSchoolDetailPage() {
  // La route est « ecoles/:id » : lire « id » (l'ancien code lisait
  // « schoolId », toujours undefined → « École introuvable » systématique).
  const { id: schoolIdParam } = useParams();
  const { agent } = useAdminAuth();
  const isSuperAdmin = agent?.role === "superadmin";

  // Hooks TOUJOURS appelés, dans le même ordre, quel que soit le param :
  // useAsync avec un no-op quand l'id est absent (jamais de retour anticipé
  // avant les hooks — rules-of-hooks).
  const schoolId = schoolIdParam ?? "";
  const state = useAsync(
    () => (schoolId ? getAdminSchoolDetail(schoolId) : Promise.resolve(null)),
    [schoolId],
  );

  if (!schoolIdParam) {
    return <div>École introuvable.</div>;
  }

  return (
    <>
      <AsyncView state={state}>
        {/* detail ne peut pas être null ici : schoolIdParam est présent
            (sinon retour anticipé plus haut). */}
        {(detail) => <Content detail={detail!} isSuperAdmin={isSuperAdmin} />}
      </AsyncView>
    </>
  );
}

function Content({ detail, isSuperAdmin }: { detail: AdminSchoolDetail; isSuperAdmin: boolean }) {
  const school: AdminSchool = detail.school;
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<"ACTIF" | "SUSPENDUE">("ACTIF");
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [form, setForm] = useState({
    name: school.name,
    city: school.city,
    address: school.address,
    phone: school.phone,
    email: school.email,
    cycles: school.cycles,
    registrationOpen: school.registrationOpen,
    autoApproveStudents: school.autoApproveStudents,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await updateAdminSchool({
        schoolId: school.id,
        name: form.name.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        cycles: form.cycles,
        registrationOpen: form.registrationOpen,
        autoApproveStudents: form.autoApproveStudents,
      });
      setStatusMsg({ type: "success", text: "Établissement mis à jour avec succès." });
      setEditing(false);
    } catch (e: any) {
      setError(e.message || "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = (newStatus: "ACTIF" | "SUSPENDUE") => {
    setPendingStatus(newStatus);
    setStatusModal(true);
  };

  const confirmStatusChange = async () => {
    try {
      await setAdminSchoolStatus({ schoolId: school.id, status: pendingStatus });
      setStatusMsg({ type: "success", text: `Établissement ${pendingStatus === "ACTIF" ? "activé" : "suspendu"} avec succès.` });
      setStatusModal(false);
      window.location.reload();
    } catch (e: any) {
      setError(e.message || "Erreur lors du changement de statut.");
    }
  };

  const openDeleteModal = () => {
    setDeleteConfirm("");
    setDeleteError("");
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      await deleteAdminSchool({ schoolId: school.id, confirmation: deleteConfirm });
      navigate("/admin/ecoles");
    } catch (e: any) {
      setDeleteError(e.message || "Erreur lors de la suppression.");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={school.name}
        subtitle={`Matricule : ${school.matricule} · ${school.city}`}
        actions={
          <>
            <LinkButton to="/admin/ecoles" variant="ghost" size="sm" icon="arrow_back">
              Retour à la liste
            </LinkButton>
            {editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                  Annuler
                </Button>
                <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
                  Enregistrer
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" icon="edit" onClick={() => setEditing(true)}>
                Modifier les infos
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                variant={school.registrationOpen ? "danger" : "primary"}
                size="sm"
                icon={school.registrationOpen ? "block" : "play_arrow"}
                onClick={() => handleStatusChange(school.registrationOpen ? "SUSPENDUE" : "ACTIF")}
              >
                {school.registrationOpen ? "Suspendre" : "Activer"}
              </Button>
            )}
          </>
        }
      />

      {statusMsg && (
        <Notice tone={statusMsg.type} onClose={() => setStatusMsg(null)}>
          {statusMsg.text}
        </Notice>
      )}

      {editing && (
        <Card>
          <PanelHeading
            icon="edit_note"
            title="Modifier les informations administratives"
            subtitle="Les changements sont appliqués immédiatement après enregistrement."
          />
          <form onSubmit={handleSave} className="mt-5 space-y-4">
            {error && <Notice tone="error">{error}</Notice>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Nom de l'établissement" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Ville" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              <Input label="Téléphone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <Input label="E-mail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-ink">Cycles</label>
                <div className="flex flex-wrap gap-2">
                  {["elementaire", "moyen", "secondaire"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={form.cycles.includes(c)}
                      onClick={() => {
                        const idx = form.cycles.indexOf(c);
                        const next = idx >= 0 ? form.cycles.filter((x) => x !== c) : [...form.cycles, c];
                        setForm({ ...form, cycles: next });
                      }}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                        form.cycles.includes(c) ? "bg-forest text-white shadow-card" : "bg-mist text-forest hover:bg-lime-soft"
                      }`}
                    >
                      {form.cycles.includes(c) && <Icon name="check" className="text-[16px]" />}
                      {CYCLE_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-ink">Options</label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-forest"
                    checked={form.registrationOpen}
                    onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })}
                  />
                  Inscriptions ouvertes
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-forest"
                    checked={form.autoApproveStudents}
                    onChange={(e) => setForm({ ...form, autoApproveStudents: e.target.checked })}
                  />
                  Approbation automatique des élèves
                </label>
              </div>
            </div>
          </form>
        </Card>
      )}

      {!editing && (
        <>
          {/* Identité et effectifs */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <SchoolHero school={school} />

            <div className="grid gap-3 sm:grid-cols-2">
              <KpiTile
                tone="lime"
                icon="groups"
                label="Élèves"
                value={detail.stats.students}
                note={`${detail.stats.girls} fille(s) · ${detail.stats.boys} garçon(s)`}
              />
              <KpiTile
                tone="sky"
                icon="meeting_room"
                label="Classes"
                value={detail.stats.classes}
                note="Salles constituées"
              />
              <KpiTile
                tone="amber"
                icon="badge"
                label="Enseignants"
                value={detail.stats.teachers}
                note="Professeurs et instituteurs"
              />
              <KpiTile
                tone="violet"
                icon="family_restroom"
                label="Parents"
                value={detail.stats.parents}
                note="Comptes familiaux"
              />
            </div>
          </div>

          {/* Informations, statut, direction */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <PanelHeading icon="info" title="Informations générales" subtitle="Coordonnées administratives de l'école." />
              <div className="mt-4 space-y-2.5">
                <InfoRow icon="badge" label="Matricule" value={<MonoChip>{school.matricule || "—"}</MonoChip>} />
                <InfoRow icon="location_on" label="Ville" value={school.city || "—"} />
                <InfoRow icon="location_on" label="Adresse" value={school.address || "—"} />
                <InfoRow icon="call" label="Téléphone" value={school.phone || "—"} />
                <InfoRow icon="mail" label="E-mail" value={<span className="break-all">{school.email || "—"}</span>} />
                <InfoRow icon="school" label="Cycles" value={school.cycles.map((c) => CYCLE_LABELS[c] ?? c).join(" · ") || "—"} />
                <InfoRow icon="event" label="Créé le" value={formatDate(school.createdAt)} />
              </div>
            </Card>

            <Card>
              <PanelHeading icon="tune" title="Statut et options" subtitle="Accès et règles d'inscription de l'école." />
              <div className="mt-4 space-y-2.5">
                <InfoRow
                  icon={school.registrationOpen ? "verified" : "block"}
                  label="Statut"
                  value={
                    <Badge tone={school.registrationOpen ? "success" : "danger"}>
                      <StatusDot tone={school.registrationOpen ? "success" : "danger"} />
                      {school.registrationOpen ? "Actif" : "Suspendu"}
                    </Badge>
                  }
                />
                <InfoRow
                  icon="how_to_reg"
                  label="Inscriptions"
                  value={
                    <Badge tone={school.registrationOpen ? "success" : "neutral"}>
                      {school.registrationOpen ? "Ouvertes" : "Fermées"}
                    </Badge>
                  }
                />
                <InfoRow
                  icon="verified"
                  label="Approbation auto."
                  value={
                    <Badge tone={school.autoApproveStudents ? "success" : "neutral"}>
                      {school.autoApproveStudents ? "Activée" : "Désactivée"}
                    </Badge>
                  }
                />
              </div>
              <div className="mt-4 rounded-2xl bg-mist p-3 text-xs leading-relaxed text-neutral-600">
                {school.registrationOpen
                  ? "Les familles peuvent déposer une inscription depuis l'espace public."
                  : "L'école est suspendue : les inscriptions et l'accès des familles sont bloqués."}
              </div>
            </Card>

            <Card>
              <PanelHeading icon="manage_accounts" title="Direction" subtitle="Compte directeur rattaché à l'établissement." />
              {detail.director ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-mist/60 p-3">
                    <EntityAvatar name={`${detail.director.firstName} ${detail.director.lastName}`} active={detail.director.status === "ACTIF"} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">
                        {detail.director.firstName} {detail.director.lastName}
                      </p>
                      <p className="text-xs text-neutral-500">Directeur / Directrice</p>
                    </div>
                    <Badge
                      className="ml-auto"
                      tone={detail.director.status === "ACTIF" ? "success" : "neutral"}
                    >
                      <StatusDot tone={detail.director.status === "ACTIF" ? "success" : "neutral"} />
                      {detail.director.status === "ACTIF" ? "Actif" : detail.director.status === "EN_ATTENTE" ? "En attente" : "Désactivé"}
                    </Badge>
                  </div>
                  <InfoRow icon="mail" label="E-mail" value={<span className="break-all">{detail.director.email}</span>} />
                  <InfoRow icon="call" label="Téléphone" value={detail.director.phone || "—"} />
                  <InfoRow icon="event" label="Membre depuis" value={formatDate(detail.director.memberSince)} />
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-mist px-4 py-6 text-center text-sm text-neutral-500">
                  Aucun directeur n'est enregistré pour cet établissement.
                </p>
              )}
            </Card>
          </div>

          {/* Classes et abonnement */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2" padded={false}>
              <div className="px-4 pt-5 sm:px-6">
                <PanelHeading
                  icon="meeting_room"
                  title="Classes"
                  subtitle={`${detail.stats.classes} classe(s) · ${detail.stats.students} élève(s)`}
                  action={<Badge tone="neutral">{detail.classes.length} ligne(s)</Badge>}
                />
              </div>
              <div className="px-4 py-4 sm:px-6">
                {detail.classes.length === 0 ? (
                  <p className="rounded-2xl bg-mist/60 px-4 py-8 text-center text-sm text-neutral-500">
                    Aucune classe n'a encore été créée.
                  </p>
                ) : (
                  <Table
                    stagger
                    columns={[
                      {
                        key: "name",
                        header: "Classe",
                        render: (r: SchoolClassRow) => (
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{r.name}</p>
                            <p className="text-xs text-neutral-500">{r.level}</p>
                          </div>
                        ),
                      },
                      {
                        key: "cycle",
                        header: "Cycle",
                        className: "hidden sm:table-cell",
                        render: (r: SchoolClassRow) => (
                          <Badge tone="neutral">{CYCLE_LABELS[r.cycle] ?? r.cycle}</Badge>
                        ),
                      },
                      {
                        key: "count",
                        header: "Effectif",
                        align: "right",
                        render: (r: SchoolClassRow) => {
                          const pct = r.capacity > 0 ? Math.min(100, Math.round((r.studentCount / r.capacity) * 100)) : 0;
                          const full = r.studentCount > r.capacity;
                          return (
                            <div className="ml-auto w-28">
                              <p className={`text-sm tabular-nums ${full ? "font-semibold text-danger" : "text-ink"}`}>
                                {r.studentCount} / {r.capacity}
                              </p>
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-mist">
                                <div
                                  className={`h-full rounded-full ${full ? "bg-danger" : "bg-leaf"}`}
                                  style={{ width: `${Math.max(pct, r.studentCount > 0 ? 4 : 0)}%` }}
                                />
                              </div>
                            </div>
                          );
                        },
                      },
                    ]}
                    rows={detail.classes}
                    rowKey={(r: SchoolClassRow) => r.id}
                    caption="Effectifs par classe"
                  />
                )}
              </div>
            </Card>

            <Card>
              <PanelHeading icon="workspace_premium" title="Abonnement" subtitle="Formule et échéance en cours." />
              {detail.subscription ? (
                <div className="mt-4 space-y-2.5">
                  <div className="rounded-2xl bg-lime-soft p-4">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-forest/60">Formule</p>
                    <p className="mt-1 text-lg font-extrabold text-forest">{detail.subscription.plan?.name ?? "—"}</p>
                    {detail.subscription.plan?.tagline && (
                      <p className="text-xs text-forest/70">{detail.subscription.plan.tagline}</p>
                    )}
                  </div>
                  <InfoRow
                    icon="verified"
                    label="Statut"
                    value={
                      <Badge
                        tone={
                          detail.subscription.status === "ACTIF"
                            ? "success"
                            : detail.subscription.status === "EXPIRE"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        <StatusDot
                          tone={
                            detail.subscription.status === "ACTIF"
                              ? "success"
                              : detail.subscription.status === "EXPIRE"
                                ? "danger"
                                : "neutral"
                          }
                        />
                        {detail.subscription.status === "ACTIF"
                          ? "Actif"
                          : detail.subscription.status === "EXPIRE"
                            ? "Expiré"
                            : "Aucun"}
                      </Badge>
                    }
                  />
                  <InfoRow
                    icon="date_range"
                    label="Période"
                    value={`${formatDate(detail.subscription.startsAt)} → ${formatDate(detail.subscription.endsAt)}`}
                  />
                  <InfoRow
                    icon="groups"
                    label="Limite"
                    value={`${detail.subscription.studentLimit ?? detail.subscription.plan?.studentLimit ?? "Illimité"} élève(s)`}
                  />
                  <InfoRow
                    icon="payments"
                    label="Payé"
                    value={<span className="font-extrabold text-forest">{formatCurrency(detail.subscription.amountPaid)}</span>}
                  />
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-mist px-4 py-6 text-center text-sm text-neutral-500">
                  Aucun abonnement enregistré pour cet établissement.
                </p>
              )}
              <LinkButton className="mt-4 w-full" to="/admin/abonnements" variant="outline" size="sm" icon="autorenew">
                Gérer l'abonnement
              </LinkButton>
            </Card>
          </div>

          {/* Enseignants */}
          <Card padded={false}>
            <div className="px-4 pt-5 sm:px-6">
              <PanelHeading
                icon="badge"
                title="Enseignants"
                subtitle={`${detail.teachersTotal} enseignant(s) rattaché(s) à l'établissement`}
                action={<Badge tone="neutral">{detail.teachers.length} affiché(s)</Badge>}
              />
            </div>
            <div className="px-4 py-4 sm:px-6">
              {detail.teachers.length === 0 ? (
                <p className="rounded-2xl bg-mist/60 px-4 py-8 text-center text-sm text-neutral-500">
                  Aucun enseignant enregistré.
                </p>
              ) : (
                <>
                  <Table
                    stagger
                    columns={[
                      {
                        key: "name",
                        header: "Enseignant",
                        render: (r: SchoolTeacherRow) => (
                          <div className="flex min-w-0 items-center gap-3">
                            <EntityAvatar name={`${r.firstName} ${r.lastName}`} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-ink">
                                {r.firstName} {r.lastName}
                              </p>
                              <p className="text-xs capitalize text-neutral-500">{r.kind}</p>
                            </div>
                          </div>
                        ),
                      },
                      {
                        key: "spec",
                        header: "Spécialités",
                        render: (r: SchoolTeacherRow) => (
                          <div className="flex flex-wrap gap-1">
                            {r.specialties.length === 0 ? (
                              <span className="text-sm text-neutral-400">—</span>
                            ) : (
                              r.specialties.map((s) => (
                                <span key={s} className="rounded-lg bg-mist px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                                  {s}
                                </span>
                              ))
                            )}
                          </div>
                        ),
                      },
                      {
                        key: "contact",
                        header: "Contact",
                        className: "hidden md:table-cell",
                        render: (r: SchoolTeacherRow) => (
                          <span className="break-all text-xs text-neutral-500">
                            {r.email}
                            {r.phone ? ` · ${r.phone}` : ""}
                          </span>
                        ),
                      },
                    ]}
                    rows={detail.teachers}
                    rowKey={(r: SchoolTeacherRow) => r.id}
                    caption="Corps enseignant"
                  />
                  {detail.teachersTotal > detail.teachers.length && (
                    <p className="mt-3 text-xs text-neutral-500">
                      + {detail.teachersTotal - detail.teachers.length} autre(s) enseignant(s) non affiché(s).
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>
        </>
      )}

      {isSuperAdmin && !editing && (
        <Card className="border border-red-200">
          <PanelHeading
            icon="delete"
            title="Zone de danger"
            subtitle="Actions irréversibles — à n'utiliser qu'en dernier recours."
            action={<Badge tone="danger">Superadmin</Badge>}
          />
          <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-red-100 bg-red-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-600">
              <p className="font-semibold text-danger">Suppression définitive de l'établissement</p>
              <p className="mt-1 text-xs leading-relaxed">
                Efface irrévocablement <strong className="text-ink">{school.name}</strong> : élèves, classes, enseignants, parents,
                abonnements, messages et tous les comptes de connexion associés.
              </p>
            </div>
            <Button variant="danger" size="sm" icon="delete" onClick={openDeleteModal} className="shrink-0">
              Supprimer définitivement…
            </Button>
          </div>
        </Card>
      )}

      <Modal
        open={statusModal}
        onClose={() => setStatusModal(false)}
        title="Changer le statut de l'établissement"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusModal(false)}>
              Annuler
            </Button>
            <Button variant="danger" onClick={confirmStatusChange}>
              {pendingStatus === "ACTIF" ? "Activer" : "Suspendre"}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-neutral-700">
          Voulez-vous vraiment {pendingStatus === "ACTIF" ? "activer" : "suspendre"} l'établissement{" "}
          <strong className="text-ink">{school.name}</strong> ?
        </p>
      </Modal>

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Supprimer définitivement l'établissement"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteModal(false)} disabled={deleting}>
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              loading={deleting}
              disabled={!school.matricule || deleteConfirm !== school.matricule}
            >
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <Icon name="warning" fill className="text-[20px]" />
            Cette action est irréversible.
          </p>
          <p className="mt-1 text-xs text-neutral-600">
            Seront définitivement supprimés : l'établissement <strong>{school.name}</strong>, ses élèves, classes,
            enseignants, parents, abonnements, messages, ainsi que tous les comptes de connexion de son personnel
            et de ses familles.
          </p>
        </div>
        {deleteError && (
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-danger">
            <Icon name="error" className="text-[20px]" />
            {deleteError}
          </p>
        )}
        {school.matricule ? (
          <Input
            label="Tapez la matricule de l'établissement pour confirmer"
            hint={`Matricule attendue : ${school.matricule}`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={school.matricule}
            autoComplete="off"
          />
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Cet établissement n'a pas de matricule : la suppression est bloquée. Attribuez d'abord une matricule.
          </p>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Identité de l'établissement                                        */
/* ------------------------------------------------------------------ */

/** Bandeau forêt : nom, matricule, cycles, statut et coordonnées. */
function SchoolHero({ school }: { school: AdminSchool }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-soft">
      <div
        className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(currentColor_1.4px,transparent_1.4px)] [background-size:18px_18px]"
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-lime/25 blur-3xl" aria-hidden="true" />

      <div className="relative flex items-start gap-4">
        <EntityAvatar name={school.name} active={school.registrationOpen} className="size-16 rounded-3xl text-2xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-lime">Fiche établissement</p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{school.name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <MonoChip className="bg-white/10 text-white/80">{school.matricule || "Sans matricule"}</MonoChip>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-white/60">
              <Icon name="location_on" className="text-[14px]" />
              {school.city || "Ville non renseignée"}
            </span>
          </div>
        </div>
        <Badge tone={school.registrationOpen ? "lime" : "danger"} className="shrink-0">
          <StatusDot tone={school.registrationOpen ? "success" : "danger"} />
          {school.registrationOpen ? "Actif" : "Suspendu"}
        </Badge>
      </div>

      <div className="relative mt-5 flex flex-wrap gap-1.5">
        {school.cycles.length === 0 ? (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/70">Aucun cycle renseigné</span>
        ) : (
          school.cycles.map((cycle) => (
            <span key={cycle} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
              {CYCLE_LABELS[cycle] ?? cycle}
            </span>
          ))
        )}
      </div>

      <div className="relative mt-5 grid gap-2 sm:grid-cols-3">
        <HeroContact icon="call" label="Téléphone" value={school.phone || "—"} />
        <HeroContact icon="mail" label="E-mail" value={school.email || "—"} />
        <HeroContact icon="location_on" label="Adresse" value={school.address || "—"} />
      </div>
    </div>
  );
}

function HeroContact({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
        <Icon name={icon} className="text-[14px]" />
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function InfoRow({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-mist/70 px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
        <Icon name={icon} className="text-[16px] text-forest" />
        {label}
      </span>
      <span className="min-w-0 text-right text-sm text-ink">{value}</span>
    </div>
  );
}
