"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, BriefcaseBusiness, CalendarDays, CircleDollarSign, ClipboardList, FileText, Images, KanbanSquare, LayoutDashboard, PackageOpen, PanelsTopLeft, ReceiptText, Rocket, Search, Settings, UsersRound, X } from "lucide-react";
import type { GlobalSearchItem } from "@/lib/types";

const pageCommands = [
  ["Overview", "/admin/overview", LayoutDashboard], ["Requests", "/admin/requests", FileText],
  ["Pipeline", "/admin/pipeline", KanbanSquare], ["Calendar", "/admin/calendar", CalendarDays],
  ["Campaigns", "/admin/campaigns", Rocket], ["Clients", "/admin/clients", UsersRound],
  ["Jobs", "/admin/jobs", BriefcaseBusiness], ["Tasks / Assets", "/admin/tasks", ClipboardList],
  ["Website Elements", "/admin/website", PanelsTopLeft], ["Portfolio", "/admin/portfolio", Images],
  ["Pricing", "/admin/pricing", PackageOpen], ["Revenue Analytics", "/admin/analytics", BarChart3],
  ["Invoices", "/admin/invoices", ReceiptText], ["Finance & Tax", "/admin/finance", CircleDollarSign],
  ["Finance Reports", "/admin/finance/reports", FileText], ["Settings", "/admin/settings", Settings],
] as const;

const kindLabels: Record<GlobalSearchItem["kind"], string> = {
  client: "Client", job: "Job", task: "Task", invoice: "Invoice", campaign: "Campaign", request: "Request",
};

export function WorkspaceSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [items, setItems] = useState<GlobalSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadItems = useCallback(async () => {
    if (loading || loaded) return;
    setLoading(true);
    try {
      const response = await fetch("/api/admin/search", { cache: "no-store" });
      if (!response.ok) throw new Error("Search is unavailable");
      const payload = await response.json() as { items?: GlobalSearchItem[] };
      setItems(payload.items ?? []);
      setLoaded(true);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [loaded, loading]);

  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return items.slice(0, 7);
    return items
      .filter((item) => terms.every((term) => `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase().includes(term)))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 12);
  }, [items, query]);

  const commands = useMemo(() => {
    const lower = query.toLowerCase().trim();
    return pageCommands.filter(([label]) => !lower || label.toLowerCase().includes(lower)).slice(0, lower ? 5 : 7);
  }, [query]);
  const total = commands.length + results.length;

  const close = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    if (restoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const choose = useCallback((href: string) => {
    close({ restoreFocus: false });
    router.push(href);
  }, [close, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        void loadItems();
        return;
      }
      if (!open) return;
      if (event.key === "Escape") close();
      if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => total ? (index + 1) % total : 0); }
      if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => total ? (index - 1 + total) % total : 0); }
      if (event.key === "Enter") {
        event.preventDefault();
        const command = commands[activeIndex];
        const item = results[activeIndex - commands.length];
        if (command) choose(command[1]);
        else if (item) choose(item.href);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeIndex, choose, close, commands, loadItems, open, results, total]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className="admin-search" onPointerEnter={() => void loadItems()} onFocus={() => void loadItems()} onClick={() => { setOpen(true); void loadItems(); }} aria-haspopup="dialog">
        <Search size={17} /><span>Search clients, jobs, tasks, invoices…</span><kbd>⌘ K</kbd>
      </button>
      {open ? <div className="command-layer" role="presentation">
        <button className="command-backdrop" type="button" aria-label="Close workspace search" onClick={() => close()} />
        <section className="command-palette" role="dialog" aria-modal="true" aria-label="Search TruShot workspace">
          <div className="command-input-row">
            <Search size={19} />
            <input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }} placeholder="Search anything or jump to a page…" aria-label="Search workspace" />
            <button type="button" onClick={() => close()} aria-label="Close"><X size={17} /></button>
          </div>
          <div className="command-results" role="listbox">
            {commands.length ? <div className="command-group"><p>Go to</p>{commands.map(([label, href, Icon], index) => <button key={href} type="button" role="option" aria-selected={activeIndex === index} className={activeIndex === index ? "is-active" : undefined} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(href)}><span><Icon size={17} /></span><strong>{label}</strong><small>Page</small></button>)}</div> : null}
            {results.length ? <div className="command-group"><p>{query ? "Workspace matches" : "Recently updated"}</p>{results.map((item, index) => { const optionIndex = commands.length + index; return <button key={`${item.kind}-${item.id}`} type="button" role="option" aria-selected={activeIndex === optionIndex} className={activeIndex === optionIndex ? "is-active" : undefined} onMouseEnter={() => setActiveIndex(optionIndex)} onClick={() => choose(item.href)}><span>{kindLabels[item.kind].slice(0, 1)}</span><strong>{item.title}<small>{item.subtitle}</small></strong><em>{kindLabels[item.kind]}</em></button>; })}</div> : null}
            {!total ? <div className="command-empty">{loading ? <><span className="command-loader" /><strong>Searching the workspace…</strong></> : <><Search size={25} /><strong>No matching records</strong><span>Try a client name, invoice number, job, task, campaign or request.</span></>}</div> : null}
          </div>
          <footer><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span></footer>
        </section>
      </div> : null}
    </>
  );
}
