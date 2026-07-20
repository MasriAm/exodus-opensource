export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 py-16 text-foreground">
      <section className="w-full max-w-2xl rounded-3xl border bg-card p-8 shadow-sm sm:p-12">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Local-first · Zero-knowledge
        </p>
        <h1 className="mt-4 text-5xl font-semibold tracking-tight">Exodus</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
          A private dashboard for exploring data exports entirely in your
          browser. The application scaffold and offline security constraints
          are ready; archive ingestion is introduced in a later phase.
        </p>
      </section>
    </main>
  );
}
