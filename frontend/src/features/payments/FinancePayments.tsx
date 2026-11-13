// Gestion des paiements cote ecole : encaissements, impayes et relances.

import { useEffect, useMemo, useState } from "react";
import { AsyncView } from "@/components/ui/AsyncView";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterSheet } from "@/components/ui/FilterSheet";
import { Icon } from "@/components/ui/Icon";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { Table, type Column } from "@/components/ui/Table";
import { Tabs } from "@/components/ui/Tabs";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { todayIso } from "@/data/school";
import { useAsync } from "@/hooks/useAsync";
import { useDebounce } from "@/hooks/useDebounce";
import { listPaymentRows, recordCashPayment, sendReminders } from "@/services/paymentService";
import type { PaymentRow } from "@/services/paymentRows";
import { formatCurrency, formatDate } from "@/utils/format";
import { useFeature } from "@/utils/features";
import { PAY_METHOD_LABELS, PAY_STATUS_LABELS, remaining, sum } from "@/utils/payments";
import { buildReminderMessage, downloadDebtorsCsv, maxOverdueDays, reminderSubject, reminderLevelOf, whatsappReminderLink, type ReminderLine } from "@/utils/reminders";
import { PAY_TONE } from "./ParentPayments";
import { Receipt } from "./Receipt";

const PAGE = 12;

interface Debtor {
  studentId: string;
  studentName: string;
  className: string;
  parentName: string;
  parentFirstName: string;
  parentPhone: string;
  count: number;
  total: number;
  lines: ReminderLine[];
  maxOverdueDays: number;
}

// Vue ecole des paiements : filtres, impayes, encaissement et relances WhatsApp.
export function FinancePayments({ schoolName, canAct }: { schoolName: string; canAct: boolean }) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const canExportData = useFeature("data_export");
  const canAutoRemind = useFeature("auto_reminders");

  const state = useAsync(() => listPaymentRows(user), [user.id]);
  const [tab, setTab] = useState("echeances");
  const [q, setQ] = useState("");
  const dq = useDebounce(q, 250);
  const [cls, setCls] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cash, setCash] = useState<PaymentRow | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<PaymentRow | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => state.data ?? [], [state.data]);
  useEffect(() => setPage(1), [dq, cls, status, tab]);

  const due = rows.filter((p) => p.dueDate <= todayIso());
  const expected = sum(due.map((p) => p.amount));
  const collected = sum(due.map((p) => p.paidAmount));
  const classes = Array.from(new Set(rows.map((r) => r.className))).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  const filtered = useMemo(() => {
    const t = dq.trim().toLowerCase();
    return rows
      .filter((p) => (!t || `${p.studentName} ${p.parentName}`.toLowerCase().includes(t)) && (!cls || p.className === cls) && (!status || p.status === status))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.studentName.localeCompare(b.studentName));
  }, [rows, dq, cls, status]);

  const debtors = useMemo<Debtor[]>(() => {
    const map = new Map<string, Debtor>();
    rows.filter((p) => p.dueDate <= todayIso() && remaining(p) > 0).forEach((p) => {
      const d = map.get(p.studentId) ?? { studentId: p.studentId, studentName: p.studentName, className: p.className, parentName: p.parentName, parentFirstName: p.parentName.split(" ")[0] ?? p.parentName, parentPhone: p.parentPhone, count: 0, total: 0, lines: [], maxOverdueDays: 0 };
      d.count += 1;
      d.total += remaining(p);
      d.lines.push({ label: p.label, dueDate: p.dueDate, amount: p.amount, paidAmount: p.paidAmount });
      d.maxOverdueDays = maxOverdueDays(d.lines.map((l) => l.dueDate), todayIso());
      map.set(p.studentId, d);
    });
    return Array.from(map.values()).filter((d) => (!cls || d.className === cls) && (!dq || `${d.studentName} ${d.parentName}`.toLowerCase().includes(dq.toLowerCase()))).sort((a, b) => b.total - a.total);
  }, [rows, cls, dq]);

  const cashAmount = Number(amount);
  const cashErr = cash && (!(cashAmount > 0) || cashAmount > remaining(cash)) ? `Montant entre 1 et ${formatCurrency(remaining(cash))}.` : null;

  const doCash = async () => {
    if (!cash || cashErr) return;
    setBusy(true);
    try {
      const r = await recordCashPayment(user, cash.id, cashAmount);
      toast(`${formatCurrency(cashAmount)} encaissés pour ${cash.studentName}.`);
      setCash(null);
      state.reload();
      setReceipt(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Encaissement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remind = async () => {
    setBusy(true);
    try {
      const n = await sendReminders(picked);
      toast(`Relance tracée pour ${n} famille${n > 1 ? "s" : ""}. Pensez à ouvrir WhatsApp pour chaque famille sélectionnée.`);
      setPicked([]);
    } catch {
      toast("Envoi impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  const messageOf = (d: Debtor) => buildReminderMessage({ schoolName, studentName: d.studentName, className: d.className, parentFirstName: d.parentFirstName, total: d.total, lines: d.lines, maxOverdueDays: d.maxOverdueDays });
  const waLinkOf = (d: Debtor) => whatsappReminderLink(d.parentPhone, messageOf(d));
  const [preview, setPreview] = useState<Debtor | null>(null);

  const copyMessage = async (d: Debtor) => {
    try {
      await navigator.clipboard.writeText(messageOf(d));
      toast("Message de relance copié.");
    } catch {
      toast("Copie impossible sur cet appareil.", "error");
    }
  };

  const actions = (p: PaymentRow) => (
    <div className="flex justify-end gap-2">
      {canAct && remaining(p) > 0 && <Button size="sm" variant="primary" onClick={() => { setCash(p); setAmount(String(remaining(p))); }}>Encaisser</Button>}
      {p.paidAmount > 0 && <Button size="sm" variant="outline" icon="receipt_long" aria-label={`Reçu de ${p.studentName}`} onClick={() => setReceipt(p)} />}
    </div>
  );
  const cols: Column<PaymentRow>[] = [
    { key: "s", header: "Élève", render: (p) => <span><strong>{p.studentName}</strong><span className="block text-xs text-neutral-500">{p.className}</span></span>, noTruncate: true },
    { key: "l", header: "Échéance", render: (p) => p.label },
    { key: "d", header: "Date limite", render: (p) => formatDate(p.dueDate) },
    { key: "a", header: "Montant", align: "right", render: (p) => formatCurrency(p.amount), numeric: true },
    { key: "p", header: "Payé", align: "right", render: (p) => formatCurrency(p.paidAmount), numeric: true },
    { key: "st", header: "Statut", render: (p) => <Badge tone={PAY_TONE[p.status]}>{PAY_STATUS_LABELS[p.status]}</Badge> },
    { key: "ac", header: <span className="sr-only">Actions</span>, align: "right", render: actions, shrink: 0 },
  ];
  const debtorCols: Column<Debtor>[] = [
    { key: "c", header: <span className="sr-only">Sélection</span>, render: (d) => <label className="grid size-11 cursor-pointer place-items-center rounded-full hover:bg-mist"><input type="checkbox" className="size-5 accent-forest" aria-label={`Sélectionner ${d.studentName}`} checked={picked.includes(d.studentId)} onChange={() => setPicked((p) => (p.includes(d.studentId) ? p.filter((x) => x !== d.studentId) : [...p, d.studentId]))} /></label>, shrink: 0 },
    { key: "s", header: "Élève", render: (d) => <span><strong>{d.studentName}</strong><span className="block text-xs text-neutral-500">{d.className}</span></span>, noTruncate: true },
    { key: "p", header: "Parent", render: (d) => <span>{d.parentName}<span className="block text-xs text-neutral-500">{d.parentPhone}</span></span>, noTruncate: true },
    { key: "n", header: "Échéances", align: "center", render: (d) => d.count, numeric: true },
    { key: "t", header: "Total dû", align: "right", render: (d) => <strong className="text-danger">{formatCurrency(d.total)}</strong>, numeric: true },
    { key: "ac", header: "Relance", align: "right", render: (d) => (
        <div className="flex justify-end gap-2">
          {waLinkOf(d) ? (
            <a href={waLinkOf(d)!} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-leaf px-3 text-sm font-semibold text-white hover:opacity-90" aria-label={`Relancer ${d.parentName} sur WhatsApp`}>
              <Icon name="forum" className="text-[18px]" /> WhatsApp
            </a>
          ) : <span className="text-xs text-neutral-500">Nº invalide</span>}
          <Button size="sm" variant="outline" icon="content_copy" aria-label={`Copier le message pour ${d.parentName}`} onClick={() => void copyMessage(d)} />
          <Button size="sm" variant="outline" icon="visibility" aria-label={`Aperçu de la relance pour ${d.parentName}`} onClick={() => setPreview(d)} />
        </div>
      ), shrink: 0 },
  ];
  const receiptRows = filtered.filter((p) => p.paidAmount > 0 && p.paidAt).sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const receiptCols: Column<PaymentRow>[] = [
    { key: "d", header: "Date", render: (p) => formatDate(p.paidAt) },
    { key: "r", header: "Référence", render: (p) => p.reference ?? "—" },
    { key: "s", header: "Élève", render: (p) => p.studentName },
    { key: "l", header: "Échéance", render: (p) => p.label },
    { key: "m", header: "Moyen", render: (p) => (p.method ? <Badge tone="info">{PAY_METHOD_LABELS[p.method]}</Badge> : "—") },
    { key: "a", header: "Montant", align: "right", render: (p) => formatCurrency(p.paidAmount) },
    { key: "x", header: <span className="sr-only">Reçu</span>, align: "right", render: actions },
  ];
  const list = tab === "recus" ? receiptRows : filtered;
  const activeFilters = [cls, status].filter(Boolean).length;
  const filterFields = (
    <>
      <Select compact aria-label="Classe" placeholder="Toutes les classes" value={cls} onChange={(e) => setCls(e.target.value)} options={classes.map((c) => ({ value: c, label: c }))} />
      {tab === "echeances" && <Select compact aria-label="Statut" placeholder="Tous les statuts" value={status} onChange={(e) => setStatus(e.target.value)} options={Object.entries(PAY_STATUS_LABELS).map(([value, label]) => ({ value, label }))} />}
    </>
  );

  return (
    <AsyncView state={state} skeleton={<SkeletonTable />}>
      {() => (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard dark icon="account_balance_wallet" label="Encaissé" value={formatCurrency(collected)} />
            <StatCard icon="request_quote" label="Attendu à ce jour" value={formatCurrency(expected)} />
            <StatCard icon="warning" label="Impayés" value={formatCurrency(expected - collected)} badge={{ text: `${debtors.length} élèves`, tone: "down" }} />
            <StatCard icon="percent" label="Recouvrement" value={`${expected ? Math.round((collected / expected) * 100) : 0} %`} />
          </div>
          <Tabs label="Paiements" value={tab} onChange={setTab} items={[{ id: "echeances", label: "Échéances", icon: "calendar_month" }, { id: "impayes", label: "Impayés et relances", icon: "notifications_active", badge: debtors.length }, { id: "recus", label: "Reçus", icon: "receipt_long" }]} />
          <Card>
            <div className="grid gap-3 md:grid-cols-3">
              <Input aria-label="Rechercher" icon="search" placeholder="Élève ou parent…" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="hidden md:contents">{filterFields}</div>
            </div>
            <div className="mt-3 flex items-center gap-2 md:hidden">
              <button type="button" onClick={() => setFiltersOpen(true)} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-forest">
                <Icon name="tune" className="text-[20px]" />
                Filtres
                {activeFilters > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-lime px-1.5 text-xs font-bold leading-6 text-forest">{activeFilters}</span>}
              </button>
              {activeFilters > 0 && (
                <button type="button" onClick={() => { setCls(""); setStatus(""); }} className="min-h-12 rounded-2xl px-3 text-sm font-semibold text-neutral-600">
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
            <div className="grid gap-3">{filterFields}</div>
          </FilterSheet>
          {tab === "impayes" ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setPicked(picked.length === debtors.length ? [] : debtors.map((d) => d.studentId))}>{picked.length === debtors.length && debtors.length ? "Tout désélectionner" : "Tout sélectionner"}</Button>
                {canAct && <Button icon="send" disabled={picked.length === 0 || !canAutoRemind} loading={busy} onClick={() => void remind()} title={canAutoRemind ? undefined : "Disponible à partir du plan Pro"}>Tracer la relance ({picked.length})</Button>}
                <Button variant="outline" icon="download" disabled={debtors.length === 0 || !canExportData} onClick={() => downloadDebtorsCsv(debtors)} title={canExportData ? undefined : "Disponible à partir du plan Premium"}>Exporter la liste</Button>
              </div>
              <p className="text-xs text-neutral-500">Chaque ligne ouvre WhatsApp avec un message personnalisé (montant + échéances). « Tracer la relance » enregistre l'envoi dans le journal d'audit.</p>
              {debtors.length === 0 ? <EmptyState icon="verified" title="Aucun impayé" text="Toutes les échéances échues sont réglées." /> : <Card padded={false} className="p-2"><Table caption="Élèves avec échéances impayées" columns={debtorCols} rows={debtors} rowKey={(d) => d.studentId} stagger /></Card>}
            </>
          ) : list.length === 0 ? (
            <EmptyState icon="search_off" title="Aucun résultat" text="Modifiez vos filtres." />
          ) : (
            <Card padded={false} className="p-2">
              <Table caption="Paiements" columns={tab === "recus" ? receiptCols : cols} rows={list.slice((page - 1) * PAGE, page * PAGE)} rowKey={(p) => p.id} stagger />
              <div className="px-4 pb-4"><Pagination page={page} pageSize={PAGE} total={list.length} onChange={setPage} /></div>
            </Card>
          )}
          <Modal open={!!cash} onClose={() => setCash(null)} title="Encaisser un paiement en espèces" size="sm" footer={<><Button variant="outline" onClick={() => setCash(null)}>Annuler</Button><Button variant="dark" loading={busy} disabled={!!cashErr} onClick={() => void doCash()}>Valider l'encaissement</Button></>}>
            {cash && (
              <div className="space-y-4">
                <p className="text-sm"><strong>{cash.studentName}</strong> · {cash.label}<br />Reste dû : <strong>{formatCurrency(remaining(cash))}</strong></p>
                <Input label="Montant encaissé (FCFA)" type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} error={cashErr} />
              </div>
            )}
          </Modal>
          <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Reçu de paiement" footer={<><Button variant="outline" icon="print" onClick={() => window.print()}>Imprimer</Button><Button variant="dark" onClick={() => setReceipt(null)}>Fermer</Button></>}>
            {receipt && <Receipt payments={[receipt]} schoolName={schoolName} />}
          </Modal>
          <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? reminderSubject(reminderLevelOf(preview.maxOverdueDays)) : "Aperçu"} footer={<>{preview && waLinkOf(preview) && <a href={waLinkOf(preview)!} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-leaf px-5 text-sm font-semibold text-white">Ouvrir WhatsApp</a>}<Button variant="outline" onClick={() => setPreview(null)}>Fermer</Button></>}>
            {preview && (
              <div className="space-y-3">
                <p className="text-sm text-neutral-600">{preview.maxOverdueDays} j de retard · {preview.count} échéance(s) · niveau <strong>{reminderLevelOf(preview.maxOverdueDays)}</strong></p>
                <pre className="whitespace-pre-wrap rounded-2xl bg-mist p-4 text-sm">{messageOf(preview)}</pre>
              </div>
            )}
          </Modal>
        </div>
      )}
    </AsyncView>
  );
}
