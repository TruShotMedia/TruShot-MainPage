import { cache } from "react";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { PortfolioCategory, PortfolioItem } from "@/lib/types";

export const getAdminContext = cache(async () => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return null;

  const { data: membership } = await supabase
    .from("website-admin-users")
    .select("id,role,display_name,workspace_id")
    .eq("user_id", claims.claims.sub)
    .eq("is_active", true)
    .maybeSingle();

  if (!membership) return null;
  return { supabase, claims: claims.claims, membership };
});

export async function getOverviewData() {
  const context = await getAdminContext();
  if (!context) return null;
  const { supabase } = context;

  const [clients, jobs, tasks, enquiries, invoices, finance, recentJobs] = await Promise.all([
    supabase.from("website-clients").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("website-jobs").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("website-job-tasks").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("website-enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("website-invoices").select("id,total_cents,status,due_date"),
    supabase.from("website-finance-overview").select("*").maybeSingle(),
    supabase.from("website-job-metrics").select("id,title,job_number,hours,created_assets,open_tasks,value_cents,due_date").gt("open_tasks", 0).order("due_date", { ascending: true, nullsFirst: false }).limit(6),
  ]);

  return {
    counts: { clients: clients.count ?? 0, jobs: jobs.count ?? 0, tasks: tasks.count ?? 0, enquiries: enquiries.count ?? 0 },
    invoices: invoices.data ?? [],
    finance: finance.data,
    recentJobs: recentJobs.data ?? [],
  };
}

export async function getClients() {
  const context = await getAdminContext();
  if (!context) return [];
  const { data: clients } = await context.supabase
    .from("website-clients")
    .select("id,name,slug,status,industry,website_url,priority,is_retainer,monthly_budget_cents,package_id,notes,updated_at")
    .is("archived_at", null)
    .order("name");
  if (!clients?.length) return [];
  const [{ data: contacts }, { data: invoices }, { data: payments }, { data: jobs }, { data: jobMetrics }, { data: packages }] = await Promise.all([
    context.supabase
      .from("website-client-contacts")
      .select("id,client_id,name,email,phone,is_primary")
      .in("client_id", clients.map((client) => client.id)),
    context.supabase
      .from("website-invoices")
      .select("id,client_id,status,total_cents")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-payments")
      .select("invoice_id,amount_cents")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-jobs")
      .select("id,client_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-job-metrics")
      .select("id,value_cents")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-pricing-packages")
      .select("id,title")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  const invoiceById = new Map((invoices ?? []).map((invoice) => [invoice.id, invoice]));
  const invoicedByClient = new Map<string, number>();
  for (const invoice of invoices ?? []) {
    if (!invoice.client_id || invoice.status === "void") continue;
    invoicedByClient.set(invoice.client_id, (invoicedByClient.get(invoice.client_id) ?? 0) + Number(invoice.total_cents));
  }
  const paidByClient = new Map<string, number>();
  for (const payment of payments ?? []) {
    const invoice = invoiceById.get(payment.invoice_id);
    if (!invoice?.client_id || invoice.status === "void") continue;
    paidByClient.set(invoice.client_id, (paidByClient.get(invoice.client_id) ?? 0) + Number(payment.amount_cents));
  }
  const jobById = new Map((jobs ?? []).map((job) => [job.id, job]));
  const earnedByClient = new Map<string, number>();
  for (const metric of jobMetrics ?? []) {
    const job = jobById.get(metric.id);
    if (!job?.client_id) continue;
    earnedByClient.set(job.client_id, (earnedByClient.get(job.client_id) ?? 0) + Number(metric.value_cents));
  }
  return clients.map((client) => ({
    ...client,
    package: (packages ?? []).find((item) => item.id === client.package_id) ?? null,
    contacts: (contacts ?? []).filter((contact) => contact.client_id === client.id),
    invoiced_cents: invoicedByClient.get(client.id) ?? 0,
    earned_cents: earnedByClient.get(client.id) ?? 0,
    paid_cents: paidByClient.get(client.id) ?? 0,
  }));
}

export async function getJobs() {
  const context = await getAdminContext();
  if (!context) return [];
  const [{ data: metrics }, { data: baseJobs }, { data: clients }, { data: statuses }] = await Promise.all([
    context.supabase.from("website-job-metrics").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase.from("website-jobs").select("id,location,description,notes,updated_at").is("archived_at", null),
    context.supabase.from("website-clients").select("id,name"),
    context.supabase.from("website-job-statuses").select("id,key,label,color,position,is_closed").eq("is_active", true).order("position"),
  ]);
  const baseById = new Map((baseJobs ?? []).map((job) => [job.id, job]));
  const clientById = new Map((clients ?? []).map((client) => [client.id, client]));
  const statusById = new Map((statuses ?? []).map((status) => [status.id, status]));
  return (metrics ?? []).flatMap((job) => {
    const baseJob = baseById.get(job.id);
    if (!baseJob) return [];
    return [{
      ...job,
      ...baseJob,
      client: job.client_id ? clientById.get(job.client_id) ?? null : null,
      status: statusById.get(job.status_id) ?? null,
    }];
  });
}

export async function getPipeline() {
  const context = await getAdminContext();
  if (!context) return { statuses: [], tasks: [] };
  const [statuses, tasks, jobs, clients] = await Promise.all([
    context.supabase.from("website-task-statuses").select("id,key,label,color,position,is_open").eq("is_active", true).order("position"),
    context.supabase.from("website-job-tasks").select("id,title,job_id,status_id,asset_type,hours,due_date,priority,description,position,updated_at").is("archived_at", null).order("position"),
    context.supabase.from("website-jobs").select("id,title,client_id").is("archived_at", null),
    context.supabase.from("website-clients").select("id,name").is("archived_at", null),
  ]);
  return {
    statuses: statuses.data ?? [],
    tasks: (tasks.data ?? []).map((task) => {
      const job = (jobs.data ?? []).find((entry) => entry.id === task.job_id);
      return { ...task, job: job ? { ...job, client: (clients.data ?? []).find((client) => client.id === job.client_id) ?? null } : null };
    }),
  };
}

export async function getInvoices() {
  const context = await getAdminContext();
  if (!context) return [];
  const [{ data: invoices }, { data: clients }, { data: payments }] = await Promise.all([
    context.supabase.from("website-invoices").select("id,client_id,invoice_number,status,issue_date,due_date,subtotal_cents,gst_cents,total_cents,external_url,notes").is("archived_at", null).order("issue_date", { ascending: false }),
    context.supabase.from("website-clients").select("id,name"),
    context.supabase.from("website-payments").select("id,invoice_id,amount_cents,paid_at"),
  ]);
  return (invoices ?? []).map((invoice) => ({
    ...invoice,
    client: (clients ?? []).find((client) => client.id === invoice.client_id) ?? null,
    payments: (payments ?? []).filter((payment) => payment.invoice_id === invoice.id),
  }));
}

export async function getEnquiries() {
  const context = await getAdminContext();
  if (!context) return [];
  const [{ data: enquiries }, { data: packages }] = await Promise.all([
    context.supabase.from("website-enquiries").select("id,package_id,name,business_name,email,phone,message,status,created_at").order("created_at", { ascending: false }),
    context.supabase.from("website-pricing-packages").select("id,title"),
  ]);
  return (enquiries ?? []).map((enquiry) => ({ ...enquiry, package: (packages ?? []).find((item) => item.id === enquiry.package_id) ?? null }));
}

export async function getFinanceData() {
  const context = await getAdminContext();
  if (!context) return null;
  const [overview, invoices, expenses, taxSettings] = await Promise.all([
    context.supabase.from("website-finance-overview").select("*").maybeSingle(),
    context.supabase.from("website-invoices").select("id,total_cents,gst_cents,status,issue_date,due_date").neq("status", "void").order("issue_date"),
    context.supabase.from("website-expenses").select("id,amount_cents,gst_credit_cents,deductible_percent,incurred_on,vendor").is("archived_at", null).order("incurred_on"),
    context.supabase.from("website-tax-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle(),
  ]);
  return { overview: overview.data, invoices: invoices.data ?? [], expenses: expenses.data ?? [], taxSettings: taxSettings.data };
}

export async function getPricingAdmin() {
  const context = await getAdminContext();
  if (!context) return [];
  const { data: version } = await context.supabase
    .from("website-pricing-versions")
    .select("id")
    .eq("status", "published")
    .maybeSingle();
  if (!version) return [];
  const { data: packages } = await context.supabase
    .from("website-pricing-packages")
    .select("*")
    .eq("version_id", version.id)
    .order("position");
  if (!packages?.length) return [];
  const { data: items } = await context.supabase
    .from("website-pricing-package-items")
    .select("*")
    .in("package_id", packages.map((item) => item.id))
    .order("position");
  return packages.map((item) => ({ ...item, items: (items ?? []).filter((entry) => entry.package_id === item.id) }));
}

export async function getClientPackageOptionsAdmin() {
  const context = await getAdminContext();
  if (!context) return [];
  const { data: version } = await context.supabase
    .from("website-pricing-versions")
    .select("id")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("status", "published")
    .maybeSingle();
  if (!version) return [];
  const { data } = await context.supabase
    .from("website-pricing-packages")
    .select("id,title,price_cents")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .eq("version_id", version.id)
    .eq("is_active", true)
    .order("position");
  return data ?? [];
}

export async function getWebsiteElementsAdmin() {
  const context = await getAdminContext();
  if (!context) return [];
  const { data } = await context.supabase
    .from("website-site-elements")
    .select("id,element_key,element_type,eyebrow,title,body,media_kind,media_url,media_path,media_alt,position,is_published")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("position");
  return data ?? [];
}

export async function getWebsiteVisibilityAdmin() {
  const context = await getAdminContext();
  if (!context) return { show_pricing: true };
  const { data } = await context.supabase
    .from("website-settings")
    .select("show_pricing")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .maybeSingle();
  return { show_pricing: data?.show_pricing !== false };
}

export async function getPortfolioCategoriesAdmin(): Promise<PortfolioCategory[]> {
  const context = await getAdminContext();
  if (!context) return [];
  const [categoriesResult, itemsResult] = await Promise.all([
    context.supabase
      .from("website-portfolio-categories")
      .select("id,name,slug,description,position,is_published")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("position")
      .order("created_at"),
    context.supabase
      .from("website-portfolio-items")
      .select("id,category_id,media_kind,alt_text,public_url,display_size")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("category_id")
      .order("position")
      .order("created_at"),
  ]);

  if (categoriesResult.error || itemsResult.error) return [];
  const items = (itemsResult.data ?? []) as PortfolioItem[];
  return (categoriesResult.data ?? []).map((category) => ({
    ...category,
    items: items.filter((item) => item.category_id === category.id),
  })) as PortfolioCategory[];
}

export async function getAnalyticsData() {
  const context = await getAdminContext();
  if (!context) return null;
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [events, sessions] = await Promise.all([
    context.supabase.from("website-analytics-events").select("anonymous_id,event_name,page_path,analytics_key,package_slug,properties,occurred_at").gte("occurred_at", since).order("occurred_at"),
    context.supabase.from("website-analytics-sessions").select("anonymous_id,active_seconds,landing_path,device_class,started_at").gte("started_at", since),
  ]);
  return { events: events.data ?? [], sessions: sessions.data ?? [] };
}
