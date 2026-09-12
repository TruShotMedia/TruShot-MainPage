import { describe, expect, it } from "vitest";
import { buildClientRequestPushMessage, isExpiredPushSubscriptionError } from "@/lib/push";

describe("push notification messages", () => {
  it("builds a client request message that deep-links to the request", () => {
    expect(buildClientRequestPushMessage({
      enquiryId: "request/id",
      name: "Alex Morgan",
      businessName: "North Studio",
    })).toEqual({
      title: "New client request",
      body: "Alex Morgan · North Studio has asked to work with TruShot Media.",
      url: "/admin/requests?request=request%2Fid",
      tag: "client-request-request/id",
    });
  });

  it("recognises push-provider responses that require subscription cleanup", () => {
    expect(isExpiredPushSubscriptionError({ statusCode: 404 })).toBe(true);
    expect(isExpiredPushSubscriptionError({ statusCode: 410 })).toBe(true);
    expect(isExpiredPushSubscriptionError({ statusCode: 500 })).toBe(false);
    expect(isExpiredPushSubscriptionError(new Error("network"))).toBe(false);
  });
});
