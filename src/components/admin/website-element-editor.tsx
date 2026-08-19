"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, ImageIcon, LoaderCircle, Upload, Video } from "lucide-react";
import { updateWebsiteElement } from "@/app/admin/actions";
import { createClient } from "@/lib/supabase/client";
import type { WebsiteElement } from "@/lib/types";
import { validateWebsiteMediaFile, WEBSITE_MEDIA_ACCEPT } from "@/lib/website-media";

export function WebsiteElementEditor({
  element,
  number,
  workspaceId,
}: {
  element: WebsiteElement;
  number: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [removeMedia, setRemoveMedia] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const isVideo = element.media_kind === "video";
  const isImage = element.media_kind === "image";
  const mediaLabel = isVideo ? "Video" : isImage ? "Image" : "Branded fallback";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("Saving website element…");

    try {
      const formData = new FormData(event.currentTarget);
      const file = fileInput.current?.files?.[0];
      let mediaKind = removeMedia ? "none" : element.media_kind;
      let mediaUrl = removeMedia ? "" : (element.media_url ?? "");
      let mediaPath = removeMedia ? "" : (element.media_path ?? "");

      if (file) {
        const { kind, extension } = validateWebsiteMediaFile(file);

        setMessage(`Uploading ${file.name}…`);
        const path = `${workspaceId}/${element.element_key}/${crypto.randomUUID()}.${extension}`;
        const supabase = createClient();
        const { error } = await supabase.storage.from("website-media").upload(path, file, {
          cacheControl: "3600",
          contentType: file.type,
          upsert: false,
        });
        if (error) throw new Error(error.message);
        const { data } = supabase.storage.from("website-media").getPublicUrl(path);
        mediaKind = kind;
        mediaUrl = data.publicUrl;
        mediaPath = path;
      }

      formData.set("media_kind", mediaKind);
      formData.set("media_url", mediaUrl);
      formData.set("media_path", mediaPath);
      await updateWebsiteElement(formData);
      setRemoveMedia(false);
      setSelectedFileName("");
      if (fileInput.current) fileInput.current.value = "";
      setStatus("saved");
      setMessage("Saved and published to the website.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This element could not be saved.");
    }
  }

  return (
    <article className={`website-element-card ${element.element_type === "about" ? "about-element-card" : ""}`}>
      <div className="website-element-preview">
        {element.element_type === "service" && !isImage && (
          <div className="admin-media-fallback" aria-hidden="true"><span /></div>
        )}
        {element.element_type === "about" && !isImage && (
          <Image
            src="/brand/wallpaper.png"
            alt=""
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
          />
        )}
        {isImage && element.media_url && (
          <Image
            src={element.media_url}
            alt={element.media_alt || "TruShot Media"}
            fill
            sizes="(max-width: 900px) 100vw, 44vw"
          />
        )}
        {isVideo && element.media_url && (
          <video src={element.media_url} autoPlay muted loop playsInline preload="metadata" aria-label={element.media_alt || "TruShot Media"} />
        )}
        <span className="website-preview-number">{number}</span>
        <span className="website-media-badge">{isVideo ? <Video size={13} /> : <ImageIcon size={13} />}{mediaLabel}</span>
      </div>

      <form className="website-element-form" onSubmit={handleSubmit}>
        <input type="hidden" name="id" value={element.id} />
        <input type="hidden" name="element_key" value={element.element_key} />
        <input type="hidden" name="media_kind" value={element.media_kind} />
        <input type="hidden" name="media_url" value={element.media_url ?? ""} />
        <input type="hidden" name="media_path" value={element.media_path ?? ""} />

        <div className="website-element-heading">
          <div><span>{element.element_type === "service" ? "Service card" : "About TruShot"}</span><h2>{element.title}</h2></div>
          <small>Live</small>
        </div>

        <div className="website-element-fields">
          <label>Eyebrow<input name="eyebrow" defaultValue={element.eyebrow ?? ""} maxLength={100} /></label>
          <label>Title<input name="title" defaultValue={element.title} minLength={2} maxLength={120} required /></label>
          <label className="website-field-wide">Description<textarea name="body" defaultValue={element.body} minLength={10} maxLength={700} rows={4} required /></label>
          <label className="website-field-wide">Media description<input name="media_alt" defaultValue={element.media_alt ?? ""} maxLength={180} required /></label>
        </div>

        <div className="website-upload-row">
          <label className="website-upload-button">
            <Upload size={15} /> {element.media_url ? "Replace media" : "Upload image or video"}
            <input ref={fileInput} type="file" accept={WEBSITE_MEDIA_ACCEPT} onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} />
          </label>
          {element.media_url && (
            <label className="website-remove-media">
              <input type="checkbox" checked={removeMedia} onChange={(event) => setRemoveMedia(event.target.checked)} />
              Use branded fallback
            </label>
          )}
          <span>{selectedFileName || "Images max 10 MB · videos max 80 MB"}</span>
        </div>

        <div className="website-element-actions">
          <p className={`website-save-status ${status}`}>{status === "saving" && <LoaderCircle className="spin" size={14} />}{status === "saved" && <Check size={14} />}{message}</p>
          <button className="admin-primary-button" type="submit" disabled={status === "saving"}>Save & publish</button>
        </div>
      </form>
    </article>
  );
}
