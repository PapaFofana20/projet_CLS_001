import { supabase } from "@/lib/supabase";

/**
 * Appel de l'API backend (hébergée sur Render) avec la session courante ;
 * erreurs → messages FR. L'URL vient de VITE_API_URL, ex.
 * https://scolia-api.onrender.com — le contrat (enveloppe JSON, Bearer JWT,
 * { error } en échec) est identique aux anciennes Edge Functions.
 * Timeout 15s pour éviter les blocages indéfinis (fix audit 2026-11-12).
 */
export async function callFunction<T>(
  name: string,
  body?: unknown,
  method: "POST" | "GET" | "PATCH" | "DELETE" = "POST",
): Promise<T> {
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");
  if (!base) {
    throw new Error("API non configurée : définissez VITE_API_URL pour ce build.");
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    // `name` peut contenir des segments dynamiques (ids) : l'appelant doit les
    // encoder avec encodeURIComponent() avant de les interpoler (voir
    // timetableService) afin qu'un '/' ou '?' dans un id ne change pas la route.
    res = await fetch(`${base}/${name}`, {
      method,
      // Les réponses de l'API sont dynamiques (statut de maintenance, rôles,
      // données métier) : jamais de cache navigateur, sinon un F5 renverrait
      // un état périmé après une modification côté admin.
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof DOMException && e.name === "AbortError") {
      const err = new Error("Timeout : l'API ne répond pas. Réessayez dans un instant.");
      // @ts-expect-error - Error cause not in ES2020 but supported at runtime
      err.cause = e;
      throw err;
    }
    const err = new Error("Service indisponible. Vérifiez que l'API est démarrée et que VITE_API_URL est correct.");
    // @ts-expect-error - Error cause not in ES2020 but supported at runtime
    err.cause = e;
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const raw = await res.text().catch(() => "");
  let payload: Record<string, unknown> = {};
  try {
    payload = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    payload = {};
  }

  if (!res.ok) {
    if (typeof payload.error === "string") throw new Error(payload.error);
    throw new Error(
      res.status === 404
        ? "Service introuvable (API indisponible ou route non déployée)."
        : `Erreur du service (HTTP ${res.status}). Réessayez dans un instant.`,
    );
  }
  return payload as T;
}
