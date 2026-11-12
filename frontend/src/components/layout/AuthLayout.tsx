// Page de connexion/inscription : formulaire d'un côté, visuel de l'autre.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { images } from "@/data/landing";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Brand";

interface Props {
  title: ReactNode;
  subtitle: string;
  children: ReactNode;
  visualTitle?: ReactNode;
  visualText?: string;
  showVisual?: boolean;
  backgroundImage?: boolean;
}

/** Formulaire à gauche, visuel vert foncé à droite (si showVisual), ou image de fond (backgroundImage). */
export function AuthLayout({ title, subtitle, children, visualTitle, visualText, showVisual = true, backgroundImage = false }: Props) {
  const hasImageBackground = !showVisual && backgroundImage;
  const floatingDots = [...Array(8)].map((_, i) => (
    <div
      key={i}
      className="absolute size-1 rounded-full bg-lime/20"
      style={{
        top: `${10 + i * 11}%`,
        left: `${5 + (i * 11) % 90}%`,
        animation: `float ${4 + i * 0.5}s ease-in-out infinite`,
        animationDelay: `${i * 0.3}s`,
      }}
    />
  ));

  return (
    <div className={showVisual ? "grid min-h-screen bg-white lg:grid-cols-2" : "min-h-screen relative overflow-hidden"}>
      {/* Image d'arrière-plan pour les pages d'authentification */}
      {hasImageBackground && (
        <div className="absolute inset-0" aria-hidden="true">
          <div
            className="size-full"
            style={{
              backgroundImage: `url(${images.authBackground})`,
              // Tuiles répétées à taille fixe (côte à côte + en dessous),
              // jamais étirées ni zoomées : l'image garde son échelle d'origine.
              backgroundRepeat: "repeat",
              backgroundSize: "600px auto",
              backgroundPosition: "top left",
            }}
          />
          <div className="absolute inset-0 bg-white/10" />
        </div>
      )}

      {/* Décorations d'arrière-plan élégantes pour les formulaires sans visuel */}
      {!showVisual && !hasImageBackground && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {/* Motif de lignes diagonales subtiles */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 20px, #0f3d1e08 20px, #0f3d1e08 40px)`
          }} />
          {/* Motif de points subtils */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: `radial-gradient(#0f3d1e10 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }} />
          {/* Formes organiques floues - coin supérieur gauche */}
          <div className="absolute -top-32 -left-32 size-96 rounded-full bg-lime/10 blur-3xl" />
          {/* Forme organique floue - coin inférieur droit */}
          <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-forest/10 blur-3xl" />
          {/* Accent circulaire central bas */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 size-64 rounded-full bg-lime/5 blur-3xl" />
          {/* Petits accents décoratifs - livres/cahiers stylisés */}
          <svg className="absolute top-20 right-20 size-32 opacity-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 17H20" />
            <path d="M6.5 17V5a2.5 2.5 0 0 1 2.5-2.5H20" />
            <path d="M4 19.5v-15" />
          </svg>
          <svg className="absolute bottom-20 left-20 size-24 opacity-5 rotate-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 17H20" />
            <path d="M6.5 17V5a2.5 2.5 0 0 1 2.5-2.5H20" />
            <path d="M4 19.5v-15" />
          </svg>
          {/* Étoiles décoratives */}
          <svg className="absolute top-1/3 left-10 size-12 opacity-10" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 8,14 3,9 10,9" />
          </svg>
          <svg className="absolute bottom-1/3 right-10 size-16 opacity-5" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 8,14 3,9 10,9" />
          </svg>
          {/* Petits points lumineux */}
          {floatingDots}
        </div>
      )}

      <div className={showVisual ? "grid min-h-screen bg-white lg:grid-cols-2 relative z-10" : hasImageBackground ? "min-h-screen relative z-10 flex justify-center px-3 py-4 sm:px-6 sm:py-8" : "min-h-screen relative z-10 flex justify-center"}>
        <div className={showVisual ? "flex flex-col px-5 py-6 sm:px-10 lg:px-16" : hasImageBackground ? "flex w-full max-w-3xl flex-col self-start rounded-[28px] border border-forest/10 bg-white/95 px-5 py-6 shadow-soft backdrop-blur-sm sm:px-8 sm:py-8 lg:px-10" : "flex flex-col px-5 py-6 sm:px-10 lg:px-16 w-full max-w-3xl pt-10"}>
          <div className="flex items-center justify-between">
            <Logo />
            <Link to="/" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-forest">
              <Icon name="arrow_back" className="text-[18px]" />
              <span className="underline-offset-4 hover:underline">Retour</span>
            </Link>
          </div>
          {/* Marge au-dessus du titre : sépare nettement le logo du formulaire. */}
          <div className="mt-8 w-full max-w-3xl">
            <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-neutral-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
        {showVisual && (
          <aside className="relative hidden p-4 lg:block" aria-hidden="true">
            <div className="relative h-full overflow-hidden rounded-3xl bg-forest">
              <img src={images.auth} alt="" className="absolute inset-0 size-full object-cover opacity-40 mix-blend-luminosity" loading="eager" />
              <div className="absolute inset-0 bg-gradient-to-t from-forest via-forest/70 to-forest/30" />
              <div className="absolute -right-16 -top-16 size-64 rounded-full bg-lime/20 blur-2xl" />
              <div className="relative flex h-full flex-col justify-end p-12 text-white">
                <span className="mb-6 grid size-14 place-items-center rounded-2xl bg-lime text-forest">
                  <Icon name="school" fill className="text-[30px]" />
                </span>
                <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
                  {visualTitle ?? (
                    <>
                      Toute votre école, connectée.
                    </>
                  )}
                </h2>
                <p className="mt-4 max-w-md text-white/80">{visualText ?? "Inscriptions, bulletins et échéanciers de scolarité, dans un seul espace."}</p>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}