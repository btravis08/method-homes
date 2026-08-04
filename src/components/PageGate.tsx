/*
  The passphrase wall for protected pages: a centered dark card in
  the site's voice. Plain HTML form POST to /api/gate — no client
  JS, SSR-safe, works before hydration.
*/

export function PageGate({
  slug,
  title,
  wrong,
}: {
  slug: string;
  title?: string;
  wrong?: boolean;
}) {
  return (
    <main
      data-mode="dark"
      className="flex min-h-[100svh] w-full items-center justify-center bg-surface px-6 text-ink"
    >
      <form
        method="POST"
        action="/api/gate"
        className="flex w-full max-w-sm flex-col items-center gap-6 text-center"
      >
        <p className="label text-ink-3">PROTECTED PAGE</p>
        {title && <h1 className="font-display text-headline-sm">{title}</h1>}
        <p className="text-body-sm text-ink-2">
          Enter the passphrase to view this page.
        </p>
        <input type="hidden" name="slug" value={slug} />
        <input
          type="password"
          name="passphrase"
          required
          autoFocus
          autoComplete="current-password"
          aria-label="Passphrase"
          aria-invalid={wrong || undefined}
          placeholder="Passphrase"
          className="label h-12 w-full rounded-xs border border-line bg-transparent px-[1.125rem] text-ink outline-none placeholder:text-ink-3 focus:border-ink-2"
        />
        {wrong && (
          <p className="label text-ink-2" role="alert">
            THAT PASSPHRASE DIDN&apos;T MATCH — TRY AGAIN
          </p>
        )}
        <button
          type="submit"
          className="label h-12 w-full rounded-xs bg-btn px-[1.125rem] text-btn-fg"
        >
          VIEW PAGE
        </button>
      </form>
    </main>
  );
}
