"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";

export default function AdminRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page failed to render", error);
  }, [error]);

  return (
    <section className="admin-card admin-route-error" role="alert">
      <span className="admin-route-error-icon"><TriangleAlert size={22} /></span>
      <p className="eyebrow">Temporary loading issue</p>
      <h1>This page couldn’t load</h1>
      <p>Your CRM data is safe. Retry the page, or return to the overview while the connection recovers.</p>
      <div>
        <button type="button" onClick={reset}><RefreshCw size={15} /> Try again</button>
        <Link href="/admin/overview"><ArrowLeft size={15} /> Back to overview</Link>
      </div>
    </section>
  );
}
