"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  FileText,
  LoaderCircle,
  Paperclip,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  loadJobSupportingData,
  registerJobAttachment,
  removeJobAttachment,
} from "@/app/autopacific/brief-actions";
import {
  JOB_ATTACHMENT_BUCKET,
  JOB_ATTACHMENT_MAX_BYTES,
  jobAttachmentTypes,
} from "@/lib/job-brief";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";

export type JobSupportingData = Awaited<
  ReturnType<typeof loadJobSupportingData>
>;
const supportingRequests = new Map<string, Promise<JobSupportingData>>();
function readSupportingData(jobId:string,fresh:boolean) {
  if(fresh)supportingRequests.delete(jobId);
  const existing=supportingRequests.get(jobId);if(existing)return existing;
  const request=loadJobSupportingData(jobId);supportingRequests.set(jobId,request);
  void request.finally(()=>{if(supportingRequests.get(jobId)===request)supportingRequests.delete(jobId);}).catch(()=>{});
  return request;
}
export function useJobSupportingData(jobId: string) {
  const [state, setState] = useState<{
    data: JobSupportingData | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  const generation = useRef(0);
  const alive = useRef(true);
  const reload = useCallback(async (fresh = true) => {
    const request = ++generation.current;
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const data = await readSupportingData(jobId,fresh);
      if (alive.current && request === generation.current)
        setState({ data, error: "", loading: false });
    } catch (error) {
      if (alive.current && request === generation.current)
        setState((current) => ({
          ...current,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Files could not be loaded.",
        }));
    }
  }, [jobId]);
  useEffect(() => {
    alive.current = true;
    void reload(false);
    return () => {
      alive.current = false;
    };
  }, [reload]);
  return { ...state, reload };
}
export function JobFiles({
  jobId,
  editable = true,
}: {
  jobId: string;
  editable?: boolean;
}) {
  const { data, error, loading, reload } = useJobSupportingData(jobId);
  const [uploading, setUploading] = useState(false),
    [message, setMessage] = useState("");
  const [failed, setFailed] = useState<
    Array<{ file: File; path: string; uploaded: boolean }>
  >([]);
  const input = useRef<HTMLInputElement>(null);
  async function upload(
    entries: Array<{ file: File; path?: string; uploaded?: boolean }>,
  ) {
    setUploading(true);
    setMessage("");
    const failures: Array<{ file: File; path: string; uploaded: boolean }> = [];
    for (const entry of entries) {
      const file = entry.file;
      const extension =
        file.name
          .split(".")
          .pop()
          ?.toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 10) || "bin";
      const path =
        entry.path ??
        `${TRUSHOT_WORKSPACE_ID}/${jobId}/${crypto.randomUUID()}.${extension}`;
      let uploaded = entry.uploaded ?? false;
      try {
        if (
          !jobAttachmentTypes.includes(file.type) ||
          !file.size ||
          file.size > JOB_ATTACHMENT_MAX_BYTES
        )
          throw new Error(`${file.name}: use an accepted file up to 50 MB.`);
        // A retry of metadata registration must not re-upload an already completed file.
        const { uploadSupabaseFileResumable } = await import(
          "@/lib/resumable-upload"
        );
        if (!uploaded) {
          await uploadSupabaseFileResumable({
            file,
            storagePath: path,
            bucketName: JOB_ATTACHMENT_BUCKET,
            cacheControl: "600",
            onProgress: (progress) =>
              setMessage(`${file.name} · ${progress.percentage}%`),
          });
          uploaded = true;
        }
        await registerJobAttachment({
          jobId,
          storagePath: path,
          fileName: file.name,
        });
      } catch (uploadError) {
        failures.push({ file, path, uploaded });
        setMessage(
          uploadError instanceof Error ? uploadError.message : "Upload failed.",
        );
      }
    }
    setFailed(failures);
    setUploading(false);
    if (!failures.length) setMessage("Files attached.");
    await reload();
  }
  return (
    <section
      className="job-files"
      aria-label="Files and references"
      onDragOver={(event) => {
        if (editable) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(event) => {
        if (!editable || uploading) return;
        event.preventDefault();
        void upload([...event.dataTransfer.files].map((file) => ({ file })));
      }}
    >
      <header>
        <h3>
          <Paperclip size={15} /> Files & references
        </h3>
        {editable ? (
          <button
            type="button"
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <Upload size={14} /> Add files
          </button>
        ) : null}
      </header>
      <input
        ref={input}
        hidden
        type="file"
        multiple
        accept={jobAttachmentTypes.join(",")}
        onChange={(event) => {
          void upload(
            [...(event.target.files ?? [])].map((file) => ({ file })),
          );
          event.target.value = "";
        }}
      />
      {loading ? (
        <p>
          <LoaderCircle className="spin" size={14} /> Loading private files…
        </p>
      ) : null}
      {error ? (
        <p role="alert">
          {error}
          <button type="button" onClick={() => void reload()}>
            Retry
          </button>
        </p>
      ) : null}
      {!loading && !error && !data?.attachments.length ? (
        <p>
          Drop reference images, videos or documents here. Up to 50 MB each.
          Files stay private to this workspace.
        </p>
      ) : null}
      <div className="job-file-grid">
        {data?.attachments.map((file) => (
          <article className="job-file" key={file.id}>
            <a
              href={`/api/autopacific/jobs/${jobId}/attachments/${file.id}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${file.file_name}`}
            >
              {file.mime_type.startsWith("image/") ? (
                <Image
                  src={file.url}
                  alt=""
                  width={42}
                  height={42}
                  loading="lazy"
                  unoptimized
                />
              ) : (
                <FileText size={25} />
              )}
              <span>
                <strong>{file.file_name}</strong>
                <small>
                  {file.mime_type.split("/").pop()} ·{" "}
                  {(file.size_bytes / 1024 / 1024).toFixed(1)} MB
                </small>
              </span>
            </a>
            {editable ? (
              <button
                type="button"
                disabled={uploading}
                aria-label={`Remove ${file.file_name}`}
                onClick={async () => {
                  if (
                    !window.confirm(`Remove ${file.file_name} from this brief?`)
                  )
                    return;
                  try {
                    await removeJobAttachment(jobId, file.id);
                    await reload();
                  } catch (reason) {
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : "Removal failed.",
                    );
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {message ? (
        <p role="status">
          {uploading ? <LoaderCircle size={14} className="spin" /> : null}
          {message}
        </p>
      ) : null}
      {failed.length ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => void upload(failed)}
        >
          <RotateCcw size={14} /> Retry {failed.length} failed attachment
          {failed.length === 1 ? "" : "s"}
        </button>
      ) : null}
    </section>
  );
}
