import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // Cibles navigateurs modernes : moins de code de compatibilité à parser.
    target: "es2020",
    // Le JavaScript n'est plus inliné dans index.html : chaque page garde son
    // propre chunk, chargé à la demande et mis en cache séparément. L'ancien
    // build "singlefile" produisait un index.html de ~1,7 Mo à re-télécharger
    // et re-parser à chaque visite, sur toutes les pages.
    cssCodeSplit: true,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        // React et Supabase changent rarement : un chunk dédié reste en cache
        // longtemps, même après une mise à jour de l'application.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
