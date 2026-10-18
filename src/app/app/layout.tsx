import Link from "next/link";
import { requirePageSession } from "@/lib/auth/session";
import { SignOut } from "@/components/sign-out";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageSession();
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-12 flex flex-wrap items-center justify-between gap-6 border-b border-stone-200 pb-6">
        <Link href="/app" className="font-semibold text-emerald-800">
          RemindMe
        </Link>
        <nav aria-label="Application" className="flex gap-6">
          <Link href="/app/settings" className="text-sm underline">
            Settings
          </Link>
          <SignOut />
        </nav>
      </header>
      {children}
    </div>
  );
}
