"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Images,
  KanbanSquare,
  LayoutDashboard,
  LoaderCircle,
  PackageOpen,
  PanelsTopLeft,
  ReceiptText,
  UsersRound,
} from "lucide-react";

const groups = [
  { label: "Workspace", links: [["/admin/overview", "Overview", LayoutDashboard], ["/admin/requests", "Requests", Bell], ["/admin/pipeline", "Pipeline", KanbanSquare]] },
  { label: "Operations", links: [["/admin/clients", "Clients", UsersRound], ["/admin/jobs", "Jobs", BriefcaseBusiness], ["/admin/tasks", "Tasks / Assets", ClipboardList]] },
  { label: "Website", links: [["/admin/website", "Website Elements", PanelsTopLeft], ["/admin/portfolio", "Portfolio", Images], ["/admin/pricing", "Pricing", PackageOpen], ["/admin/analytics", "Analytics", BarChart3]] },
  { label: "Business", links: [["/admin/invoices", "Invoices", ReceiptText], ["/admin/finance", "Finance & Tax", CircleDollarSign]] },
] as const;

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <LoaderCircle className="nav-pending" size={14} aria-label="Loading page" /> : <ChevronRight className="nav-chevron" size={14} />;
}

export function AdminNavigation() {
  const pathname = usePathname();
  return <nav className="admin-nav" aria-label="CRM navigation">
    {groups.map((group) => <div className="admin-nav-group" key={group.label}>
      <p>{group.label}</p>
      {group.links.map(([href, label, Icon]) => <Link key={href} href={href} className={pathname === href ? "is-active" : undefined}>
        <Icon size={17} strokeWidth={1.8} /><span>{label}</span><PendingIndicator />
      </Link>)}
    </div>)}
  </nav>;
}
