import { ReminderList } from "@/components/reminder-list";
export default function AppPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReminderList searchParams={searchParams} />;
}
