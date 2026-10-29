// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MentionText, MentionTextarea } from "./comment-mentions";
import { ProductionTeamProvider } from "./team-context";
import { WorkspaceDialog } from "@/components/shared/workspace-dialog";
import type { TeamContextData } from "@/lib/production-team";

const team: TeamContextData = { userId: "john", role: "manager", canManage: true, videographerId: "john", members: [
  { user_id: "john", display_name: "John Herholdt", username: "john", role: "manager", is_active: true, avatar_color: "#579" },
  { user_id: "charlotte", display_name: "Charlotte Byrne", username: "c.byrne", role: "marketing", is_active: true, avatar_color: "#579" },
  { user_id: "hidden", display_name: "Hidden Person", username: "hidden", role: "marketing", is_active: false, avatar_color: "#579" },
] };
function Composer({ initial = "", maxLength }: { initial?: string; maxLength?: number }) {
  const [text, setText] = useState(initial);
  return <><MentionTextarea aria-label="Comment" value={text} onChange={setText} maxLength={maxLength} /><output>{text}</output></>;
}

describe("inline comment mentions", () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  async function render(initial = "", maxLength?: number) {
    await act(async () => root.render(<ProductionTeamProvider value={team}><Composer initial={initial} maxLength={maxLength} /></ProductionTeamProvider>));
    const input = container.querySelector("textarea")!;
    await act(async () => { input.setSelectionRange(initial.length, initial.length); input.focus(); });
    return input;
  }
  async function key(input: HTMLTextAreaElement, value: string) {
    const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(event)); return event;
  }
  it("opens while typing @, searches names and inserts at the caret with surrounding text intact", async () => {
    const input = await render("Please @by review this.");
    await act(async () => { input.setSelectionRange(10, 10); document.dispatchEvent(new Event("selectionchange")); });
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(container.querySelector('[role="option"]')?.textContent).toContain("Charlotte Byrne");
    await act(async () => container.querySelector<HTMLButtonElement>('[role="option"]')!.click());
    expect(input.value).toBe("Please @c.byrne review this.");
    expect(input.selectionStart).toBe("Please @c.byrne ".length);
    expect(container.querySelector('[role="listbox"]')).toBeNull(); expect(document.activeElement).toBe(input);
  });
  it("supports arrows, Enter and Tab without submitting the comment", async () => {
    const input = await render("@");
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
    await key(input, "ArrowDown"); expect(input.getAttribute("aria-activedescendant")).toContain("option-1");
    await key(input, "Enter"); expect(input.value).toBe("@john ");
  });
  it("accepts a suggestion with Tab", async () => {
    const input = await render("@c"); await key(input, "Tab"); expect(input.value).toBe("@c.byrne ");
  });
  it("opens as @ is typed and preserves Shift+Enter for a new line", async () => {
    const input = await render();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Check @jo");
      input.setSelectionRange(9, 9); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector('[role="option"]')?.textContent).toContain("John Herholdt");
    const event = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false); expect(input.value).toBe("Check @jo");
  });
  it("dismisses suggestions on Escape before dismissing the surrounding dialog", async () => {
    const close = vi.fn();
    await act(async () => root.render(<ProductionTeamProvider value={team}><WorkspaceDialog onClose={close} titleId="title" header={<h2 id="title">Notes</h2>}><Composer initial="@jo" /></WorkspaceDialog></ProductionTeamProvider>));
    const input = container.querySelector("textarea")!;
    await act(async () => { input.setSelectionRange(3, 3); input.focus(); });
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    await key(input, "Escape"); expect(container.querySelector('[role="listbox"]')).toBeNull(); expect(close).not.toHaveBeenCalled();
    await key(input, "Escape"); expect(close).toHaveBeenCalledOnce();
  });
  it("does not offer disabled users or intercept Enter when there are no results", async () => {
    const input = await render("@hidden"); expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect((await key(input, "Enter")).defaultPrevented).toBe(false);
  });
  it("does not open for email addresses and preserves normal multiline typing", async () => {
    const input = await render("Send to john@example.com");
    expect(container.querySelector('[role="listbox"]')).toBeNull(); expect((await key(input, "Enter")).defaultPrevented).toBe(false);
  });
  it("does not exceed the note limit or lose text when a mention is too long", async () => {
    const input = await render("@c", 5); await key(input, "Enter");
    expect(input.value).toBe("@c"); expect(container.textContent).toContain("Remove a few characters");
  });
  it("highlights valid mentions as escaped text, never as HTML", async () => {
    await act(async () => root.render(<ProductionTeamProvider value={team}><MentionText>{'Hi @john. <script>alert(1)</script> @hidden'}</MentionText></ProductionTeamProvider>));
    expect(container.querySelectorAll(".comment-inline-mention")).toHaveLength(1);
    expect(container.querySelector(".comment-inline-mention")?.textContent).toBe("@John Herholdt");
    expect(container.querySelector("script")).toBeNull(); expect(container.textContent).toContain("<script>");
  });
});
