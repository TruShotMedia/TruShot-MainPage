export type PricingItem = {
  id: string;
  kind: "inclusion" | "exclusion" | "ideal_for" | "note";
  label: string;
  detail: string | null;
  position: number;
};

export type PricingPackage = {
  id: string;
  slug: string;
  title: string;
  eyebrow: string | null;
  summary: string;
  price_cents: number;
  billing_interval: "one_off" | "monthly" | "custom";
  price_suffix: string | null;
  badge: string | null;
  cta_label: string;
  is_featured: boolean;
  position: number;
  items: PricingItem[];
};

export type WebsiteElementKey =
  | "service-content"
  | "service-brand"
  | "service-campaigns"
  | "about-growth-partner";

export type WebsiteElement = {
  id: string;
  element_key: WebsiteElementKey;
  element_type: "service" | "about";
  eyebrow: string | null;
  title: string;
  body: string;
  media_kind: "none" | "video" | "image";
  media_url: string | null;
  media_path: string | null;
  media_alt: string | null;
  position: number;
  is_published: boolean;
};

export type TaskStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_open: boolean;
};

export type PipelineTask = {
  id: string;
  title: string;
  job_id: string;
  status_id: string;
  asset_type: string | null;
  hours: number | null;
  due_date: string | null;
  priority: string;
  description: string | null;
  position: number;
  job?: { title: string; client?: { name: string } | null } | null;
};
