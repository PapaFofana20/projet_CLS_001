import { isValidEmail, isValidSnPhone, parseFrDate } from "./format";

/**
 * Import CSV des élèves — format attendu (en-têtes normalisés) :
 *   prenom, nom, genre, date_naissance, classe, parent_prenom, parent_nom, parent_tel, parent_email
 * Séparateur auto-détecté (virgule ou point-virgule). Date : JJ/MM/AAAA ou AAAA-MM-JJ.
 * Une ligne = un élève + son parent (parent créé en mode "new" par enrollStudent).
 */

export interface CsvStudentRow {
  line: number;
  firstName: string;
  lastName: string;
  gender: "F" | "M";
  birthDateIso: string;
  className: string;
  parentFirst: string;
  parentLast: string;
  parentPhone: string;
  parentEmail: string;
}

export interface CsvParseResult {
  rows: CsvStudentRow[];
  errors: string[];
}

const HEADER_ALIASES: Record<string, string> = {
  prenom: "firstName", firstname: "firstName", first_name: "firstName", "prénom": "firstName",
  nom: "lastName", lastname: "lastName", last_name: "lastName",
  genre: "gender", sexe: "gender", gender: "gender",
  date_naissance: "birthDate", datenaissance: "birthDate", birth_date: "birthDate", naissance: "birthDate",
  classe: "className", class: "className", class_name: "className",
  parent_prenom: "parentFirst", parent_first: "parentFirst", parentprenom: "parentFirst",
  parent_nom: "parentLast", parent_last: "parentLast", parentnom: "parentLast",
  parent_tel: "parentPhone", parent_phone: "parentPhone", telephone: "parentPhone", tel: "parentPhone",
  parent_email: "parentEmail", parent_mail: "parentEmail", email: "parentEmail",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitCsvLine(line: string, sep: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) { cells.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function detectSeparator(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? "";
  return (firstLine.match(/;/g) ?? []).length > (firstLine.match(/,/g) ?? []).length ? ";" : ",";
}

function parseBirthDate(raw: string): string | null {
  const v = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return v; // déjà ISO
  return parseFrDate(v);
}

// Lit un fichier CSV d'élèves et renvoie les lignes valides plus les erreurs par ligne.
export function parseStudentsCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const rows: CsvStudentRow[] = [];
  const clean = text.replace(/^\uFEFF/, ""); // BOM Excel
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { rows, errors: ["Fichier vide."] };

  const sep = detectSeparator(clean);
  const headerCells = splitCsvLine(lines[0]!, sep).map(normalizeHeader);
  const colIndex = new Map<string, number>();
  headerCells.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  });

  const required: [string, string][] = [
    ["firstName", "prenom"], ["lastName", "nom"], ["birthDate", "date_naissance"], ["className", "classe"],
    ["parentFirst", "parent_prenom"], ["parentLast", "parent_nom"], ["parentPhone", "parent_tel"],
  ];
  for (const [key, label] of required) {
    if (!colIndex.has(key)) errors.push(`Colonne manquante : "${label}". En-têtes reconnus : ${headerCells.join(", ")}`);
  }
  if (errors.length > 0) return { rows, errors };

  const get = (cells: string[], key: string): string => cells[colIndex.get(key)!] ?? "";
  const MAX_ROWS = 500;
  const seen = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    if (rows.length >= MAX_ROWS) { errors.push(`Limite atteinte : ${MAX_ROWS} lignes max par import.`); break; }
    const cells = splitCsvLine(lines[i]!, sep);
    const firstName = get(cells, "firstName");
    const lastName = get(cells, "lastName");
    const genderRaw = get(cells, "gender").toLowerCase();
    const birthRaw = get(cells, "birthDate");
    const className = get(cells, "className");
    const parentFirst = get(cells, "parentFirst");
    const parentLast = get(cells, "parentLast");
    const parentPhone = get(cells, "parentPhone");
    const parentEmail = get(cells, "parentEmail");

    const lineErrors: string[] = [];
    if (firstName.length < 2) lineErrors.push("prénom manquant");
    if (lastName.length < 2) lineErrors.push("nom manquant");
    // Genre explicite : toute valeur non reconnue (ou absente) est une erreur,
    // jamais un défaut silencieux vers « F » (données fausses en base).
    let gender: "F" | "M" | null = null;
    if (genderRaw === "m" || genderRaw === "masculin" || genderRaw === "garcon" || genderRaw === "male") gender = "M";
    else if (genderRaw === "f" || genderRaw === "feminin" || genderRaw === "fille" || genderRaw === "female") gender = "F";
    else lineErrors.push(`genre invalide ("${get(cells, "gender")}", attendez M ou F)`);
    const birthIso = parseBirthDate(birthRaw);
    if (!birthIso) lineErrors.push(`date de naissance invalide ("${birthRaw}", attendez JJ/MM/AAAA)`);
    if (!className) lineErrors.push("classe manquante");
    if (parentFirst.length < 2) lineErrors.push("prénom du parent manquant");
    if (parentLast.length < 2) lineErrors.push("nom du parent manquant");
    if (!isValidSnPhone(parentPhone)) lineErrors.push(`téléphone parent invalide ("${parentPhone}")`);
    if (parentEmail && !isValidEmail(parentEmail)) lineErrors.push(`e-mail parent invalide ("${parentEmail}")`);

    const dedupKey = `${firstName}|${lastName}|${birthRaw}|${className}`.toLowerCase();
    if (lineErrors.length === 0 && seen.has(dedupKey)) lineErrors.push("doublon dans le fichier");
    seen.add(dedupKey);

    if (lineErrors.length > 0) {
      errors.push(`Ligne ${lineNo} : ${lineErrors.join(", ")}.`);
      continue;
    }
    rows.push({ line: lineNo, firstName, lastName, gender: gender!, birthDateIso: birthIso!, className, parentFirst, parentLast, parentPhone, parentEmail });
  }

  if (rows.length === 0 && errors.length === 0) errors.push("Aucune ligne valide trouvée.");
  return { rows, errors };
}

/** Modèle CSV téléchargeable par la direction. */
export const CSV_TEMPLATE = [
  "prenom,nom,genre,date_naissance,classe,parent_prenom,parent_nom,parent_tel,parent_email",
  'Aminata,Diop,F,12/03/2015,CP A,Mariama,Diop,77 123 45 67,mariama.diap@exemple.sn',
  'Moussa,Ndiaye,M,05/07/2014,CP A,Fatou,Ndiaye,76 456 78 90,fatou.ndiaye@exemple.sn',
].join("\r\n");

// Télécharge le modèle CSV vierge pour aider la direction à préparer son import.
export function downloadCsvTemplate(): void {
  const blob = new Blob(["\uFEFF" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modele-import-eleves.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
