"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { rectSortingStrategy, sortableKeyboardCoordinates, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FileVideo, FolderPlus, GripVertical, ImageIcon, ImagePlus, Images, LoaderCircle, Pencil, Play, Trash2, Upload, X } from "lucide-react";
import { createPortfolioCategory, createPortfolioItems, deletePortfolioCategory, deletePortfolioItem, movePortfolioItemToCategory, removePortfolioCategoryLogo, reorderPortfolioCategories, reorderPortfolioItems, savePortfolioCategoryLogo, savePortfolioVideoPoster, updatePortfolioCategory } from "@/app/admin/actions";
import { ActionPopover } from "@/components/admin/action-popover";
import { SubmitButton } from "@/components/admin/submit-button";
import { getImageDimensions } from "@/lib/media-dimensions";
import { getPortfolioDisplaySizeFromDimensions, movePortfolioCategory, movePortfolioItem, movePortfolioItemBetweenCategories } from "@/lib/portfolio";
import { uploadWebsiteMediaResumable } from "@/lib/resumable-upload";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioCategory, PortfolioItem } from "@/lib/types";
import { createVideoPoster, createVideoPosterWithDimensions } from "@/lib/video-poster";
import { validateWebsiteMediaFile, WEBSITE_MEDIA_ACCEPT } from "@/lib/website-media";

const MAX_BATCH_FILES = 20;
const MAX_CATEGORY_LOGO_SIZE = 10 * 1024 * 1024;
const CATEGORY_LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
const CATEGORY_DRAG_PREFIX = "portfolio-category:";
const CATEGORY_DROP_PREFIX = "portfolio-category-drop:";

function getCategoryDragId(categoryId: string) {
  return `${CATEGORY_DRAG_PREFIX}${categoryId}`;
}

function getCategoryIdFromDragId(dragId: string) {
  return dragId.startsWith(CATEGORY_DRAG_PREFIX) ? dragId.slice(CATEGORY_DRAG_PREFIX.length) : dragId;
}

function getCategoryDropId(categoryId: string) {
  return `${CATEGORY_DROP_PREFIX}${categoryId}`;
}

function getCategoryIdFromDropId(dropId: string) {
  return dropId.startsWith(CATEGORY_DROP_PREFIX) ? dropId.slice(CATEGORY_DROP_PREFIX.length) : null;
}

const portfolioCollisionDetection: CollisionDetection = (args) => {
  const draggingCategory = String(args.active.id).startsWith(CATEGORY_DRAG_PREFIX);
  const droppableContainers = args.droppableContainers.filter((container) => (
    String(container.id).startsWith(CATEGORY_DRAG_PREFIX) === draggingCategory
  ));
  return closestCenter({ ...args, droppableContainers });
};

type DeleteRequest = {
  id: string;
  kind: "category" | "item";
};

type LogoFeedback = {
  categoryId: string;
  status: "saving" | "saved" | "error";
  message: string;
};

function getCategoryLogoExtension(file: File) {
  if (file.size === 0) throw new Error("That logo file is empty.");
  if (file.size > MAX_CATEGORY_LOGO_SIZE) throw new Error("Category logos can be up to 10 MB.");
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  throw new Error("Choose a PNG, JPG or WebP logo.");
}

type RemoveControlsProps = {
  confirming: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  isDeleting: boolean;
  label: string;
  onCancel: () => void;
  onConfirm: () => void;
  onRequest: () => void;
};

function RemoveControls({ confirming, disabled = false, disabledTitle, isDeleting, label, onCancel, onConfirm, onRequest }: RemoveControlsProps) {
  if (!confirming) {
    return (
      <button
        className="portfolio-remove-button"
        type="button"
        onClick={onRequest}
        disabled={disabled || isDeleting}
        title={disabledTitle}
      >
        {isDeleting ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
        {isDeleting ? "Removing…" : label}
      </button>
    );
  }

  return (
    <div className="portfolio-delete-confirmation" role="group" aria-label={`Confirm ${label.toLowerCase()}`}>
      <span>Delete permanently?</span>
      <button type="button" className="portfolio-delete-cancel" onClick={onCancel} disabled={isDeleting}>Keep</button>
      <button type="button" className="portfolio-delete-confirm" onClick={onConfirm} disabled={isDeleting} autoFocus>
        {isDeleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}

function SortablePortfolioCard({
  item,
  confirmingDelete,
  disabled,
  isDeleting,
  isBuildingPoster,
  onCancelDelete,
  onBuildPoster,
  onConfirmDelete,
  onRequestDelete,
}: {
  item: PortfolioItem;
  confirmingDelete: boolean;
  disabled: boolean;
  isDeleting: boolean;
  isBuildingPoster: boolean;
  onCancelDelete: () => void;
  onBuildPoster: () => void;
  onConfirmDelete: () => void;
  onRequestDelete: () => void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    data: { type: "portfolio-item", categoryId: item.category_id },
    disabled,
  });

  return (
    <article
      ref={setNodeRef}
      className={`portfolio-admin-card ${isDragging ? "is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 3 : undefined }}
      aria-busy={isDeleting}
    >
      <div className={`portfolio-admin-preview portfolio-admin-preview-${item.display_size}`}>
        {item.media_kind === "image" ? (
          <Image src={item.public_url} alt={item.alt_text} fill sizes="(max-width: 850px) 100vw, 33vw" />
        ) : (
          <video src={item.public_url} poster={item.poster_url ?? undefined} muted playsInline controls preload="metadata" aria-label={item.alt_text} />
        )}
        <span className="website-media-badge">{item.media_kind === "video" ? <Play size={12} /> : <ImageIcon size={12} />}{item.media_kind}</span>
      </div>
      <div className="portfolio-admin-copy">
        <small>{item.display_size} layout</small>
        <div className="portfolio-admin-card-controls">
          {item.media_kind === "video" ? (
            <button
              className="portfolio-poster-button"
              type="button"
              onClick={onBuildPoster}
              disabled={disabled || isBuildingPoster}
              title={item.poster_url ? "Replace this video's thumbnail" : "Create a thumbnail from this video"}
            >
              {isBuildingPoster ? <LoaderCircle className="spin" size={14} /> : <ImagePlus size={14} />}
              {isBuildingPoster ? "Building…" : item.poster_url ? "Regenerate thumbnail" : "Create thumbnail"}
            </button>
          ) : null}
          <button
            className="portfolio-order-handle"
            type="button"
            aria-label={`Move ${item.media_kind}`}
            title="Drag to change display order"
            disabled={disabled}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
            Move
          </button>
          <RemoveControls
            confirming={confirmingDelete}
            isDeleting={isDeleting}
            label="Remove media"
            onCancel={onCancelDelete}
            onConfirm={onConfirmDelete}
            onRequest={onRequestDelete}
          />
        </div>
      </div>
    </article>
  );
}

function PortfolioCategoryDropTarget({ category, children }: { category: PortfolioCategory; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({
    id: getCategoryDropId(category.id),
    data: { type: "portfolio-category-drop", categoryId: category.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${category.items.length > 0 ? "portfolio-admin-grid" : "portfolio-category-empty"} portfolio-category-drop-target ${isOver ? "is-over" : ""}`}
      aria-label={`Drop media into ${category.name}`}
    >
      {children}
    </div>
  );
}

function CategoryLogoControl({
  category,
  disabled,
  feedback,
  onRemove,
  onUpload,
}: {
  category: PortfolioCategory;
  disabled: boolean;
  feedback: LogoFeedback | null;
  onRemove: () => void;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="portfolio-category-logo-control">
      <div className={`portfolio-category-logo-preview ${category.logo_url ? "has-logo" : ""}`}>
        {category.logo_url ? (
          <Image src={category.logo_url} alt={`${category.name} logo`} fill sizes="96px" />
        ) : (
          <ImageIcon size={20} aria-hidden="true" />
        )}
      </div>
      <div className="portfolio-category-logo-copy">
        <strong>Category logo</strong>
        <small>Optional · appears in the scrolling logo banner beneath Selected work</small>
        {feedback ? <p className={feedback.status} role="status" aria-live="polite">{feedback.status === "saving" ? <LoaderCircle className="spin" size={12} /> : feedback.status === "saved" ? <Check size={12} /> : null}{feedback.message}</p> : null}
      </div>
      <div className="portfolio-category-logo-actions">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={CATEGORY_LOGO_ACCEPT}
          aria-label={`Choose a logo for ${category.name}`}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onUpload(file);
          }}
        />
        <button type="button" className="portfolio-category-logo-button" onClick={() => inputRef.current?.click()} disabled={disabled}>
          {disabled ? <LoaderCircle className="spin" size={14} /> : <ImagePlus size={14} />}
          {category.logo_url ? "Replace logo" : "Add logo"}
        </button>
        {category.logo_url ? (
          <button type="button" className="portfolio-category-logo-remove" onClick={onRemove} disabled={disabled} aria-label={`Remove ${category.name} logo`}>
            <Trash2 size={14} /> Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SortableCategoryOrderRow({
  category,
  index,
  disabled,
}: {
  category: PortfolioCategory;
  index: number;
  disabled: boolean;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: getCategoryDragId(category.id),
    data: { type: "portfolio-category", categoryId: category.id },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`portfolio-category-order-row ${isDragging ? "is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 4 : undefined }}
    >
      <button
        className="portfolio-category-order-handle"
        type="button"
        aria-label={`Move ${category.name} category`}
        title="Drag to change category order"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      <span>{String(index + 1).padStart(2, "0")}</span>
      <div><strong>{category.name}</strong><small>{category.items.length} {category.items.length === 1 ? "piece" : "pieces"}</small></div>
    </div>
  );
}

function PortfolioAdminCategory({
  category,
  categoryIndex,
  children,
  confirmingDelete,
  isDeleting,
  isSavingLogo,
  itemOrderFeedback,
  logoFeedback,
  onCancelDelete,
  onConfirmDelete,
  onLogoRemove,
  onLogoUpload,
  onRequestDelete,
}: {
  category: PortfolioCategory;
  categoryIndex: number;
  children: ReactNode;
  confirmingDelete: boolean;
  isDeleting: boolean;
  isSavingLogo: boolean;
  itemOrderFeedback: { status: "saving" | "saved" | "error"; message: string } | null;
  logoFeedback: LogoFeedback | null;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  onLogoRemove: () => void;
  onLogoUpload: (file: File) => void;
  onRequestDelete: () => void;
}) {
  return (
    <section
      className="admin-card portfolio-admin-category"
      aria-busy={isDeleting}
    >
      <header className="portfolio-admin-category-heading">
        <div>
          <span>{String(categoryIndex + 1).padStart(2, "0")} · {category.items.length} {category.items.length === 1 ? "piece" : "pieces"}</span>
          <h2>{category.name}</h2>
          {category.description && <p>{category.description}</p>}
        </div>
        <div className="portfolio-admin-category-tools">
          {category.items.length > 1 || itemOrderFeedback ? (
            <p className={`portfolio-order-status ${itemOrderFeedback?.status ?? ""}`} role="status" aria-live="polite">
              {itemOrderFeedback?.message ?? "Drag media to reorder it or move it into another category."}
            </p>
          ) : null}
          <div className="portfolio-admin-category-actions">
            <ActionPopover
              action={updatePortfolioCategory}
              summary={<><Pencil size={14} /> Edit details</>}
              title={`Edit ${category.name}`}
              detailsClassName="portfolio-category-editor"
              summaryClassName="portfolio-category-edit-button"
              formClassName="quick-form"
            >
              <input type="hidden" name="id" value={category.id} />
              <label>Category title<input name="name" minLength={2} maxLength={80} defaultValue={category.name} required /></label>
              <label>Introduction <span>Optional</span><textarea name="description" maxLength={280} rows={4} defaultValue={category.description ?? ""} /></label>
              <SubmitButton pendingLabel="Saving…">Save category</SubmitButton>
            </ActionPopover>
            <RemoveControls
              confirming={confirmingDelete}
              disabled={category.items.length > 0}
              disabledTitle={category.items.length > 0 ? "Remove this category’s media first" : undefined}
              isDeleting={isDeleting}
              label="Remove category"
              onCancel={onCancelDelete}
              onConfirm={onConfirmDelete}
              onRequest={onRequestDelete}
            />
          </div>
        </div>
      </header>
      <CategoryLogoControl
        category={category}
        disabled={isSavingLogo || isDeleting}
        feedback={logoFeedback}
        onRemove={onLogoRemove}
        onUpload={onLogoUpload}
      />
      {children}
    </section>
  );
}

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
  const [buildingPosterId, setBuildingPosterId] = useState<string | null>(null);
  const [savingLogoCategoryId, setSavingLogoCategoryId] = useState<string | null>(null);
  const [logoFeedback, setLogoFeedback] = useState<LogoFeedback | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [portfolioCategories, setPortfolioCategories] = useState(categories);
  const [serverCategories, setServerCategories] = useState(categories);
  const [orderingCategoryId, setOrderingCategoryId] = useState<string | null>(null);
  const [orderFeedback, setOrderFeedback] = useState<{ categoryId: string; status: "saving" | "saved" | "error"; message: string } | null>(null);
  const [orderingCategories, setOrderingCategories] = useState(false);
  const [categoryOrderFeedback, setCategoryOrderFeedback] = useState<{ status: "saving" | "saved" | "error"; message: string } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (categories !== serverCategories) {
    setServerCategories(categories);
    setPortfolioCategories(categories);
    setSelectedCategoryId((current) => categories.some((category) => category.id === current) ? current : categories[0]?.id ?? "");
  }
  const activeCategoryId = portfolioCategories.some((category) => category.id === selectedCategoryId) ? selectedCategoryId : "";

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
      setPortfolioCategories((current) => [...current, { ...result.category, items: [] }]);
      setSelectedCategoryId(result.category.id);
      setStatus("saved");
      setMessage(`${result.category.name} created and selected for upload.`);
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
    const destinationCategory = portfolioCategories.find((category) => category.id === activeCategoryId);
    if (!destinationCategory) {
      setStatus("error");
      setMessage("Choose the portfolio category for this upload.");
      return;
    }
    const destinationCategoryId = destinationCategory.id;

    setStatus("saving");
    const supabase = createClient();
    const uploadedPaths: string[] = [];

    try {
      const uploadedItems = [];
      for (const [index, file] of selectedFiles.entries()) {
        const { kind, extension } = validateWebsiteMediaFile(file);
        let poster: File | null = null;
        let dimensions: { width: number; height: number } | null = null;
        if (kind === "video") {
          setMessage(`Creating thumbnail ${index + 1} of ${selectedFiles.length} · ${file.name}`);
          try {
            const result = await createVideoPosterWithDimensions(file);
            poster = result.file;
            dimensions = { width: result.width, height: result.height };
          } catch (error) {
            const detail = error instanceof Error ? error.message : "This browser could not decode the video.";
            throw new Error(`Automatic thumbnail creation failed for ${file.name}. ${detail} Try Safari or an H.264 MP4 if the file uses an uncommon codec.`);
          }
        } else {
          setMessage(`Reading layout ${index + 1} of ${selectedFiles.length} · ${file.name}`);
          try {
            dimensions = await getImageDimensions(file);
          } catch {
            dimensions = null;
          }
        }
        const displaySize = dimensions
          ? getPortfolioDisplaySizeFromDimensions(dimensions.width, dimensions.height)
          : "standard";

        setMessage(`Uploading ${index + 1} of ${selectedFiles.length} · 0% · ${file.name}`);
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

        let posterPath: string | null = null;
        let posterUrl: string | null = null;
        if (poster) {
          setMessage(`Uploading thumbnail ${index + 1} of ${selectedFiles.length} · ${file.name}`);
          posterPath = `${workspaceId}/portfolio/posters/${crypto.randomUUID()}.jpg`;
          const uploadedPoster = await uploadWebsiteMediaResumable({ file: poster, storagePath: posterPath });
          posterUrl = uploadedPoster.publicUrl;
          uploadedPaths.push(posterPath);
        }
        uploadedItems.push({
          media_kind: kind,
          display_size: displaySize,
          public_url: uploaded.publicUrl,
          storage_path: storagePath,
          poster_url: posterUrl,
          poster_path: posterPath,
        });
      }

      setMessage("Building the collection…");
      const formData = new FormData();
      formData.set("category_id", destinationCategoryId);
      formData.set("items", JSON.stringify(uploadedItems));
      await createPortfolioItems(formData);

      setSelectedFiles([]);
      setStatus("saved");
      setMessage(`${uploadedItems.length} ${uploadedItems.length === 1 ? "file" : "files"} published to ${destinationCategory.name}.`);
      router.refresh();
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("website-media").remove(uploadedPaths);
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The media could not be uploaded.");
    }
  }

  async function handleBuildPoster(item: PortfolioItem) {
    setBuildingPosterId(item.id);
    setStatus("saving");
    setMessage("Capturing a thumbnail from the video…");
    const supabase = createClient();
    let posterPath = "";
    try {
      const poster = await createVideoPoster(item.public_url);
      posterPath = `${workspaceId}/portfolio/posters/${crypto.randomUUID()}.jpg`;
      const uploadedPoster = await uploadWebsiteMediaResumable({ file: poster, storagePath: posterPath });
      await savePortfolioVideoPoster({ itemId: item.id, posterUrl: uploadedPoster.publicUrl, posterPath });
      setPortfolioCategories((current) => current.map((category) => ({
        ...category,
        items: category.items.map((candidate) => candidate.id === item.id
          ? { ...candidate, poster_url: uploadedPoster.publicUrl, poster_path: posterPath }
          : candidate),
      })));
      setStatus("saved");
      setMessage("Video thumbnail saved. Visitors will see it while the video loads.");
      router.refresh();
    } catch (error) {
      if (posterPath) await supabase.storage.from("website-media").remove([posterPath]);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The video thumbnail could not be created.");
    } finally {
      setBuildingPosterId(null);
    }
  }

  async function handleCategoryLogoUpload(category: PortfolioCategory, file: File) {
    const supabase = createClient();
    let logoPath = "";
    setSavingLogoCategoryId(category.id);
    setLogoFeedback({ categoryId: category.id, status: "saving", message: "Uploading logo…" });
    try {
      const extension = getCategoryLogoExtension(file);
      logoPath = `${workspaceId}/portfolio/logos/${crypto.randomUUID()}.${extension}`;
      const uploadedLogo = await uploadWebsiteMediaResumable({
        file,
        storagePath: logoPath,
        cacheControl: "31536000",
        onProgress: ({ percentage }) => setLogoFeedback({
          categoryId: category.id,
          status: "saving",
          message: `Uploading logo · ${percentage}%`,
        }),
      });
      const saved = await savePortfolioCategoryLogo({
        categoryId: category.id,
        logoUrl: uploadedLogo.publicUrl,
        logoPath,
      });
      setPortfolioCategories((current) => current.map((candidate) => candidate.id === category.id
        ? { ...candidate, logo_url: saved.logo_url, logo_path: saved.logo_path }
        : candidate));
      setLogoFeedback({ categoryId: category.id, status: "saved", message: "Logo published to the portfolio banner." });
      router.refresh();
    } catch (error) {
      if (logoPath) await supabase.storage.from("website-media").remove([logoPath]);
      setLogoFeedback({
        categoryId: category.id,
        status: "error",
        message: error instanceof Error ? error.message : "The category logo could not be uploaded.",
      });
    } finally {
      setSavingLogoCategoryId(null);
    }
  }

  async function handleCategoryLogoRemove(category: PortfolioCategory) {
    setSavingLogoCategoryId(category.id);
    setLogoFeedback({ categoryId: category.id, status: "saving", message: "Removing logo…" });
    try {
      await removePortfolioCategoryLogo(category.id);
      setPortfolioCategories((current) => current.map((candidate) => candidate.id === category.id
        ? { ...candidate, logo_url: null, logo_path: null }
        : candidate));
      setLogoFeedback({ categoryId: category.id, status: "saved", message: "Logo removed from the portfolio banner." });
      router.refresh();
    } catch (error) {
      setLogoFeedback({
        categoryId: category.id,
        status: "error",
        message: error instanceof Error ? error.message : "The category logo could not be removed.",
      });
    } finally {
      setSavingLogoCategoryId(null);
    }
  }

  async function handleDeleteItem(item: PortfolioItem) {
    setDeletingId(item.id);
    setStatus("idle");
    setMessage("");
    try {
      await deletePortfolioItem(item.id);
      setDeleteRequest(null);
      setStatus("saved");
      setMessage(`${item.media_kind === "video" ? "Video" : "Photo"} removed from the portfolio.`);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This portfolio item could not be removed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteCategory(category: PortfolioCategory) {
    if (category.items.length > 0) return;
    setDeletingId(category.id);
    setStatus("idle");
    setMessage("");
    try {
      await deletePortfolioCategory(category.id);
      if (activeCategoryId === category.id) setSelectedCategoryId("");
      setDeleteRequest(null);
      setStatus("saved");
      setMessage(`“${category.name}” removed.`);
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This category could not be removed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleMediaReorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || orderingCategoryId || orderingCategories) return;
    const activeId = String(event.active.id);
    const overId = String(event.over.id);
    const sourceCategory = portfolioCategories.find((category) => category.items.some((item) => item.id === activeId));
    if (!sourceCategory) return;

    const dropCategoryId = getCategoryIdFromDropId(overId);
    const targetCategory = dropCategoryId
      ? portfolioCategories.find((category) => category.id === dropCategoryId)
      : portfolioCategories.find((category) => category.items.some((item) => item.id === overId));
    if (!targetCategory) return;

    const previousCategories = portfolioCategories;
    if (sourceCategory.id !== targetCategory.id) {
      const targetItemId = dropCategoryId ? null : overId;
      const nextCategories = movePortfolioItemBetweenCategories(previousCategories, activeId, targetCategory.id, targetItemId);
      if (nextCategories === previousCategories) return;

      const nextSource = nextCategories.find((category) => category.id === sourceCategory.id)!;
      const nextTarget = nextCategories.find((category) => category.id === targetCategory.id)!;
      setPortfolioCategories(nextCategories);
      setOrderingCategoryId(targetCategory.id);
      setOrderFeedback({ categoryId: targetCategory.id, status: "saving", message: `Moving media into ${targetCategory.name}…` });
      try {
        await movePortfolioItemToCategory({
          itemId: activeId,
          sourceCategoryId: sourceCategory.id,
          targetCategoryId: targetCategory.id,
          sourceItemIds: nextSource.items.map((item) => item.id),
          targetItemIds: nextTarget.items.map((item) => item.id),
        });
        setOrderFeedback({ categoryId: targetCategory.id, status: "saved", message: `Media moved into ${targetCategory.name}.` });
        router.refresh();
      } catch {
        setPortfolioCategories(previousCategories);
        setOrderFeedback({ categoryId: targetCategory.id, status: "error", message: "That move was not saved. The media has been restored." });
      } finally {
        setOrderingCategoryId(null);
      }
      return;
    }

    const previousItems = sourceCategory.items;
    const destinationItemId = dropCategoryId ? sourceCategory.items.at(-1)?.id : overId;
    if (!destinationItemId) return;
    const nextItems = movePortfolioItem(previousItems, activeId, destinationItemId);
    if (nextItems === previousItems) return;

    setPortfolioCategories((current) => current.map((candidate) => (
      candidate.id === sourceCategory.id ? { ...candidate, items: nextItems } : candidate
    )));
    setOrderingCategoryId(sourceCategory.id);
    setOrderFeedback({ categoryId: sourceCategory.id, status: "saving", message: "Saving display order…" });
    try {
      await reorderPortfolioItems(sourceCategory.id, nextItems.map((item) => item.id));
      setOrderFeedback({ categoryId: sourceCategory.id, status: "saved", message: "Display order saved." });
      router.refresh();
    } catch {
      setPortfolioCategories(previousCategories);
      setOrderFeedback({ categoryId: sourceCategory.id, status: "error", message: "That order was not saved. The previous order has been restored." });
    } finally {
      setOrderingCategoryId(null);
    }
  }

  async function handleCategoryReorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || orderingCategories || orderingCategoryId) return;
    if (!String(event.active.id).startsWith(CATEGORY_DRAG_PREFIX) || !String(event.over.id).startsWith(CATEGORY_DRAG_PREFIX)) return;
    const activeId = getCategoryIdFromDragId(String(event.active.id));
    const overId = getCategoryIdFromDragId(String(event.over.id));
    const previousCategories = portfolioCategories;
    const nextCategories = movePortfolioCategory(previousCategories, activeId, overId);
    if (nextCategories === previousCategories) return;

    setPortfolioCategories(nextCategories);
    setOrderingCategories(true);
    setCategoryOrderFeedback({ status: "saving", message: "Saving category order…" });
    try {
      await reorderPortfolioCategories(nextCategories.map((category) => category.id));
      setCategoryOrderFeedback({ status: "saved", message: "Category order saved." });
      router.refresh();
    } catch {
      setPortfolioCategories(previousCategories);
      setCategoryOrderFeedback({ status: "error", message: "That category order was not saved. The previous order has been restored." });
    } finally {
      setOrderingCategories(false);
    }
  }

  const totalItems = portfolioCategories.reduce((total, category) => total + category.items.length, 0);

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
            <p>Choose up to {MAX_BATCH_FILES} files or drag them into the drop zone. Photo previews are optimised automatically, every video gets a thumbnail before publishing, and uploads resume through brief connection drops.</p>
          </div>
        </div>
        <form onSubmit={handleUpload} className="portfolio-upload-form">
          <div className="website-element-fields portfolio-category-select">
            <label>Upload to category
              <select value={activeCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)} disabled={portfolioCategories.length === 0 || status === "saving"} required>
                {!activeCategoryId ? <option value="">Choose a category</option> : null}
                {portfolioCategories.length === 0 ? <option value="">Create a category first</option> : portfolioCategories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
              </select>
            </label>
          </div>

          <label
            className={`portfolio-dropzone ${isDragging ? "is-dragging" : ""} ${!activeCategoryId ? "is-disabled" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); if (activeCategoryId) setIsDragging(true); }}
            onDragOver={(event) => { event.preventDefault(); }}
            onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              if (activeCategoryId) addFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={fileInput}
              type="file"
              accept={WEBSITE_MEDIA_ACCEPT}
              multiple
              disabled={!activeCategoryId || status === "saving"}
              onChange={(event) => event.target.files && addFiles(event.target.files)}
            />
            <span className="portfolio-dropzone-icon"><Upload size={22} /></span>
            <strong>{portfolioCategories.length === 0 ? "Create a category to begin" : !activeCategoryId ? "Choose a category to begin" : isDragging ? "Drop your files here" : "Drop photos and videos here"}</strong>
            <small>{!activeCategoryId ? "The upload area unlocks after a destination is selected." : "or click to browse · images up to 50 MB · videos up to 200 MB"}</small>
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
            <button className="admin-primary-button" type="submit" disabled={status === "saving" || !activeCategoryId || selectedFiles.length === 0}>
              {status === "saving" ? "Publishing…" : selectedFiles.length > 0 ? `Publish ${selectedFiles.length} ${selectedFiles.length === 1 ? "file" : "files"}` : "Publish files"}
            </button>
          </div>
        </form>
      </section>

      {portfolioCategories.length > 0 ? (
        <>
          <section className="admin-card portfolio-category-order-card" aria-labelledby="portfolio-category-order-heading">
            <div className="portfolio-upload-intro">
              <span><GripVertical size={18} /></span>
              <div>
                <p className="card-label">Portfolio structure</p>
                <h2 id="portfolio-category-order-heading">Sort category order</h2>
                <p>Drag the rows into the order visitors should see. Changes save as soon as a row is dropped.</p>
              </div>
            </div>
            <div className="portfolio-category-order-panel">
              <p className={`portfolio-category-order-status ${categoryOrderFeedback?.status ?? ""}`} role="status" aria-live="polite">
                <GripVertical size={14} />
                {categoryOrderFeedback?.message ?? "Drag a row to set the category order shown on your portfolio."}
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void handleCategoryReorder(event)}>
                <SortableContext items={portfolioCategories.map((category) => getCategoryDragId(category.id))} strategy={verticalListSortingStrategy}>
                  <div className="portfolio-category-order-list">
                    {portfolioCategories.map((category, index) => (
                      <SortableCategoryOrderRow
                        key={category.id}
                        category={category}
                        index={index}
                        disabled={portfolioCategories.length < 2 || orderingCategories || Boolean(orderingCategoryId) || Boolean(deletingId) || Boolean(deleteRequest)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </section>

          <section className="portfolio-admin-categories" aria-label="Portfolio categories">
          <div className="portfolio-library-summary"><span><Images size={16} /> {portfolioCategories.length} {portfolioCategories.length === 1 ? "category" : "categories"}</span><span>{totalItems} {totalItems === 1 ? "piece" : "pieces"}</span></div>
          <DndContext sensors={sensors} collisionDetection={portfolioCollisionDetection} onDragEnd={(event) => void handleMediaReorder(event)}>
              <div className="portfolio-category-sort-list">
                {portfolioCategories.map((category, categoryIndex) => (
                  <PortfolioAdminCategory
                    key={category.id}
                    category={category}
                    categoryIndex={categoryIndex}
                    confirmingDelete={deleteRequest?.kind === "category" && deleteRequest.id === category.id}
                    isDeleting={deletingId === category.id}
                    isSavingLogo={savingLogoCategoryId === category.id}
                    itemOrderFeedback={orderFeedback?.categoryId === category.id ? orderFeedback : null}
                    logoFeedback={logoFeedback?.categoryId === category.id ? logoFeedback : null}
                    onCancelDelete={() => setDeleteRequest(null)}
                    onConfirmDelete={() => handleDeleteCategory(category)}
                    onLogoRemove={() => void handleCategoryLogoRemove(category)}
                    onLogoUpload={(file) => void handleCategoryLogoUpload(category, file)}
                    onRequestDelete={() => setDeleteRequest({ id: category.id, kind: "category" })}
                  >
                    <SortableContext items={category.items.map((item) => item.id)} strategy={rectSortingStrategy}>
                      <PortfolioCategoryDropTarget category={category}>
                        {category.items.length > 0 ? category.items.map((item) => (
                          <SortablePortfolioCard
                            key={item.id}
                            item={item}
                            confirmingDelete={deleteRequest?.kind === "item" && deleteRequest.id === item.id}
                            disabled={orderingCategories || Boolean(orderingCategoryId) || Boolean(buildingPosterId) || deletingId === item.id || (deleteRequest?.kind === "item" && deleteRequest.id === item.id)}
                            isDeleting={deletingId === item.id}
                            isBuildingPoster={buildingPosterId === item.id}
                            onCancelDelete={() => setDeleteRequest(null)}
                            onBuildPoster={() => handleBuildPoster(item)}
                            onConfirmDelete={() => handleDeleteItem(item)}
                            onRequestDelete={() => setDeleteRequest({ id: item.id, kind: "item" })}
                          />
                        )) : <><ImageIcon size={18} /><p>No media yet. Drag media here, or choose this category above before uploading.</p></>}
                      </PortfolioCategoryDropTarget>
                    </SortableContext>
                  </PortfolioAdminCategory>
                ))}
              </div>
          </DndContext>
          </section>
        </>
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
