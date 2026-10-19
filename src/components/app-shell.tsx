"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand, Icon } from "./icon";
import { SignOut } from "./sign-out";

const navigation = [
  { href: "/app", label: "My reminders", icon: "grid" },
  { href: "/app/completed", label: "Completed", icon: "check" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
] as const;
export function AppShell({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <a href="#workspace" className="skip-link">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/app" aria-label="RemindMe home">
          <Brand />
        </Link>
        <Link
          href="/app/new"
          aria-label="Create a reminder"
          className="button button-coral sidebar-create"
        >
          <Icon name="plus" />
          New reminder
        </Link>
        <p className="nav-eyebrow">YOUR SPACE</p>
        <nav aria-label="Application" className="side-nav">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={
                pathname === item.href ? "nav-item active" : "nav-item"
              }
            >
              <Icon name={item.icon} />
              {item.label}
              {pathname === item.href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="little-spark">
            <Icon name="sparkle" />
          </span>
          <p>A little less on your mind.</p>
          <span>Make room for what matters.</span>
        </div>
        <div className="profile">
          <span className="avatar">
            {name.trim().charAt(0).toUpperCase() || "R"}
          </span>
          <div className="profile-name">
            <strong>{name}</strong>
            <span>Your personal space</span>
          </div>
          <SignOut />
        </div>
      </aside>
      <div className="workspace" id="workspace" tabIndex={-1}>
        <header className="workspace-header">
          <span className="desktop-wordmark">A CLEARER DAY STARTS HERE</span>
          <Link href="/app" className="mobile-brand" aria-label="RemindMe home">
            <Brand />
          </Link>
          <div className="header-right">
            <span className="private-indicator">
              <span />
              Your space, your pace
            </span>
            <span className="avatar small">
              {name.trim().charAt(0).toUpperCase() || "R"}
            </span>
          </div>
        </header>
        <div className="app-content">{children}</div>
        <footer className="workspace-footer">
          <span>Less remembering. More living.</span>
          <span>Made for your everyday.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile application">
        <Link
          href="/app"
          aria-current={pathname === "/app" ? "page" : undefined}
        >
          <Icon name="grid" />
          <span>Reminders</span>
        </Link>
        <Link
          href="/app/completed"
          aria-current={pathname === "/app/completed" ? "page" : undefined}
        >
          <Icon name="check" />
          <span>Completed</span>
        </Link>
        <Link
          href="/app/new"
          className="mobile-create"
          aria-label="New reminder"
        >
          <Icon name="plus" />
        </Link>
        <Link
          href="/app/settings"
          aria-current={pathname === "/app/settings" ? "page" : undefined}
        >
          <Icon name="settings" />
          <span>Settings</span>
        </Link>
      </nav>
    </div>
  );
}
