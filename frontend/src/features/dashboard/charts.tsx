// Graphiques du tableau de bord : paiements, cycles, effectifs, évolution des notes.

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CYCLE_LABELS } from "@/data/school";
import type { AdminStats } from "@/services/statsService";
import type { Cycle, StudentGradeHistory } from "@/types";
import { formatCurrency, formatNumber } from "@/utils/format";

export const CYCLE_COLORS: Record<Cycle, string> = { elementaire: "#12a150", moyen: "#0f3d1e", secondaire: "#c6f068" };
const axis = { fontSize: 12, fill: "#6b7280" };
/** Les graphiques ne se recalculent qu'une fois la transition de sidebar terminée (250 ms). */
export const CHART_DEBOUNCE = 250;

// Couleurs pour les types d'évaluations
export const GRADE_COLORS = {
  devoir1: "#3b82f6",   // bleu
  devoir2: "#8b5cf6",   // violet
  composition: "#12a150", // vert
  average: "#f59e0b",   // ambre
} as const;

// Barres mensuels : montants attendus et montants encaisses.
export function PaymentsChart({ data }: { data: AdminStats["paymentsByMonth"] }) {
  return (
    <div className="h-72" role="img" aria-label="Graphique des mensualités attendues et encaissées par mois">
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_DEBOUNCE}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#eee" />
          <XAxis dataKey="month" tick={axis} axisLine={false} tickLine={false} />
          <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v) => formatCurrency(Number(v ?? 0))} cursor={{ fill: "rgba(198,240,104,0.2)" }} contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 40px -14px rgba(15,61,30,.3)" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="attendu" name="Attendu" fill="#12a150" radius={[20, 20, 20, 20]} barSize={14} />
          <Bar dataKey="encaisse" name="Encaissé" fill="#0f3d1e" radius={[20, 20, 20, 20]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Camembert de la repartition des eleves par cycle.
export function CycleDonut({ data }: { data: AdminStats["byCycle"] }) {
  const items = data.map((d) => ({ name: CYCLE_LABELS[d.cycle], value: d.count, cycle: d.cycle }));
  return (
    <div className="h-56" role="img" aria-label="Répartition des élèves par cycle">
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_DEBOUNCE}>
        <PieChart>
          <Pie data={items} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3} stroke="#fff" strokeWidth={2}>
            {items.map((i) => (
              <Cell key={i.cycle} fill={CYCLE_COLORS[i.cycle]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => `${v} élèves`} contentStyle={{ borderRadius: 16, border: "none" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// Barres horizontales de l'effectif de chaque classe.
export function ClassBars({ data }: { data: AdminStats["studentsByClass"] }) {
  return (
    <div className="h-80" role="img" aria-label="Effectif par classe">
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_DEBOUNCE}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke="#eee" />
          <XAxis type="number" tick={axis} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={axis} axisLine={false} tickLine={false} width={64} interval={0} />
          <Tooltip formatter={(v) => `${v} élèves`} cursor={{ fill: "rgba(198,240,104,0.2)" }} contentStyle={{ borderRadius: 16, border: "none" }} />
          <Bar dataKey="effectif" name="Effectif" radius={[0, 20, 20, 0]} barSize={12}>
            {data.map((d) => (
              <Cell key={d.name} fill={CYCLE_COLORS[d.cycle]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------
// Graphiques d'évolution des notes (élève / parent)
// ------------------------------------------------------------------

interface GradePoint {
  period: string;
  periodLabel: string;
  devoir1: number | null;
  devoir2: number | null;
  composition: number | null;
  average: number | null;
}

interface SubjectGradeEvolutionProps {
  subjectName: string;
  data: GradePoint[];
  cycle: Cycle;
  maxGrade?: number;
}

/**
 * Graphique en courbes montrant l'évolution des notes d'une matière sur les périodes.
 * Affiche : Devoir 1, Devoir 2, Composition, et Moyenne de la matière.
 */
export function SubjectGradeEvolution({ subjectName, data, cycle, maxGrade = 20 }: SubjectGradeEvolutionProps) {
  const hasData = data.some((d) => d.devoir1 !== null || d.devoir2 !== null || d.composition !== null || d.average !== null);
  if (!hasData) return null;

  // Filtrer les périodes qui ont au moins une note
  const filteredData = data.filter((d) => d.devoir1 !== null || d.devoir2 !== null || d.composition !== null || d.average !== null);
  if (filteredData.length === 0) return null;

  const isElementaire = cycle === "elementaire";
  const yMax = maxGrade === 10 ? 10 : 20;

  return (
    <div className="h-64" role="img" aria-label={`Évolution des notes en ${subjectName}`}>
      <ResponsiveContainer width="100%" height="100%" debounce={CHART_DEBOUNCE}>
        <LineChart data={filteredData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#eee" />
          <XAxis dataKey="periodLabel" tick={axis} axisLine={false} tickLine={false} />
          <YAxis
            tick={axis}
            axisLine={false}
            tickLine={false}
            domain={[0, yMax]}
            tickFormatter={(v) => (v === yMax ? `${v}/20` : v)}
          />
          <Tooltip
            formatter={(v) => (typeof v === "number" ? formatNumber(v) : String(v ?? "—"))}
            cursor={{ fill: "rgba(198,240,104,0.2)" }}
            contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 40px -14px rgba(15,61,30,.3)" }}
            labelFormatter={(label) => {
              const labels: Record<string, string> = {
                devoir1: "Devoir 1",
                devoir2: "Devoir 2",
                composition: "Composition",
                average: "Moyenne",
              };
              return typeof label === "string" ? (labels[label] ?? label) : String(label);
            }}
          />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          {/* Devoir 1 */}
          {!isElementaire && (
            <Line
              type="monotone"
              dataKey="devoir1"
              name="Devoir 1"
              stroke={GRADE_COLORS.devoir1}
              strokeWidth={2}
              dot={{ fill: GRADE_COLORS.devoir1, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
            />
          )}
          {/* Devoir 2 */}
          {!isElementaire && (
            <Line
              type="monotone"
              dataKey="devoir2"
              name="Devoir 2"
              stroke={GRADE_COLORS.devoir2}
              strokeWidth={2}
              dot={{ fill: GRADE_COLORS.devoir2, strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
            />
          )}
          {/* Composition */}
          <Line
            type="monotone"
            dataKey="composition"
            name="Composition"
            stroke={GRADE_COLORS.composition}
            strokeWidth={2}
            dot={{ fill: GRADE_COLORS.composition, strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, strokeWidth: 2 }}
            connectNulls={false}
          />
          {/* Moyenne de la matière */}
          <Line
            type="monotone"
            dataKey="average"
            name="Moyenne"
            stroke={GRADE_COLORS.average}
            strokeWidth={3}
            strokeDasharray="5 5"
            dot={{ fill: GRADE_COLORS.average, strokeWidth: 2, r: 5 }}
            activeDot={{ r: 7, strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Conteneur qui affiche un graphique par matière pour un élève.
 */
export interface GradeEvolutionChartsProps {
  history: StudentGradeHistory[];
  cycle: Cycle;
}

export function GradeEvolutionCharts({ history, cycle }: GradeEvolutionChartsProps) {
  const isElementaire = cycle === "elementaire";
  const scale = isElementaire ? 10 : 20;

  // Filtrer les matières qui ont au moins une note sur au moins une période
  const subjectsWithData = history.filter((h) =>
    h.periods.some((p) => p.devoir1 !== null || p.devoir2 !== null || p.composition !== null || p.average !== null)
  );

  if (subjectsWithData.length === 0) {
    return (
      <div className="text-center py-12 text-neutral-500">
        <svg className="mx-auto h-12 w-12 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        <p className="mt-3 font-medium">Aucune note enregistrée pour le moment</p>
        <p className="text-sm mt-1">Les graphiques d'évolution apparaîtront ici dès que des notes seront saisies par les enseignants.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-neutral-500 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS.composition }} /> Composition</span>
        {!isElementaire && <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS.devoir1 }} /> Devoir 1</span>}
        {!isElementaire && <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full" style={{ background: GRADE_COLORS.devoir2 }} /> Devoir 2</span>}
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border-2 border-dashed" style={{ borderColor: GRADE_COLORS.average }} /> Moyenne</span>
        <span className="ml-auto text-xs text-neutral-400">Échelle : / {scale}</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {subjectsWithData.map((subject) => (
          <div key={subject.subjectId} className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-card">
            <h3 className="mb-3 font-semibold text-neutral-900 truncate" title={subject.subjectName}>{subject.subjectName}</h3>
            <SubjectGradeEvolution
              subjectName={subject.subjectName}
              data={subject.periods.map((p) => ({
                period: p.periodId,
                periodLabel: p.periodLabel,
                devoir1: p.devoir1,
                devoir2: p.devoir2,
                composition: p.composition,
                average: p.average,
              }))}
              cycle={cycle}
              maxGrade={scale}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
