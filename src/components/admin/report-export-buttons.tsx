"use client";

import { Download, Printer } from "lucide-react";

type ReportRow = Record<string, string | number | null>;

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function ReportExportButtons({ rows, fileName }: { rows: ReportRow[]; fileName: string }) {
  function download() {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <div className="report-export-actions"><button type="button" className="admin-secondary-button" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</button><button type="button" className="admin-primary-button" onClick={download} disabled={!rows.length}><Download size={15} /> Export CSV</button></div>;
}
