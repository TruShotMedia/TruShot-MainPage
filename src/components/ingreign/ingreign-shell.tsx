"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BellRing, CalendarDays, Captions, ImagePlus, LogOut, Menu, X } from "lucide-react";
import { signOutOfIngreign } from "@/app/ingreign/actions";

const links = [
  { href: "/ingreign", label: "Calendar", Icon: CalendarDays },
  { href: "/ingreign/captions", label: "Captions", Icon: Captions },
  { href: "/ingreign/generator", label: "Post generator", Icon: ImagePlus },
  { href: "/ingreign/notifications", label: "Notifications", Icon: BellRing },
];

export function IngreignShell({ children, displayName }: { children: React.ReactNode; displayName: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  return (
    <div className="ingreign-app-shell">
      <header className="ingreign-topbar">
        <Link href="/ingreign" className="ingreign-brand" aria-label="INGREIGN calendar">
          <Image src="/ingreign/ingreign-header-mark.png" alt="INGREIGN" width={512} height={512} priority />
        </Link>
        <nav className="ingreign-desktop-nav" aria-label="INGREIGN navigation">
          {links.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={pathname === href ? "is-active" : undefined}>
              <Icon size={17} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ingreign-account">
          <span>{displayName}</span>
          <form action={signOutOfIngreign}><button type="submit" aria-label="Sign out"><LogOut size={17} /></button></form>
        </div>
        <button className="ingreign-menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-controls="ingreign-mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <button className={`ingreign-menu-backdrop ${menuOpen ? "is-open" : ""}`} type="button" aria-label="Close navigation" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
      <aside id="ingreign-mobile-menu" className={`ingreign-mobile-menu ${menuOpen ? "is-open" : ""}`} aria-hidden={!menuOpen}>
        <div>
          <span>INGREIGN workspace</span>
          <strong>{displayName}</strong>
        </div>
        <nav aria-label="Mobile INGREIGN navigation">
          {links.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={pathname === href ? "is-active" : undefined}>
              <Icon size={18} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <form action={signOutOfIngreign}><button type="submit"><LogOut size={17} /> Sign out</button></form>
      </aside>

      <main className="ingreign-main">{children}</main>
    </div>
  );
}

