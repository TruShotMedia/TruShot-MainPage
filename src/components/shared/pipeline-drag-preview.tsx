"use client";

import { DragOverlay } from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { GripVertical } from "lucide-react";

export function PipelineDragPreview({ title, detail }: { title?: string; detail?: string }) {
  // Render outside all scroll containers so a card never gets clipped while
  // travelling between columns. The original stays in place as a placeholder.
  if (!title) return null;
  return createPortal(<DragOverlay dropAnimation={null} zIndex={600}>
    <div className="pipeline-drag-preview"><GripVertical size={18} /><div><strong>{title}</strong><small>{detail || "Drop into a highlighted status"}</small></div></div>
  </DragOverlay>, document.body);
}
