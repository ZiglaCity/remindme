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
      <p className="mt-12 border-t border-stone-200 pt-6 text-sm text-stone-500">
        In development. Reminder capture and accounts are coming next.
      </p>
    </main>
  );
}
