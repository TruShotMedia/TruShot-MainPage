import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageOpen,
  PanelsTopLeft,
  ReceiptText,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";
import { signOut } from "@/app/admin/actions";

const groups = [
  {
    label: "Workspace",
    links: [
      ["/admin/overview", "Overview", LayoutDashboard],
      ["/admin/requests", "Requests", Bell],
      ["/admin/pipeline", "Pipeline", KanbanSquare],
    ],
  },
  {
    label: "Operations",
    links: [
      ["/admin/clients", "Clients", UsersRound],
      ["/admin/jobs", "Jobs", BriefcaseBusiness],
      ["/admin/tasks", "Tasks / Assets", ClipboardList],
    ],
  },
  {
    label: "Website",
    links: [
      ["/admin/website", "Website Elements", PanelsTopLeft],
      ["/admin/pricing", "Pricing", PackageOpen],
      ["/admin/analytics", "Analytics", BarChart3],
    ],
  },
  {
    label: "Business",
    links: [
      ["/admin/invoices", "Invoices", ReceiptText],
      ["/admin/finance", "Finance & Tax", CircleDollarSign],
    ],
  },
];

function Navigation() {
  return (
    <nav className="admin-nav" aria-label="CRM navigation">
      {groups.map((group) => (
        <div className="admin-nav-group" key={group.label}>
          <p>{group.label}</p>
          {group.links.map(([href, label, Icon]) => (
            <Link key={href as string} href={href as string}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label as string}</span>
              <ChevronRight className="nav-chevron" size={14} />
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({
  children,
  displayName,
  role,
  unread,
}: {
  children: React.ReactNode;
  displayName: string;
  role: string;
  unread: number;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-logo" href="/admin/overview">
          <Image src="/brand/logo-white.png" alt="TruShot Media" width={230} height={84} priority />
        </Link>
        <Navigation />
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
            <div><Navigation /></div>
          </details>
          <div className="admin-search"><Search size={17} /><span>Search workspace</span><kbd>⌘ K</kbd></div>
          <div className="topbar-actions">
            <Link href="/admin/requests" className="notification-button" aria-label={`${unread} unread notifications`}>
              <Bell size={18} />{unread > 0 && <span>{unread}</span>}
            </Link>
            <Link href="/admin/settings" aria-label="Settings"><Settings size={18} /></Link>
          </div>
        </header>
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
