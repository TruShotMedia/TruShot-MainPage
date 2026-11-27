import { beforeEach, expect, it, vi } from "vitest";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { setScheduledPostCompletion } from "./calendar-post-actions";

const mock = vi.hoisted(() => ({
  getProductionContext: vi.fn(), revalidatePath: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(),
  select: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("@/lib/data/admin", () => ({ getProductionContext: mock.getProductionContext }));

const id = "b57bcf06-ccd8-4cc0-b1b3-3c75e3388daa";
const at = "2026-11-27T07:00:00.000Z";
beforeEach(() => {
  vi.resetAllMocks();
  const query = { update: mock.update, eq: mock.eq, select: mock.select, maybeSingle: mock.maybeSingle };
  mock.from.mockReturnValue(query);
  mock.update.mockReturnValue(query);
  mock.eq.mockReturnValue(query);
  mock.select.mockReturnValue(query);
  mock.getProductionContext.mockResolvedValue({ supabase: { from: mock.from }, claims: { sub: "editor" }, membership: { workspace_id: TRUSHOT_WORKSPACE_ID } });
});

it.each([true, false])("persists the requested completion state (%s) only on scheduled posts", async completed => {
  mock.maybeSingle.mockResolvedValue({ data: { post_completed_at: completed ? at : null, updated_at: at }, error: null });
  expect(await setScheduledPostCompletion({ id, completed })).toEqual({ ok: true, post: { post_completed_at: completed ? at : null, updated_at: at } });
  expect(mock.from).toHaveBeenCalledWith("website-calendar-events");
  expect(mock.update).toHaveBeenCalledExactlyOnceWith({ post_completed_at: completed ? expect.any(String) : null, updated_by: "editor" });
  expect(mock.eq.mock.calls).toEqual([["workspace_id", TRUSHOT_WORKSPACE_ID], ["id", id], ["event_kind", "post"]]);
  expect(mock.revalidatePath).toHaveBeenCalledWith("/marketing");
});

it("does not write without a valid input and workspace session", async () => {
  expect(await setScheduledPostCompletion({ id, completed: "true" })).toMatchObject({ ok: false });
  expect(mock.getProductionContext).not.toHaveBeenCalled();
  mock.getProductionContext.mockResolvedValue(null);
  expect(await setScheduledPostCompletion({ id, completed: true })).toMatchObject({ ok: false });
  expect(mock.from).not.toHaveBeenCalled();
});

it("does not report success for an inaccessible row or ordinary event", async () => {
  mock.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect(await setScheduledPostCompletion({ id, completed: true })).toMatchObject({ ok: false });
  expect(mock.revalidatePath).not.toHaveBeenCalled();
});
