export type TextLink = { start: number; end: number; text: string; href: string };

/** Recognise web URLs without interpreting stored text as HTML or changing it. */
export function findTextLinks(text: string): TextLink[] {
  const links: TextLink[] = [];
  const pattern = /(?:https?:\/\/|www\.)[^\s<>"'\u0000-\u001f]+/gi;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start && /[\p{L}\p{N}_@]/u.test(text[start - 1])) continue;
    let value = match[0];
    // Sentence punctuation and unmatched closing brackets aren't part of a URL.
    let previous: string;
    do {
      previous = value;
      value = value.replace(/[.,!?;:]+$/, "");
      for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
        while (value.endsWith(close) && value.split(close).length > value.split(open).length) value = value.slice(0, -1);
      }
    } while (value !== previous);
    try {
      const url = new URL(/^www\./i.test(value) ? `https://${value}` : value);
      if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) continue;
      links.push({ start, end: start + value.length, text: value, href: url.href });
    } catch { /* Incomplete URLs stay ordinary editable text. */ }
  }
  return links;
}
