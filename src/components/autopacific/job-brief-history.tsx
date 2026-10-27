"use client";
import { useState } from "react";
import { History } from "lucide-react";
import { loadJobBriefHistory } from "@/app/autopacific/brief-actions";
import { briefAsMarkdown } from "@/lib/job-brief";
export function JobBriefHistory({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<Awaited<
      ReturnType<typeof loadJobBriefHistory>
    > | null>(null),
    [error, setError] = useState("");
  return (
    <details
      className="brief-module"
      onToggle={async (event) => {
        if (!event.currentTarget.open || items) return;
        try {
          setItems(await loadJobBriefHistory(jobId));
        } catch {
          setError("History could not be loaded. Close and reopen to retry.");
        }
      }}
    >
      <summary>
        <History size={14} /> Previous brief revisions
      </summary>
      <div className="brief-module-fields">
        {error ? (
          <p role="alert">{error}</p>
        ) : items === null ? (
          <p>Loading history…</p>
        ) : items.length ? (
          items.map((item, index) => (
            <details key={`${item.saved_at}-${index}`}>
              <summary>
                {new Intl.DateTimeFormat("en-AU", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Australia/Brisbane",
                }).format(new Date(item.saved_at))}
              </summary>
              <p className="brief-help">
                Previous content is retained here so you can recover it without
                overwriting the current brief.
              </p>
              <pre className="brief-history-content">
                {[
                  item.description,
                  briefAsMarkdown(item.brief_details),
                  item.deliverables
                    .map(
                      (deliverable) =>
                        `${deliverable.name}${deliverable.date ? ` · ${deliverable.date}` : ""}`,
                    )
                    .join("\n"),
                ]
                  .filter(Boolean)
                  .join("\n\n")}
              </pre>
            </details>
          ))
        ) : (
          <p>No previous revisions yet.</p>
        )}
      </div>
    </details>
  );
}
