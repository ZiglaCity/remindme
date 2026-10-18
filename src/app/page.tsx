import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-12">
      <p className="mb-12 text-sm font-semibold tracking-widest text-emerald-800">
        REMINDME
      </p>
      <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
        A little less to keep in your head.
      </h1>
      <p className="mt-6 max-w-lg text-lg leading-relaxed text-stone-600">
        A simple place for your tasks, deadlines, and things you want to
        remember.
      </p>
      <div className="mt-8 flex gap-6">
        <Link
          href="/login"
          className="rounded-lg bg-emerald-900 px-5 py-3 text-white"
        >
          Sign in
        </Link>
        <Link href="/register" className="px-2 py-3 underline">
          Create account
        </Link>
      </div>
      <p className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-500">
        In development. Reminder capture is coming next.
      </p>
    </main>
  );
}
