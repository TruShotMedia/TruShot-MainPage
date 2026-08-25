import Image from "next/image";
import Link from "next/link";
import { Bell, LogOut, Menu, Search, Settings } from "lucide-react";
import { signOut } from "@/app/admin/actions";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { NotionAutoSync } from "@/components/admin/notion-auto-sync";

export function AdminShell({
  children,
  displayName,
  role,
  pendingRequestCount,
  notionSyncEnabled,
  notionSyncIntervalMinutes,
}: {
  children: React.ReactNode;
  displayName: string;
  role: string;
  pendingRequestCount: number;
  notionSyncEnabled: boolean;
  notionSyncIntervalMinutes: number;
}) {
  return (
    <div className="admin-shell">
      <NotionAutoSync enabled={notionSyncEnabled} intervalMinutes={notionSyncIntervalMinutes} />
      <aside className="admin-sidebar">
        <Link className="admin-logo" href="/admin/overview">
          <Image src="/brand/logo-white.png" alt="TruShot Media" width={230} height={84} priority />
        </Link>
        <AdminNavigation />
        <div className="sidebar-user">
          <span>{displayName.slice(0, 1).toUpperCase()}</span>
          <div><strong>{displayName}</strong><small>{role}</small></div>
          <form action={signOut}><button aria-label="Sign out"><LogOut size={16} /></button></form>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <details className="mobile-admin-menu">
            <summary><Menu size={21} /> Menu</summary>
            <div><AdminNavigation /></div>
          </details>
          <div className="admin-search"><Search size={17} /><span>Search workspace</span><kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            <Link href="/admin/requests" className="notification-button" aria-label={`${pendingRequestCount} client ${pendingRequestCount === 1 ? "request" : "requests"} awaiting review`}>
              <Bell size={18} />{pendingRequestCount > 0 ? <span>{pendingRequestCount > 99 ? "99+" : pendingRequestCount}</span> : null}
            </Link>
            <Link href="/admin/settings" aria-label="Settings"><Settings size={18} /></Link>
          </div>
        </header>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
