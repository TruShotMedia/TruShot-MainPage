"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteInvoice } from "@/app/admin/actions";
import { SubmitButton } from "@/components/admin/submit-button";

export function InvoiceDeleteControl({ invoiceId, invoiceNumber }: { invoiceId: string; invoiceNumber: string }) {
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function remove(formData: FormData) {
    setErrorMessage("");
    try {
      await deleteInvoice(formData);
      setConfirming(false);
    } catch {
      setErrorMessage("The invoice could not be deleted. Refresh and try again.");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="invoice-delete-button"
        aria-label={`Delete ${invoiceNumber}`}
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={14} />
        Delete
      </button>
    );
  }

  return (
    <div className="invoice-delete-layer">
      <button type="button" className="row-editor-backdrop" aria-label={`Cancel deleting ${invoiceNumber}`} onClick={() => setConfirming(false)} />
      <section className="invoice-delete-dialog" role="dialog" aria-modal="true" aria-labelledby={`delete-${invoiceId}-title`}>
        <button type="button" className="popover-close-button" aria-label={`Close delete ${invoiceNumber}`} onClick={() => setConfirming(false)}><X size={16} /></button>
        <span className="invoice-delete-icon"><Trash2 size={20} /></span>
        <p className="card-label">Delete invoice</p>
        <h3 id={`delete-${invoiceId}-title`}>Delete {invoiceNumber} permanently?</h3>
        <p>This removes the invoice and its recorded payments and job allocations. This action cannot be undone.</p>
        {errorMessage ? <p className="popover-error" role="alert">{errorMessage}</p> : null}
        <div className="invoice-delete-actions">
          <button type="button" className="admin-secondary-button" onClick={() => setConfirming(false)}>Keep invoice</button>
          <form action={remove}>
            <input type="hidden" name="id" value={invoiceId} />
            <SubmitButton className="admin-primary-button danger-button" pendingLabel="Deleting…"><Trash2 size={14} /> Delete permanently</SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
