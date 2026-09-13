"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Camera, FileText, LoaderCircle, Plus, ScanLine, Upload, X } from "lucide-react";
import { createExpense } from "@/app/admin/actions";
import { todayDateInput } from "@/lib/format";
import { parseReceiptText, type ReceiptExtraction } from "@/lib/receipt-ocr";
import { uploadSupabaseFileResumable } from "@/lib/resumable-upload";
import { createClient } from "@/lib/supabase/client";

const RECEIPT_BUCKET = "website-expense-receipts";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const MAX_RECEIPT_BYTES = 20 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

type Option = { id: string; name?: string; title?: string };

function safeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  return `${crypto.randomUUID()}${extension}`;
}

export function ExpenseCapture({ categories, clients, jobs, campaigns }: { categories: Option[]; clients: Option[]; jobs: Option[]; campaigns: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState({ vendor: "", incurred_on: todayDateInput(), amount_dollars: "", gst_credit_dollars: "" });

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !submitting) setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting]);

  function selectFile(selected: File | null) {
    setError("");
    setExtraction(null);
    if (!selected) { setFile(null); setPreviewUrl(null); return; }
    if (!allowedTypes.has(selected.type)) { setError("Use a JPG, PNG, WebP, HEIC or PDF receipt."); return; }
    if (selected.size > MAX_RECEIPT_BYTES) { setError("Receipts can be up to 20 MB."); return; }
    setFile(selected);
    setPreviewUrl(selected.type.startsWith("image/") ? URL.createObjectURL(selected) : null);
  }

  async function scanReceipt() {
    if (!file?.type.startsWith("image/")) return;
    setError("");
    setOcrProgress(0);
    let worker: Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>> | null = null;
    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("eng", undefined, {
        logger: (message) => {
          if (typeof message.progress === "number") setOcrProgress(Math.round(message.progress * 100));
        },
      });
      const result = await worker.recognize(file);
      const detected = parseReceiptText(result.data.text);
      setExtraction(detected);
      setFields((current) => ({
        vendor: detected.vendor ?? current.vendor,
        incurred_on: detected.date ?? current.incurred_on,
        amount_dollars: detected.amountDollars?.toFixed(2) ?? current.amount_dollars,
        gst_credit_dollars: detected.gstDollars?.toFixed(2) ?? current.gst_credit_dollars,
      }));
    } catch {
      setError("The receipt could not be read automatically. You can still enter the details manually.");
    } finally {
      if (worker) await worker.terminate();
      setOcrProgress(null);
    }
  }

  function resetAndClose() {
    setOpen(false);
    setFile(null);
    setPreviewUrl(null);
    setExtraction(null);
    setError("");
    setUploadProgress(null);
    setFields({ vendor: "", incurred_on: todayDateInput(), amount_dollars: "", gst_credit_dollars: "" });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const expenseId = crypto.randomUUID();
    let receiptPath = "";
    try {
      if (file) {
        receiptPath = `${WORKSPACE_ID}/expenses/${expenseId}/${safeFileName(file.name)}`;
        await uploadSupabaseFileResumable({ file, storagePath: receiptPath, bucketName: RECEIPT_BUCKET, cacheControl: "3600", onProgress: ({ percentage }) => setUploadProgress(percentage) });
      }
      const formData = new FormData(event.currentTarget);
      formData.set("id", expenseId);
      formData.set("receipt_path", receiptPath);
      formData.set("receipt_file_name", file?.name ?? "");
      formData.set("receipt_mime_type", file?.type ?? "");
      formData.set("receipt_size_bytes", String(file?.size ?? 0));
      formData.set("receipt_extraction", JSON.stringify(extraction ? { method: "tesseract_local", ...extraction, detected_at: new Date().toISOString() } : {}));
      await createExpense(formData);
      resetAndClose();
      router.refresh();
    } catch (caught) {
      if (receiptPath) await createClient().storage.from(RECEIPT_BUCKET).remove([receiptPath]);
      setError(caught instanceof Error ? caught.message : "The expense could not be saved.");
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  }

  return (
    <>
      <button type="button" className="admin-primary-button" onClick={() => setOpen(true)}><Plus size={16} /> Add expense</button>
      {open ? <div className="expense-modal-layer">
        <button type="button" className="expense-modal-backdrop" aria-label="Close expense capture" onClick={() => !submitting && resetAndClose()} />
        <form className="expense-modal" role="dialog" aria-modal="true" aria-label="Capture an expense" onSubmit={submit}>
          <header><div><p className="card-label">Finance capture</p><h2>Record an expense</h2></div><button type="button" onClick={resetAndClose} disabled={submitting} aria-label="Close"><X size={19} /></button></header>
          <div className="expense-modal-body">
            <section className="receipt-capture-panel">
              <div className="receipt-preview">
                {previewUrl ? <Image src={previewUrl} alt="Selected receipt preview" fill sizes="360px" unoptimized /> : file?.type === "application/pdf" ? <FileText size={42} /> : <Camera size={42} />}
                {file ? <span>{file.name}</span> : <><strong>Add a receipt</strong><small>Take a photo or choose an image/PDF · up to 20 MB</small></>}
              </div>
              <div className="receipt-buttons">
                <label className="admin-secondary-button"><Camera size={15} /> Capture<input type="file" accept="image/*" capture="environment" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} /></label>
                <label className="admin-secondary-button"><Upload size={15} /> Browse<input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" onChange={(event) => selectFile(event.target.files?.[0] ?? null)} /></label>
              </div>
              {file?.type.startsWith("image/") ? <button type="button" className="receipt-scan-button" onClick={scanReceipt} disabled={ocrProgress !== null || submitting}>{ocrProgress !== null ? <><LoaderCircle className="spin" size={16} /> Reading receipt · {ocrProgress}%</> : <><ScanLine size={16} /> Auto-read receipt</>}</button> : null}
              <p className="receipt-privacy">Text recognition runs on this device. Always check suggested totals and GST before saving.</p>
            </section>
            <section className="quick-form expense-fields">
              <label>Vendor<input name="vendor" required maxLength={160} value={fields.vendor} onChange={(event) => setFields({ ...fields, vendor: event.target.value })} /></label>
              <label>Date<input name="incurred_on" type="date" required value={fields.incurred_on} onChange={(event) => setFields({ ...fields, incurred_on: event.target.value })} /></label>
              <label>Amount AUD<input name="amount_dollars" type="number" min="0" step="0.01" required value={fields.amount_dollars} onChange={(event) => setFields({ ...fields, amount_dollars: event.target.value })} /></label>
              <label>GST credit AUD<input name="gst_credit_dollars" type="number" min="0" step="0.01" required value={fields.gst_credit_dollars} onChange={(event) => setFields({ ...fields, gst_credit_dollars: event.target.value })} /></label>
              <label>Category<select name="category_id" defaultValue=""><option value="">Uncategorised</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Deductible %<input name="deductible_percent" type="number" min="0" max="100" step="1" defaultValue="100" required /></label>
              <label>Client<select name="client_id" defaultValue=""><option value="">No direct client</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Job<select name="job_id" defaultValue=""><option value="">No linked job</option>{jobs.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <label>Campaign<select name="campaign_id" defaultValue=""><option value="">No linked campaign</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
              <label className="form-span">Description<input name="description" maxLength={500} placeholder="What was this purchase for?" /></label>
              {extraction ? <p className={`receipt-detection ${extraction.confidence}`}>Suggested from receipt · {extraction.confidence} confidence. Please verify each figure.</p> : null}
            </section>
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer><button type="button" className="admin-secondary-button" onClick={resetAndClose} disabled={submitting}>Cancel</button><button type="submit" className="admin-primary-button" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={16} /> {uploadProgress !== null ? `Uploading · ${uploadProgress}%` : "Saving…"}</> : "Save expense"}</button></footer>
        </form>
      </div> : null}
    </>
  );
}
