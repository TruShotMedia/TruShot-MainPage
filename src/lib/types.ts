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

export type PortfolioItem = {
  id: string;
  category_id: string;
  media_kind: "video" | "image";
  alt_text: string;
  public_url: string;
  poster_url: string | null;
  poster_path: string | null;
  display_size: "standard" | "wide" | "tall";
};

export type PortfolioCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  logo_path: string | null;
  position: number;
  is_published: boolean;
  items: PortfolioItem[];
};

export type PortfolioMiscLogo = {
  id: string;
  name: string;
  logo_url: string;
  logo_path: string;
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

export type InvoiceOption = {
  id: string;
  invoice_number: string;
  client_id: string | null;
  client_name: string | null;
  status: string;
  total_cents: number;
  issue_date: string;
};

export type JobInvoiceRelation = InvoiceOption & {
  is_locked: boolean;
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
  related_invoices: JobInvoiceRelation[];
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

export type CalendarJob = {
  id: string;
  entity_type: "job";
  title: string;
  client_name: string | null;
  shoot_date: string | null;
  due_date: string | null;
  status_label: string;
  status_color: string;
  is_complete: boolean;
};

export type CalendarTask = {
  id: string;
  entity_type: "task";
  title: string;
  job_title: string;
  client_name: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status_label: string;
  status_color: string;
  is_complete: boolean;
};

export type CalendarCampaignAsset = {
  id: string;
  entity_type: "campaign-asset";
  title: string;
  campaign_title: string;
  client_name: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status_label: string;
  status_color: string;
  is_complete: boolean;
};

export type CalendarItem = CalendarJob | CalendarTask | CalendarCampaignAsset;

export type CampaignStatus = "planning" | "active" | "paused" | "complete";

export type CampaignAttachment = {
  id: string;
  campaign_asset_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  signed_url: string | null;
  created_at: string;
};

export type CampaignAsset = {
  id: string;
  campaign_id: string;
  invoice_id: string | null;
  status_id: string;
  title: string;
  description: string | null;
  asset_type: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  start_date: string | null;
  due_date: string | null;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  position: number;
  completed_at: string | null;
  updated_at: string;
  status: TaskStatus | null;
  invoice: InvoiceOption | null;
  attachments: CampaignAttachment[];
};

export type Campaign = {
  id: string;
  client_id: string | null;
  title: string;
  objective: string | null;
  status: CampaignStatus;
  start_date: string | null;
  due_date: string | null;
  notes: string | null;
  updated_at: string;
  client: SelectOption | null;
  assets: CampaignAsset[];
};

export type EnquiryStatus = "new" | "reviewing" | "approved" | "declined" | "archived";

export type ClientEnquiry = {
  id: string;
  package_id: string | null;
  name: string;
  business_name: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  budget_range: string | null;
  preferred_timeline: string | null;
  source_path: string;
  status: EnquiryStatus;
  rejection_reason: string | null;
  internal_notes: string | null;
  reviewed_at: string | null;
  converted_client_id: string | null;
  archived_at: string | null;
  created_at: string;
  package: { id: string; title: string } | null;
  converted_client: { id: string; name: string } | null;
};
