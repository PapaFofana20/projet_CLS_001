import { createClient } from "@supabase/supabase-js";

/**
 * Client Supabase orienté navigateur.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase n'est pas configuré : définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // persistSession: false empêche le stockage du JWT et du refresh_token
    // dans localStorage (vol total en cas de XSS). La session reste en
    // mémoire uniquement pour l'onglet courant.
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE : le code d'autorisation transite par l'URL (jamais le token en
    // fragment, que les historiques de navigateur et référents conservent).
    flowType: "pkce",
  },
});

export default supabase;