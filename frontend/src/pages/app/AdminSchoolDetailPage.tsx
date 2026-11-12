// Fiche détaillée d'un établissement côté admin.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { AsyncView } from "@/components/ui/AsyncView";
import { Card, CardHeader } from "@/components/ui/Card";
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
import { StatCard } from "@/components/ui/StatCard";
import { Table } from "@/components/ui/Table";

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

  const cycleLabels: Record<string, string> = { elementaire: "Élémentaire", moyen: "Moyen", secondaire: "Secondaire" };

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
              <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
                Modifier les infos
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                variant={school.registrationOpen ? "danger" : "primary"}
                size="sm"
                onClick={() => handleStatusChange(school.registrationOpen ? "SUSPENDUE" : "ACTIF")}
              >
                {school.registrationOpen ? "Suspendre" : "Activer"}
              </Button>
            )}
          </>
        }
      />

      {statusMsg && (
        <div className={`rounded-xl p-3 ${statusMsg.type === "success" ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"}`}>
          <Icon name={statusMsg.type === "success" ? "check_circle" : "error"} fill className={`mr-2 ${statusMsg.type === "success" ? "text-emerald-600" : "text-red-600"}`} />
          <span className="text-sm">{statusMsg.text}</span>
        </div>
      )}

      {editing && (
        <Card>
          <CardHeader title="Modifier les informations administratives" />
          <form onSubmit={handleSave} className="p-4 space-y-4">
            {error && <p className="text-xs text-danger">{error}</p>}
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
                <div className="flex gap-2">
                  {["elementaire", "moyen", "secondaire"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        const idx = form.cycles.indexOf(c);
                        const next = idx >= 0 ? form.cycles.filter((x) => x !== c) : [...form.cycles, c];
                        setForm({ ...form, cycles: next });
                      }}
                      className={`px-3 py-2 rounded-xl text-sm border transition ${form.cycles.includes(c) ? "bg-forest text-white border-forest" : "bg-white text-neutral-600 border-neutral-300 hover:border-forest"}`}
                    >
                      {cycleLabels[c]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-ink">Options</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.registrationOpen} onChange={(e) => setForm({ ...form, registrationOpen: e.target.checked })} /> Inscriptions ouvertes
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.autoApproveStudents} onChange={(e) => setForm({ ...form, autoApproveStudents: e.target.checked })} /> Approbation automatique des élèves
                </label>
              </div>
            </div>
          </form>
        </Card>
      )}

      {!editing && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="Informations générales" />
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Nom</span>
                <span className="text-sm font-medium">{school.name}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Matricule</span>
                <span className="text-sm font-mono font-medium">{school.matricule}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Ville</span>
                <span className="text-sm">{school.city}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Adresse</span>
                <span className="text-sm">{school.address || "—"}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Téléphone</span>
                <span className="text-sm">{school.phone}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">E-mail</span>
                <span className="text-sm">{school.email}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Cycles</span>
                <span className="text-sm">{school.cycles.map((c) => cycleLabels[c]).join(" · ") || "—"}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Créé le</span>
                <span className="text-sm text-neutral-500">{school.createdAt}</span>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Statut et options" />
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Statut</span>
                <Badge tone={school.registrationOpen ? "success" : "danger"}>
                  {school.registrationOpen ? "Actif" : "Suspendu"}
                </Badge>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Inscriptions</span>
                <Badge tone={school.registrationOpen ? "success" : "neutral"}>
                  {school.registrationOpen ? "Ouvertes" : "Fermées"}
                </Badge>
              </div>
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-neutral-400">Approbation auto.</span>
                <Badge tone={school.autoApproveStudents ? "success" : "neutral"}>
                  {school.autoApproveStudents ? "Activée" : "Désactivée"}
                </Badge>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Direction" />
            {detail.director ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-neutral-400">Directeur</span>
                  <span className="text-sm font-medium">{detail.director.firstName} {detail.director.lastName}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-neutral-400">E-mail</span>
                  <span className="break-all text-sm">{detail.director.email}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-neutral-400">Téléphone</span>
                  <span className="text-sm">{detail.director.phone || "—"}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-neutral-400">Statut</span>
                  <Badge tone={detail.director.status === "ACTIF" ? "success" : "neutral"}>
                    {detail.director.status === "ACTIF" ? "Actif" : detail.director.status === "EN_ATTENTE" ? "En attente" : "Désactivé"}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Aucun directeur n'est enregistré pour cet établissement.</p>
            )}
          </Card>
        </div>
      )}

      {!editing && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard dark icon="groups" label="Élèves" value={String(detail.stats.students)} note={`${detail.stats.girls} filles · ${detail.stats.boys} garçons`} />
            <StatCard icon="meeting_room" label="Classes" value={String(detail.stats.classes)} note="salles constituées" />
            <StatCard icon="badge" label="Enseignants" value={String(detail.stats.teachers)} note="professeurs et instituteurs" />
            <StatCard icon="family_restroom" label="Parents" value={String(detail.stats.parents)} note="comptes familiaux" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title="Classes" subtitle={`${detail.stats.classes} classe(s) · ${detail.stats.students} élève(s)`} />
              {detail.classes.length === 0 ? (
                <p className="text-sm text-neutral-500">Aucune classe n'a encore été créée.</p>
              ) : (
                <Table
                  columns={[
                    { key: "name", header: "Classe", render: (r: SchoolClassRow) => <span className="font-medium">{r.name}</span> },
                    { key: "level", header: "Niveau", render: (r: SchoolClassRow) => r.level },
                    { key: "cycle", header: "Cycle", render: (r: SchoolClassRow) => cycleLabels[r.cycle] ?? r.cycle },
                    {
                      key: "count",
                      header: "Effectif",
                      align: "right",
                      render: (r: SchoolClassRow) => (
                        <span className={`tabular-nums ${r.studentCount > r.capacity ? "font-semibold text-danger" : ""}`}>
                          {r.studentCount} / {r.capacity}
                        </span>
                      ),
                    },
                  ]}
                  rows={detail.classes}
                  rowKey={(r: SchoolClassRow) => r.id}
                  caption="Effectifs par classe"
                />
              )}
            </Card>

            <Card>
              <CardHeader title="Abonnement" />
              {detail.subscription ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-neutral-400">Formule</span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{detail.subscription.plan?.name ?? "—"}</span>
                      {detail.subscription.plan?.tagline && (
                        <p className="text-xs text-neutral-500">{detail.subscription.plan.tagline}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-neutral-400">Statut</span>
                    <Badge tone={detail.subscription.status === "ACTIF" ? "success" : detail.subscription.status === "EXPIRE" ? "danger" : "neutral"}>
                      {detail.subscription.status === "ACTIF" ? "Actif" : detail.subscription.status === "EXPIRE" ? "Expiré" : "Aucun"}
                    </Badge>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-neutral-400">Période</span>
                    <span className="text-sm">
                      {detail.subscription.startsAt ?? "—"} → {detail.subscription.endsAt ?? "—"}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-neutral-400">Limite</span>
                    <span className="text-sm">
                      {detail.subscription.studentLimit ?? detail.subscription.plan?.studentLimit ?? "Illimité"} élève(s)
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-neutral-400">Payé</span>
                    <span className="text-sm">{detail.subscription.amountPaid.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">Aucun abonnement enregistré pour cet établissement.</p>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader title="Enseignants" subtitle={`${detail.teachersTotal} enseignant(s)`} />
            {detail.teachers.length === 0 ? (
              <p className="text-sm text-neutral-500">Aucun enseignant enregistré.</p>
            ) : (
              <>
                <Table
                  columns={[
                    {
                      key: "name",
                      header: "Enseignant",
                      render: (r: SchoolTeacherRow) => <span className="font-medium">{r.firstName} {r.lastName}</span>,
                    },
                    {
                      key: "kind",
                      header: "Type",
                      render: (r: SchoolTeacherRow) => <span className="capitalize">{r.kind}</span>,
                    },
                    {
                      key: "spec",
                      header: "Spécialités",
                      render: (r: SchoolTeacherRow) => r.specialties.join(" · ") || "—",
                    },
                    {
                      key: "contact",
                      header: "Contact",
                      render: (r: SchoolTeacherRow) => (
                        <span className="break-all text-xs text-neutral-500">{r.email}{r.phone ? ` · ${r.phone}` : ""}</span>
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
          </Card>
        </>
      )}

      {isSuperAdmin && !editing && (
        <Card className="border border-red-200">
          <CardHeader title="Zone de danger" subtitle="Actions irréversibles — à n'utiliser qu'en dernier recours" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-neutral-600">
              <p className="font-semibold text-danger">Suppression définitive de l'établissement</p>
              <p className="mt-1 text-xs">
                Efface irrévocablement <strong>{school.name}</strong> : élèves, classes, enseignants, parents,
                abonnements, messages et tous les comptes de connexion associés.
              </p>
            </div>
            <Button variant="danger" size="sm" icon="delete" onClick={openDeleteModal} className="shrink-0">
              Supprimer définitivement…
            </Button>
          </div>
        </Card>
      )}

      <Modal open={statusModal} onClose={() => setStatusModal(false)} title="Changer le statut de l'établissement" size="sm">
        <p className="mb-4">Voulez-vous vraiment {pendingStatus === "ACTIF" ? "activer" : "suspendre"} l'établissement <strong>{school.name}</strong> ?</p>
        <div className="flex justify-end gap-3" slot="footer">
          <Button variant="outline" onClick={() => setStatusModal(false)}>
            Annuler
          </Button>
          <Button variant="danger" onClick={confirmStatusChange}>
            {pendingStatus === "ACTIF" ? "Activer" : "Suspendre"}
          </Button>
        </div>
      </Modal>

      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="Supprimer définitivement l'établissement" size="sm">
        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3">
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
        <div className="flex justify-end gap-3" slot="footer">
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
        </div>
      </Modal>
    </div>
  );
}