"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FileVideo, FolderPlus, ImageIcon, Images, LoaderCircle, Play, Trash2, Upload, X } from "lucide-react";
import { createPortfolioCategory, createPortfolioItems, deletePortfolioCategory, deletePortfolioItem } from "@/app/admin/actions";
import { uploadWebsiteMediaResumable } from "@/lib/resumable-upload";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioCategory, PortfolioItem } from "@/lib/types";
import { validateWebsiteMediaFile, WEBSITE_MEDIA_ACCEPT } from "@/lib/website-media";

const MAX_BATCH_FILES = 20;

function getFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PortfolioManager({ categories, workspaceId }: { categories: PortfolioCategory[]; workspaceId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const categoryFormRef = useRef<HTMLFormElement>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(categories[0]?.id ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const activeCategoryId = categories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : categories[0]?.id ?? "";

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    try {
      incoming.forEach(validateWebsiteMediaFile);
      const byKey = new Map(selectedFiles.map((file) => [getFileKey(file), file]));
      incoming.forEach((file) => byKey.set(getFileKey(file), file));
      const nextFiles = [...byKey.values()];
      if (nextFiles.length > MAX_BATCH_FILES) {
        throw new Error(`Upload up to ${MAX_BATCH_FILES} files at a time.`);
      }
      setSelectedFiles(nextFiles);
      setStatus("idle");
      setMessage("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Those files could not be added.");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function removeQueuedFile(file: File) {
    const key = getFileKey(file);
    setSelectedFiles((current) => current.filter((candidate) => getFileKey(candidate) !== key));
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategorySaving(true);
    setStatus("idle");
    setMessage("");
    try {
      const result = await createPortfolioCategory(new FormData(event.currentTarget));
      categoryFormRef.current?.reset();
      setSelectedCategoryId(result.id);
      setStatus("saved");
      setMessage("Category created. It is ready for media.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The category could not be created.");
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCategoryId) {
      setStatus("error");
      setMessage("Create and choose a category first.");
      return;
    }
    if (selectedFiles.length === 0) {
      setStatus("error");
      setMessage("Choose or drop at least one image or video.");
      return;
    }

    setStatus("saving");
    const supabase = createClient();
    const uploadedPaths: string[] = [];

    try {
      const uploadedItems = [];
      for (const [index, file] of selectedFiles.entries()) {
        setMessage(`Uploading ${index + 1} of ${selectedFiles.length} · 0% · ${file.name}`);
        const { kind, extension } = validateWebsiteMediaFile(file);
        const storagePath = `${workspaceId}/portfolio/${crypto.randomUUID()}.${extension}`;
        const uploaded = await uploadWebsiteMediaResumable({
          file,
          storagePath,
          cacheControl: "31536000",
          onProgress: ({ percentage }) => {
            setMessage(`Uploading ${index + 1} of ${selectedFiles.length} · ${percentage}% · ${file.name}`);
          },
        });

        uploadedPaths.push(storagePath);
        uploadedItems.push({ media_kind: kind, public_url: uploaded.publicUrl, storage_path: storagePath });
      }

      setMessage("Building the collection…");
      const formData = new FormData();
      formData.set("category_id", activeCategoryId);
      formData.set("items", JSON.stringify(uploadedItems));
      await createPortfolioItems(formData);

      setSelectedFiles([]);
      setStatus("saved");
      setMessage(`${uploadedItems.length} ${uploadedItems.length === 1 ? "file" : "files"} published to the portfolio.`);
      router.refresh();
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("website-media").remove(uploadedPaths);
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The media could not be uploaded.");
    }
  }

  async function handleDeleteItem(item: PortfolioItem) {
    if (!window.confirm(`Remove this ${item.media_kind}? This permanently deletes the uploaded file.`)) return;
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

  async function handleDeleteCategory(category: PortfolioCategory) {
    if (category.items.length > 0 || !window.confirm(`Remove the empty “${category.name}” category?`)) return;
    setDeletingId(category.id);
    setStatus("idle");
    setMessage("");
    try {
      await deletePortfolioCategory(category.id);
      if (activeCategoryId === category.id) setSelectedCategoryId("");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This category could not be removed.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalItems = categories.reduce((total, category) => total + category.items.length, 0);

  return (
    <>
      <section className="admin-card portfolio-category-builder">
        <div className="portfolio-upload-intro">
          <span><FolderPlus size={18} /></span>
          <div>
            <p className="card-label">Organise the work</p>
            <h2>Create a category</h2>
            <p>Use categories for clients, campaigns, services or any story you want to present as one collection.</p>
          </div>
        </div>
        <form ref={categoryFormRef} onSubmit={handleCreateCategory} className="portfolio-category-form">
          <div className="website-element-fields">
            <label>Category name<input name="name" minLength={2} maxLength={80} placeholder="e.g. Hospitality campaigns" required /></label>
            <label className="website-field-wide">Introduction <span>Optional</span><textarea name="description" maxLength={280} rows={3} placeholder="A short sentence that introduces this collection" /></label>
          </div>
          <button className="admin-primary-button" type="submit" disabled={categorySaving}>
            {categorySaving ? <LoaderCircle className="spin" size={14} /> : <FolderPlus size={14} />}
            {categorySaving ? "Creating…" : "Create category"}
          </button>
        </form>
      </section>

      <section className="admin-card portfolio-upload-panel">
        <div className="portfolio-upload-intro">
          <span><Upload size={18} /></span>
          <div>
            <p className="card-label">Batch upload</p>
            <h2>Add photos and videos</h2>
            <p>Choose up to {MAX_BATCH_FILES} files or drag them into the drop zone. Videos can be up to 200 MB and uploads resume through brief connection drops.</p>
          </div>
        </div>
        <form onSubmit={handleUpload} className="portfolio-upload-form">
          <div className="website-element-fields portfolio-category-select">
            <label>Upload to category
              <select value={activeCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={categories.length === 0} required>
                {categories.length === 0 ? <option value="">Create a category first</option> : categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
            </label>
          </div>

          <label
            className={`portfolio-dropzone ${isDragging ? "is-dragging" : ""} ${categories.length === 0 ? "is-disabled" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); if (categories.length > 0) setIsDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (categories.length > 0) addFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept={WEBSITE_MEDIA_ACCEPT}
              multiple
              disabled={categories.length === 0 || status === "saving"}
              onChange={(event) => event.target.files && addFiles(event.target.files)}
            />
            <span className="portfolio-dropzone-icon"><Upload size={22} /></span>
            <strong>{categories.length === 0 ? "Create a category to begin" : isDragging ? "Drop your files here" : "Drop photos and videos here"}</strong>
            <small>{categories.length === 0 ? "The upload area will unlock automatically." : "or click to browse · images up to 10 MB · videos up to 200 MB"}</small>
          </label>

          {selectedFiles.length > 0 && (
            <div className="portfolio-upload-queue" aria-label="Files ready to upload">
              <div className="portfolio-queue-heading"><span>{selectedFiles.length} selected</span><button type="button" onClick={() => setSelectedFiles([])}>Clear all</button></div>
              {selectedFiles.map((file) => {
                const { kind } = validateWebsiteMediaFile(file);
                return (
                  <div className="portfolio-queue-file" key={getFileKey(file)}>
                    <span>{kind === "video" ? <FileVideo size={15} /> : <ImageIcon size={15} />}</span>
                    <div><strong>{file.name}</strong><small>{kind} · {formatFileSize(file.size)}</small></div>
                    <button type="button" onClick={() => removeQueuedFile(file)} aria-label={`Remove ${file.name} from upload`}><X size={14} /></button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="website-element-actions">
            <p className={`website-save-status ${status}`} aria-live="polite">
              {status === "saving" && <LoaderCircle className="spin" size={14} />}
              {status === "saved" && <Check size={14} />}
              {message}
            </p>
            <button className="admin-primary-button" type="submit" disabled={status === "saving" || categories.length === 0 || selectedFiles.length === 0}>
              {status === "saving" ? "Publishing…" : selectedFiles.length > 0 ? `Publish ${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"}` : "Publish files"}
            </button>
          </div>
        </form>
      </section>

      {categories.length > 0 ? (
        <section className="portfolio-admin-categories" aria-label="Portfolio categories">
          <div className="portfolio-library-summary"><span><Images size={16} /> {categories.length} {categories.length === 1 ? "category" : "categories"}</span><span>{totalItems} {totalItems === 1 ? "piece" : "pieces"}</span></div>
          {categories.map((category, categoryIndex) => (
            <section className="admin-card portfolio-admin-category" key={category.id}>
              <header className="portfolio-admin-category-heading">
                <div><span>{String(categoryIndex + 1).padStart(2, "0")} · {category.items.length} {category.items.length === 1 ? "piece" : "pieces"}</span><h2>{category.name}</h2>{category.description && <p>{category.description}</p>}</div>
                <button
                  className="portfolio-remove-button"
                  type="button"
                  onClick={() => handleDeleteCategory(category)}
                  disabled={category.items.length > 0 || deletingId === category.id}
                  title={category.items.length > 0 ? "Remove this category’s media first" : "Remove category"}
                >
                  {deletingId === category.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                  Remove category
                </button>
              </header>

              {category.items.length > 0 ? (
                <div className="portfolio-admin-grid">
                  {category.items.map((item) => (
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
                        <small>{item.display_size} layout</small>
                        <button className="portfolio-remove-button" type="button" onClick={() => handleDeleteItem(item)} disabled={deletingId === item.id}>
                          {deletingId === item.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                          {deletingId === item.id ? "Removing…" : "Remove media"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="portfolio-category-empty"><ImageIcon size={18} /><p>No media yet. Choose this category above, then drop in your files.</p></div>
              )}
            </section>
          ))}
        </section>
      ) : (
        <section className="admin-card empty-state portfolio-empty-state">
          <span><FolderPlus size={21} /></span>
          <h3>Start with a category</h3>
          <p>Create your first collection above, then upload its photos and videos together.</p>
        </section>
      )}
    </>
  );
}
