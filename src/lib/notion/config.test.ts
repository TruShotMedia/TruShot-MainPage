import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getNotionConfiguration, getNotionConfigurationSummary } from "@/lib/notion/config";

const variableNames = [
  "NOTION_API_TOKEN",
  "NOTION_CLIENTS_DATA_SOURCE_ID",
  "NOTION_JOBS_DATA_SOURCE_ID",
  "NOTION_TASKS_DATA_SOURCE_ID",
  "NOTION_SYNC_INTERVAL_MINUTES",
] as const;

const originalValues = new Map(variableNames.map((name) => [name, process.env[name]]));

describe("Notion configuration", () => {
  beforeEach(() => {
    process.env.NOTION_API_TOKEN = "secret_test_token";
    process.env.NOTION_JOBS_DATA_SOURCE_ID = "47b8cec5c99a4975a2d6ff1e990eb2b1";
    process.env.NOTION_TASKS_DATA_SOURCE_ID = "b5cdeb9c0bcb4c87833bddeeee4ca956";
    delete process.env.NOTION_CLIENTS_DATA_SOURCE_ID;
  });

  afterEach(() => {
    for (const name of variableNames) {
      const value = originalValues.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("enables syncing without the removed Clients database", () => {
    expect(getNotionConfiguration()).toMatchObject({
      clientsSourceId: null,
      jobsSourceId: "47b8cec5c99a4975a2d6ff1e990eb2b1",
      tasksSourceId: "b5cdeb9c0bcb4c87833bddeeee4ca956",
    });
    expect(getNotionConfigurationSummary().configured).toBe(true);

    process.env.NOTION_CLIENTS_DATA_SOURCE_ID = "null";
    expect(getNotionConfiguration()?.clientsSourceId).toBeNull();
  });

  it("still requires the integration token and both operational databases", () => {
    delete process.env.NOTION_TASKS_DATA_SOURCE_ID;
    expect(getNotionConfiguration()).toBeNull();
    expect(getNotionConfigurationSummary().configured).toBe(false);
  });
});
