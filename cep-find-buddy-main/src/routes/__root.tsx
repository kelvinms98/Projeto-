import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

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

function ErrorComponent(props: ErrorComponentProps) {
  const { error, reset } = props;
  console.error(error);
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [count, setCount] = useState(5);
  const MAX = 3;
  const retry = () => {
    router.invalidate();
    reset();
  };
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    const n = Number(sessionStorage.getItem("te-achando-retries") || 0);
    setTries(n);
  }, [error]);
  useEffect(() => {
    if (tries >= MAX) return;
    if (count <= 0) {
      sessionStorage.setItem("te-achando-retries", String(tries + 1));
      window.location.reload();
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, tries]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">A página não carregou</h1>
        <p className="mt-2 text-base text-muted-foreground">
          {tries < MAX
            ? `Vamos tentar de novo sozinhos em ${count} segundos...`
            : "Já tentamos algumas vezes. Toque no botão para tentar de novo."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              sessionStorage.removeItem("te-achando-retries");
              retry();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-6 py-3 text-base font-bold text-primary-foreground hover:opacity-90"
          >
            Tentar de novo agora
          </button>
          <a
            href="/"
            onClick={() => sessionStorage.removeItem("te-achando-retries")}
            className="inline-flex items-center justify-center rounded-2xl border border-input bg-background px-6 py-3 text-base font-bold text-foreground hover:bg-accent"
          >
            Voltar ao início
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "Lovable Generated Project" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Lovable Generated Project" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

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
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
