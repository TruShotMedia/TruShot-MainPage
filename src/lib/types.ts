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

export type PublicWebsiteSettings = {
  show_pricing: boolean;
};

export type TaskStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_open: boolean;
};

export type JobStatus = {
  id: string;
  key: string;
  label: string;
  color: string;
  position: number;
  is_closed: boolean;
};

export type SelectOption = {
  id: string;
  name: string;
};

export type JobRecord = {
  id: string;
  title: string;
  job_number: string | null;
  client_id: string | null;
  status_id: string;
  shoot_date: string | null;
  due_date: string | null;
  photos_delivered: number;
  hours: number;
  created_assets: number;
  open_tasks: number;
  value_cents: number;
  has_unset_task_hours: boolean;
  allocation_needs_hours: boolean;
  location: string | null;
  description: string | null;
  notes: string | null;
  updated_at: string;
  client: { id: string; name: string } | null;
  status: JobStatus | null;
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
  updated_at: string;
  job?: { title: string; client?: { name: string } | null } | null;
};
