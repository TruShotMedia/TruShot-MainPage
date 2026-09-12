"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export function MobileAdminMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenu();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [closeMenu, isOpen]);

  return (
    <div className={`mobile-admin-menu${isOpen ? " is-open" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        className="mobile-admin-menu-trigger"
        aria-controls="mobile-admin-navigation"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? <X size={21} /> : <Menu size={21} />}
        <span>{isOpen ? "Close" : "Menu"}</span>
      </button>

      <button
        type="button"
        className="mobile-admin-menu-backdrop"
        aria-label="Close navigation menu"
        tabIndex={isOpen ? 0 : -1}
        onClick={closeMenu}
      />

      <div
        id="mobile-admin-navigation"
        className="mobile-admin-menu-panel"
        aria-hidden={!isOpen}
        inert={!isOpen}
      >
        <AdminNavigation onNavigate={closeMenu} />
      </div>
    </div>
  );
}
