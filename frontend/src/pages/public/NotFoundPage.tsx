// Page d'erreur 404 quand l'adresse demandée n'existe pas.
import { Link } from "react-router-dom";
import { Container } from "@/components/layout/Container";
import { Icon } from "@/components/ui/Icon";
import { usePageMeta } from "@/hooks/usePageMeta";

/** Page 404 — l'URL demandée n'existe pas (le serveur SPA renvoie 200 : le
 * contenu + noindex + liens de sortie remplacent l'ancienne redirection vers
 * l'accueil, qui créait des « soft 404 »). */
export default function NotFoundPage() {
  usePageMeta({ title: "Page introuvable", description: "La page demandée n'existe pas ou a été déplacée.", noindex: true });
  return (
    <Container className="flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-2xl font-semibold text-forest-500">Erreur 404</p>
      <h1 className="mt-3 max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
        Cette page n'existe pas ou a été déplacée
      </h1>
      <p className="mt-4 max-w-xl text-neutral-600">
        Le lien est peut-être incorrect ou obsolète. Retrouvez l'essentiel de Classora depuis les pages
        ci-dessous.
      </p>
      <ul className="mt-8 flex flex-wrap justify-center gap-3">
        <li>
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-forest px-6 text-sm font-semibold text-white transition hover:opacity-90">
            <Icon name="home" className="text-[18px]" />
            Retour à l'accueil
          </Link>
        </li>
        <li>
          <Link to="/fonctionnalites" className="inline-flex min-h-11 items-center rounded-full bg-mist px-6 text-sm font-semibold text-forest transition hover:bg-lime-soft">
            Les fonctionnalités
          </Link>
        </li>
        <li>
          <Link to="/tarifs" className="inline-flex min-h-11 items-center rounded-full bg-mist px-6 text-sm font-semibold text-forest transition hover:bg-lime-soft">
            Les tarifs
          </Link>
        </li>
        <li>
          <Link to="/contact" className="inline-flex min-h-11 items-center rounded-full bg-mist px-6 text-sm font-semibold text-forest transition hover:bg-lime-soft">
            Nous contacter
          </Link>
        </li>
      </ul>
    </Container>
  );
}
