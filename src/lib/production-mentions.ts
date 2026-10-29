import type { TeamMember } from "./production-team";

export type MentionQuery = { start: number; end: number; query: string };
const boundary = (character?: string) => !character || !/[\p{L}\p{N}\p{M}_@./:+-]/u.test(character);

/** Only the word under the caret participates; emails and URLs are not mentions. */
export function activeMention(text: string, caret: number, selectionEnd = caret): MentionQuery | null {
  if (caret !== selectionEnd || caret < 0 || caret > text.length) return null;
  const match = text.slice(0, caret).match(/@([a-z0-9_.-]{0,40})$/i);
  if (!match) return null;
  const start = caret - match[0].length;
  if (!boundary(text[start - 1])) return null;
  const suffix = text.slice(caret).match(/^[a-z0-9_.-]*/)?.[0] ?? "";
  return { start, end: caret + suffix.length, query: match[1] };
}

export function mentionSuggestions(members: readonly TeamMember[], query: string) {
  const search = query.toLowerCase();
  return members.filter(member => member.is_active && member.username &&
    `${member.display_name} ${member.username}`.toLowerCase().includes(search))
    .sort((a, b) => Number(!a.username.toLowerCase().startsWith(search)) - Number(!b.username.toLowerCase().startsWith(search)) || a.display_name.localeCompare(b.display_name));
}

export function insertMention(text: string, query: MentionQuery, username: string) {
  const suffix = text.slice(query.end);
  const token = `@${username} `;
  return { text: text.slice(0, query.start) + token + (suffix.startsWith(" ") ? suffix.slice(1) : suffix), caret: query.start + token.length };
}

/** Reused by server-side recipient resolution and safe React text rendering. */
export function findTeamMentions(text: string, members: readonly TeamMember[]) {
  const byHandle = new Map(members.filter(member => member.is_active && member.username).map(member => [member.username.toLowerCase(), member]));
  const found: { start: number; end: number; member: TeamMember }[] = [];
  for (const match of text.matchAll(/@([a-z0-9_.-]+)/gi)) {
    if (!boundary(text[match.index - 1])) continue;
    let handle = match[1];
    // Preserve exact dotted handles; tolerate a sentence-ending full stop.
    while (!byHandle.has(handle.toLowerCase()) && handle.endsWith(".")) handle = handle.slice(0, -1);
    const member = byHandle.get(handle.toLowerCase());
    if (member) found.push({ start: match.index, end: match.index + handle.length + 1, member });
  }
  return found;
}
