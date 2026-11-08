// Vie scolaire : absences, retards et incidents disciplinaires.

import { useMemo, useState, type FormEvent } from "react";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/context/ToastContext";
import { todayIso } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { addAbsence, listAbsences, type AbsenceRow } from "@/services/absenceService";
import { listStudentRows } from "@/services/studentService";
import { useCurrentUser } from "@/context/AuthContext";
import type { AbsenceRecord } from "@/types";
import { formatDate } from "@/utils/format";
import { GreetingSection } from "./GreetingSection";

const TYPE_LABELS: Record<AbsenceRecord["type"], string> = { absence: "Absence", retard: "Retard", discipline: "Discipline" };
const TYPE_TONES = { absence: "warning", retard: "info", discipline: "danger" } as const;

/** Vie scolaire : absences, retards et discipline (page simple). */
export function SurveillantDashboard() {
  const user = useCurrentUser();
  const state = useAsync(() => listAbsences(user.schoolId), [user.schoolId]);
  const students = useAsync(() => listStudentRows(user), []);
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ studentId: "", type: "absence" as AbsenceRecord["type"], date: todayIso(), motif: "", sanction: "" });

  const rows = state.data ?? [];
  const filtered = useMemo(() => (tab === "all" ? rows : rows.filter((r) => r.type === tab)), [rows, tab]);
  const count = (t: AbsenceRecord["type"]) => rows.filter((r) => r.type === t).length;

  const columns: Column<AbsenceRow>[] = [
    { key: "date", header: "Date", render: (r) => formatDate(r.date) },
    { key: "student", header: "Élève", render: (r) => <span className="font-semibold">{r.studentName}</span> },
    { key: "class", header: "Classe", render: (r) => r.className },
    { key: "subject", header: "Matière", render: (r) => r.subjectName ?? "Vie scolaire" },
    { key: "type", header: "Type", render: (r) => <Badge tone={TYPE_TONES[r.type]}>{TYPE_LABELS[r.type]}</Badge> },
    { key: "motif", header: "Motif", render: (r) => r.motif },
    { key: "status", header: "Statut", render: (r) => (r.type === "discipline" ? <Badge tone="neutral">{r.sanction}</Badge> : <Badge tone={r.justified ? "success" : "danger"}>{r.justified ? "Justifiée" : "Non justifiée"}</Badge>) },
  ];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.studentId || form.motif.trim().length < 3) return;
    setSaving(true);
    try {
      await addAbsence(user.schoolId, { studentId: form.studentId, type: form.type, date: form.date, motif: form.motif.trim(), justified: false, ...(form.type === "discipline" && form.sanction ? { sanction: form.sanction } : {}) });
      toast("Signalement enregistré.");
      setOpen(false);
      setForm({ studentId: "", type: "absence", date: todayIso(), motif: "", sanction: "" });
      state.reload();
    } catch {
      toast("Enregistrement impossible.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader title="Vie scolaire" subtitle="Absences, retards et discipline — décembre 2026" actions={<Button icon="add" onClick={() => setOpen(true)}>Nouveau signalement</Button>} />
      <GreetingSection />
      <AsyncView state={state}>
        {() => (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard dark icon="event_busy" label="Absences" value={String(count("absence"))} note="ce mois-ci" />
              <StatCard icon="schedule" label="Retards" value={String(count("retard"))} note="ce mois-ci" />
              <StatCard icon="gavel" label="Incidents disciplinaires" value={String(count("discipline"))} />
              <StatCard icon="report" label="Non justifiées" value={String(rows.filter((r) => r.type !== "discipline" && !r.justified).length)} badge={{ text: "À suivre", tone: "down" }} />
            </div>
            <Tabs label="Filtrer par type" value={tab} onChange={setTab} items={[{ id: "all", label: "Tout", badge: rows.length }, { id: "absence", label: "Absences" }, { id: "retard", label: "Retards" }, { id: "discipline", label: "Discipline" }]} />
            <Card padded={false}>{filtered.length ? <Table caption="Absences, retards et discipline" columns={columns} rows={filtered} rowKey={(r) => r.id} /> : <EmptyState icon="verified" title="Rien à signaler" />}</Card>
          </div>
        )}
      </AsyncView>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nouveau signalement"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button variant="dark" loading={saving} disabled={!form.studentId || form.motif.trim().length < 3} onClick={(e) => void submit(e as unknown as FormEvent)}>Enregistrer</Button>
          </>
        }
      >
        <form className="grid gap-4" onSubmit={submit}>
          <Select label="Élève" required placeholder="Choisir un élève" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} options={(students.data ?? []).map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName} · ${s.className}` }))} />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AbsenceRecord["type"] })} options={[{ value: "absence", label: "Absence" }, { value: "retard", label: "Retard" }, { value: "discipline", label: "Discipline" }]} />
          <Input label="Date (AAAA-MM-JJ)" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Input label="Motif" required value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} error={form.motif && form.motif.trim().length < 3 ? "Motif trop court." : null} />
          {form.type === "discipline" && <Input label="Sanction" value={form.sanction} onChange={(e) => setForm({ ...form, sanction: e.target.value })} />}
        </form>
      </Modal>
    </>
  );
}
