// Formatage des montants, dates, noms et validations simples du site.
export function formatCurrency(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0")}\u00A0FCFA`;
}

// Nombre en français, avec séparateur d'espaces et décimales limitées.
export function formatNumber(n: number, digits = 2): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

/** ISO (AAAA-MM-JJ…) → JJ/MM/AAAA */
export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  // Donnée distante malformée : pas de rendu « undefined/undefined/2026 ».
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

// Date ISO en date + heure lisible (« 12/03/2026 · 14 h 30 »).
export function formatDateTime(iso: string): string {
  const time = iso.length > 10 ? iso.slice(11, 16).replace(":", " h ") : "";
  return `${formatDate(iso)}${time ? " · " + time : ""}`;
}

// Date ISO en toutes lettres (« Mercredi 12 mars 2026 »).
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const text = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** JJ/MM/AAAA saisi → ISO, ou null si invalide */
export function parseFrDate(value: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (date.getUTCMonth() !== Number(mo) - 1 || date.getUTCDate() !== Number(d)) return null;
  return `${y}-${mo}-${d}`;
}

// Initiales d'un prénom et d'un nom, pour les avatars.
export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// Nom complet « prénom nom » pour les cartes et listes.
export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`;
}

// Âge en années révolues à partir d'une date de naissance.
export function ageFrom(iso: string, todayIso: string): number {
  const b = new Date(iso);
  const t = new Date(todayIso);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age -= 1;
  return age;
}

// Contrôle rapide d'une adresse e-mail.
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Numéro sénégalais : 7X XXX XX XX */
export function isValidSnPhone(v: string): boolean {
  // Mobiles du Sénégal : Orange (70/76/77/78), Free/Promobile (75).
  return /^(\+221)?\s?7(?:0|[5-8])\s?\d{3}\s?\d{2}\s?\d{2}$/.test(v.trim());
}

/** Pluralisation FR : "1 élève", "2 élèves" — utilise Intl.PluralRules */
export function pluralize(count: number, singular: string, plural: string): string {
  const rule = new Intl.PluralRules("fr-FR").select(count);
  return rule === "one" ? singular : plural;
}

/** Initiales à partir de graphèmes (supporte emoji, noms composés) */
// Initiales qui gèrent les emoji et noms composés, avec repli simple.
export function initialsGrapheme(first: string, last: string): string {
  if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
    // @ts-expect-error - Intl.Segmenter not in TS lib yet but exists at runtime
    const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
    const firstSeg = [...segmenter.segment(first.trim())].find((s) => s.isWordLike)?.segment ?? first.charAt(0);
    const lastSeg = [...segmenter.segment(last.trim())].find((s) => s.isWordLike)?.segment ?? last.charAt(0);
    return `${firstSeg}${lastSeg}`.toUpperCase();
  }
  // Fallback for older environments
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();
}
