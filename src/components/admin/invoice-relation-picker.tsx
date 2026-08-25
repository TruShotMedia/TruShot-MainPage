"use client";

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";
import { Check, Link2, LockKeyhole, Search, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { InvoiceOption, JobInvoiceRelation } from "@/lib/types";

function invoiceSearchText(invoice: InvoiceOption) {
  return [invoice.invoice_number, invoice.client_name, invoice.status, invoice.issue_date]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function invoiceStatusLabel(status: string) {
  return status.replaceAll("_", " ");
}

export function InvoiceSearchPicker({
  invoices,
  selectedId,
  onSelect,
  excludedIds = [],
  label = "Search invoices",
  placeholder = "Search invoice or client…",
  compact = false,
  disabled = false,
}: {
  invoices: InvoiceOption[];
  selectedId: string;
  onSelect: (invoiceId: string) => void;
  excludedIds?: string[];
  label?: string;
  placeholder?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const listboxId = useId();
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedId) ?? null;
  const [query, setQuery] = useState(() => selectedInvoice?.invoice_number ?? "");
  const [open, setOpen] = useState(false);
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return invoices
      .filter((invoice) => !excluded.has(invoice.id) || invoice.id === selectedId)
      .filter((invoice) => !normalizedQuery || invoiceSearchText(invoice).includes(normalizedQuery))
      .slice(0, 8);
  }, [excluded, invoices, query, selectedId]);

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div className={`invoice-search-picker ${compact ? "is-compact" : ""}`} onBlur={closeWhenFocusLeaves}>
      <div className="invoice-search-control">
        <Search size={compact ? 15 : 16} aria-hidden="true" />
        <input
          value={query}
          type="search"
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (selectedId) onSelect("");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && open && matches.length === 1) {
              event.preventDefault();
              onSelect(matches[0].id);
              setQuery(matches[0].invoice_number);
              setOpen(false);
            }
          }}
        />
        {selectedInvoice ? <Check className="invoice-search-confirmed" size={16} aria-hidden="true" /> : null}
      </div>
      {open ? (
        <div id={listboxId} className="invoice-search-results" role="listbox" aria-label="Matching invoices">
          {matches.length ? matches.map((invoice) => (
            <button
              key={invoice.id}
              type="button"
              role="option"
              aria-selected={invoice.id === selectedId}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect(invoice.id);
                setQuery(invoice.invoice_number);
                setOpen(false);
              }}
            >
              <span><strong>{invoice.invoice_number}</strong><small>{invoice.client_name ?? "No client"} · {formatDate(invoice.issue_date)}</small></span>
              <span><strong>{formatCurrency(invoice.total_cents)}</strong><small>{invoiceStatusLabel(invoice.status)}</small></span>
            </button>
          )) : <p>No matching invoices.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function JobInvoiceRelationsField({
  invoices,
  relations,
}: {
  invoices: InvoiceOption[];
  relations: JobInvoiceRelation[];
}) {
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const [selectedIds, setSelectedIds] = useState(() => relations.map((relation) => relation.id));
  const [candidateId, setCandidateId] = useState("");
  const selectedInvoices = selectedIds.flatMap((invoiceId) => {
    const invoice = invoices.find((option) => option.id === invoiceId);
    return invoice ? [invoice] : [];
  });

  useEffect(() => {
    const form = fieldsetRef.current?.closest("form");
    if (!form) return;
    const resetRelations = () => {
      setSelectedIds(relations.map((relation) => relation.id));
      setCandidateId("");
    };
    form.addEventListener("reset", resetRelations);
    return () => form.removeEventListener("reset", resetRelations);
  }, [relations]);

  function addCandidate() {
    if (!candidateId || selectedIds.includes(candidateId)) return;
    setSelectedIds((current) => [...current, candidateId]);
    setCandidateId("");
  }

  return (
    <fieldset ref={fieldsetRef} className="job-invoice-relations form-span">
      <legend>Related invoices</legend>
      {selectedIds.map((invoiceId) => <input key={invoiceId} type="hidden" name="invoice_ids" value={invoiceId} />)}
      <div className="job-invoice-relation-list">
        {selectedInvoices.length ? selectedInvoices.map((invoice) => {
          const locked = relations.find((relation) => relation.id === invoice.id)?.is_locked ?? false;
          return (
            <span className="job-invoice-relation" key={invoice.id}>
              <Link2 size={14} aria-hidden="true" />
              <span><strong>{invoice.invoice_number}</strong><small>{invoice.client_name ?? "No client"} · {formatCurrency(invoice.total_cents)}</small></span>
              {locked ? (
                <LockKeyhole size={14} aria-label="Locked allocation" />
              ) : (
                <button type="button" aria-label={`Remove ${invoice.invoice_number}`} onClick={() => setSelectedIds((current) => current.filter((id) => id !== invoice.id))}>
                  <X size={14} aria-hidden="true" />
                </button>
              )}
            </span>
          );
        }) : <p>No invoice linked yet.</p>}
      </div>
      <div className="job-invoice-add-row">
        <InvoiceSearchPicker
          key={candidateId || "job-invoice-empty"}
          invoices={invoices}
          selectedId={candidateId}
          onSelect={setCandidateId}
          excludedIds={selectedIds}
          label="Search invoice to relate to this job"
        />
        <button type="button" className="admin-secondary-button" disabled={!candidateId} onClick={addCandidate}>Add invoice</button>
      </div>
      <small>Invoice value will be allocated from the hours across every related job.</small>
    </fieldset>
  );
}
