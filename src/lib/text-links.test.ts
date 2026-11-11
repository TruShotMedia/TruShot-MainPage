import { describe, expect, it } from "vitest";
import { findTextLinks } from "./text-links";

describe("safe web links in plain text", () => {
  it("finds multiple web links without losing whitespace or punctuation", () => {
    const text = "First https://example.com/brief?a=1&b=two#shot.\nThen www.example.org/assets!";
    expect(findTextLinks(text).map(link => [link.text, link.href])).toEqual([
      ["https://example.com/brief?a=1&b=two#shot", "https://example.com/brief?a=1&b=two#shot"],
      ["www.example.org/assets", "https://www.example.org/assets"],
    ]);
    for (const link of findTextLinks(text)) expect(text.slice(link.start, link.end)).toBe(link.text);
  });
  it("keeps balanced parentheses but excludes surrounding prose brackets", () => {
    expect(findTextLinks("See (https://example.com/Shot_(wide)), [https://example.org/brief].").map(link => link.text)).toEqual(["https://example.com/Shot_(wide)", "https://example.org/brief"]);
  });
  it("handles copied markdown links without including their closing bracket", () => {
    expect(findTextLinks("[Brief](https://example.com/a)")[0].href).toBe("https://example.com/a");
  });
  it("handles case, encoded paths and international domains", () => {
    expect(findTextLinks("HTTPS://EXAMPLE.COM/a%20b WWW.EXAMPLE.ORG https://münich.de").map(link => link.href)).toEqual(["https://example.com/a%20b", "https://www.example.org/", "https://xn--mnich-kva.de/"]);
  });
  for (const text of ["javascript:alert(1)", "data:text/html,<script>bad</script>", "file:///private/report", "ftp://example.com/a", "https://", "https://user:secret@example.com/", "person@www.example.com", "abchttps://example.com", "Not a URL", ""]) {
    it(`leaves unsafe, incomplete or non-web text alone: ${text}`, () => expect(findTextLinks(text)).toEqual([]));
  }
  it("stops before HTML delimiters instead of interpreting markup", () => {
    expect(findTextLinks('https://example.com/" onclick="bad()')[0].href).toBe("https://example.com/");
  });
});
