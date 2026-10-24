import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// The dev server needs a port; a production build doesn't.
const port = Number(process.env.PORT ?? 5174);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}
const basePath = process.env.BASE_PATH ?? "/";
const isProd = process.env.NODE_ENV === "production";

const DEFAULTS = {
  VITE_SITE_URL: "https://scorerstable.swishassistant.com",
  VITE_OPERATOR_NAME: "Swish Assistant",
  VITE_PARTNER_URL: "https://www.swishassistant.com",
};

// The public address is set once (VITE_SITE_URL) and used for the canonical
// link, share image, structured data, sitemap and robots.txt, so moving to a
// new domain is an environment change plus a redeploy, not a code change.
function siteAddress(mode: string): Plugin {
  const env = { ...DEFAULTS, ...Object.fromEntries(Object.entries(loadEnv(mode, import.meta.dirname, "VITE_")).filter(([, v]) => v)) };
  const site = env.VITE_SITE_URL.replace(/\/+$/, "");
  return {
    name: "site-address",
    transformIndexHtml(html) {
      return html
        .replaceAll("%SITE_URL%", site)
        .replaceAll("%OPERATOR%", env.VITE_OPERATOR_NAME)
        .replaceAll("%PARTNER_URL%", env.VITE_PARTNER_URL.replace(/\/+$/, ""));
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "robots.txt",
        source: [
          "# Scorers Table: the public pages can be indexed; everything a signed-in",
          "# user sees is private and has nothing for a crawler anyway.",
          "User-agent: *",
          "Allow: /$",
          "Allow: /help",
          "Allow: /login",
          "Allow: /terms",
          "Allow: /privacy",
          "Disallow: /leagues",
          "Disallow: /game/",
          "Disallow: /setup/",
          "Disallow: /settings",
          "Disallow: /profile",
          "Disallow: /stats",
          "Disallow: /organizer",
          "Disallow: /auth/",
          "Disallow: /reset-password",
          "",
          `Sitemap: ${site}/sitemap.xml`,
          "",
        ].join("\n"),
      });
      const pages: [string, string, string][] = [["", "monthly", "1.0"], ["/help", "monthly", "0.6"], ["/terms", "yearly", "0.3"], ["/privacy", "yearly", "0.3"]];
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...pages.map(([p, f, pr]) => `  <url><loc>${site}${p || "/"}</loc><changefreq>${f}</changefreq><priority>${pr}</priority></url>`),
          "</urlset>",
          "",
        ].join("\n"),
      });
    },
  };
}

export default defineConfig(async ({ mode }) => ({
  base: basePath,
  plugins: [
    siteAddress(mode),
    react(),
    tailwindcss(),
    ...(isProd ? [] : [runtimeErrorOverlay()]),
    // Installable, and opens with no signal: the app shell is cached on the
    // device, so a scorer can reload or reopen it in a gym with no wifi.
    // Game data is separate (IndexedDB) and never touched by this cache.
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "icon-192.png"],
      manifest: {
        name: "Scorers Table",
        short_name: "Scorers Table",
        description: "Courtside basketball scoring for leagues and teams. Works without wifi.",
        id: basePath,
        theme_color: "#08090b",
        background_color: "#08090b",
        display: "standalone",
        orientation: "any",
        start_url: basePath,
        scope: basePath,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "fonts" },
          },
        ],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
}));
