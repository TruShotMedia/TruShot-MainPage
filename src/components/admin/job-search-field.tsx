"use client";

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";
import { Check, Search } from "lucide-react";
import { formatDate } from "@/lib/format";
import type { JobSearchOption } from "@/lib/types";

function jobSearchText(job: JobSearchOption) {
  return [job.name, job.jobNumber, job.clientName, job.dueDate]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function JobSearchField({
  jobs,
  defaultJobId = "",
  label = "Job / shoot",
}: {
  jobs: JobSearchOption[];
  defaultJobId?: string;
  label?: string;
}) {
  const inputId = useId();
  const listboxId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultJob = jobs.find((job) => job.id === defaultJobId) ?? null;
  const [selectedId, setSelectedId] = useState(defaultJob?.id ?? "");
  const [query, setQuery] = useState(defaultJob?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedJob = jobs.find((job) => job.id === selectedId) ?? null;
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return jobs.filter((job) => !normalizedQuery || jobSearchText(job).includes(normalizedQuery)).slice(0, 8);
  }, [jobs, query]);

  useEffect(() => {
    const form = wrapperRef.current?.closest("form");
    if (!form) return;
    const reset = () => {
      setSelectedId(defaultJob?.id ?? "");
      setQuery(defaultJob?.name ?? "");
      setOpen(false);
    };
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [defaultJob?.id, defaultJob?.name]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(selectedId ? "" : "Choose a job from the search results.");
  }, [selectedId]);

  function chooseJob(job: JobSearchOption) {
    setSelectedId(job.id);
    setQuery(job.name);
    setOpen(false);
    setActiveIndex(0);
    inputRef.current?.setCustomValidity("");
  }

  function closeWhenFocusLeaves(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="job-search-field form-span" onBlur={closeWhenFocusLeaves}>
      <label htmlFor={inputId}>{label}</label>
      <input type="hidden" name="job_id" value={selectedId} />
      <div className="invoice-search-picker job-search-picker">
        <div className="invoice-search-control">
          <Search size={16} aria-hidden="true" />
          <input
            ref={inputRef}
            id={inputId}
            value={query}
            required
            type="search"
            role="combobox"
            aria-label={`Search ${label.toLocaleLowerCase()}`}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={open && matches[activeIndex] ? `${listboxId}-${matches[activeIndex].id}` : undefined}
            placeholder="Search job, client or job number…"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId("");
              setActiveIndex(0);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((current) => Math.max(current - 1, 0));
              }
              if (event.key === "Enter" && open && matches[activeIndex]) {
                event.preventDefault();
                chooseJob(matches[activeIndex]);
              }
            }}
          />
          {selectedJob ? <Check className="invoice-search-confirmed" size={16} aria-hidden="true" /> : null}
        </div>
        {open ? (
          <div id={listboxId} className="invoice-search-results job-search-results" role="listbox" aria-label="Matching jobs and shoots">
            {matches.length ? matches.map((job, index) => (
              <button
                id={`${listboxId}-${job.id}`}
                key={job.id}
                type="button"
                role="option"
                aria-selected={job.id === selectedId}
                data-active={index === activeIndex ? "true" : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseJob(job)}
              >
                <span><strong>{job.name}</strong><small>{[job.jobNumber, job.clientName].filter(Boolean).join(" · ") || "No client"}</small></span>
                <span><strong>{job.dueDate ? formatDate(job.dueDate) : "Not set"}</strong><small>Job deadline</small></span>
              </button>
            )) : <p>No matching jobs.</p>}
          </div>
        ) : null}
      </div>
      {selectedJob ? <small className="job-search-deadline">Task deadline: <strong>{selectedJob.dueDate ? formatDate(selectedJob.dueDate) : "No job deadline set"}</strong></small> : null}
    </div>
  );
}
