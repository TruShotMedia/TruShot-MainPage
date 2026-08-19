-- TruShot Media website + CRM foundation.
-- Every application-owned database object is namespaced with the required website- prefix.

create extension if not exists pgcrypto;

create schema if not exists "website-private";
revoke all on schema "website-private" from public, anon, authenticated;

create table public."website-workspaces" (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  timezone text not null default 'Australia/Brisbane',
  currency_code text not null default 'AUD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-workspaces-slug-key" unique (slug),
  constraint "website-workspaces-currency-check" check (currency_code ~ '^[A-Z]{3}$')
);

create table public."website-admin-users" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  role text not null default 'editor',
  display_name text,
  is_active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-admin-users-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-admin-users-user-fkey" foreign key (user_id) references auth.users (id) on delete cascade,
  constraint "website-admin-users-role-check" check (role in ('owner', 'admin', 'editor', 'viewer')),
  constraint "website-admin-users-membership-key" unique (workspace_id, user_id)
);

create table public."website-settings" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  business_name text not null default 'TruShot Media',
  legal_name text,
  abn text,
  email text not null default 'info@fearlessau.com',
  phone text,
  address text,
  seo_title text not null default 'TruShot Media | Video & Content Production Brisbane',
  seo_description text not null default 'Bold, strategic video and social content for businesses ready to be seen.',
  analytics_retention_days integer not null default 180,
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-settings-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-settings-workspace-key" unique (workspace_id),
  constraint "website-settings-retention-check" check (analytics_retention_days between 30 and 730)
);

create table public."website-job-statuses" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  key text not null,
  label text not null,
  color text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-job-statuses-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-job-statuses-key-unique" unique (workspace_id, key),
  constraint "website-job-statuses-color-check" check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public."website-task-statuses" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  key text not null,
  label text not null,
  color text not null,
  position integer not null default 0,
  is_open boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-task-statuses-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-task-statuses-key-unique" unique (workspace_id, key),
  constraint "website-task-statuses-color-check" check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create table public."website-pricing-versions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  version_number integer not null,
  name text not null,
  status text not null default 'draft',
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-pricing-versions-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-pricing-versions-publisher-fkey" foreign key (published_by) references auth.users (id) on delete set null,
  constraint "website-pricing-versions-number-key" unique (workspace_id, version_number),
  constraint "website-pricing-versions-status-check" check (status in ('draft', 'published', 'retired')),
  constraint "website-pricing-versions-published-check" check ((status = 'published' and published_at is not null) or status <> 'published')
);

create unique index "website-pricing-versions-one-published-idx"
  on public."website-pricing-versions" (workspace_id)
  where status = 'published';

create table public."website-pricing-packages" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  version_id uuid not null,
  slug text not null,
  title text not null,
  eyebrow text,
  summary text not null,
  price_cents bigint not null,
  billing_interval text not null default 'one_off',
  price_suffix text,
  badge text,
  cta_label text not null default 'Enquire now',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-pricing-packages-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-pricing-packages-version-fkey" foreign key (version_id) references public."website-pricing-versions" (id) on delete cascade,
  constraint "website-pricing-packages-slug-key" unique (version_id, slug),
  constraint "website-pricing-packages-price-check" check (price_cents >= 0),
  constraint "website-pricing-packages-interval-check" check (billing_interval in ('one_off', 'monthly', 'custom'))
);

create table public."website-pricing-package-items" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  package_id uuid not null,
  kind text not null default 'inclusion',
  label text not null,
  detail text,
  quantity numeric(10,2),
  unit text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-pricing-items-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-pricing-items-package-fkey" foreign key (package_id) references public."website-pricing-packages" (id) on delete cascade,
  constraint "website-pricing-items-kind-check" check (kind in ('inclusion', 'exclusion', 'ideal_for', 'note')),
  constraint "website-pricing-items-quantity-check" check (quantity is null or quantity >= 0)
);

create table public."website-package-task-templates" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  package_id uuid not null,
  title text not null,
  asset_type text,
  default_hours numeric(8,2),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-package-templates-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-package-templates-package-fkey" foreign key (package_id) references public."website-pricing-packages" (id) on delete cascade,
  constraint "website-package-templates-hours-check" check (default_hours is null or default_hours >= 0)
);

create table public."website-clients" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  slug text not null,
  status text not null default 'active',
  industry text,
  website_url text,
  priority text not null default 'standard',
  monthly_budget_cents bigint,
  is_retainer boolean not null default false,
  source text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-clients-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-clients-created-by-fkey" foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-clients-updated-by-fkey" foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-clients-slug-key" unique (workspace_id, slug),
  constraint "website-clients-status-check" check (status in ('lead', 'active', 'paused', 'inactive')),
  constraint "website-clients-priority-check" check (priority in ('low', 'standard', 'high', 'vip')),
  constraint "website-clients-budget-check" check (monthly_budget_cents is null or monthly_budget_cents >= 0)
);

create table public."website-client-contacts" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid not null,
  name text not null,
  email text,
  phone text,
  role_title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-client-contacts-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-client-contacts-client-fkey" foreign key (client_id) references public."website-clients" (id) on delete cascade
);

create unique index "website-client-contacts-primary-idx"
  on public."website-client-contacts" (client_id)
  where is_primary;

create table public."website-enquiries" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  package_id uuid,
  pricing_version_id uuid,
  name text not null,
  business_name text,
  email text not null,
  phone text,
  message text,
  budget_range text,
  preferred_timeline text,
  status text not null default 'new',
  source_path text not null default '/',
  attribution jsonb not null default '{}'::jsonb,
  consent_at timestamptz not null,
  reviewed_at timestamptz,
  reviewed_by uuid,
  converted_client_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-enquiries-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-enquiries-package-fkey" foreign key (package_id) references public."website-pricing-packages" (id) on delete set null,
  constraint "website-enquiries-version-fkey" foreign key (pricing_version_id) references public."website-pricing-versions" (id) on delete set null,
  constraint "website-enquiries-reviewer-fkey" foreign key (reviewed_by) references auth.users (id) on delete set null,
  constraint "website-enquiries-client-fkey" foreign key (converted_client_id) references public."website-clients" (id) on delete set null,
  constraint "website-enquiries-status-check" check (status in ('new', 'reviewing', 'approved', 'declined', 'archived')),
  constraint "website-enquiries-email-check" check (position('@' in email) > 1),
  constraint "website-enquiries-name-check" check (char_length(name) between 2 and 120),
  constraint "website-enquiries-message-check" check (message is null or char_length(message) <= 5000)
);

create table public."website-notifications" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint "website-notifications-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade
);

create table public."website-jobs" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid,
  status_id uuid not null,
  package_id uuid,
  title text not null,
  job_number text,
  description text,
  shoot_date date,
  due_date date,
  delivered_at timestamptz,
  location text,
  photos_delivered integer not null default 0,
  hours_basis text not null default 'task_rollup',
  legacy_hours_snapshot numeric(10,2),
  package_snapshot jsonb,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-jobs-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-jobs-client-fkey" foreign key (client_id) references public."website-clients" (id) on delete set null,
  constraint "website-jobs-status-fkey" foreign key (status_id) references public."website-job-statuses" (id),
  constraint "website-jobs-package-fkey" foreign key (package_id) references public."website-pricing-packages" (id) on delete set null,
  constraint "website-jobs-created-by-fkey" foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-jobs-updated-by-fkey" foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-jobs-number-key" unique (workspace_id, job_number),
  constraint "website-jobs-photos-check" check (photos_delivered >= 0),
  constraint "website-jobs-hours-basis-check" check (hours_basis in ('task_rollup', 'legacy_import')),
  constraint "website-jobs-legacy-hours-check" check (legacy_hours_snapshot is null or legacy_hours_snapshot >= 0),
  constraint "website-jobs-date-check" check (due_date is null or shoot_date is null or due_date >= shoot_date)
);

create table public."website-job-tasks" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  job_id uuid not null,
  status_id uuid not null,
  title text not null,
  description text,
  asset_type text,
  priority text not null default 'normal',
  hours numeric(8,2),
  due_date date,
  completed_at timestamptz,
  assignee_id uuid,
  position numeric(18,6) not null default 1000,
  external_url text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-job-tasks-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-job-tasks-job-fkey" foreign key (job_id) references public."website-jobs" (id) on delete cascade,
  constraint "website-job-tasks-status-fkey" foreign key (status_id) references public."website-task-statuses" (id),
  constraint "website-job-tasks-assignee-fkey" foreign key (assignee_id) references auth.users (id) on delete set null,
  constraint "website-job-tasks-created-by-fkey" foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-job-tasks-updated-by-fkey" foreign key (updated_by) references auth.users (id) on delete set null,
  constraint "website-job-tasks-priority-check" check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint "website-job-tasks-hours-check" check (hours is null or hours >= 0)
);

create table public."website-task-comments" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid not null,
  author_id uuid,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-task-comments-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-task-comments-task-fkey" foreign key (task_id) references public."website-job-tasks" (id) on delete cascade,
  constraint "website-task-comments-author-fkey" foreign key (author_id) references auth.users (id) on delete set null,
  constraint "website-task-comments-body-check" check (char_length(body) between 1 and 10000)
);

create table public."website-invoices" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  client_id uuid,
  invoice_number text not null,
  status text not null default 'draft',
  issue_date date,
  due_date date,
  subtotal_cents bigint not null default 0,
  gst_cents bigint not null default 0,
  total_cents bigint not null default 0,
  external_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-invoices-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-invoices-client-fkey" foreign key (client_id) references public."website-clients" (id) on delete set null,
  constraint "website-invoices-number-key" unique (workspace_id, invoice_number),
  constraint "website-invoices-status-check" check (status in ('draft', 'sent', 'viewed', 'part_paid', 'paid', 'overdue', 'void')),
  constraint "website-invoices-money-check" check (subtotal_cents >= 0 and gst_cents >= 0 and total_cents >= 0),
  constraint "website-invoices-date-check" check (due_date is null or issue_date is null or due_date >= issue_date)
);

create table public."website-invoice-lines" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invoice_id uuid not null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_rate_cents bigint not null,
  gst_rate numeric(5,4) not null default 0.10,
  line_total_cents bigint not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-invoice-lines-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-invoice-lines-invoice-fkey" foreign key (invoice_id) references public."website-invoices" (id) on delete cascade,
  constraint "website-invoice-lines-quantity-check" check (quantity > 0),
  constraint "website-invoice-lines-rate-check" check (unit_rate_cents >= 0 and line_total_cents >= 0),
  constraint "website-invoice-lines-gst-check" check (gst_rate between 0 and 1)
);

create table public."website-invoice-job-allocations" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invoice_id uuid not null,
  job_id uuid not null,
  allocated_cents bigint not null default 0,
  hours_snapshot numeric(10,2),
  hourly_rate_snapshot_cents numeric(14,4),
  rounding_adjustment_cents integer not null default 0,
  is_locked boolean not null default false,
  override_reason text,
  overridden_by uuid,
  overridden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-invoice-allocations-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-invoice-allocations-invoice-fkey" foreign key (invoice_id) references public."website-invoices" (id) on delete cascade,
  constraint "website-invoice-allocations-job-fkey" foreign key (job_id) references public."website-jobs" (id) on delete cascade,
  constraint "website-invoice-allocations-overrider-fkey" foreign key (overridden_by) references auth.users (id) on delete set null,
  constraint "website-invoice-allocations-link-key" unique (invoice_id, job_id),
  constraint "website-invoice-allocations-money-check" check (allocated_cents >= 0),
  constraint "website-invoice-allocations-hours-check" check (hours_snapshot is null or hours_snapshot >= 0),
  constraint "website-invoice-allocations-lock-check" check (not is_locked or override_reason is not null)
);

create table public."website-payments" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  invoice_id uuid not null,
  amount_cents bigint not null,
  paid_at timestamptz not null,
  method text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-payments-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-payments-invoice-fkey" foreign key (invoice_id) references public."website-invoices" (id) on delete cascade,
  constraint "website-payments-amount-check" check (amount_cents > 0)
);

create table public."website-expense-categories" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  tax_category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-expense-categories-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-expense-categories-name-key" unique (workspace_id, name)
);

create table public."website-expenses" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  category_id uuid,
  job_id uuid,
  vendor text not null,
  description text,
  incurred_on date not null,
  amount_cents bigint not null,
  gst_credit_cents bigint not null default 0,
  deductible_percent numeric(5,2) not null default 100,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint "website-expenses-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-expenses-category-fkey" foreign key (category_id) references public."website-expense-categories" (id) on delete set null,
  constraint "website-expenses-job-fkey" foreign key (job_id) references public."website-jobs" (id) on delete set null,
  constraint "website-expenses-money-check" check (amount_cents >= 0 and gst_credit_cents >= 0 and gst_credit_cents <= amount_cents),
  constraint "website-expenses-deductible-check" check (deductible_percent between 0 and 100)
);

create table public."website-tax-rate-sets" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  financial_year text not null,
  status text not null default 'draft',
  resident_brackets jsonb not null,
  medicare_levy_rate numeric(7,6) not null default 0.02,
  small_business_offset_rate numeric(7,6) not null default 0.16,
  small_business_offset_cap_cents bigint not null default 100000,
  source_urls jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-tax-rate-sets-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-tax-rate-sets-year-key" unique (workspace_id, financial_year),
  constraint "website-tax-rate-sets-status-check" check (status in ('draft', 'active', 'retired')),
  constraint "website-tax-rate-sets-rates-check" check (medicare_levy_rate between 0 and 1 and small_business_offset_rate between 0 and 1)
);

create table public."website-tax-settings" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  is_gst_registered boolean not null default false,
  gst_registration_threshold_cents bigint not null default 7500000,
  estimate_basis text not null default 'cash',
  payg_withheld_cents bigint not null default 0,
  other_taxable_income_cents bigint not null default 0,
  super_contributions_cents bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint "website-tax-settings-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-tax-settings-workspace-key" unique (workspace_id),
  constraint "website-tax-settings-basis-check" check (estimate_basis in ('cash', 'accrual')),
  constraint "website-tax-settings-money-check" check (gst_registration_threshold_cents >= 0 and payg_withheld_cents >= 0 and other_taxable_income_cents >= 0 and super_contributions_cents >= 0)
);

create table public."website-tax-estimate-snapshots" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  rate_set_id uuid not null,
  period_start date not null,
  period_end date not null,
  assumptions jsonb not null,
  results jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint "website-tax-snapshots-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-tax-snapshots-rate-set-fkey" foreign key (rate_set_id) references public."website-tax-rate-sets" (id),
  constraint "website-tax-snapshots-creator-fkey" foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-tax-snapshots-period-check" check (period_end >= period_start)
);

create table public."website-analytics-sessions" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  anonymous_id uuid not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0,
  landing_path text,
  referrer_domain text,
  utm jsonb not null default '{}'::jsonb,
  device_class text,
  viewport_bucket text,
  consent_state text not null default 'analytics',
  constraint "website-analytics-sessions-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-analytics-sessions-anonymous-key" unique (workspace_id, anonymous_id),
  constraint "website-analytics-sessions-active-check" check (active_seconds >= 0),
  constraint "website-analytics-sessions-device-check" check (device_class is null or device_class in ('mobile', 'tablet', 'desktop'))
);

create table public."website-analytics-events" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid,
  anonymous_id uuid not null,
  event_name text not null,
  page_path text not null,
  analytics_key text,
  section text,
  package_slug text,
  properties jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint "website-analytics-events-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-analytics-events-session-fkey" foreign key (session_id) references public."website-analytics-sessions" (id) on delete set null,
  constraint "website-analytics-events-name-check" check (event_name in ('page_view', 'cta_click', 'pricing_view', 'package_select', 'form_start', 'enquiry_submit', 'heartbeat', 'scroll_depth')),
  constraint "website-analytics-events-properties-check" check (pg_column_size(properties) <= 8192)
);

create table public."website-analytics-daily" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  day date not null,
  page_path text not null,
  sessions integer not null default 0,
  page_views integer not null default 0,
  active_seconds bigint not null default 0,
  cta_clicks integer not null default 0,
  enquiries integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint "website-analytics-daily-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-analytics-daily-key" unique (workspace_id, day, page_path),
  constraint "website-analytics-daily-counts-check" check (sessions >= 0 and page_views >= 0 and active_seconds >= 0 and cta_clicks >= 0 and enquiries >= 0)
);

create table public."website-activity-log" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint "website-activity-log-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-activity-log-actor-fkey" foreign key (actor_id) references auth.users (id) on delete set null
);

create table public."website-audit-log" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now(),
  constraint "website-audit-log-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-audit-log-actor-fkey" foreign key (actor_id) references auth.users (id) on delete set null
);

create table public."website-import-runs" (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  source_name text not null,
  checksum text,
  status text not null default 'pending',
  row_counts jsonb not null default '{}'::jsonb,
  reconciliation jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid,
  constraint "website-import-runs-workspace-fkey" foreign key (workspace_id) references public."website-workspaces" (id) on delete cascade,
  constraint "website-import-runs-creator-fkey" foreign key (created_by) references auth.users (id) on delete set null,
  constraint "website-import-runs-status-check" check (status in ('pending', 'running', 'completed', 'failed', 'reconciled'))
);

-- Index every foreign key and the most common dashboard/pipeline filters.
create index "website-admin-users-user-idx" on public."website-admin-users" (user_id, is_active);
create index "website-job-statuses-workspace-position-idx" on public."website-job-statuses" (workspace_id, position) where is_active;
create index "website-task-statuses-workspace-position-idx" on public."website-task-statuses" (workspace_id, position) where is_active;
create index "website-pricing-packages-version-position-idx" on public."website-pricing-packages" (version_id, position) where is_active;
create index "website-pricing-items-package-position-idx" on public."website-pricing-package-items" (package_id, position);
create index "website-package-templates-package-position-idx" on public."website-package-task-templates" (package_id, position);
create index "website-clients-workspace-status-idx" on public."website-clients" (workspace_id, status, updated_at desc) where archived_at is null;
create index "website-client-contacts-client-idx" on public."website-client-contacts" (client_id);
create index "website-enquiries-workspace-status-idx" on public."website-enquiries" (workspace_id, status, created_at desc);
create index "website-enquiries-package-idx" on public."website-enquiries" (package_id) where package_id is not null;
create index "website-enquiries-version-idx" on public."website-enquiries" (pricing_version_id) where pricing_version_id is not null;
create index "website-enquiries-client-idx" on public."website-enquiries" (converted_client_id) where converted_client_id is not null;
create index "website-notifications-workspace-unread-idx" on public."website-notifications" (workspace_id, created_at desc) where read_at is null;
create index "website-jobs-client-idx" on public."website-jobs" (client_id) where archived_at is null;
create index "website-jobs-status-due-idx" on public."website-jobs" (status_id, due_date) where archived_at is null;
create index "website-jobs-package-idx" on public."website-jobs" (package_id) where package_id is not null;
create index "website-job-tasks-job-idx" on public."website-job-tasks" (job_id) where archived_at is null;
create index "website-job-tasks-status-position-idx" on public."website-job-tasks" (status_id, position) where archived_at is null;
create index "website-job-tasks-assignee-idx" on public."website-job-tasks" (assignee_id) where assignee_id is not null and archived_at is null;
create index "website-task-comments-task-created-idx" on public."website-task-comments" (task_id, created_at);
create index "website-invoices-client-status-idx" on public."website-invoices" (client_id, status) where archived_at is null;
create index "website-invoice-lines-invoice-idx" on public."website-invoice-lines" (invoice_id, position);
create index "website-invoice-allocations-job-idx" on public."website-invoice-job-allocations" (job_id);
create index "website-invoice-allocations-workspace-idx" on public."website-invoice-job-allocations" (workspace_id, invoice_id);
create index "website-payments-invoice-paid-idx" on public."website-payments" (invoice_id, paid_at);
create index "website-expense-categories-workspace-idx" on public."website-expense-categories" (workspace_id, is_active);
create index "website-expenses-workspace-date-idx" on public."website-expenses" (workspace_id, incurred_on desc) where archived_at is null;
create index "website-expenses-category-idx" on public."website-expenses" (category_id) where category_id is not null;
create index "website-expenses-job-idx" on public."website-expenses" (job_id) where job_id is not null;
create index "website-tax-rate-sets-workspace-status-idx" on public."website-tax-rate-sets" (workspace_id, status);
create index "website-tax-snapshots-rate-set-idx" on public."website-tax-estimate-snapshots" (rate_set_id, created_at desc);
create index "website-analytics-sessions-workspace-started-idx" on public."website-analytics-sessions" (workspace_id, started_at desc);
create index "website-analytics-events-session-idx" on public."website-analytics-events" (session_id) where session_id is not null;
create index "website-analytics-events-workspace-time-idx" on public."website-analytics-events" (workspace_id, occurred_at desc);
create index "website-analytics-events-key-time-idx" on public."website-analytics-events" (analytics_key, occurred_at desc) where analytics_key is not null;
create index "website-activity-log-workspace-created-idx" on public."website-activity-log" (workspace_id, created_at desc);
create index "website-audit-log-workspace-created-idx" on public."website-audit-log" (workspace_id, created_at desc);
create index "website-import-runs-workspace-started-idx" on public."website-import-runs" (workspace_id, started_at desc);

-- Private helpers used by RLS and database automation.
create or replace function "website-private"."website-has-workspace-access"(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."website-admin-users" membership
    where membership.workspace_id = requested_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
  );
$$;

create or replace function "website-private"."website-has-finance-access"(requested_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public."website-admin-users" membership
    where membership.workspace_id = requested_workspace_id
      and membership.user_id = (select auth.uid())
      and membership.is_active
      and membership.role in ('owner', 'admin')
  );
$$;

create or replace function "website-private"."website-set-updated-at"()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function "website-private"."website-create-enquiry-notification"()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public."website-notifications" (workspace_id, type, title, body, entity_type, entity_id)
  values (new.workspace_id, 'enquiry', 'New client enquiry', concat(new.name, coalesce(' · ' || new.business_name, '')), 'enquiry', new.id);
  return new;
end;
$$;

revoke all on function "website-private"."website-has-workspace-access"(uuid) from public, anon;
revoke all on function "website-private"."website-has-finance-access"(uuid) from public, anon;
grant usage on schema "website-private" to authenticated;
grant execute on function "website-private"."website-has-workspace-access"(uuid) to authenticated;
grant execute on function "website-private"."website-has-finance-access"(uuid) to authenticated;
revoke all on function "website-private"."website-set-updated-at"() from public, anon, authenticated;
revoke all on function "website-private"."website-create-enquiry-notification"() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website-workspaces', 'website-admin-users', 'website-settings', 'website-job-statuses',
    'website-task-statuses', 'website-pricing-versions', 'website-pricing-packages',
    'website-pricing-package-items', 'website-package-task-templates', 'website-clients',
    'website-client-contacts', 'website-enquiries', 'website-jobs', 'website-job-tasks',
    'website-task-comments', 'website-invoices', 'website-invoice-lines',
    'website-invoice-job-allocations', 'website-payments', 'website-expense-categories',
    'website-expenses', 'website-tax-rate-sets', 'website-tax-settings',
    'website-analytics-daily'
  ]
  loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function "website-private"."website-set-updated-at"()',
      'website-' || replace(table_name, 'website-', '') || '-updated-at',
      table_name
    );
  end loop;
end $$;

create trigger "website-enquiries-notification"
after insert on public."website-enquiries"
for each row execute function "website-private"."website-create-enquiry-notification"();

-- Live operational metrics. Legacy hours are an explicit import-only fallback until task hours are backfilled.
create view public."website-job-rollups"
with (security_invoker = true)
as
select
  job.id as job_id,
  job.workspace_id,
  coalesce(sum(task.hours) filter (where task.archived_at is null), 0)::numeric(12,2) as task_hours,
  count(task.id) filter (where task.archived_at is null)::integer as created_assets,
  count(task.id) filter (where task.archived_at is null and status.is_open)::integer as open_tasks,
  case
    when job.hours_basis = 'legacy_import' and job.legacy_hours_snapshot is not null then job.legacy_hours_snapshot
    else coalesce(sum(task.hours) filter (where task.archived_at is null), 0)
  end::numeric(12,2) as effective_hours,
  bool_or(task.hours is null) filter (where task.archived_at is null) as has_unset_task_hours
from public."website-jobs" job
left join public."website-job-tasks" task on task.job_id = job.id
left join public."website-task-statuses" status on status.id = task.status_id
group by job.id, job.workspace_id, job.hours_basis, job.legacy_hours_snapshot;

create view public."website-invoice-allocation-metrics"
with (security_invoker = true)
as
with base as (
  select
    allocation.id,
    allocation.workspace_id,
    allocation.invoice_id,
    allocation.job_id,
    allocation.is_locked,
    allocation.allocated_cents as locked_cents,
    invoice.total_cents,
    rollup.effective_hours,
    sum(case when allocation.is_locked then allocation.allocated_cents else 0 end)
      over (partition by allocation.invoice_id) as locked_total_cents,
    sum(case when not allocation.is_locked then rollup.effective_hours else 0 end)
      over (partition by allocation.invoice_id) as unlocked_total_hours
  from public."website-invoice-job-allocations" allocation
  join public."website-invoices" invoice on invoice.id = allocation.invoice_id
  join public."website-job-rollups" rollup on rollup.job_id = allocation.job_id
), raw as (
  select
    base.*,
    greatest(total_cents - locked_total_cents, 0) as distributable_cents,
    case
      when not is_locked and unlocked_total_hours > 0
        then greatest(total_cents - locked_total_cents, 0)::numeric * effective_hours / unlocked_total_hours
      else 0::numeric
    end as raw_cents
  from base
), ranked as (
  select
    raw.*,
    floor(raw_cents)::bigint as base_cents,
    row_number() over (partition by invoice_id order by (raw_cents - floor(raw_cents)) desc, job_id) as remainder_rank,
    sum(floor(raw_cents)::bigint) over (partition by invoice_id) as allocated_base_total
  from raw
)
select
  id,
  workspace_id,
  invoice_id,
  job_id,
  effective_hours,
  case when unlocked_total_hours > 0 then distributable_cents::numeric / unlocked_total_hours else 0 end as hourly_rate_cents,
  case
    when is_locked then locked_cents
    when unlocked_total_hours = 0 then 0
    else base_cents + case when remainder_rank <= distributable_cents - allocated_base_total then 1 else 0 end
  end::bigint as calculated_cents,
  is_locked,
  unlocked_total_hours = 0 and not is_locked as needs_hours
from ranked;

create view public."website-job-metrics"
with (security_invoker = true)
as
select
  job.id,
  job.workspace_id,
  job.client_id,
  job.status_id,
  job.title,
  job.job_number,
  job.shoot_date,
  job.due_date,
  job.photos_delivered,
  rollup.task_hours,
  rollup.effective_hours as hours,
  rollup.created_assets,
  rollup.open_tasks,
  rollup.has_unset_task_hours,
  coalesce(sum(allocation.calculated_cents), 0)::bigint as value_cents,
  bool_or(allocation.needs_hours) as allocation_needs_hours
from public."website-jobs" job
join public."website-job-rollups" rollup on rollup.job_id = job.id
left join public."website-invoice-allocation-metrics" allocation on allocation.job_id = job.id
group by job.id, job.workspace_id, job.client_id, job.status_id, job.title, job.job_number,
  job.shoot_date, job.due_date, job.photos_delivered, rollup.task_hours, rollup.effective_hours,
  rollup.created_assets, rollup.open_tasks, rollup.has_unset_task_hours;

create view public."website-finance-overview"
with (security_invoker = true)
as
select
  invoice.workspace_id,
  coalesce(sum(invoice.total_cents) filter (where invoice.status <> 'void'), 0)::bigint as invoiced_cents,
  coalesce(sum(payment.paid_cents), 0)::bigint as paid_cents,
  coalesce(sum(invoice.total_cents) filter (where invoice.status <> 'void'), 0)::bigint - coalesce(sum(payment.paid_cents), 0)::bigint as outstanding_cents
from public."website-invoices" invoice
left join (
  select invoice_id, sum(amount_cents)::bigint as paid_cents
  from public."website-payments"
  group by invoice_id
) payment on payment.invoice_id = invoice.id
group by invoice.workspace_id;

-- Enable RLS on every exposed table. Views inherit the caller and underlying table policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website-workspaces', 'website-admin-users', 'website-settings', 'website-job-statuses',
    'website-task-statuses', 'website-pricing-versions', 'website-pricing-packages',
    'website-pricing-package-items', 'website-package-task-templates', 'website-clients',
    'website-client-contacts', 'website-enquiries', 'website-notifications', 'website-jobs',
    'website-job-tasks', 'website-task-comments', 'website-invoices', 'website-invoice-lines',
    'website-invoice-job-allocations', 'website-payments', 'website-expense-categories',
    'website-expenses', 'website-tax-rate-sets', 'website-tax-settings',
    'website-tax-estimate-snapshots', 'website-analytics-sessions', 'website-analytics-events',
    'website-analytics-daily', 'website-activity-log', 'website-audit-log', 'website-import-runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Workspace and membership have bespoke policies to avoid recursive RLS.
create policy "website-workspaces-member-select" on public."website-workspaces"
for select to authenticated
using ((select "website-private"."website-has-workspace-access"(id)));

create policy "website-admin-users-own-select" on public."website-admin-users"
for select to authenticated
using (user_id = (select auth.uid()) and is_active);

create policy "website-admin-users-owner-manage" on public."website-admin-users"
for all to authenticated
using ((select "website-private"."website-has-finance-access"(workspace_id)))
with check ((select "website-private"."website-has-finance-access"(workspace_id)));

-- General workspace access policies.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website-settings', 'website-job-statuses', 'website-task-statuses',
    'website-package-task-templates', 'website-clients', 'website-client-contacts',
    'website-enquiries', 'website-notifications', 'website-jobs', 'website-job-tasks',
    'website-task-comments', 'website-activity-log', 'website-import-runs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select "website-private"."website-has-workspace-access"(workspace_id))) with check ((select "website-private"."website-has-workspace-access"(workspace_id)))',
      'website-' || replace(table_name, 'website-', '') || '-member-all',
      table_name
    );
  end loop;
end $$;

-- Finance, pricing publication, tax, analytics reporting, and audit writes require owner/admin access.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'website-pricing-versions', 'website-pricing-packages', 'website-pricing-package-items',
    'website-invoices', 'website-invoice-lines', 'website-invoice-job-allocations',
    'website-payments', 'website-expense-categories', 'website-expenses',
    'website-tax-rate-sets', 'website-tax-settings', 'website-tax-estimate-snapshots',
    'website-analytics-sessions', 'website-analytics-events', 'website-analytics-daily',
    'website-audit-log'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select "website-private"."website-has-finance-access"(workspace_id))) with check ((select "website-private"."website-has-finance-access"(workspace_id)))',
      'website-' || replace(table_name, 'website-', '') || '-admin-all',
      table_name
    );
  end loop;
end $$;

-- Anonymous visitors can read only the currently published package set.
create policy "website-pricing-versions-public-select" on public."website-pricing-versions"
for select to anon
using (status = 'published');

create policy "website-pricing-packages-public-select" on public."website-pricing-packages"
for select to anon
using (
  is_active and exists (
    select 1 from public."website-pricing-versions" version
    where version.id = version_id and version.status = 'published'
  )
);

create policy "website-pricing-items-public-select" on public."website-pricing-package-items"
for select to anon
using (
  exists (
    select 1
    from public."website-pricing-packages" package
    join public."website-pricing-versions" version on version.id = package.version_id
    where package.id = package_id and package.is_active and version.status = 'published'
  )
);

-- Validated route handlers use the publishable role for deliberately narrow public writes.
create policy "website-enquiries-public-insert" on public."website-enquiries"
for insert to anon
with check (
  workspace_id = '11111111-1111-4111-8111-111111111111'::uuid
  and status = 'new'
  and reviewed_at is null
  and reviewed_by is null
  and converted_client_id is null
);

create policy "website-analytics-sessions-public-insert" on public."website-analytics-sessions"
for insert to anon
with check (workspace_id = '11111111-1111-4111-8111-111111111111'::uuid and active_seconds = 0);

create policy "website-analytics-sessions-public-update" on public."website-analytics-sessions"
for update to anon
using (workspace_id = '11111111-1111-4111-8111-111111111111'::uuid)
with check (workspace_id = '11111111-1111-4111-8111-111111111111'::uuid);

create policy "website-analytics-events-public-insert" on public."website-analytics-events"
for insert to anon
with check (workspace_id = '11111111-1111-4111-8111-111111111111'::uuid and occurred_at <= now() + interval '5 minutes');

-- Least-privilege grants, scoped only to TruShot objects in this shared project.
revoke all on
  public."website-workspaces", public."website-admin-users", public."website-settings",
  public."website-job-statuses", public."website-task-statuses", public."website-pricing-versions",
  public."website-pricing-packages", public."website-pricing-package-items",
  public."website-package-task-templates", public."website-clients", public."website-client-contacts",
  public."website-enquiries", public."website-notifications", public."website-jobs",
  public."website-job-tasks", public."website-task-comments", public."website-invoices",
  public."website-invoice-lines", public."website-invoice-job-allocations", public."website-payments",
  public."website-expense-categories", public."website-expenses", public."website-tax-rate-sets",
  public."website-tax-settings", public."website-tax-estimate-snapshots",
  public."website-analytics-sessions", public."website-analytics-events", public."website-analytics-daily",
  public."website-activity-log", public."website-audit-log", public."website-import-runs"
from anon, authenticated;
grant select on public."website-pricing-versions", public."website-pricing-packages", public."website-pricing-package-items" to anon;
grant insert on public."website-enquiries", public."website-analytics-sessions", public."website-analytics-events" to anon;
grant update (last_seen_at, active_seconds) on public."website-analytics-sessions" to anon;

grant select, insert, update, delete on
  public."website-admin-users", public."website-settings", public."website-job-statuses",
  public."website-task-statuses", public."website-pricing-versions", public."website-pricing-packages",
  public."website-pricing-package-items", public."website-package-task-templates", public."website-clients",
  public."website-client-contacts", public."website-enquiries", public."website-notifications",
  public."website-jobs", public."website-job-tasks", public."website-task-comments",
  public."website-invoices", public."website-invoice-lines", public."website-invoice-job-allocations",
  public."website-payments", public."website-expense-categories", public."website-expenses",
  public."website-tax-rate-sets", public."website-tax-settings", public."website-tax-estimate-snapshots",
  public."website-analytics-sessions", public."website-analytics-events", public."website-analytics-daily",
  public."website-activity-log", public."website-import-runs"
to authenticated;
grant select on public."website-workspaces", public."website-audit-log",
  public."website-job-rollups", public."website-invoice-allocation-metrics",
  public."website-job-metrics", public."website-finance-overview" to authenticated;

-- Initial workspace, owner membership, statuses, settings, tax assumptions, and published pricing.
insert into public."website-workspaces" (id, name, slug)
values ('11111111-1111-4111-8111-111111111111', 'TruShot Media', 'trushot-media')
on conflict (id) do nothing;

insert into public."website-admin-users" (workspace_id, user_id, role, display_name)
select '11111111-1111-4111-8111-111111111111', id, 'owner', 'TruShot Owner'
from auth.users
where id = '3ccfc0e7-254e-4cbe-8b86-4bb8063d1220'
on conflict (workspace_id, user_id) do update set role = excluded.role, is_active = true;

insert into public."website-settings" (workspace_id, legal_name)
values ('11111111-1111-4111-8111-111111111111', 'TruShot Media')
on conflict (workspace_id) do nothing;

insert into public."website-tax-settings" (workspace_id)
values ('11111111-1111-4111-8111-111111111111')
on conflict (workspace_id) do nothing;

insert into public."website-job-statuses" (workspace_id, key, label, color, position, is_closed) values
  ('11111111-1111-4111-8111-111111111111', 'planning', 'Planning', '#7A7A76', 10, false),
  ('11111111-1111-4111-8111-111111111111', 'scheduled', 'Scheduled', '#4C78A8', 20, false),
  ('11111111-1111-4111-8111-111111111111', 'production', 'In Production', '#9B633E', 30, false),
  ('11111111-1111-4111-8111-111111111111', 'review', 'Client Review', '#76598C', 40, false),
  ('11111111-1111-4111-8111-111111111111', 'delivered', 'Delivered', '#397253', 50, true)
on conflict (workspace_id, key) do nothing;

insert into public."website-task-statuses" (workspace_id, key, label, color, position, is_open) values
  ('11111111-1111-4111-8111-111111111111', 'not_started', 'Not Started', '#777773', 10, true),
  ('11111111-1111-4111-8111-111111111111', 'in_progress', 'In Progress', '#4778AD', 20, true),
  ('11111111-1111-4111-8111-111111111111', 'ready_for_revision', 'Ready For Revision', '#9B633E', 30, true),
  ('11111111-1111-4111-8111-111111111111', 'final_draft_notes', 'Final Draft/Notes', '#76598C', 40, true),
  ('11111111-1111-4111-8111-111111111111', 'ready_to_post', 'Ready To Post', '#397253', 50, false),
  ('11111111-1111-4111-8111-111111111111', 'posted_done', 'Posted / Done', '#6D6D69', 60, false)
on conflict (workspace_id, key) do nothing;

insert into public."website-pricing-versions" (workspace_id, version_number, name, status, published_at, published_by)
values ('11111111-1111-4111-8111-111111111111', 1, '2026 launch pricing', 'published', now(), '3ccfc0e7-254e-4cbe-8b86-4bb8063d1220')
on conflict (workspace_id, version_number) do nothing;

insert into public."website-pricing-packages"
  (workspace_id, version_id, slug, title, eyebrow, summary, price_cents, billing_interval, price_suffix, badge, is_featured, position)
select
  '11111111-1111-4111-8111-111111111111', version.id, package.slug, package.title, package.eyebrow,
  package.summary, package.price_cents, package.billing_interval, package.price_suffix, package.badge, package.is_featured, package.position
from public."website-pricing-versions" version
cross join (values
  ('social-reel', 'Social Reel', 'One sharp idea', 'A polished vertical reel built to stop the scroll.', 35000::bigint, 'one_off', 'one-off', null::text, false, 10),
  ('essentials', 'Essentials', 'Stay consistently visible', 'A dependable monthly content rhythm for growing brands.', 100000::bigint, 'monthly', '/month', null::text, false, 20),
  ('growth', 'Growth', 'Build real momentum', 'More creative range, more frequent publishing, more opportunities to convert.', 175000::bigint, 'monthly', '/month', 'Most popular', true, 30),
  ('partner', 'Partner', 'Your embedded media team', 'High-output content support with strategic attention built in.', 250000::bigint, 'monthly', '/month', null::text, false, 40),
  ('content-growth', 'Content + Growth', 'Create and amplify', 'Production and campaign support working together for sustained growth.', 350000::bigint, 'monthly', '/month + ad spend', null::text, false, 50)
) as package(slug, title, eyebrow, summary, price_cents, billing_interval, price_suffix, badge, is_featured, position)
where version.workspace_id = '11111111-1111-4111-8111-111111111111'
  and version.version_number = 1
on conflict (version_id, slug) do nothing;

insert into public."website-pricing-package-items" (workspace_id, package_id, kind, label, position)
select '11111111-1111-4111-8111-111111111111', package.id, item.kind, item.label, item.position
from public."website-pricing-packages" package
join public."website-pricing-versions" version on version.id = package.version_id
join (values
  ('social-reel', 'inclusion', '1 vertical social video', 10),
  ('social-reel', 'inclusion', 'Planning, filming and edit', 20),
  ('social-reel', 'inclusion', 'One revision round', 30),
  ('essentials', 'inclusion', 'Monthly planning session', 10),
  ('essentials', 'inclusion', '4 short-form videos', 20),
  ('essentials', 'inclusion', '8 edited photos', 30),
  ('growth', 'inclusion', 'Monthly content strategy', 10),
  ('growth', 'inclusion', '8 short-form videos', 20),
  ('growth', 'inclusion', '20 edited photos', 30),
  ('growth', 'inclusion', 'Priority turnaround', 40),
  ('partner', 'inclusion', 'Fortnightly production support', 10),
  ('partner', 'inclusion', '12 short-form videos', 20),
  ('partner', 'inclusion', '40 edited photos', 30),
  ('partner', 'inclusion', 'Creative direction and reporting', 40),
  ('content-growth', 'inclusion', 'Full Partner production package', 10),
  ('content-growth', 'inclusion', 'Campaign planning and optimisation', 20),
  ('content-growth', 'inclusion', 'Monthly performance reporting', 30),
  ('content-growth', 'exclusion', 'Advertising spend billed separately', 40)
) as item(package_slug, kind, label, position) on item.package_slug = package.slug
where version.workspace_id = '11111111-1111-4111-8111-111111111111'
  and version.version_number = 1;

insert into public."website-expense-categories" (workspace_id, name, tax_category) values
  ('11111111-1111-4111-8111-111111111111', 'Equipment & gear', 'depreciating_assets'),
  ('11111111-1111-4111-8111-111111111111', 'Software & subscriptions', 'operating_expense'),
  ('11111111-1111-4111-8111-111111111111', 'Travel & vehicle', 'travel'),
  ('11111111-1111-4111-8111-111111111111', 'Contractors', 'contract_labour'),
  ('11111111-1111-4111-8111-111111111111', 'Marketing', 'advertising'),
  ('11111111-1111-4111-8111-111111111111', 'Other', 'other')
on conflict (workspace_id, name) do nothing;

insert into public."website-tax-rate-sets"
  (workspace_id, financial_year, status, resident_brackets, source_urls, reviewed_at)
values (
  '11111111-1111-4111-8111-111111111111',
  '2026-27',
  'active',
  '[{"from_cents":0,"to_cents":1820000,"rate":0,"base_cents":0},{"from_cents":1820000,"to_cents":4500000,"rate":0.15,"base_cents":0},{"from_cents":4500000,"to_cents":13500000,"rate":0.30,"base_cents":402000},{"from_cents":13500000,"to_cents":19000000,"rate":0.37,"base_cents":3102000},{"from_cents":19000000,"to_cents":null,"rate":0.45,"base_cents":5137000}]'::jsonb,
  '["https://treasury.gov.au/tax-cuts","https://www.ato.gov.au/tax-rates-and-codes/individual-income-tax-rates"]'::jsonb,
  now()
)
on conflict (workspace_id, financial_year) do nothing;
