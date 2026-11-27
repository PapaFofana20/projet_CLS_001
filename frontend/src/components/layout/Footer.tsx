// Pied de page du site public : logo et colonnes de liens.
import { Link } from "react-router-dom";
import { footerColumns } from "@/data/landing";
import { Logo } from "@/components/ui/Brand";
import { Container } from "./Container";

// Pied de page affiché sur toutes les pages publiques.
export function Footer() {
  return (
    <footer>
      <Container className="pb-footer-bottom">
        <div className="rounded-3xl bg-forest p-8 text-white sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo dark className="h-10" />
          </div>
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
            {footerColumns.map((col) => (
              <div key={col.title}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-lime">{col.title}</h3>
                <ul className="space-y-1">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <Link to={l.to} className="inline-flex min-h-11 items-center text-sm text-white/80 transition-colors hover:text-lime">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/15 pt-6 text-xs text-white/60 sm:flex-row sm:items-center">
          <p>© 2026 Classora. Tous droits réservés.</p>
          <p className="flex items-center gap-2 text-[11px]">
            Développé par
            <img
              src="/images/bluepixel-wordmark.webp"
              alt="BluePixel"
              width={475}
              height={111}
              loading="lazy"
              decoding="async"
              className="h-5 w-auto sm:h-6"
            />
          </p>
        </div>
        </div>
      </Container>
    </footer>
  );
}
