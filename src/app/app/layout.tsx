import { requirePageSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requirePageSession();
  return <AppShell name={user.name}>{children}</AppShell>;
}
