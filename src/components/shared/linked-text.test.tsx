// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedText, LinkAwareTextarea, TextLinksPreview } from "./linked-text";

let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
describe("clickable text and native editing", () => {
  it("preserves visible text exactly and opens safe links in an isolated new tab", async () => {
    const text = "Brief:\nhttps://example.com/a?x=1&y=2.\nKeep the spacing.";
    await act(async () => root.render(<p><LinkedText>{text}</LinkedText></p>));
    const link = host.querySelector("a")!;
    expect(host.textContent).toBe(text);
    expect(link.href).toBe("https://example.com/a?x=1&y=2");
    expect(link.target).toBe("_blank"); expect(link.rel).toBe("noopener noreferrer");
    expect(link.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
  it("escapes HTML and rejects executable protocols", async () => {
    const text = '<img src=x onerror=alert(1)> javascript:alert(1) https://example.com';
    await act(async () => root.render(<LinkedText>{text}</LinkedText>));
    expect(host.querySelector("img")).toBeNull(); expect(host.querySelectorAll("a")).toHaveLength(1);
    expect(host.textContent).toBe(text);
  });
  it("does not trigger a containing record click when following a link", async () => {
    const openRecord = vi.fn();
    await act(async () => root.render(<div onClick={openRecord}><LinkedText>https://example.com</LinkedText></div>));
    const link = host.querySelector("a")!;
    // Block browser navigation in the test, leaving normal click propagation intact.
    link.addEventListener("click", event => event.preventDefault());
    await act(async () => link.click()); expect(openRecord).not.toHaveBeenCalled();
  });
  it("does not create empty or duplicate preview links", async () => {
    await act(async () => root.render(<TextLinksPreview text="See https://example.com and https://example.com again." />));
    expect(host.querySelectorAll("a")).toHaveLength(1);
    await act(async () => root.render(<TextLinksPreview text="No links here" />)); expect(host.textContent).toBe("");
  });
  it("keeps uncontrolled form fields and previews in step without changing submitted text", async () => {
    await act(async () => root.render(<form><label>Brief<LinkAwareTextarea name="description" defaultValue="Old https://example.com" /></label></form>));
    const input = host.querySelector("textarea")!;
    const text = "Updated\nwww.example.org/brief";
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.querySelector("a")?.href).toBe("https://www.example.org/brief");
    expect(new FormData(host.querySelector("form")!).get("description")).toBe(text);
  });
  it("supports controlled textareas without changing their onChange contract", async () => {
    function Controlled() { const [text, setText] = useState(""); return <LinkAwareTextarea value={text} onChange={event => setText(event.target.value)} />; }
    await act(async () => root.render(<Controlled />));
    const input = host.querySelector("textarea")!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "https://example.com/new"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(input.value).toBe("https://example.com/new"); expect(host.querySelector("a")?.href).toBe(input.value);
  });
});
