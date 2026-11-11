// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabletNotificationControl } from "./tablet-notification-control";
const mocks = vi.hoisted(() => ({ state: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/app/admin/notification-actions", () => ({ getPushSubscriptionState: mocks.state, removePushSubscription: vi.fn(), savePushSubscription: vi.fn(), sendTestPushNotification: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("Notification", { permission: "granted" });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  mocks.unsubscribe.mockResolvedValue(true);
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn().mockResolvedValue({ pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: "https://push.example.test/device", unsubscribe: mocks.unsubscribe }) } }) } });
});
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "serviceWorker"); });

describe("device notifications after switching accounts", () => {
  for (const registered of [false, true]) it(registered ? "retains this account’s registered device" : "disconnects the previous account’s browser subscription", async () => {
    mocks.state.mockResolvedValue({ registered, experienceMatches: registered });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<TabletNotificationControl experience="autopacific" experienceName="AutoPacific" publicKey="example-public-key" />));
      expect(mocks.state).toHaveBeenCalledWith("https://push.example.test/device", "autopacific");
      expect(mocks.unsubscribe).toHaveBeenCalledTimes(registered ? 0 : 1);
      expect(Boolean(container.querySelector(".is-enabled"))).toBe(registered);
    } finally {
      await act(async () => root.unmount()); container.remove();
    }
  });
  it("does not silently unsubscribe or enable another app's registration", async () => {
    mocks.state.mockResolvedValue({ registered: true, experienceMatches: false });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<TabletNotificationControl experience="autopacific" experienceName="AutoPacific" publicKey="example-public-key" />));
      expect(mocks.unsubscribe).not.toHaveBeenCalled();
      expect(container.querySelector(".is-enabled")).toBeNull();
      container.querySelector<HTMLButtonElement>(".tablet-alert-toggle")!.click();
      await act(async () => {});
      expect(document.body.textContent).toContain("use separate installed apps to keep both");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });
});
