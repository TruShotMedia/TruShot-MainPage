import { describe, expect, it, vi } from "vitest";
import type { CollisionDetection, KeyboardCoordinateGetter } from "@dnd-kit/core";
import { pipelineColumnCollision, pipelineColumnKeyboardCoordinates } from "./pipeline-drag";

const detectors = vi.hoisted(() => ({ pointerWithin: vi.fn(() => []), closestCenter: vi.fn(() => []) }));
vi.mock("@dnd-kit/core", () => detectors);

describe("pipeline column targeting", () => {
  it("uses the pointer position and never guesses a nearest column outside the board", () => {
    const args = { pointerCoordinates: { x: 400, y: 500 } } as Parameters<CollisionDetection>[0];
    pipelineColumnCollision(args);
    expect(detectors.pointerWithin).toHaveBeenCalledWith(args);
    expect(detectors.closestCenter).not.toHaveBeenCalled();
    pipelineColumnCollision({ pointerCoordinates: null } as Parameters<CollisionDetection>[0]);
    expect(detectors.closestCenter).toHaveBeenCalledOnce();
  });

  it("moves keyboard drags between column centres without changing vertical position", () => {
    const rects = new Map([
      ["left", { left: 0, width: 250 }], ["right", { left: 270, width: 250 }],
    ]);
    const context = { collisionRect: { left: 10, width: 230 }, over: { id: "left" }, droppableRects: rects, droppableContainers: { getEnabled: () => [{ id: "right" }, { id: "left" }] } };
    const event = { code: "ArrowRight", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    const options = { currentCoordinates: { x: 0, y: 80 }, context } as unknown as Parameters<KeyboardCoordinateGetter>[1];
    expect(pipelineColumnKeyboardCoordinates(event, options)).toEqual({ x: 270, y: 80 });
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(pipelineColumnKeyboardCoordinates({ code: "ArrowLeft" } as KeyboardEvent, options)).toBeUndefined();
    expect(pipelineColumnKeyboardCoordinates({ code: "ArrowDown" } as KeyboardEvent, options)).toBeUndefined();
  });
});
