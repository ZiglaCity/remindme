"use client";
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1 className="text-2xl font-semibold">Couldn’t load your account</h1>
      <p className="my-4">Please check your connection and try again.</p>
      <button onClick={reset} className="underline">
        Try again
      </button>
    </main>
  );
}
