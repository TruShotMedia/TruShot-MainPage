import { describe, expect, it } from "vitest";
import { activeMention, findTeamMentions, insertMention, mentionSuggestions } from "./production-mentions";
import { mentionedMembers, type TeamMember } from "./production-team";
const member = (id: string, name: string, username: string, active = true): TeamMember => ({ user_id: id, display_name: name, username, role: "marketing", is_active: active, avatar_color: "#579" });
const members = [member("john", "John Herholdt", "john"), member("charlotte", "Charlotte Byrne", "c.byrne"), member("jones", "Sarah Jones", "sarah.jones"), member("hidden", "John Hidden", "hidden", false)];
describe("inline mention parsing", () => {
  it("finds a query at the caret at the beginning, in a sentence or after a newline", () => {
    for (const text of ["@", "Please @jo", "First line\n@jo", "(@jo"]) {
      expect(activeMention(text, text.length)?.query).toBe(text.endsWith("@") ? "" : "jo");
    }
  });
  it("does not autocomplete email, URL, selected text or a completed mention", () => {
    for (const text of ["john@example.com", "été@john", "https://example.test/@john", "Please @john ", "@john thanks", "@@john"]) expect(activeMention(text, text.length)).toBeNull();
    expect(activeMention("@john", 2, 5)).toBeNull();
  });
  it("inserts at the caret, replacing the whole partial token and preserving the surrounding sentence", () => {
    const text = "Please @jhn review this.";
    const query = activeMention(text, text.indexOf("hn"))!;
    expect(insertMention(text, query, "john")).toEqual({ text: "Please @john review this.", caret: "Please @john ".length });
    expect(insertMention("@c", activeMention("@c", 2)!, "c.byrne")).toEqual({ text: "@c.byrne ", caret: 9 });
  });
  it("searches display names and handles locally, excludes disabled members, and prioritises handles", () => {
    expect(mentionSuggestions(members, "JO").map(member => member.user_id)).toEqual(["john", "jones"]);
    expect(mentionSuggestions(members, "byrne").map(member => member.user_id)).toEqual(["charlotte"]);
    expect(mentionSuggestions(members, "hidden")).toEqual([]);
  });
  it("recognises punctuation, dotted handles and multiple mentions without email or prefix matches", () => {
    const text = "Hi (@JOHN), @c.byrne! Please check with @john. @john.extra john@example.com @hidden";
    expect(findTeamMentions(text, members).map(found => text.slice(found.start, found.end))).toEqual(["@JOHN", "@c.byrne", "@john"]);
    expect(mentionedMembers(text, members)).toEqual(["john", "charlotte"]);
  });
});
