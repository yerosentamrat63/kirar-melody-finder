import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "ቅኝት Finder — Ethiopian Kignit Detector" },
      {
        name: "description",
        content:
          "Detect the ቅኝት (kignit) of Ethiopian kirar and begena mezmurs by listening or uploading audio.",
      },
      { name: "theme-color", content: "#1a0f08" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "ቅኝት Finder" },
      { name: "author", content: "Kignit" },
      { property: "og:title", content: "ቅኝት Finder — Ethiopian Kignit Detector" },
      {
        property: "og:description",
        content:
          "Identify the Ethiopian modal scale of any kirar or begena mezmur in seconds.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&display=swap",
      },
      { rel: "icon", href: "/icons/icon-192.svg", type: "image/svg+xml" },
      {
        rel: "apple-touch-icon",
        href: "/icons/icon-192.svg",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function Nav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-500/10 bg-[#1a0f08]">
      <div className="mx-auto flex max-w-lg items-center justify-around">
        <Link
          to="/"
          className="group flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-[10px] font-sans font-medium uppercase tracking-[0.12em] text-amber-200/40 transition-colors duration-200 hover:text-amber-200/70 aria-[current]:text-amber-400"
          activeProps={{ className: "text-amber-400" }}
          inactiveProps={{}}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
          Detector
          <span className="mt-0.5 h-0.5 w-4 rounded-full bg-current opacity-0 transition-opacity duration-200 group-aria-[current]:opacity-100" />
        </Link>
        <Link
          to="/kignits"
          className="group flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-[10px] font-sans font-medium uppercase tracking-[0.12em] text-amber-200/40 transition-colors duration-200 hover:text-amber-200/70 aria-[current]:text-amber-400"
          activeProps={{ className: "text-amber-400" }}
          inactiveProps={{}}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M9 3L5 6.99h3V14h2V6.99h3L9 3zm7 14.01V10h-2v7.01h-3L15 21l4-3.99h-3z" />
          </svg>
          ቅኝቶች
          <span className="mt-0.5 h-0.5 w-4 rounded-full bg-current opacity-0 transition-opacity duration-200 group-aria-[current]:opacity-100" />
        </Link>
        <Link
          to="/history"
          className="group flex flex-1 flex-col items-center gap-0.5 px-3 py-2.5 text-[10px] font-sans font-medium uppercase tracking-[0.12em] text-amber-200/40 transition-colors duration-200 hover:text-amber-200/70 aria-[current]:text-amber-400"
          activeProps={{ className: "text-amber-400" }}
          inactiveProps={{}}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
          </svg>
          History
          <span className="mt-0.5 h-0.5 w-4 rounded-full bg-current opacity-0 transition-opacity duration-200 group-aria-[current]:opacity-100" />
        </Link>
      </div>
    </nav>
  );
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Nav />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
