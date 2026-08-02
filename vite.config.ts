// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  nitro: {
    preset: "vercel",
    ...({
      // YouTube audio streaming runs inside the same serverless function, which
      // needs more than the 10s default to proxy a full mezmur. Fluid Compute
      // allows up to 300s on Hobby.
      vercel: { functions: { maxDuration: 300 } },
    } as object),
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      ...VitePWA({
        strategies: "injectManifest",
        swSrc: "public/sw.js",
        swDest: "sw.js",
        injectManifest: {
          injectionPoint: undefined,
        },
        manifest: {
          name: "ቅኝት Finder — Ethiopian Kignit Detector",
          short_name: "ቅኝት Finder",
          description:
            "Detect the ቅኝት (kignit) of Ethiopian kirar and begena mezmurs by listening or uploading audio.",
          theme_color: "#06130e",
          background_color: "#06130e",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "icons/icon-192.svg",
              sizes: "192x192",
              type: "image/svg+xml",
            },
            {
              src: "icons/icon-512.svg",
              sizes: "512x512",
              type: "image/svg+xml",
            },
            {
              src: "icons/icon-512.svg",
              sizes: "512x512",
              type: "image/svg+xml",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  },
});
