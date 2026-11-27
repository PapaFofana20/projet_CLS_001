// Import en masse des eleves depuis un fichier CSV.

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { useCurrentUser } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { hydrateAll } from "@/services/db";
import { enrollStudent } from "@/services/studentService";
import type { SchoolOverview } from "@/services/schoolService";
import { downloadCsvTemplate, parseStudentsCsv, type CsvStudentRow } from "@/utils/csvImport";
import { cn } from "@/utils/cn";

interface Props {
  overview: SchoolOverview;
  onImported: (count: number) => void;
}

/** Garde-fou avant lecture : un CSV scolaire tient largement sous 2 Mo. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;
/** Taille des lots parallèles : évite de saturer le serveur avec 500 RPC simultanées. */
const BATCH_SIZE = 10;

interface PreviewRow extends CsvStudentRow {
  classId: string | null;
  classError: string | null;
}

/**
 * Import CSV des élèves (directeur) : aperçu validé ligne par ligne, puis
 * inscriptions Via enrollStudent (RPC serveur) par lots parallèles de 10, avec
 * une synchronisation finale unique. Les lignes en erreur sont listées et ne
 * bloquent pas les autres.
 */
export function StudentCsvImport({ overview, onImported }: Props) {
  const user = useCurrentUser();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ ok: number; failed: number; failedLines: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const classByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of overview.classes) map.set(c.name.trim().toLowerCase(), c.id);
    return map;
  }, [overview.classes]);

  const validRows = useMemo(() => rows.filter((r) => r.classId && !r.classError), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.classId || r.classError), [rows]);

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      setText("");
      setRows([]);
      setErrors([`Fichier trop volumineux (${(file.size / 1024 / 1024).toFixed(1)} Mo) : la limite est de 2 Mo (500 lignes max).`]);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const raw = await file.text();
      setText(raw);
      const parsed = parseStudentsCsv(raw);
      const preview: PreviewRow[] = parsed.rows.map((r) => {
        const classId = classByName.get(r.className.trim().toLowerCase()) ?? null;
        return {
          ...r,
          classId,
          classError: classId ? null : `classe "${r.className}" introuvable (créez-la d'abord dans Classes)`,
        };
      });
      setRows(preview);
      setErrors(parsed.errors);
    } catch {
      setErrors(["Impossible de lire ce fichier. Utilisez un CSV en UTF-8 (export Excel/Sheets)."]);
      setRows([]);
    }
  };

  const importAll = async () => {
    if (validRows.length === 0 || busy) return;
    setBusy(true);
    setProgress({ done: 0, total: validRows.length });
    // Les inscriptions sont regroupées par lots de 10 ; chaque ligne garde son
    // propre résultat pour ne pas transformer un échec isolé en échec du lot.
    const results: { row: PreviewRow; ok: boolean; message?: string }[] = [];
    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        const settled = await Promise.all(
          batch.map(async (r) => {
            try {
              await enrollStudent(user, {
                firstName: r.firstName,
                lastName: r.lastName,
                gender: r.gender,
                birthDate: r.birthDateIso,
                classId: r.classId!,
                options: { cantine: false, transport: false, tenue: true },
                parent: { mode: "new", firstName: r.parentFirst, lastName: r.parentLast, phone: r.parentPhone, email: r.parentEmail, address: "" },
              }, { skipHydrate: true });
              return { row: r, ok: true };
            } catch (e) {
              return { row: r, ok: false, message: e instanceof Error ? e.message : "échec" };
            }
          }),
        );
        results.push(...settled);
        setProgress({ done: Math.min(i + BATCH_SIZE, validRows.length), total: validRows.length });
      }
      // Chaque ligne a été inscrite avec `skipHydrate` : une seule
      // synchronisation globale est faite ici, après tous les lots.
      await hydrateAll();
    } catch (e) {
      // La synchronisation finale ne doit pas masquer les inscriptions réussies.
      toast(e instanceof Error ? e.message : "Synchronisation impossible.", "error");
    }
    const ok = results.filter((r) => r.ok).length;
    const failedLines = results
      .filter((r) => !r.ok)
      .map((r) => `Ligne ${r.row.line} (${r.row.firstName} ${r.row.lastName}) : ${r.message ?? "échec"}`);
    setResult({ ok, failed: failedLines.length, failedLines });
    setBusy(false);
    if (ok > 0) {
      toast(`${ok} élève(s) importé(s) avec succès.`);
      onImported(ok);
    }
  };

  const reset = () => {
    setText("");
    setRows([]);
    setErrors([]);
    setFileName("");
    setResult(null);
    setProgress({ done: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold">Importer des élèves (CSV)</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Colonnes : <code className="rounded bg-mist px-1">prenom, nom, genre, date_naissance (JJ/MM/AAAA), classe, parent_prenom, parent_nom, parent_tel, parent_email</code>
          </p>
        </div>
        <Button variant="outline" icon="download" onClick={downloadCsvTemplate}>Modèle CSV</Button>
      </div>

      <label className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center", "border-forest/30")}>
        <Icon name="upload_file" className="text-[40px] text-forest" />
        <span className="text-sm font-semibold">{fileName || "Choisir un fichier .csv"}</span>
        <span className="text-xs text-neutral-500">500 lignes max · séparateur , ou ; · UTF-8</span>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
      </label>

      {text && rows.length === 0 && errors.length === 0 && <p className="text-sm text-neutral-500">Lecture du fichier…</p>}

      {errors.length > 0 && (
        <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-danger">
          <strong>{errors.length} erreur(s) :</strong>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {errors.slice(0, 20).map((e, i) => <li key={`${i}-${e.slice(0, 40)}`}>{e}</li>)}
            {errors.length > 20 && <li>…et {errors.length - 20} autre(s).</li>}
          </ul>
        </div>
      )}

      {rows.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            {validRows.length} ligne(s) prête(s) · {invalidRows.length} ligne(s) à corriger
          </p>
          {invalidRows.length > 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <ul className="list-inside list-disc space-y-1">
                {invalidRows.map((r) => <li key={r.line}>Ligne {r.line} — {r.firstName} {r.lastName} : {r.classError}</li>)}
              </ul>
            </div>
          )}
          <div className="max-h-56 overflow-auto rounded-2xl border border-neutral-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-mist text-xs text-neutral-600">
                <tr><th className="px-3 py-2">Élève</th><th className="px-3 py-2">Classe</th><th className="px-3 py-2">Parent</th></tr>
              </thead>
              <tbody>
                {validRows.slice(0, 50).map((r) => (
                  <tr key={r.line} className="border-t border-neutral-100">
                    <td className="px-3 py-2">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-2">{r.className}</td>
                    <td className="px-3 py-2">{r.parentFirst} {r.parentLast} · {r.parentPhone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {validRows.length > 50 && <p className="px-3 py-2 text-xs text-neutral-500">Aperçu limité aux 50 premières lignes.</p>}
          </div>

          {busy && (
            <div className="space-y-2">
              <div className="h-3 overflow-hidden rounded-full bg-mist" role="progressbar" aria-valuenow={progress.done} aria-valuemin={0} aria-valuemax={progress.total}>
                <div className="h-full bg-forest transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
              </div>
              <p className="text-sm text-neutral-600">Inscription en cours… {progress.done}/{progress.total}</p>
            </div>
          )}

          {result && (
            <div role="alert" className={cn("rounded-2xl p-4 text-sm", result.failed > 0 ? "bg-amber-50 text-amber-900" : "bg-lime-pale text-forest")}>
              <strong>Résultat : {result.ok} importé(s), {result.failed} échec(s).</strong>
              {result.failedLines.length > 0 && (
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {result.failedLines.slice(0, 20).map((e, i) => <li key={`${i}-${String(e).slice(0, 40)}`}>{e}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-3 border-t border-neutral-100 pt-4">
            <Button variant="outline" onClick={reset} disabled={busy}>Effacer</Button>
            <Button variant="dark" icon="upload_file" onClick={() => void importAll()} loading={busy} disabled={validRows.length === 0}>
              Importer {validRows.length} élève(s)
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
