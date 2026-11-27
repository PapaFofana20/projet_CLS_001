import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase orienté navigateur.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase n'est pas configuré : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");
}

/**
 * Stockage de session orienté onglet : sessionStorage et non localStorage.
 * Le JWT / refresh_token ne survit donc pas à la fermeture de l'onglet (moins
 * d'exposition en cas de XSS) mais RESTE restaurable après F5 dans le même
 * onglet — nécessaire à AuthContext et aux gardes de route qui attendent une
 * restauration de session. Les erreurs d'accès au stockage (mode privé, policy
 * navigateur) sont absorbées : Supabase retombe alors en session mémoire.
 */
const tabStorage: {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} = {
  getItem: (key) => {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : session mémoire uniquement */
    }
  },
  removeItem: (key) => {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* stockage indisponible : rien à nettoyer */
    }
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On persiste volontairement la session, mais dans sessionStorage via
    // `storage` : restauration après F5 dans l'onglet, sans écriture durable
    // dans localStorage. C'est l'objet attendu par l'interface Supabase
    // (getItem / setItem / removeItem, éventuellement promisifiés).
    persistSession: true,
    storage: tabStorage,
    autoRefreshToken: true,
    // detectSessionInUrl + flowType PKCE : le code d'autorisation transite par
    // l'URL (jamais le token en fragment, conservé par historiques/référents)
    // et le verifier PKCE est lu/écrit dans le MÊME sessionStorage. Cohérent
    // avec la restauration : le code n'est consommé qu'une fois, puis la
    // session est stockée dans l'onglet pour les rechargements suivants.
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

export default supabase;