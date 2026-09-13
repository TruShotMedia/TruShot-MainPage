import { cache } from "react";
import { BRISBANE_TIMEZONE, type CalendarReminderSettings } from "@/lib/calendar-reminder-logic";
import { ACTIVE_CLIENT_REQUEST_STATUSES } from "@/lib/client-requests";
import { TRUSHOT_WORKSPACE_ID } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import type { CalendarCampaignAsset, CalendarJob, CalendarTask, Campaign, ClientEnquiry, ExpenseRecord, GlobalSearchItem, InvoiceOption, PipelineTask, PortfolioCategory, PortfolioItem, PortfolioMiscLogo, TaskStatus } from "@/lib/types";

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
    supabase
      .from("website-enquiries")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("status", [...ACTIVE_CLIENT_REQUEST_STATUSES])
      .is("archived_at", null),
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
  const [metricsResult, baseJobsResult, clientsResult, statusesResult, allocationsResult, invoicesResult] = await Promise.all([
    context.supabase.from("website-job-metrics").select("*").order("due_date", { ascending: true, nullsFirst: false }),
    context.supabase.from("website-jobs").select("id,location,description,notes,shoot_time,due_time,updated_at").is("archived_at", null),
    context.supabase.from("website-clients").select("id,name"),
    context.supabase.from("website-job-statuses").select("id,key,label,color,position,is_closed").eq("is_active", true).order("position"),
    context.supabase
      .from("website-invoice-job-allocations")
      .select("job_id,invoice_id,is_locked")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-invoices")
      .select("id,invoice_number,client_id,status,total_cents,issue_date")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("issue_date", { ascending: false }),
  ]);
  const queryError = [metricsResult, baseJobsResult, clientsResult, statusesResult, allocationsResult, invoicesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Jobs could not be loaded: ${queryError.message}`);
  const metrics = metricsResult.data;
  const baseJobs = baseJobsResult.data;
  const clients = clientsResult.data;
  const statuses = statusesResult.data;
  const allocations = allocationsResult.data;
  const invoices = invoicesResult.data;
  const baseById = new Map((baseJobs ?? []).map((job) => [job.id, job]));
  const clientById = new Map((clients ?? []).map((client) => [client.id, client]));
  const statusById = new Map((statuses ?? []).map((status) => [status.id, status]));
  const invoiceById = new Map<string, InvoiceOption>((invoices ?? []).map((invoice) => [invoice.id, {
    ...invoice,
    client_name: invoice.client_id ? clientById.get(invoice.client_id)?.name ?? null : null,
  }]));
  const allocationsByJobId = new Map<string, Array<{ invoice_id: string; is_locked: boolean }>>();
  for (const allocation of allocations ?? []) {
    allocationsByJobId.set(allocation.job_id, [...(allocationsByJobId.get(allocation.job_id) ?? []), allocation]);
  }
  return (metrics ?? []).flatMap((job) => {
    const baseJob = baseById.get(job.id);
    if (!baseJob) return [];
    return [{
      ...job,
      ...baseJob,
      client: job.client_id ? clientById.get(job.client_id) ?? null : null,
      status: statusById.get(job.status_id) ?? null,
      related_invoices: (allocationsByJobId.get(job.id) ?? []).flatMap((allocation) => {
        const invoice = invoiceById.get(allocation.invoice_id);
        return invoice ? [{ ...invoice, is_locked: allocation.is_locked }] : [];
      }),
    }];
  });
}

export async function getPipeline() {
  const context = await getAdminContext();
  if (!context) return { statuses: [], tasks: [] };
  const [statusesResult, tasksResult, jobsResult, clientsResult] = await Promise.all([
    context.supabase.from("website-task-statuses").select("id,key,label,color,position,is_open").eq("is_active", true).order("position"),
    context.supabase.from("website-job-tasks").select("id,title,job_id,status_id,asset_type,hours,due_date,due_time,priority,description,position,updated_at").is("archived_at", null).order("position"),
    context.supabase.from("website-jobs").select("id,title,client_id").is("archived_at", null),
    context.supabase.from("website-clients").select("id,name").is("archived_at", null),
  ]);
  const queryError = [statusesResult, tasksResult, jobsResult, clientsResult].find((result) => result.error)?.error;
  if (queryError) throw new Error(`Tasks could not be loaded: ${queryError.message}`);
  const statuses = statusesResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const clients = clientsResult.data ?? [];
  return {
    statuses,
    tasks: tasks.map((task) => {
      const job = jobs.find((entry) => entry.id === task.job_id);
      return { ...task, job: job ? { ...job, client: clients.find((client) => client.id === job.client_id) ?? null } : null };
    }),
  };
}

export async function getTabletKioskData(): Promise<{
  statuses: TaskStatus[];
  pipelineTasks: PipelineTask[];
  calendarJobs: CalendarJob[];
  calendarTasks: CalendarTask[];
  calendarCampaignAssets: CalendarCampaignAsset[];
  pendingRequestCount: number;
}> {
  const context = await getAdminContext();
  if (!context) return { statuses: [], pipelineTasks: [], calendarJobs: [], calendarTasks: [], calendarCampaignAssets: [], pendingRequestCount: 0 };
  const { supabase } = context;

  const [taskStatusesResult, tasksResult, jobsResult, campaignsResult, campaignAssetsResult, clientsResult, jobStatusesResult, enquiriesResult] = await Promise.all([
    supabase
      .from("website-task-statuses")
      .select("id,key,label,color,position,is_open,is_active")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("position"),
    supabase
      .from("website-job-tasks")
      .select("id,title,job_id,status_id,asset_type,hours,due_date,due_time,priority,description,position,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("position"),
    supabase
      .from("website-jobs")
      .select("id,title,client_id,status_id,shoot_date,shoot_time,due_date,due_time")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-campaigns")
      .select("id,title,client_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,status_id,title,start_date,start_time,due_date,due_time,priority")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-clients")
      .select("id,name")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    supabase
      .from("website-job-statuses")
      .select("id,label,color,is_closed")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    supabase
      .from("website-enquiries")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .in("status", [...ACTIVE_CLIENT_REQUEST_STATUSES])
      .is("archived_at", null),
  ]);

  const queryError = [taskStatusesResult, tasksResult, jobsResult, campaignsResult, campaignAssetsResult, clientsResult, jobStatusesResult, enquiriesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error("The tablet workspace could not be refreshed.");

  const allTaskStatuses = taskStatusesResult.data ?? [];
  const tasks = tasksResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const clientsById = new Map((clientsResult.data ?? []).map((client) => [client.id, client]));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const campaignsById = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]));
  const taskStatusesById = new Map(allTaskStatuses.map((status) => [status.id, status]));
  const jobStatusesById = new Map((jobStatusesResult.data ?? []).map((status) => [status.id, status]));

  const pipelineTasks = tasks.map((task) => {
    const job = jobsById.get(task.job_id);
    const client = job?.client_id ? clientsById.get(job.client_id) ?? null : null;
    return { ...task, job: job ? { id: job.id, title: job.title, client } : null };
  }) as PipelineTask[];

  const calendarJobs = jobs.map((job): CalendarJob => {
    const status = jobStatusesById.get(job.status_id);
    return {
      id: job.id,
      entity_type: "job",
      title: job.title,
      client_name: job.client_id ? clientsById.get(job.client_id)?.name ?? null : null,
      shoot_date: job.shoot_date,
      shoot_time: job.shoot_time,
      due_date: job.due_date,
      due_time: job.due_time,
      status_label: status?.label ?? "Unknown",
      status_color: status?.color ?? "#777d76",
      is_complete: status?.is_closed ?? false,
    };
  });

  const calendarTasks = tasks.flatMap((task): CalendarTask[] => {
    const job = jobsById.get(task.job_id);
    if (!job) return [];
    const status = taskStatusesById.get(task.status_id);
    return [{
      id: task.id,
      entity_type: "task",
      title: task.title,
      job_title: job.title,
      client_name: job.client_id ? clientsById.get(job.client_id)?.name ?? null : null,
      due_date: task.due_date,
      due_time: task.due_time,
      priority: task.priority as CalendarTask["priority"],
      status_label: status?.label ?? "Unknown",
      status_color: status?.color ?? "#777d76",
      is_complete: !(status?.is_open ?? true),
    }];
  });

  const calendarCampaignAssets = (campaignAssetsResult.data ?? []).flatMap((asset): CalendarCampaignAsset[] => {
    const campaign = campaignsById.get(asset.campaign_id);
    if (!campaign) return [];
    const status = taskStatusesById.get(asset.status_id);
    return [{
      id: asset.id,
      entity_type: "campaign-asset",
      title: asset.title,
      campaign_title: campaign.title,
      client_name: campaign.client_id ? clientsById.get(campaign.client_id)?.name ?? null : null,
      start_date: asset.start_date,
      start_time: asset.start_time,
      due_date: asset.due_date,
      due_time: asset.due_time,
      priority: asset.priority as CalendarCampaignAsset["priority"],
      status_label: status?.label ?? "Unknown",
      status_color: status?.color ?? "#777d76",
      is_complete: !(status?.is_open ?? true),
    }];
  });

  return {
    statuses: allTaskStatuses.filter((status) => status.is_active).map((status) => ({
      id: status.id,
      key: status.key,
      label: status.label,
      color: status.color,
      position: status.position,
      is_open: status.is_open,
    })),
    pipelineTasks,
    calendarJobs,
    calendarTasks,
    calendarCampaignAssets,
    pendingRequestCount: enquiriesResult.count ?? 0,
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
  const [{ data: enquiries }, { data: packages }, { data: clients }] = await Promise.all([
    context.supabase
      .from("website-enquiries")
      .select("id,package_id,name,business_name,email,phone,message,budget_range,preferred_timeline,source_path,status,rejection_reason,internal_notes,reviewed_at,converted_client_id,archived_at,created_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("created_at", { ascending: false }),
    context.supabase.from("website-pricing-packages").select("id,title"),
    context.supabase.from("website-clients").select("id,name").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
  ]);
  return (enquiries ?? []).map((enquiry) => ({
    ...enquiry,
    package: (packages ?? []).find((item) => item.id === enquiry.package_id) ?? null,
    converted_client: (clients ?? []).find((item) => item.id === enquiry.converted_client_id) ?? null,
  })) as ClientEnquiry[];
}

export async function getFinanceData() {
  const context = await getAdminContext();
  if (!context) return null;
  const [overview, invoices, payments, expenses, categories, clients, jobs, campaigns, campaignAssets, packages, taxSettings] = await Promise.all([
    context.supabase.from("website-finance-overview").select("*").maybeSingle(),
    context.supabase.from("website-invoices").select("id,client_id,invoice_number,total_cents,gst_cents,status,issue_date,due_date").neq("status", "void").is("archived_at", null).order("issue_date"),
    context.supabase.from("website-payments").select("id,invoice_id,amount_cents,paid_at,method,reference").order("paid_at"),
    context.supabase.from("website-expenses").select("id,category_id,job_id,client_id,campaign_id,vendor,description,incurred_on,amount_cents,gst_credit_cents,deductible_percent,receipt_path,receipt_file_name,receipt_mime_type,receipt_size_bytes,receipt_extraction").is("archived_at", null).order("incurred_on", { ascending: false }),
    context.supabase.from("website-expense-categories").select("id,name,tax_category").eq("workspace_id", TRUSHOT_WORKSPACE_ID).eq("is_active", true).order("name"),
    context.supabase.from("website-clients").select("id,name,package_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("name"),
    context.supabase.from("website-jobs").select("id,title,client_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("title"),
    context.supabase.from("website-campaigns").select("id,title,client_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("title"),
    context.supabase.from("website-campaign-assets").select("id,campaign_id,invoice_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null),
    context.supabase.from("website-pricing-packages").select("id,title").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-tax-settings").select("*").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle(),
  ]);
  const queryError = [overview, invoices, payments, expenses, categories, clients, jobs, campaigns, campaignAssets, packages, taxSettings]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Finance data could not be loaded: ${queryError.message}`);

  const categoryById = new Map((categories.data ?? []).map((item) => [item.id, item]));
  const clientById = new Map((clients.data ?? []).map((item) => [item.id, item]));
  const jobById = new Map((jobs.data ?? []).map((item) => [item.id, item]));
  const campaignById = new Map((campaigns.data ?? []).map((item) => [item.id, item]));
  const receiptPaths = (expenses.data ?? []).flatMap((expense) => expense.receipt_path ? [expense.receipt_path] : []);
  const signedUrlByPath = new Map<string, string>();
  if (receiptPaths.length) {
    const { data: signedUrls, error: signedError } = await context.supabase.storage
      .from("website-expense-receipts")
      .createSignedUrls(receiptPaths, 60 * 15);
    if (signedError) throw new Error(`Receipt previews could not be signed: ${signedError.message}`);
    for (const item of signedUrls ?? []) if (item.path && item.signedUrl) signedUrlByPath.set(item.path, item.signedUrl);
  }
  const enrichedExpenses: ExpenseRecord[] = (expenses.data ?? []).map((expense) => ({
    ...expense,
    amount_cents: Number(expense.amount_cents),
    gst_credit_cents: Number(expense.gst_credit_cents),
    deductible_percent: Number(expense.deductible_percent),
    receipt_size_bytes: expense.receipt_size_bytes === null ? null : Number(expense.receipt_size_bytes),
    receipt_extraction: (expense.receipt_extraction ?? {}) as Record<string, unknown>,
    receipt_signed_url: expense.receipt_path ? signedUrlByPath.get(expense.receipt_path) ?? null : null,
    category: expense.category_id ? categoryById.get(expense.category_id) ?? null : null,
    client: expense.client_id ? clientById.get(expense.client_id) ?? null : null,
    job: expense.job_id && jobById.get(expense.job_id) ? { id: expense.job_id, name: jobById.get(expense.job_id)!.title } : null,
    campaign: expense.campaign_id && campaignById.get(expense.campaign_id) ? { id: expense.campaign_id, name: campaignById.get(expense.campaign_id)!.title } : null,
  }));
  return {
    overview: overview.data,
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    expenses: enrichedExpenses,
    categories: categories.data ?? [],
    clients: clients.data ?? [],
    jobs: jobs.data ?? [],
    campaigns: campaigns.data ?? [],
    campaignAssets: campaignAssets.data ?? [],
    packages: packages.data ?? [],
    taxSettings: taxSettings.data,
  };
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
      .select("id,name,slug,description,logo_url,logo_path,position,is_published")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("position")
      .order("created_at"),
    context.supabase
      .from("website-portfolio-items")
      .select("id,category_id,media_kind,alt_text,public_url,poster_url,poster_path,display_size")
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

export async function getPortfolioMiscLogosAdmin(): Promise<PortfolioMiscLogo[]> {
  const context = await getAdminContext();
  if (!context) return [];
  const { data, error } = await context.supabase
    .from("website-portfolio-logos")
    .select("id,name,logo_url,logo_path,position,is_published")
    .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
    .order("position")
    .order("created_at");
  if (error) return [];
  return (data ?? []) as PortfolioMiscLogo[];
}

export async function getCampaigns(): Promise<{
  campaigns: Campaign[];
  clients: Array<{ id: string; name: string }>;
  contacts: Array<{ id: string; client_id: string; name: string; email: string | null; phone: string | null; is_primary: boolean }>;
  statuses: TaskStatus[];
  invoices: InvoiceOption[];
}> {
  const context = await getAdminContext();
  if (!context) return { campaigns: [], clients: [], contacts: [], statuses: [], invoices: [] };

  const { supabase } = context;
  const assetsPromise = (async () => {
    const currentResult = await supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,invoice_id,status_id,title,description,asset_type,priority,start_date,start_time,due_date,due_time,location,contact_name,contact_email,contact_phone,notes,position,completed_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("position");

    const missingTimeColumn = currentResult.error
      && ["42703", "PGRST204"].includes(currentResult.error.code)
      && /(?:start_time|due_time)/i.test(currentResult.error.message);
    if (!missingTimeColumn) return currentResult;

    // Keep campaign planning available while a newly deployed time field is
    // still propagating through PostgREST's schema cache.
    const legacyResult = await supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,invoice_id,status_id,title,description,asset_type,priority,start_date,due_date,location,contact_name,contact_email,contact_phone,notes,position,completed_at,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("start_date", { ascending: true, nullsFirst: false })
      .order("position");

    return {
      ...legacyResult,
      data: legacyResult.data?.map((asset) => ({ ...asset, start_time: null, due_time: null })) ?? null,
    };
  })();
  const [campaignsResult, assetsResult, attachmentsResult, clientsResult, contactsResult, statusesResult, invoicesResult] = await Promise.all([
    supabase
      .from("website-campaigns")
      .select("id,client_id,title,objective,status,start_date,due_date,notes,updated_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false }),
    assetsPromise,
    supabase
      .from("website-campaign-attachments")
      .select("id,campaign_asset_id,storage_path,file_name,mime_type,file_size_bytes,created_at")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("created_at"),
    supabase
      .from("website-clients")
      .select("id,name")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("name"),
    supabase
      .from("website-client-contacts")
      .select("id,client_id,name,email,phone,is_primary")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .order("is_primary", { ascending: false })
      .order("name"),
    supabase
      .from("website-task-statuses")
      .select("id,key,label,color,position,is_open")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .eq("is_active", true)
      .order("position"),
    supabase
      .from("website-invoices")
      .select("id,invoice_number,client_id,status,total_cents,issue_date")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null)
      .order("issue_date", { ascending: false }),
  ]);

  const queryError = [campaignsResult, assetsResult, attachmentsResult, clientsResult, contactsResult, statusesResult, invoicesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Campaign planning could not be loaded: ${queryError.message}`);

  const clients = clientsResult.data ?? [];
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const statuses = (statusesResult.data ?? []) as TaskStatus[];
  const statusById = new Map(statuses.map((status) => [status.id, status]));
  const invoices: InvoiceOption[] = (invoicesResult.data ?? []).map((invoice) => ({
    ...invoice,
    client_name: invoice.client_id ? clientById.get(invoice.client_id)?.name ?? null : null,
  }));
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const attachments = attachmentsResult.data ?? [];
  const paths = attachments.map((attachment) => attachment.storage_path);
  const signedUrlByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signedUrls } = await supabase.storage
      .from("website-campaign-attachments")
      .createSignedUrls(paths, 60 * 60);
    for (const signed of signedUrls ?? []) {
      if (signed.path && signed.signedUrl) signedUrlByPath.set(signed.path, signed.signedUrl);
    }
  }

  const attachmentsByAssetId = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    attachmentsByAssetId.set(attachment.campaign_asset_id, [...(attachmentsByAssetId.get(attachment.campaign_asset_id) ?? []), attachment]);
  }

  const assets = (assetsResult.data ?? []).map((asset) => ({
    ...asset,
    priority: asset.priority as "low" | "normal" | "high" | "urgent",
    status: statusById.get(asset.status_id) ?? null,
    invoice: asset.invoice_id ? invoiceById.get(asset.invoice_id) ?? null : null,
    attachments: (attachmentsByAssetId.get(asset.id) ?? [])
      .map((attachment) => ({ ...attachment, signed_url: signedUrlByPath.get(attachment.storage_path) ?? null })),
  }));
  const assetsByCampaignId = new Map<string, typeof assets>();
  for (const asset of assets) {
    assetsByCampaignId.set(asset.campaign_id, [...(assetsByCampaignId.get(asset.campaign_id) ?? []), asset]);
  }

  return {
    campaigns: (campaignsResult.data ?? []).map((campaign) => ({
      ...campaign,
      status: campaign.status as Campaign["status"],
      client: campaign.client_id ? clientById.get(campaign.client_id) ?? null : null,
      assets: assetsByCampaignId.get(campaign.id) ?? [],
    })) as Campaign[],
    clients,
    contacts: contactsResult.data ?? [],
    statuses,
    invoices,
  };
}

export async function getCalendarData() {
  const context = await getAdminContext();
  const defaultReminderSettings: CalendarReminderSettings = {
    workspace_id: TRUSHOT_WORKSPACE_ID,
    enabled: true,
    default_event_time: "09:00:00",
    lead_minutes: 120,
    send_at_event_time: true,
    notify_job_starts: true,
    notify_job_deadlines: true,
    notify_task_deadlines: true,
    notify_campaign_assets: true,
    timezone: BRISBANE_TIMEZONE,
  };
  if (!context) return { jobs: [], tasks: [], campaignAssets: [], reminderSettings: defaultReminderSettings };

  const [jobsResult, tasksResult, campaignsResult, campaignAssetsResult, clientsResult, jobStatusesResult, taskStatusesResult, reminderSettingsResult] = await Promise.all([
    context.supabase
      .from("website-jobs")
      .select("id,title,client_id,status_id,shoot_date,shoot_time,due_date,due_time")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-job-tasks")
      .select("id,title,job_id,status_id,due_date,due_time,priority")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-campaigns")
      .select("id,title,client_id")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-campaign-assets")
      .select("id,campaign_id,status_id,title,start_date,start_time,due_date,due_time,priority")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .is("archived_at", null),
    context.supabase
      .from("website-clients")
      .select("id,name")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-job-statuses")
      .select("id,label,color,is_closed")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-task-statuses")
      .select("id,label,color,is_open")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase
      .from("website-calendar-reminder-settings")
      .select("workspace_id,enabled,default_event_time,lead_minutes,send_at_event_time,notify_job_starts,notify_job_deadlines,notify_task_deadlines,notify_campaign_assets,timezone")
      .eq("workspace_id", TRUSHOT_WORKSPACE_ID)
      .maybeSingle(),
  ]);
  const queryError = [jobsResult, tasksResult, campaignsResult, campaignAssetsResult, clientsResult, jobStatusesResult, taskStatusesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Calendar data could not be loaded: ${queryError.message}`);
  if (reminderSettingsResult.error) throw new Error(`Calendar reminder settings could not be loaded: ${reminderSettingsResult.error.message}`);

  const clients = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const jobStatuses = new Map((jobStatusesResult.data ?? []).map((status) => [status.id, status]));
  const taskStatuses = new Map((taskStatusesResult.data ?? []).map((status) => [status.id, status]));
  const jobsById = new Map((jobsResult.data ?? []).map((job) => [job.id, job]));
  const campaignsById = new Map((campaignsResult.data ?? []).map((campaign) => [campaign.id, campaign]));

  return {
    jobs: (jobsResult.data ?? []).map((job) => {
      const status = jobStatuses.get(job.status_id);
      return {
        id: job.id,
        entity_type: "job" as const,
        title: job.title,
        client_name: job.client_id ? clients.get(job.client_id) ?? null : null,
        shoot_date: job.shoot_date,
        shoot_time: job.shoot_time,
        due_date: job.due_date,
        due_time: job.due_time,
        status_label: status?.label ?? "Unknown",
        status_color: status?.color ?? "#777d76",
        is_complete: status?.is_closed ?? false,
      };
    }),
    tasks: (tasksResult.data ?? []).flatMap((task) => {
      const job = jobsById.get(task.job_id);
      if (!job) return [];
      const status = taskStatuses.get(task.status_id);
      return [{
        id: task.id,
        entity_type: "task" as const,
        title: task.title,
        job_title: job.title,
        client_name: job.client_id ? clients.get(job.client_id) ?? null : null,
        due_date: task.due_date,
        due_time: task.due_time,
        priority: task.priority as "low" | "normal" | "high" | "urgent",
        status_label: status?.label ?? "Unknown",
        status_color: status?.color ?? "#777d76",
        is_complete: !(status?.is_open ?? true),
      }];
    }),
    campaignAssets: (campaignAssetsResult.data ?? []).flatMap((asset): CalendarCampaignAsset[] => {
      const campaign = campaignsById.get(asset.campaign_id);
      if (!campaign) return [];
      const status = taskStatuses.get(asset.status_id);
      return [{
        id: asset.id,
        entity_type: "campaign-asset",
        title: asset.title,
        campaign_title: campaign.title,
        client_name: campaign.client_id ? clients.get(campaign.client_id) ?? null : null,
        start_date: asset.start_date,
        start_time: asset.start_time,
        due_date: asset.due_date,
        due_time: asset.due_time,
        priority: asset.priority as CalendarCampaignAsset["priority"],
        status_label: status?.label ?? "Unknown",
        status_color: status?.color ?? "#777d76",
        is_complete: !(status?.is_open ?? true),
      }];
    }),
    reminderSettings: (reminderSettingsResult.data ?? defaultReminderSettings) as CalendarReminderSettings,
  };
}

export async function getGlobalSearchIndex(): Promise<GlobalSearchItem[]> {
  const context = await getAdminContext();
  if (!context) return [];
  const [clientsResult, jobsResult, tasksResult, invoicesResult, campaignsResult, enquiriesResult] = await Promise.all([
    context.supabase.from("website-clients").select("id,name,status,industry").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("name"),
    context.supabase.from("website-jobs").select("id,title,job_number,client_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("updated_at", { ascending: false }),
    context.supabase.from("website-job-tasks").select("id,title,asset_type,job_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("updated_at", { ascending: false }),
    context.supabase.from("website-invoices").select("id,invoice_number,status,total_cents,client_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("issue_date", { ascending: false }),
    context.supabase.from("website-campaigns").select("id,title,status,client_id").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("updated_at", { ascending: false }),
    context.supabase.from("website-enquiries").select("id,name,business_name,email,status").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null).order("created_at", { ascending: false }),
  ]);
  const queryError = [clientsResult, jobsResult, tasksResult, invoicesResult, campaignsResult, enquiriesResult]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Workspace search could not be prepared: ${queryError.message}`);
  const clients = new Map((clientsResult.data ?? []).map((client) => [client.id, client.name]));
  const jobs = new Map((jobsResult.data ?? []).map((job) => [job.id, job.title]));
  return [
    ...(clientsResult.data ?? []).map((client): GlobalSearchItem => ({ id: client.id, kind: "client", title: client.name, subtitle: `${client.status} client${client.industry ? ` · ${client.industry}` : ""}`, href: "/admin/clients", keywords: `${client.name} ${client.status} ${client.industry ?? ""}` })),
    ...(jobsResult.data ?? []).map((job): GlobalSearchItem => ({ id: job.id, kind: "job", title: job.title, subtitle: `${job.job_number ?? "Job"}${job.client_id ? ` · ${clients.get(job.client_id) ?? "Client"}` : ""}`, href: "/admin/jobs", keywords: `${job.title} ${job.job_number ?? ""} ${job.client_id ? clients.get(job.client_id) ?? "" : ""}` })),
    ...(tasksResult.data ?? []).map((task): GlobalSearchItem => ({ id: task.id, kind: "task", title: task.title, subtitle: `${task.asset_type ?? "Asset"} · ${jobs.get(task.job_id) ?? "Job"}`, href: "/admin/tasks", keywords: `${task.title} ${task.asset_type ?? ""} ${jobs.get(task.job_id) ?? ""}` })),
    ...(invoicesResult.data ?? []).map((invoice): GlobalSearchItem => ({ id: invoice.id, kind: "invoice", title: invoice.invoice_number, subtitle: `${invoice.status} · $${(Number(invoice.total_cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}${invoice.client_id ? ` · ${clients.get(invoice.client_id) ?? "Client"}` : ""}`, href: "/admin/invoices", keywords: `${invoice.invoice_number} ${invoice.status} ${invoice.client_id ? clients.get(invoice.client_id) ?? "" : ""}` })),
    ...(campaignsResult.data ?? []).map((campaign): GlobalSearchItem => ({ id: campaign.id, kind: "campaign", title: campaign.title, subtitle: `${campaign.status}${campaign.client_id ? ` · ${clients.get(campaign.client_id) ?? "Client"}` : ""}`, href: "/admin/campaigns", keywords: `${campaign.title} ${campaign.status} ${campaign.client_id ? clients.get(campaign.client_id) ?? "" : ""}` })),
    ...(enquiriesResult.data ?? []).map((enquiry): GlobalSearchItem => ({ id: enquiry.id, kind: "request", title: enquiry.business_name || enquiry.name, subtitle: `${enquiry.status} request · ${enquiry.email}`, href: "/admin/requests", keywords: `${enquiry.name} ${enquiry.business_name ?? ""} ${enquiry.email} ${enquiry.status}` })),
  ];
}

export async function getAnalyticsData({ rangeDays = 30, comparisonMode = "previous_period" }: { rangeDays?: number; comparisonMode?: "previous_period" | "previous_year" } = {}) {
  const context = await getAdminContext();
  if (!context) return null;
  const safeDays = Math.min(730, Math.max(1, Math.round(rangeDays)));
  const currentTo = new Date();
  const currentFrom = new Date(currentTo.getTime() - safeDays * 86_400_000);
  const previousTo = comparisonMode === "previous_year"
    ? new Date(new Date(currentTo).setFullYear(currentTo.getFullYear() - 1))
    : new Date(currentFrom.getTime() - 1);
  const previousFrom = comparisonMode === "previous_year"
    ? new Date(new Date(currentFrom).setFullYear(currentFrom.getFullYear() - 1))
    : new Date(previousTo.getTime() - safeDays * 86_400_000);

  const [events, sessions, enquiries, invoices, payments, packages, marketingSpend, savedViews, alertSettings] = await Promise.all([
    context.supabase.from("website-analytics-events").select("anonymous_id,event_name,page_path,analytics_key,package_slug,properties,occurred_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).gte("occurred_at", previousFrom.toISOString()).lte("occurred_at", currentTo.toISOString()).order("occurred_at"),
    context.supabase.from("website-analytics-sessions").select("id,anonymous_id,active_seconds,landing_path,referrer_domain,utm,device_class,started_at,last_seen_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-enquiries").select("id,analytics_anonymous_id,analytics_session_id,converted_client_id,package_id,status,attribution,created_at,reviewed_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID).gte("created_at", previousFrom.toISOString()).lte("created_at", currentTo.toISOString()),
    context.supabase.from("website-invoices").select("id,client_id,status,total_cents,issue_date").eq("workspace_id", TRUSHOT_WORKSPACE_ID).is("archived_at", null),
    context.supabase.from("website-payments").select("invoice_id,amount_cents,paid_at").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-pricing-packages").select("id,title").eq("workspace_id", TRUSHOT_WORKSPACE_ID),
    context.supabase.from("website-marketing-spend").select("id,spend_on,source,campaign,amount_cents,notes").eq("workspace_id", TRUSHOT_WORKSPACE_ID).gte("spend_on", previousFrom.toISOString().slice(0, 10)).lte("spend_on", currentTo.toISOString().slice(0, 10)).is("archived_at", null).order("spend_on", { ascending: false }),
    context.supabase.from("website-analytics-saved-views").select("id,name,range_days,comparison_mode,is_default").eq("workspace_id", TRUSHOT_WORKSPACE_ID).order("created_at"),
    context.supabase.from("website-analytics-alert-settings").select("enabled,sensitivity_percent,minimum_visitors").eq("workspace_id", TRUSHOT_WORKSPACE_ID).maybeSingle(),
  ]);
  const queryError = [events, sessions, enquiries, invoices, payments, packages, marketingSpend, savedViews, alertSettings]
    .find((result) => result.error)?.error;
  if (queryError) throw new Error(`Revenue analytics could not be loaded: ${queryError.message}`);
  return {
    events: events.data ?? [],
    sessions: sessions.data ?? [],
    enquiries: enquiries.data ?? [],
    invoices: invoices.data ?? [],
    payments: payments.data ?? [],
    packages: packages.data ?? [],
    marketingSpend: marketingSpend.data ?? [],
    savedViews: savedViews.data ?? [],
    alertSettings: alertSettings.data ?? { enabled: true, sensitivity_percent: 30, minimum_visitors: 10 },
    currentPeriod: { from: currentFrom.toISOString(), to: currentTo.toISOString() },
    previousPeriod: { from: previousFrom.toISOString(), to: previousTo.toISOString() },
    rangeDays: safeDays,
    comparisonMode,
  };
}
