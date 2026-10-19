export function SessionRecovery({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p className="mt-3 text-sm" role="status">
      Keep this tab open to retain your work.{" "}
      <a
        href="/login"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Sign in again in another tab ↗
      </a>
      , then retry here.
    </p>
  );
}
