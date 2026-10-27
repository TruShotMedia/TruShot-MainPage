"use client";
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  briefSectionLabels,
  type BriefSectionKey,
  type JobBrief,
} from "@/lib/job-brief";
import "./production-desktop.css";

export function JobBriefFields({ initial = {} }: { initial?: JobBrief }) {
  const [brief, setBrief] = useState<JobBrief>(initial);
  const [choice, setChoice] = useState<BriefSectionKey>("output_specs");
  const sections = brief.sections ?? [];
  const available = (
    Object.keys(briefSectionLabels) as BriefSectionKey[]
  ).filter((key) => !sections.some((section) => section.key === key));
  const selected = available.includes(choice) ? choice : available[0];
  const change = (key: Exclude<keyof JobBrief, "sections">, value: string) =>
    setBrief((current) => ({ ...current, [key]: value }));
  function shift(index: number, direction: number) {
    const next = [...sections];
    [next[index], next[index + direction]] = [
      next[index + direction],
      next[index],
    ];
    setBrief((current) => ({ ...current, sections: next }));
  }
  return (
    <div className="job-brief-fields form-span">
      <input type="hidden" name="brief_details" value={JSON.stringify(brief)} />
      <details className="brief-module" open>
        <summary>Brief & objective</summary>
        <div className="brief-module-fields">
          <label>
            Objective
            <textarea
              rows={3}
              maxLength={2000}
              value={brief.objective ?? ""}
              onChange={(event) => change("objective", event.target.value)}
              placeholder="What should this work achieve?"
            />
          </label>
          <label>
            Audience
            <input
              maxLength={500}
              value={brief.audience ?? ""}
              onChange={(event) => change("audience", event.target.value)}
              placeholder="Who are we making this for?"
            />
          </label>
        </div>
      </details>
      <details className="brief-module">
        <summary>Production contact</summary>
        <div className="brief-module-fields">
          <label>
            Name
            <input
              maxLength={200}
              value={brief.contact_name ?? ""}
              onChange={(event) => change("contact_name", event.target.value)}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              maxLength={254}
              value={brief.contact_email ?? ""}
              onChange={(event) => change("contact_email", event.target.value)}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              maxLength={100}
              value={brief.contact_phone ?? ""}
              onChange={(event) => change("contact_phone", event.target.value)}
            />
          </label>
        </div>
      </details>
      {sections.map((section, index) => (
        <details className="brief-module" key={section.key} open>
          <summary>{briefSectionLabels[section.key]}</summary>
          <div className="brief-module-fields">
            <label>
              {briefSectionLabels[section.key]}
              <textarea
                rows={4}
                maxLength={4000}
                value={section.body}
                onChange={(event) =>
                  setBrief((current) => ({
                    ...current,
                    sections: sections.map((item) =>
                      item.key === section.key
                        ? { ...item, body: event.target.value }
                        : item,
                    ),
                  }))
                }
                placeholder={
                  section.key === "output_specs"
                    ? "e.g. 9:16 reel, 30 seconds, MP4 · Instagram and TikTok"
                    : undefined
                }
              />
            </label>
            <div className="brief-module-actions">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => shift(index, -1)}
                aria-label={`Move ${briefSectionLabels[section.key]} up`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={index === sections.length - 1}
                onClick={() => shift(index, 1)}
                aria-label={`Move ${briefSectionLabels[section.key]} down`}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    section.body &&
                    !window.confirm(
                      "Remove this section from your draft? Its current content will be removed when you save.",
                    )
                  )
                    return;
                  setBrief((current) => ({
                    ...current,
                    sections: sections.filter(
                      (item) => item.key !== section.key,
                    ),
                  }));
                }}
              >
                <Trash2 size={14} /> Remove section
              </button>
            </div>
          </div>
        </details>
      ))}
      {available.length ? (
        <div className="brief-add-section">
          <select
            aria-label="Optional brief section"
            value={selected}
            onChange={(event) =>
              setChoice(event.target.value as BriefSectionKey)
            }
          >
            {available.map((key) => (
              <option key={key} value={key}>
                {briefSectionLabels[key]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setBrief((current) => ({
                ...current,
                sections: [
                  ...(current.sections ?? []),
                  { key: selected, body: "" },
                ],
              }))
            }
          >
            <Plus size={14} /> Add section
          </button>
        </div>
      ) : null}
    </div>
  );
}
