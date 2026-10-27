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
    mocks.state.mockResolvedValue({ registered });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<TabletNotificationControl experience="autopacific" experienceName="AutoPacific" publicKey="example-public-key" />));
      expect(mocks.state).toHaveBeenCalledWith("https://push.example.test/device");
      expect(mocks.unsubscribe).toHaveBeenCalledTimes(registered ? 0 : 1);
      expect(Boolean(container.querySelector(".is-enabled"))).toBe(registered);
    } finally {
      await act(async () => root.unmount()); container.remove();
    }
  });
});
