/**
 * Validation des entrées à la frontière de l'API (portage de _shared/validate,
 * sans dépendance). Chaque validateur lève une erreur avec le message français
 * attendu par le front — route() la traduit en 400 { error }.
 */

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Vérifie que le corps JSON est un objet ; lève ValidationError sinon. Entrée : body. Sortie : body. */
export function expectObject(body, message = "Requête invalide.") {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError(message);
  }
  return body;
}

/** Lit un champ chaîne obligatoire et borné. Entrée : objet, champ, libellé. Sortie : chaîne nettoyée. */
export function requireString(obj, field, label, { min = 0, max = 200, trim = true } = {}) {
  const raw = obj[field];
  if (typeof raw !== "string") throw new ValidationError(`${label} est obligatoire.`);
  const value = trim ? raw.trim() : raw;
  if (value.length < min || value.length > max) {
    throw new ValidationError(`${label} contient entre ${min} et ${max} caractères.`);
  }
  return value;
}

/** Lit un champ chaîne optionnel ; undefined si absent. Entrée : objet, champ, libellé. Sortie : chaîne ou undefined. */
export function optionalString(obj, field, label, max = 200) {
  const raw = obj[field];
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new ValidationError(`${label} est invalide.`);
  const value = raw.trim();
  if (value.length > max) throw new ValidationError(`${label} est trop long (max ${max} caractères).`);
  return value;
}

/** Lit et déduplique les cycles scolaires choisis (élémentaire, moyen, secondaire). */
export function requireCycles(obj) {
  const raw = obj["cycles"];
  const allowed = new Set(["elementaire", "moyen", "secondaire"]);
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError("Sélectionnez au moins un cycle.");
  }
  const cycles = raw.filter((c) => typeof c === "string" && allowed.has(c));
  if (cycles.length === 0 || cycles.length !== raw.length) {
    throw new ValidationError("Sélection de cycles invalide.");
  }
  return Array.from(new Set(cycles));
}

/** Lit un tableau de chaînes borné (chaque élément max 80 caractères). */
export function requireStringArray(obj, field, label, { maxItems = 20 } = {}) {
  const raw = obj[field];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string" || v.length > 80)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  if (raw.length > maxItems) {
    throw new ValidationError(`${label} : ${maxItems} éléments maximum.`);
  }
  return raw.map((v) => v.trim()).filter(Boolean);
}

/** E-mail : obligatoire, normalisé en minuscules. */
export function requireEmail(obj, field = "email") {
  const raw = requireString(obj, field, "L'e-mail", { max: 120, trim: true });
  const email = raw.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new ValidationError("L'e-mail est invalide.");
  }
  return email;
}

/** Tél. sénégalais : format 7X XXX XX XX (validation identique au front). */
export function requireSnPhone(obj, field, label) {
  const raw = requireString(obj, field, label, { max: 20, trim: true });
  if (!/^(\+221)?\s?7(?:0|[5-8])\s?\d{3}\s?\d{2}\s?\d{2}$/.test(raw)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  return raw;
}

/**
 * Date ISO (AAAA-MM-JJ) OBLIGATOIRE (parent/élève : preuve d'identité par
 * date de naissance, cf. migration 00054) — contrôle strict du calendrier :
 * `new Date("2026-02-31")` ne renvoie pas NaN.
 */
export function requireIsoDate(obj, field, label) {
  const raw = requireString(obj, field, label, { max: 10, trim: true });
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) throw new ValidationError(`${label} est invalide.`);
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  return raw;
}

/**
 * Date ISO (AAAA-MM-JJ) optionnelle (élève : naissance) — contrôle strict du
 * calendrier : `new Date("2026-02-31")` ne renvoie pas NaN.
 */
export function optionalIsoDate(obj, field, label) {
  const raw = optionalString(obj, field, label, 10);
  if (raw === undefined || raw === "") return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) throw new ValidationError(`${label} est invalide.`);
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (dt.getUTCFullYear() !== Number(y) || dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  return raw;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lit un UUID obligatoire (identifiants école, compte, classe…). */
export function requireUuid(obj, field, label) {
  const raw = requireString(obj, field, label, { max: 64, trim: true });
  if (!UUID_RE.test(raw)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  return raw;
}

/** Lit un UUID optionnel ; undefined si absent ou vide. */
export function optionalUuid(obj, field, label) {
  const raw = optionalString(obj, field, label, 64);
  if (raw === undefined || raw === "") return undefined;
  if (!UUID_RE.test(raw)) {
    throw new ValidationError(`${label} est invalide.`);
  }
  return raw;
}

/** Lit un booléen strict ; renvoie la valeur par défaut si le champ est absent. */
export function bool(obj, field, defaultValue) {
  const raw = obj[field];
  if (raw === undefined || raw === null) return defaultValue;
  if (typeof raw !== "boolean") throw new ValidationError("Requête invalide.");
  return raw;
}
