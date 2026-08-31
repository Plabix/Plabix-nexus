import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">
          Plabix Nexus
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Your company&apos;s AI knowledge operating system.
        </h1>
        <p className="mx-auto max-w-xl text-slate-600">
          Upload internal documents and ask questions in plain language. Answers are
          grounded in your own knowledge base — powered entirely by local AI.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/signup" className="btn-primary">
          Get started
        </Link>
        <Link href="/login" className="btn-secondary">
          Log in
        </Link>
      </div>
    </main>
  );
}
