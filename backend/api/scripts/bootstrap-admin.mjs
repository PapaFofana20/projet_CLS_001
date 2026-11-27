/**
 * Amorçage du premier superadministrateur Classora.
 *
 * La table `public.admin_agents` est créée vide par la migration 00024 et
 * seule l'API (service_role) peut y écrire : sans ce script, personne ne peut
 * se connecter sur /admin/connexion tant qu'aucune ligne n'existe.
 *
 * Ce script est idempotent : il retrouve (ou crée) le compte Supabase Auth,
 * puis crée le profil `admin_agents` avec une matricule CLA-ADM-000001.
 *
 * Usage :
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<clé service_role> \
 *   ADMIN_EMAIL=vous@classora.sn \
 *   ADMIN_PASSWORD='<mot de passe>' \
 *   ADMIN_FIRST_NAME=Papa ADMIN_LAST_NAME=Fofana \
 *   node scripts/bootstrap-admin.mjs
 *
 * La clé service_role ne doit JAMAIS être committée ni exposée au navigateur.
 */
import "../src/env.js";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";
const firstName = process.env.ADMIN_FIRST_NAME?.trim() || "Super";
const lastName = process.env.ADMIN_LAST_NAME?.trim() || "Admin";

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!url || !key) {
  fail(
    "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.\n" +
      "  Supabase Dashboard > Project Settings > API : URL du projet et clé service_role.",
  );
}
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  fail("ADMIN_EMAIL est requis et doit être une adresse e-mail valide.");
}
if (password && password.length < 8) {
  fail("ADMIN_PASSWORD doit contenir au moins 8 caractères.");
}

const svc = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Supabase Auth n'expose pas de « getUserByEmail » : parcours paginé. */
async function findUserByEmail(target) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Impossible de lister les comptes : ${error.message}`);
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (users.length < 200) return null;
  }
  return null;
}

async function main() {
  let user = await findUserByEmail(email);

  if (!user) {
    if (!password) {
      fail("Aucun compte Supabase Auth avec cet e-mail : ADMIN_PASSWORD est requis pour le créer.");
    }
    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "superadmin", school_id: null },
    });
    if (error || !data?.user) {
      throw new Error(`Création du compte Auth impossible : ${error?.message ?? "réponse vide"}`);
    }
    user = data.user;
    console.log(`• Compte Auth créé : ${user.id}`);
  } else {
    console.log(`• Compte Auth existant : ${user.id}`);
    if (password) {
      // Réinitialisation d'un mot de passe fixe : on ne touche PAS aux
      // métadonnées ici (le rôle réel vit dans admin_agents et ne doit pas
      // être promu par simple changement de mot de passe).
      const { error } = await svc.auth.admin.updateUserById(user.id, { password, email_confirm: true });
      if (error) throw new Error(`Mise à jour du mot de passe impossible : ${error.message}`);
      console.log("• Mot de passe mis à jour.");
    } else {
      console.log("• Mot de passe inchangé (ADMIN_PASSWORD non fourni).");
    }
  }

  const { data: existing, error: findError } = await svc
    .from("admin_agents")
    .select("id, matricule, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (findError) throw new Error(`Lecture de admin_agents impossible : ${findError.message}`);

  if (existing) {
    console.log(`✔ Profil administrateur déjà présent : ${existing.matricule} (${existing.role}, ${existing.status}).`);
    // L'e-mail n'est pas journalisé : matricule + identifiant suffisent à
    // identifier le compte sans exposer d'adresse dans les logs du terminal.
    console.log(`  Connexion : /admin/connexion (compte ${user.id})`);
    return;
  }

  // Un e-mail déjà utilisé par un autre agent empêcherait l'insertion (unique).
  const { data: emailOwner, error: emailError } = await svc
    .from("admin_agents")
    .select("id, matricule, auth_user_id")
    .eq("email", email)
    .maybeSingle();
  if (emailError) throw new Error(`Lecture de admin_agents impossible : ${emailError.message}`);
  if (emailOwner) {
    fail(
      `Un profil admin_agents (${emailOwner.matricule}) existe déjà avec un autre compte Auth (${emailOwner.auth_user_id}).\n` +
        "  Supprimez ou corrigez cette ligne dans Supabase (SQL Editor) puis relancez le script.",
    );
  }

  const { data: matricule, error: matriculeError } = await svc.rpc("generate_admin_matricule");
  if (matriculeError || !matricule) {
    throw new Error(
      `Génération de la matricule impossible : ${matriculeError?.message ?? "réponse vide"}. ` +
        "La migration 00024_admin_agents.sql est-elle appliquée ?",
    );
  }

  const { data: inserted, error: insertError } = await svc
    .from("admin_agents")
    .insert({
      auth_user_id: user.id,
      matricule,
      role: "superadmin",
      status: "ACTIF",
      first_name: firstName,
      last_name: lastName,
      email,
      phone: "",
    })
    .select("matricule, role, status")
    .single();
  if (insertError) {
    throw new Error(
      `Création du profil administrateur impossible : ${insertError.message}. ` +
        "La migration 00024_admin_agents.sql est-elle appliquée ?",
    );
  }

  // Métadonnées Auth alignées sur le rôle d'amorçage (best-effort : l'API
  // autorise d'après admin_agents, jamais d'après ce claim).
  const { error: metaError } = await svc.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata ?? {}), role: "superadmin", school_id: null },
  });
  if (metaError) console.warn(`• Métadonnées Auth non mises à jour : ${metaError.message}`);

  console.log(`✔ Superadministrateur créé : ${inserted.matricule} (${inserted.role}, ${inserted.status}).`);
  console.log(`  Connexion : /admin/connexion (compte ${user.id})`);
}

main().catch((e) => {
  console.error(`✖ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
