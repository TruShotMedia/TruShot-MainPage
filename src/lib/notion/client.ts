import "server-only";

import type { NotionPage } from "@/lib/notion/types";

const NOTION_API_ORIGIN = "https://api.notion.com";
const NOTION_API_VERSION = "2026-03-11";
const dataSourceCache = new Map<string, string>();

type NotionListResponse = {
  object: "list";
  results: Array<NotionPage | { object: string }>;
  has_more: boolean;
  next_cursor: string | null;
};

type NotionDatabaseResponse = {
  object: "database";
  data_sources?: Array<{ id: string; name?: string }>;
};

export class NotionApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string | null) {
    super(message);
    this.name = "NotionApiError";
  }
}

function notionId(value: string) {
  const decoded = decodeURIComponent(value.trim());
  const compactMatch = decoded.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i);
  const raw = compactMatch?.[1] ?? decoded.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  if (!raw) throw new Error("A Notion source ID is not valid.");
  const compact = raw.replaceAll("-", "").toLowerCase();
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function notionRequest<T>(token: string, path: string, init?: RequestInit, attempt = 0): Promise<T> {
  const response = await fetch(`${NOTION_API_ORIGIN}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_API_VERSION,
      ...init?.headers,
    },
  });

  if (response.status === 429 && attempt < 3) {
    const retrySeconds = Math.min(10, Math.max(1, Number(response.headers.get("retry-after") ?? 1)));
    await wait(retrySeconds * 1_000);
    return notionRequest<T>(token, path, init, attempt + 1);
  }
  if (response.status >= 500 && attempt < 2) {
    await wait((attempt + 1) * 500);
    return notionRequest<T>(token, path, init, attempt + 1);
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    throw new NotionApiError(payload?.message ?? `Notion returned HTTP ${response.status}.`, response.status, payload?.code ?? null);
  }
  return response.json() as Promise<T>;
}

async function resolveDataSourceId(token: string, configuredId: string) {
  const normalized = notionId(configuredId);
  const cached = dataSourceCache.get(normalized);
  if (cached) return cached;

  try {
    await notionRequest(token, `/v1/data_sources/${normalized}`);
    dataSourceCache.set(normalized, normalized);
    return normalized;
  } catch (error) {
    if (!(error instanceof NotionApiError) || error.status !== 404) throw error;
  }

  const database = await notionRequest<NotionDatabaseResponse>(token, `/v1/databases/${normalized}`);
  const resolved = database.data_sources?.[0]?.id;
  if (!resolved) throw new Error("That Notion database does not contain a queryable data source.");
  dataSourceCache.set(normalized, resolved);
  return resolved;
}

export async function queryNotionSource(token: string, configuredId: string) {
  const dataSourceId = await resolveDataSourceId(token, configuredId);
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const response: NotionListResponse = await notionRequest(token, `/v1/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    pages.push(...response.results
      .filter((result): result is NotionPage => result.object === "page")
      .filter((page) => !page.in_trash));
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor && pages.length < 10_000);

  return pages;
}
