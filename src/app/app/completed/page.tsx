import { ReminderList } from "@/components/reminder-list";
export default function CompletedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <ReminderList completed searchParams={searchParams} />;
}
