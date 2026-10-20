import Link from "next/link";
import { Temporal } from "@js-temporal/polyfill";
import { requirePageSession } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/server";
import { listReminders, reminderSummary } from "@/repositories/reminders";
import { reminderViewInput } from "@/lib/validation/reminders";
import { formatDeadline } from "@/lib/reminders/display";
import { ReminderActions } from "./reminder-actions";
import { readPreferences } from "@/repositories/preferences";
import { Icon } from "./icon";
import { formatRecurrence } from "@/lib/reminders/recurrence-display";

export async function ReminderList({
  completed = false,
  searchParams,
}: {
  completed?: boolean;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { owner, user } = await requirePageSession();
  const db = getDatabase();
  const preferences = await readPreferences(db, owner);
  const query = reminderViewInput.safeParse(await searchParams);
  if (!query.success)
    return (
      <main>
        <h1 className="page-title">Let’s find your reminders.</h1>
        <p className="page-description">That page or search is unavailable.</p>
        <Link href="/app" className="button button-dark">
          Return to reminders <Icon name="arrow" />
        </Link>
      </main>
    );
  const now = new Date();
  const local = Temporal.Instant.fromEpochMilliseconds(
    now.getTime(),
  ).toZonedDateTimeISO(preferences.timeZone);
  const todayStart = new Date(local.startOfDay().epochMilliseconds);
  const tomorrowStart = new Date(
    local.add({ days: 1 }).startOfDay().epochMilliseconds,
  );
  const [result, counts] = await Promise.all([
    listReminders(
      db,
      owner,
      completed ? "completed" : "active",
      query.data.page,
      query.data.pageSize,
      { ...query.data, now, todayStart, tomorrowStart },
    ),
    reminderSummary(db, owner, now, todayStart, tomorrowStart),
  ]);
  const base = completed ? "/app/completed" : "/app";
  function href(page: number, view = query.success ? query.data.view : "all") {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(query.success ? query.data.pageSize : 20),
      view,
      ...(query.success && query.data.q ? { q: query.data.q } : {}),
    });
    return `${base}?${params}`;
  }
  const firstName = user.name.trim().split(/\s+/)[0];
  const next = !completed
    ? result.items.find((reminder) => reminder.dueAt > now)
    : undefined;
  return (
    <main>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              month: "long",
              day: "numeric",
              timeZone: preferences.timeZone,
            }).format(now)}
          </p>
          <h1 className="page-title">
            {completed ? (
              "A little progress, every day."
            ) : (
              <>
                A clearer day, <em>{firstName}.</em>
              </>
            )}
          </h1>
          <p className="page-description">
            {completed
              ? "Look at everything you’ve taken off your mind."
              : "A home for your plans. A little room to breathe."}
          </p>
        </div>
        <Link href="/app/new" className="button button-dark header-create">
          <Icon name="plus" size={18} />
          New reminder
        </Link>
      </div>
      {!completed && (
        <>
          <section className="capture-invitation">
            <div className="capture-copy">
              <span className="pill light-pill">
                <span className="tiny-dot" />A LITTLE LESS ON YOUR MIND
              </span>
              <h2>
                Thought of something?
                <br />
                <em>Let it land here.</em>
              </h2>
              <p>Type it, say it, then get back to your day.</p>
              <Link href="/app/new" className="capture-input-link">
                <span>“Remind me to…”</span>
                <span className="capture-input-icons">
                  <Icon name="mic" size={18} />
                  <span className="capture-arrow">
                    <Icon name="arrow" size={19} />
                  </span>
                </span>
              </Link>
            </div>
            <div className="orbit-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit-center">
                <Icon name="bell" size={46} />
              </div>
              <div className="orbit-check">
                <Icon name="check" size={23} />
              </div>
              <span className="orbit-star">✦</span>
              <span className="orbit-dot" />
            </div>
          </section>
          <section className="stat-grid" aria-label="Your reminder overview">
            {[
              {
                title: "On your mind",
                value: counts.active,
                icon: "bell" as const,
                label: "Active reminders",
                href: "/app",
                tone: "peach",
              },
              {
                title: "On the horizon",
                value: counts.today,
                icon: "calendar" as const,
                label: "Due today",
                href: "/app?view=today",
                tone: "sage",
              },
              {
                title: "Off your shoulders",
                value: counts.completed,
                icon: "check" as const,
                label: "Completed",
                href: "/app/completed",
                tone: "lavender",
              },
            ].map((stat) => (
              <Link key={stat.title} href={stat.href} className="stat-card">
                <span className={`stat-icon ${stat.tone}`}>
                  <Icon name={stat.icon} size={21} />
                </span>
                <div>
                  <span className="stat-title">{stat.title}</span>
                  <div className="stat-value">
                    {stat.value.toString().padStart(2, "0")}
                    <span>{stat.label}</span>
                  </div>
                </div>
                <Icon name="arrow" size={16} />
              </Link>
            ))}
          </section>
        </>
      )}
      <div className="dashboard-grid">
        <section className="reminders-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                {completed ? "GOOD THINGS ADD UP" : "ONE THING AT A TIME"}
              </p>
              <h2>
                {completed ? "Completed reminders" : "Your reminders"}
                <span className="count-badge">
                  {completed ? counts.completed : counts.active}
                </span>
              </h2>
            </div>
          </div>
          <div className="list-toolbar">
            {!completed && (
              <nav className="filter-tabs" aria-label="Filter reminders">
                {(["all", "today", "upcoming", "overdue"] as const).map(
                  (view) => (
                    <Link
                      key={view}
                      href={href(1, view)}
                      className={query.data.view === view ? "selected" : ""}
                      aria-current={
                        query.data.view === view ? "page" : undefined
                      }
                    >
                      {view === "all"
                        ? "All reminders"
                        : view.charAt(0).toUpperCase() + view.slice(1)}
                      {view === "overdue" && counts.overdue > 0 && (
                        <span>{counts.overdue}</span>
                      )}
                    </Link>
                  ),
                )}
              </nav>
            )}
            <form action={base} className="reminder-search">
              <Icon name="search" size={17} />
              <input
                type="search"
                name="q"
                aria-label="Search reminders"
                placeholder="Find a reminder…"
                maxLength={160}
                defaultValue={query.data.q}
              />
              {query.data.view !== "all" && (
                <input type="hidden" name="view" value={query.data.view} />
              )}
              <button
                type="submit"
                className="search-submit"
                aria-label="Search"
              >
                <Icon name="arrow" size={16} />
              </button>
            </form>
          </div>
          {result.items.length ? (
            <ul className="reminder-cards">
              {result.items.map((reminder) => {
                const overdue =
                  reminder.status === "active" && reminder.dueAt <= now;
                const today =
                  reminder.dueAt >= todayStart &&
                  reminder.dueAt < tomorrowStart;
                return (
                  <li
                    key={reminder.id}
                    className={`reminder-card ${completed ? "is-complete" : ""}`}
                  >
                    <div
                      className={`reminder-status-mark ${overdue ? "overdue-mark" : ""}`}
                      aria-hidden="true"
                    >
                      <Icon name={completed ? "check" : "bell"} size={18} />
                    </div>
                    <div className="reminder-card-body">
                      <div className="reminder-card-heading">
                        <Link href={`/app/reminders/${reminder.id}`}>
                          {reminder.title}
                        </Link>
                        {reminder.priority !== "normal" && (
                          <span
                            className={`pill priority-${reminder.priority}`}
                          >
                            {reminder.priority === "high"
                              ? "High priority"
                              : "Low priority"}
                          </span>
                        )}
                      </div>
                      {reminder.description && (
                        <p className="reminder-description">
                          {reminder.description}
                        </p>
                      )}
                      <div className="reminder-meta">
                        <span className={overdue ? "overdue-text" : ""}>
                          <Icon name="calendar" size={14} />
                          {formatDeadline(reminder)}
                        </span>
                        {overdue && (
                          <span className="pill overdue-pill">Overdue</span>
                        )}
                        {!overdue && today && !completed && (
                          <span className="pill today-pill">Today</span>
                        )}
                      </div>
                      <ReminderActions
                        recurring={Boolean(reminder.recurrence)}
                        id={reminder.id}
                        revision={reminder.revision}
                        status={reminder.status}
                        afterDelete={base}
                      />
                      {reminder.recurrence && (
                        <p className="reminder-description mt-2">
                          {formatRecurrence(reminder.recurrence)}
                        </p>
                      )}
                    </div>
                    <Link
                      href={`/app/reminders/${reminder.id}`}
                      className="reminder-open"
                      aria-label={`Open ${reminder.title}`}
                    >
                      <Icon name="arrow" size={18} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="empty-art">
                <Icon name={completed ? "check" : "bell"} size={34} />
              </span>
              <h3>
                {query.data.q
                  ? "Nothing by that name."
                  : completed
                    ? "Good things are on their way."
                    : query.data.view !== "all"
                      ? "A little breathing room."
                      : "A fresh page. A clearer mind."}
              </h3>
              <p>
                {query.data.q
                  ? "Try another search, or clear the search to see everything."
                  : completed
                    ? "Complete a reminder and celebrate it here."
                    : query.data.view !== "all"
                      ? "No reminders in this view. Your other plans are still right where you left them."
                      : "Big plans, little errands, that thing you nearly forgot. Give your first reminder a home."}
              </p>
              <Link
                href={
                  query.data.q || query.data.view !== "all" ? base : "/app/new"
                }
                className="button button-outline"
              >
                {query.data.q || query.data.view !== "all"
                  ? "See all reminders"
                  : "Add your first reminder"}
                <Icon name="arrow" size={16} />
              </Link>
            </div>
          )}
          {(result.page > 1 || result.hasMore) && (
            <nav aria-label="Reminder pages" className="pagination">
              {result.page > 1 ? (
                <Link href={href(result.page - 1)}>← Previous page</Link>
              ) : (
                <span />
              )}
              <span>Page {result.page}</span>
              {result.hasMore ? (
                <Link href={href(result.page + 1)}>Next page →</Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </section>
        <aside className="dashboard-aside">
          <div className="day-note">
            <span className="eyebrow">A FRIENDLY REMINDER</span>
            <span className="note-flower" aria-hidden="true">
              ✳
            </span>
            <h3>
              You don’t have to
              <br />
              hold it all.
            </h3>
            <p>
              Make a little space for the things that make today a good day.
            </p>
            <span className="note-signature">one thing at a time.</span>
          </div>
          <div className="aside-detail">
            <span className="eyebrow">YOUR NEXT LITTLE THING</span>
            {next ? (
              <>
                <h3>{next.title}</h3>
                <p>
                  <Icon name="clock" size={15} />
                  {formatDeadline(next)}
                </p>
                <Link href={`/app/reminders/${next.id}`} className="text-link">
                  View reminder <Icon name="arrow" size={15} />
                </Link>
              </>
            ) : (
              <>
                <h3>Room for what’s next.</h3>
                <p>Your next upcoming reminder will appear here.</p>
              </>
            )}
          </div>
          <div className="zone-note">
            <Icon name="globe" size={17} />
            <div>
              <strong>{preferences.timeZone.replaceAll("_", " ")}</strong>
              <Link href="/app/settings">
                {preferences.reviewedAt
                  ? "Your time zone"
                  : "Review your time zone"}
              </Link>
            </div>
          </div>
          <p className="delivery-note">
            Scheduled email delivery is awaiting activation. Your saved
            reminders are ready.
          </p>
        </aside>
      </div>
    </main>
  );
}
