import Link from "next/link";
import { Brand, Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-20">
      <Link href="/" aria-label="RemindMe home">
        <Brand />
      </Link>
      <p className="eyebrow mt-16">404 · A small detour</p>
      <h1 className="page-title mt-4">This page slipped away.</h1>
      <p className="page-description">
        The page may have moved, or this reminder is no longer available to your
        account.
      </p>
      <Link href="/app" className="button button-dark mt-8">
        Back to reminders <Icon name="arrow" />
      </Link>
    </main>
  );
}
