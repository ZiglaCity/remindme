"use client";
import { Icon } from "@/components/icon";
export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="error-state">
      <span>
        <Icon name="wifi" size={30} />
      </span>
      <h1 className="text-2xl font-semibold">Couldn’t load this page</h1>
      <p className="my-4">Please check your connection and try again.</p>
      <button onClick={reset} className="button button-dark">
        Try again
      </button>
    </main>
  );
}
