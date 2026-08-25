export type NotionRichText = {
  plain_text?: string;
  href?: string | null;
};

export type NotionProperty = {
  id?: string;
  type: string;
  title?: NotionRichText[];
  rich_text?: NotionRichText[];
  number?: number | null;
  checkbox?: boolean;
  select?: { name?: string } | null;
  status?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  date?: { start?: string | null; end?: string | null } | null;
  relation?: Array<{ id: string }>;
  has_more?: boolean;
  url?: string | null;
  email?: string | null;
  phone_number?: string | null;
  files?: Array<{
    name?: string;
    type?: "external" | "file";
    external?: { url?: string };
    file?: { url?: string };
  }>;
  formula?: {
    type?: string;
    string?: string | null;
    number?: number | null;
    boolean?: boolean | null;
    date?: { start?: string | null; end?: string | null } | null;
  };
  rollup?: {
    type?: string;
    number?: number | null;
    date?: { start?: string | null; end?: string | null } | null;
  };
};

export type NotionPage = {
  object: "page";
  id: string;
  url: string;
  last_edited_time: string;
  in_trash?: boolean;
  properties: Record<string, NotionProperty>;
};

export type NotionSyncResult = {
  status: "completed" | "failed" | "skipped" | "not_configured";
  scanned: { clients: number; jobs: number; tasks: number };
  created: { clients: number; jobs: number; tasks: number };
  linked: { clients: number; jobs: number; tasks: number };
  unresolvedTasks: number;
  warnings: string[];
  message: string;
};
