"use client";

import { Fragment, useState, type TextareaHTMLAttributes } from "react";
import { findTextLinks, type TextLink } from "@/lib/text-links";
import "./linked-text.css";

function WebLink({ link }: { link: TextLink }) {
  return <a className="inline-text-link" href={link.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
    title="Open in a new tab" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>{link.text}</a>;
}

export function LinkedText({ children }: { children: string }) {
  const links = findTextLinks(children);
  if (!links.length) return children;
  return <span className="linked-text">{links.map((link, index) => <Fragment key={link.start}>{children.slice(index ? links[index - 1].end : 0, link.start)}<WebLink link={link} /></Fragment>)}{children.slice(links[links.length - 1].end)}</span>;
}

export function TextLinksPreview({ text }: { text: string }) {
  const seen = new Set<string>();
  const links = findTextLinks(text).filter(link => !seen.has(link.href) && Boolean(seen.add(link.href)));
  if (!links.length) return null;
  return <span className="text-links-preview"><span className="text-links-preview-label">Links · open in a new tab</span>{links.map(link => <WebLink key={link.href} link={link} />)}</span>;
}

/** Keep the native field/caret/form behaviour, with links outside the textarea. */
export function LinkAwareTextarea({ value, defaultValue, onChange, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [draft, setDraft] = useState(String(defaultValue ?? ""));
  const text = value === undefined ? draft : String(value);
  return <><textarea {...props} value={value} defaultValue={defaultValue} onChange={event => { setDraft(event.target.value); onChange?.(event); }} /><TextLinksPreview text={text} /></>;
}
