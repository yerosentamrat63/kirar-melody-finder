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
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
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
    <nav className="flex items-center justify-center border-b border-amber-500/10 bg-[#1a0f08] px-4 py-0">
      <div className="flex items-center gap-6">
        <Link
          to="/"
          className="relative px-1 py-3.5 text-sm font-medium font-sans tracking-wide text-amber-200/50 transition-colors duration-200 hover:text-amber-200 aria-[current]:text-amber-300"
          activeProps={{ className: "text-amber-300" }}
          inactiveProps={{}}
        >
          Detector
          <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500 opacity-0 transition-opacity duration-200 aria-[current]:opacity-100" />
        </Link>
        <Link
          to="/kignits"
          className="relative px-1 py-3.5 text-sm font-medium font-sans tracking-wide text-amber-200/50 transition-colors duration-200 hover:text-amber-200 aria-[current]:text-amber-300"
          activeProps={{ className: "text-amber-300" }}
          inactiveProps={{}}
        >
          ቅኝቶች Reference
          <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500 opacity-0 transition-opacity duration-200 aria-[current]:opacity-100" />
        </Link>
        <Link
          to="/history"
          className="relative px-1 py-3.5 text-sm font-medium font-sans tracking-wide text-amber-200/50 transition-colors duration-200 hover:text-amber-200 aria-[current]:text-amber-300"
          activeProps={{ className: "text-amber-300" }}
          inactiveProps={{}}
        >
          History
          <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500 opacity-0 transition-opacity duration-200 aria-[current]:opacity-100" />
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
