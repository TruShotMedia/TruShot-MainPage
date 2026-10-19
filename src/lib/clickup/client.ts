import "server-only";

import { getClickUpToken } from "@/lib/clickup/config";

const CLICKUP_API_ORIGIN = "https://api.clickup.com/api/v2";

export class ClickUpApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ClickUpApiError";
  }
}

export type ClickUpUser = {
  id: number;
  username: string;
  email?: string;
};

export type ClickUpList = {
  id: string;
  name: string;
  statuses?: Array<{ status: string; type?: string }>;
};

export type ClickUpTask = {
  id: string;
  url?: string;
};

async function clickUpRequest<T>(path: string, init: RequestInit = {}) {
  const token = getClickUpToken();
  if (!token) throw new ClickUpApiError("The ClickUp API token has not been configured.", 503, "TOKEN_MISSING");

  const response = await fetch(`${CLICKUP_API_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: token,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { err?: string; ECODE?: string } | T | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "err" in payload ? payload.err : null;
    const code = payload && typeof payload === "object" && "ECODE" in payload ? payload.ECODE ?? null : null;
    throw new ClickUpApiError(detail || `ClickUp returned HTTP ${response.status}.`, response.status, code);
  }
  return payload as T;
}

export function getClickUpAuthorizedUser() {
  return clickUpRequest<{ user: ClickUpUser }>("/user");
}

export function getClickUpList(listId: string) {
  return clickUpRequest<ClickUpList>(`/list/${encodeURIComponent(listId)}`);
}

export function createClickUpTask(listId: string, payload: Record<string, unknown>) {
  return clickUpRequest<ClickUpTask>(`/list/${encodeURIComponent(listId)}/task`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateClickUpTask(taskId: string, payload: Record<string, unknown>) {
  return clickUpRequest<ClickUpTask>(`/task/${encodeURIComponent(taskId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteClickUpTask(taskId: string) {
  return clickUpRequest<void>(`/task/${encodeURIComponent(taskId)}`, { method: "DELETE" });
}
