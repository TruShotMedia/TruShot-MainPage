"use client";

import { Fragment, useId, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from "react";
import { AtSign } from "lucide-react";
import { activeMention, findTeamMentions, insertMention, mentionSuggestions } from "@/lib/production-mentions";
import type { TeamMember } from "@/lib/production-team";
import { TeamAvatar, useProductionTeam } from "./team-context";
import "./comment-mentions.css";

type MentionTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & { value: string; onChange: (text: string) => void };

export function MentionTextarea({ value, onChange, maxLength = 4000, ...props }: MentionTextareaProps) {
  const team = useProductionTeam(), id = useId();
  const field = useRef<HTMLTextAreaElement>(null), pendingCaret = useRef<number | null>(null);
  const [caret, setCaret] = useState<{ start: number; end: number } | null>(null);
  const [focused, setFocused] = useState(false), [composing, setComposing] = useState(false);
  const [selected, setSelected] = useState(0), [dismissed, setDismissed] = useState("");
  const [notice, setNotice] = useState("");
  const query = caret && focused && !composing && !props.disabled && team ? activeMention(value, caret.start, caret.end) : null;
  const queryKey = query ? `${query.start}:${query.end}:${query.query}` : "";
  const open = Boolean(query && queryKey !== dismissed);
  const results = query && team ? mentionSuggestions(team.members, query.query) : [];
  const index = Math.min(selected, Math.max(0, results.length - 1));

  useLayoutEffect(() => {
    if (pendingCaret.current === null || !field.current) return;
    const position = pendingCaret.current; pendingCaret.current = null;
    field.current.focus({ preventScroll: true }); field.current.setSelectionRange(position, position);
  }, [value]);

  function updateCaret(input: HTMLTextAreaElement) { setCaret({ start: input.selectionStart, end: input.selectionEnd }); }
  function choose(member: TeamMember) {
    if (!query) return;
    const result = insertMention(value, query, member.username);
    if (result.text.length > maxLength) { setNotice("Remove a few characters to make room for this mention."); return; }
    pendingCaret.current = result.caret;
    setCaret({ start: result.caret, end: result.caret }); setSelected(0); setNotice(""); onChange(result.text);
  }
  return <div className="comment-mention-field">
    {open ? <div className="comment-mention-menu" id={`${id}-list`} role="listbox" aria-label="Mention a teammate">
      <div className="comment-mention-menu-label"><AtSign size={13} /> Mention a teammate</div>
      {results.length ? results.map((member, option) => <button type="button" role="option" id={`${id}-option-${option}`} aria-selected={option === index} tabIndex={-1} key={member.user_id}
        onPointerDown={event => event.preventDefault()} onClick={() => choose(member)}>
        <TeamAvatar member={member} /><span><strong>{member.display_name}</strong><small>@{member.username}</small></span>{member.user_id === team?.userId ? <small>You</small> : null}
      </button>) : <p className="comment-mention-empty" role="status">No teammates match “{query?.query}”.</p>}
    </div> : null}
    <textarea {...props} ref={field} value={value} maxLength={maxLength}
      role={team ? "combobox" : undefined} aria-autocomplete={team ? "list" : undefined} aria-haspopup={team ? "listbox" : undefined}
      aria-expanded={team ? open : undefined} aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={open && results.length ? `${id}-option-${index}` : undefined}
      aria-describedby={[props["aria-describedby"], team ? `${id}-help` : null].filter(Boolean).join(" ") || undefined}
      onChange={event => { updateCaret(event.currentTarget); setSelected(0); setDismissed(""); setNotice(""); onChange(event.target.value); }}
      onSelect={event => updateCaret(event.currentTarget)}
      onFocus={event => { setFocused(true); updateCaret(event.currentTarget); props.onFocus?.(event); }}
      onBlur={event => { setFocused(false); props.onBlur?.(event); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={event => { setComposing(false); updateCaret(event.currentTarget); }}
      onKeyDown={event => {
        if (!open || event.nativeEvent.isComposing) { props.onKeyDown?.(event); return; }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDismissed(queryKey); return; }
        if (results.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
          event.preventDefault(); const next = (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
          setSelected(next); field.current?.parentElement?.querySelectorAll('[role="option"]')[next]?.scrollIntoView?.({ block: "nearest" }); return;
        }
        if (results.length && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === "Enter" || event.key === "Tab")) { event.preventDefault(); choose(results[index]); return; }
        props.onKeyDown?.(event);
      }} />
    {team ? <small id={`${id}-help`} className="comment-mention-hint">Type @ to mention someone{open && results.length ? " · ↑↓ to choose · Enter to insert · Esc to dismiss" : ""}</small> : null}
    {notice ? <small role="status" className="comment-mention-hint">{notice}</small> : null}
  </div>;
}

export function MentionText({ children }: { children: string }) {
  const team = useProductionTeam();
  const mentions = findTeamMentions(children, team?.members ?? []);
  if (!mentions.length) return children;
  return <>{mentions.map((mention, index) => {
    const before = children.slice(index ? mentions[index - 1].end : 0, mention.start);
    return <Fragment key={mention.start}>{before}<span className={`comment-inline-mention${mention.member.user_id === team?.userId ? " is-you" : ""}`} title={`@${mention.member.username}`}>@{mention.member.display_name}</span></Fragment>;
  })}{children.slice(mentions[mentions.length - 1].end)}</>;
}
