// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), verify: vi.fn(), cancel: vi.fn() }));
vi.mock("@/app/autopacific/mfa-actions", () => ({ beginAutopacificMfaSetup: mocks.begin, verifyAutopacificMfa: mocks.verify, cancelAutopacificMfaSetup: mocks.cancel }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }));
import { AutopacificMfaForm } from "./autopacific-mfa-form";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  mocks.begin.mockResolvedValue({ enrollment: { id: "test-factor", qr: "data:image/svg+xml,%3Csvg/%3E", secret: "TEST-ONLY-KEY" } });
  mocks.cancel.mockResolvedValue({ ok: true });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("authenticator setup and challenge UI", () => {
  it("does not request or render a secret until the user explicitly starts setup", async () => {
    await act(async () => root.render(<AutopacificMfaForm mode="enroll" factors={[]} next="/autopacific" />));
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("sign out other sessions");
    expect(container.querySelector('input[type="password"]')).not.toBeNull();
  });
  it("shows QR instructions after setup and clears private setup data on cancel", async () => {
    await act(async () => root.render(<AutopacificMfaForm mode="enroll" factors={[]} next="/autopacific" />));
    const password = container.querySelector<HTMLInputElement>('input[type="password"]')!;
    password.value = "test-password";
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.begin).toHaveBeenCalledWith("test-password");
    expect(container.querySelector('img[alt="Private authenticator setup QR code"]')).not.toBeNull();
    expect(container.textContent).toContain("Other account");
    expect(container.textContent).toContain("TEST-ONLY-KEY");
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Cancel setup")!.click());
    expect(mocks.cancel).toHaveBeenCalledWith("test-factor");
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("TEST-ONLY-KEY");
  });
  it("has a mobile-friendly six-digit text input and no password-only skip on the challenge", () => {
    const html = renderToStaticMarkup(<AutopacificMfaForm mode="challenge" factors={[{ id: "factor", name: "Phone" }]} next="/marketing" />);
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('maxLength="6"');
    expect(html).not.toContain("Not now");
    expect(html).not.toContain('type="password"');
  });
  it("supports a choice when the account has multiple verified authenticators", () => {
    const html = renderToStaticMarkup(<AutopacificMfaForm mode="challenge" factors={[{ id: "a", name: "Phone" }, { id: "b", name: "Backup" }]} next="/autopacific" />);
    expect(html).toContain('id="mfa-factor"');
    expect(html).toContain("Backup");
  });
});
