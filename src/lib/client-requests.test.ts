import { describe, expect, it } from "vitest";
import { ACTIVE_CLIENT_REQUEST_STATUSES } from "./client-requests";

describe("active client request statuses", () => {
  it("counts only new requests and requests under review", () => {
    expect(ACTIVE_CLIENT_REQUEST_STATUSES).toEqual(["new", "reviewing"]);
    expect(ACTIVE_CLIENT_REQUEST_STATUSES).not.toContain("approved");
    expect(ACTIVE_CLIENT_REQUEST_STATUSES).not.toContain("declined");
    expect(ACTIVE_CLIENT_REQUEST_STATUSES).not.toContain("archived");
  });
});
