import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function getAdminContext() {
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
}

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
    supabase.from("website-job-metrics").select("id,title,job_number,hours,created_assets,open_tasks,value_cents,due_date").order("due_date", { ascending: true, nullsFirst: false }).limit(6),
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
    .select("id,name,slug,status,industry,priority,is_retainer,monthly_budget_cents,updated_at")
    .is("archived_at", null)
    .order("name");
  if (!clients?.length) return [];
  const { data: contacts } = await context.supabase
    .from("website-client-contacts")
    .select("id,client_id,name,email,phone,is_primary")
    .in("client_id", clients.map((client) => client.id));
  return clients.map((client) => ({ ...client, contacts: (contacts ?? []).filter((contact) => contact.client_id === client.id) }));
}

export async function getJobs() {
  const context = await getAdminContext();
  if (!context) return [];
  const [{ data: jobs }, { data: clients }, { data: statuses }] = await Promise.all([
    context.supabase.from("website-job-metrics").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase.from("website-clients").select("id,name"),
    context.supabase.from("website-job-statuses").select("id,label,color,position").order("position"),
  ]);
  return (jobs ?? []).map((job) => ({
    ...job,
    client: (clients ?? []).find((client) => client.id === job.client_id) ?? null,
    status: (statuses ?? []).find((status) => status.id === job.status_id) ?? null,
  }));
}

export async function getPipeline() {
  const context = await getAdminContext();
  if (!context) return { statuses: [], tasks: [] };
  const [statuses, tasks, jobs, clients] = await Promise.all([
    context.supabase.from("website-task-statuses").select("id,key,label,color,position,is_open").eq("is_active", true).order("position"),
    context.supabase.from("website-job-tasks").select("id,title,job_id,status_id,asset_type,hours,due_date,priority,position").is("archived_at", null).order("position"),
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
    context.supabase.from("website-invoices").select("id,client_id,invoice_number,status,issue_date,due_date,total_cents").is("archived_at", null).order("issue_date", { ascending: false }),
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
