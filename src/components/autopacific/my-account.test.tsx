// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), remove: vi.fn(), prepare: vi.fn(), refresh: vi.fn(), revoke: vi.fn() }));
vi.mock("@/app/autopacific/profile-actions", () => ({ loadMyAccount: mocks.load, saveMyProfilePhoto: mocks.save, removeMyProfilePhoto: mocks.remove }));
vi.mock("@/lib/prepare-profile-photo", () => ({ prepareProfilePhoto: mocks.prepare }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
import { MyAccountDialog } from "./my-account";
const account = { userId: "john", displayName: "John", email: "john@example.test", username: "john", role: "manager", createdAt: "2026-10-01", avatarUrl: null, mfaEnabled: true, verifiedSession: true };
describe("My Account flow", () => {
  let container: HTMLDivElement, root: Root;
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.load.mockResolvedValue(account); mocks.prepare.mockResolvedValue(new File(["photo"], "photo.webp", { type: "image/webp" }));
    mocks.save.mockResolvedValue({ avatarUrl: "/api/autopacific/profile-photo/john?v=2" }); mocks.remove.mockResolvedValue({ avatarUrl: null });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:photo-preview"), revokeObjectURL: mocks.revoke }));
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
  const render = async () => { await act(async () => root.render(<MyAccountDialog marketing onClose={vi.fn()} />)); };
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.includes(text))!;
  async function choose() {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["original"], "photo.jpg", { type: "image/jpeg" })] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  }
  it("shows the signed-in account and security status without editable permission fields", async () => {
    await render(); expect(container.textContent).toContain("john@example.test"); expect(container.textContent).toContain("Enabled · verified this session");
    expect(container.querySelector('input[name="role"],input[name="user_id"]')).toBeNull();
    expect(container.querySelector('.my-account-security a')?.getAttribute("href")).toContain("next=/marketing");
  });
  it("prepares a local preview and uploads only when Save photo is pressed", async () => {
    await render(); await choose();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:photo-preview"); expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => button("Save photo").click());
    expect(mocks.save).toHaveBeenCalledOnce(); expect(container.textContent).toContain("Photo updated across your workspace");
    expect(container.querySelector("img")?.getAttribute("src")).toContain("?v=2"); expect(mocks.revoke).toHaveBeenCalledWith("blob:photo-preview");
  });
  it("keeps the preview after a failed upload, allowing a retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Upload failed")); await render(); await choose();
    await act(async () => button("Save photo").click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Upload failed");
    expect(button("Save photo").disabled).toBe(false); expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:photo-preview");
  });
  it("keeps Close available during phone-photo preparation and aborts when closed", async () => {
    let signal: AbortSignal | undefined;
    mocks.prepare.mockImplementation((_file, options) => { signal = options.signal; return new Promise(() => {}); });
    const onClose = vi.fn();
    await act(async () => root.render(<MyAccountDialog marketing onClose={onClose} />));
    await choose();
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Close My Account"]')!;
    expect(close.disabled).toBe(false); expect(container.textContent).toContain("Preparing…");
    await act(async () => close.click());
    expect(signal?.aborted).toBe(true); expect(onClose).toHaveBeenCalledOnce(); expect(mocks.save).not.toHaveBeenCalled();
  });
  it("requires confirmation before removing a saved photo", async () => {
    mocks.load.mockResolvedValue({ ...account, avatarUrl: "/saved-photo" }); await render();
    await act(async () => button("Remove photo").click()); expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => container.querySelector<HTMLButtonElement>(".my-account-remove>button:last-child")!.click());
    expect(mocks.remove).toHaveBeenCalledOnce(); expect(container.querySelector("img")).toBeNull();
  });
});
