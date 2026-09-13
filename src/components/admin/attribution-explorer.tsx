"use client";

import { useState } from "react";
import type { AttributionRow } from "@/lib/revenue-analytics";
import { formatCurrency } from "@/lib/format";

const dimensions = ["source", "campaign", "device", "package"] as const;

export function AttributionExplorer({ rows }: { rows: Record<(typeof dimensions)[number], AttributionRow[]> }) {
  const [dimension, setDimension] = useState<(typeof dimensions)[number]>("source");
  const activeRows = rows[dimension];
  return <section className="admin-card attribution-card">
    <div className="card-heading"><div><p>Acquisition economics</p><h2>Attribution explorer</h2></div><div className="attribution-tabs" role="tablist" aria-label="Attribution dimension">{dimensions.map((item) => <button key={item} type="button" role="tab" aria-selected={dimension === item} className={dimension === item ? "is-active" : undefined} onClick={() => setDimension(item)}>{item}</button>)}</div></div>
    {activeRows.length ? <div className="admin-table-wrap"><table className="admin-table attribution-table"><thead><tr><th>{dimension}</th><th>Leads</th><th>Approved</th><th>Lead → client</th><th>Invoiced</th><th>Paid</th><th>Spend</th><th>Cost / lead</th></tr></thead><tbody>{activeRows.map((row) => <tr key={row.label}><td><strong>{row.label}</strong></td><td>{row.leads}</td><td>{row.approved}</td><td>{row.leads ? `${Math.round(row.approved / row.leads * 100)}%` : "—"}</td><td>{formatCurrency(row.invoicedCents)}</td><td>{formatCurrency(row.paidCents)}</td><td>{dimension === "source" || dimension === "campaign" ? formatCurrency(row.spendCents) : "—"}</td><td>{row.costPerLeadCents === null ? <span className="cpl-ready">Ready</span> : formatCurrency(row.costPerLeadCents)}</td></tr>)}</tbody></table></div> : <div className="expense-empty"><p>No attributed enquiries in this period.</p><span>New website enquiries will carry their source, campaign, device and selected package.</span></div>}
    <footer><span><i /> Cost-per-lead becomes active whenever marketing spend is recorded against a matching source or campaign.</span></footer>
  </section>;
}
