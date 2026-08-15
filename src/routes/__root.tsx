import { Link, Outlet, createRootRoute, useRouter } from "@tanstack/react-router";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-vx-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-vx-text">404</h1>
        <h2 className="mt-4 text-lg font-medium text-vx-text">Page not found</h2>
        <p className="mt-2 text-sm text-vx-dim">
          That page doesn't exist. The processor lives on the home screen.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-vx-accent px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110"
          >
            Go to VoxFX
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-vx-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold tracking-tight text-vx-text">This page didn't load</h1>
        <p className="mt-2 text-sm text-vx-dim">
          Something went wrong while starting the app. Reloading usually clears it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-vx-accent px-4 py-2 text-sm font-semibold text-black transition-[filter] hover:brightness-110"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-vx-line bg-vx-raise px-4 py-2 text-sm font-medium text-vx-text transition-colors hover:border-vx-line-strong"
          >
            Reload
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  // Required: nested routes render here. Removing <Outlet /> breaks all child routes.
  return <Outlet />;
}
