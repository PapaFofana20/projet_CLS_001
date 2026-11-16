// Page de confirmation après une inscription élève ou parent.
import { Link, useLocation } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";

interface SignupSentState {
  role?: "eleve" | "parent";
  eleve?: string;
  childCode?: string | null;
  autoApprove?: boolean;
}

/** /inscription-envoyee : confirmation après une inscription élève ou parent.
 *  Les données sensibles (child_code, nom de l'élève) arrivent via
 *  location.state — JAMAIS via l'URL (historique, logs, Referer). */
export default function SignupSentPage() {
  const location = useLocation();
  const state = (location.state as SignupSentState | null) ?? {};
  const role = state.role ?? null;
  const eleve = state.eleve ?? null;
  const childCode = state.childCode ?? null;
  const autoApprove = state.autoApprove === true;
  const isParent = role === "parent";
  const isStudent = role === "eleve";

  const copyCode = async () => {
    if (childCode) {
      try {
        await navigator.clipboard.writeText(childCode);
      } catch {
        /* presse-papiers indisponible */
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4 py-10">
      <Card className="w-full max-w-2xl text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-lime text-forest">
          <Icon name="mark_email_read" fill className="text-[32px]" />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {isStudent && autoApprove ? "Inscription confirmée" : "Demande envoyée"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-neutral-600">
          {isStudent && autoApprove
            ? "Votre compte est activé. Vous pouvez dès maintenant vous connecter et communiquer votre code à vos parents."
            : isParent
            ? "Votre école doit valider votre inscription. Vous recevrez un accès à votre espace dès validation par la direction."
            : "Votre école doit valider votre inscription. Vous recevrez un accès à votre espace dès validation par la direction."}
        </p>
        {eleve && (
          <p className="mx-auto mt-4 w-fit rounded-full bg-lime-soft px-4 py-2 text-sm font-semibold text-forest">Élève rattaché : {eleve}</p>
        )}
        {isStudent && childCode && (
          <div className="mt-6 rounded-2xl bg-lime-soft p-4 text-left border border-lime">
            <p className="text-sm font-semibold text-forest mb-2">
              {autoApprove ? "Votre code élève (accès immédiat) :" : "Code élève :"}
            </p>
            <div className="flex items-center gap-2">
              <span className="flex-1 font-mono text-2xl font-bold tracking-widest text-ink bg-white px-4 py-3 rounded-xl border border-neutral-200 text-center select-all">
                {childCode}
              </span>
              <Button variant="outline" icon="save" onClick={copyCode} aria-label="Copier le code">
                Copier
              </Button>
            </div>
            <p className="mt-3 text-xs text-forest/80">
              {autoApprove
                ? "Votre compte est déjà actif. Communiquez ce code à vos parents pour qu'ils puissent créer leur compte et suivre vos notes, devoirs, etc."
                : "Communiquez ce code à vos parents pour qu'ils puissent créer leur compte. Votre accès sera ouvert après validation par la direction."}
            </p>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/connexion" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest px-6 text-sm font-semibold text-white hover:bg-forest-600">
            Retour à la connexion
          </Link>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-forest/20 bg-white px-6 text-sm font-semibold text-forest hover:bg-lime-soft">
            Voir le site
          </Link>
        </div>
        <p className="mt-8 border-t border-neutral-100 pt-6 text-left text-xs text-neutral-500">
          <strong className="text-ink">Et ensuite ?</strong>
          <br />
          {autoApprove && isStudent
            ? "Votre compte est déjà actif. Connectez-vous avec votre e-mail et votre mot de passe."
            : "La direction de votre école examine la demande. Dès qu'elle est acceptée, vous recevez un e-mail avec votre accès personnel."}
          <br />
          Vous avez utilisé l'adresse e-mail&nbsp;? Conservez-la : elle sert à vous identifier auprès de l'école.
        </p>
      </Card>
    </div>
  );
}
