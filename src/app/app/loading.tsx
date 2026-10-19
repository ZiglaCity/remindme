export default function Loading() {
  return (
    <div role="status" className="loading-skeleton">
      <span className="sr-only">Loading your reminders…</span>
      <div className="skeleton-bar" />
      <div className="skeleton-bar" style={{ width: "25%", height: 12 }} />
      {[1, 2, 3].map((item) => (
        <div key={item} className="skeleton-card" />
      ))}
    </div>
  );
}
