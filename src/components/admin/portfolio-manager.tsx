"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, ImageIcon, LoaderCircle, Play, Trash2, Upload } from "lucide-react";
import { createPortfolioItem, deletePortfolioItem } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioItem } from "@/lib/types";
import { validateWebsiteMediaFile, WEBSITE_MEDIA_ACCEPT } from "@/lib/website-media";

export function PortfolioManager({ items, workspaceId }: { items: PortfolioItem[]; workspaceId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (!file) {
      setStatus("error");
      setMessage("Choose an image or video to add.");
      return;
    }

    setStatus("saving");
    setMessage(`Uploading ${file.name}…`);
    let uploadedPath = "";
    const formData = new FormData(event.currentTarget);

    try {
      const { kind, extension } = validateWebsiteMediaFile(file);
      const supabase = createClient();
      uploadedPath = `${workspaceId}/portfolio/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from("website-media").upload(uploadedPath, file, {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from("website-media").getPublicUrl(uploadedPath);
      formData.set("media_kind", kind);
      formData.set("public_url", data.publicUrl);
      formData.set("storage_path", uploadedPath);
      await createPortfolioItem(formData);

      formRef.current?.reset();
      setSelectedFileName("");
      setStatus("saved");
      setMessage("Media added to the private portfolio link.");
      router.refresh();
    } catch (error) {
      if (uploadedPath) {
        await createClient().storage.from("website-media").remove([uploadedPath]);
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This portfolio item could not be added.");
    }
  }

  async function handleDelete(item: PortfolioItem) {
    if (!window.confirm(`Remove ${item.title || "this portfolio item"}? This permanently deletes the uploaded file.`)) return;
    setDeletingId(item.id);
    setStatus("idle");
    setMessage("");
    try {
      await deletePortfolioItem(item.id);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This portfolio item could not be removed.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="admin-card portfolio-upload-panel">
        <div className="portfolio-upload-intro">
          <span><Upload size={18} /></span>
          <div>
            <p className="card-label">Add work</p>
            <h2>Upload portfolio media</h2>
            <p>Videos lead the collection automatically. Choose a tile shape to compose the rest of the editorial grid.</p>
          </div>
        </div>
        <form ref={formRef} onSubmit={handleUpload} className="portfolio-upload-form">
          <div className="website-element-fields">
            <label>Title <span>Optional</span><input name="title" minLength={2} maxLength={120} placeholder="Campaign or client name" /></label>
            <label>Tile shape<select name="display_size" defaultValue="standard"><option value="standard">Standard portrait</option><option value="wide">Wide landscape</option><option value="tall">Tall feature</option></select></label>
            <label className="website-field-wide">Media description<input name="alt_text" minLength={3} maxLength={180} placeholder="Describe what is shown for accessibility" required /></label>
            <label className="website-field-wide">Caption <span>Optional</span><textarea name="caption" maxLength={280} rows={3} placeholder="A short line about the idea, outcome or production" /></label>
          </div>
          <div className="portfolio-file-row">
            <label className="website-upload-button">
              <Upload size={15} /> Choose image or video
              <input ref={fileInput} type="file" accept={WEBSITE_MEDIA_ACCEPT} onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} required />
            </label>
            <span>{selectedFileName || "JPG, PNG, WebP, AVIF · MP4, MOV, WebM"}</span>
          </div>
          <div className="website-element-actions">
            <p className={`website-save-status ${status}`} aria-live="polite">
              {status === "saving" && <LoaderCircle className="spin" size={14} />}
              {status === "saved" && <Check size={14} />}
              {message}
            </p>
            <button className="admin-primary-button" type="submit" disabled={status === "saving"}>{status === "saving" ? "Publishing…" : "Add to portfolio"}</button>
          </div>
        </form>
      </section>

      {items.length > 0 ? (
        <section className="portfolio-admin-grid" aria-label="Current portfolio media">
          {items.map((item) => (
            <article className="portfolio-admin-card" key={item.id}>
              <div className="portfolio-admin-preview">
                {item.media_kind === "image" ? (
                  <Image src={item.public_url} alt={item.alt_text} fill sizes="(max-width: 850px) 100vw, 33vw" />
                ) : (
                  <video src={item.public_url} muted playsInline controls preload="metadata" aria-label={item.alt_text} />
                )}
                <span className="website-media-badge">{item.media_kind === "video" ? <Play size={12} /> : <ImageIcon size={12} />}{item.media_kind}</span>
              </div>
              <div className="portfolio-admin-copy">
                <div><small>{item.display_size} tile</small><h2>{item.title || "Untitled work"}</h2></div>
                {item.caption && <p>{item.caption}</p>}
                <button className="portfolio-remove-button" type="button" onClick={() => handleDelete(item)} disabled={deletingId === item.id}>
                  {deletingId === item.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                  {deletingId === item.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="admin-card empty-state portfolio-empty-state">
          <span><ImageIcon size={21} /></span>
          <h3>Your collection is ready to curate</h3>
          <p>Add your first image or video above. It will publish immediately to the private portfolio link.</p>
        </section>
      )}
    </>
  );
}
