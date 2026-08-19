import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Papa from "papaparse";

const [clientsPath, jobsPath, tasksPath, invoicesPath] = process.argv.slice(2);
if (!clientsPath || !jobsPath || !tasksPath || !invoicesPath) {
  throw new Error("Usage: node scripts/prepare-legacy-import.mjs clients.csv jobs.csv tasks.csv invoices.csv");
}

function readCsv(path) {
  const source = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const result = Papa.parse(source, { header: true, skipEmptyLines: true, transformHeader: (header) => header.replace(/^\uFEFF/, "").trim() });
  if (result.errors.length) throw new Error(`${path}: ${result.errors[0].message}`);
  return { source, rows: result.data };
}

function relationName(value, kind) {
  if (!value) return null;
  const marker = ` (${kind}/`;
  const index = value.indexOf(marker);
  return (index >= 0 ? value.slice(0, index) : value).trim() || null;
}

function money(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function date(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function slug(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function priority(value) {
  if (value === "High") return "high";
  if (value === "Low") return "low";
  return "normal";
}

const clientsFile = readCsv(clientsPath);
const jobsFile = readCsv(jobsPath);
const tasksFile = readCsv(tasksPath);
const invoicesFile = readCsv(invoicesPath);
const checksum = createHash("sha256")
  .update(clientsFile.source)
  .update(jobsFile.source)
  .update(tasksFile.source)
  .update(invoicesFile.source)
  .digest("hex");

const clients = clientsFile.rows.map((row, index) => ({
  source_index: index,
  name: row["Client Name"].trim(),
  slug: `${slug(row["Client Name"])}-legacy`,
  status: String(row.Status).toLowerCase() === "active" ? "active" : "inactive",
  industry: row.Industry || null,
  priority: String(row.Priority).toLowerCase() === "high" ? "high" : "standard",
  is_retainer: row.Retainer === "Yes",
  monthly_budget_cents: row.Budget ? money(row.Budget) : null,
  notes: row["Content Type"] ? `Content types: ${row["Content Type"]}` : null,
}));

const invoices = invoicesFile.rows.map((row, index) => ({
  source_index: index,
  invoice_number: row["Invoice ref."].trim(),
  total_cents: money(row["$VALUE"]),
  jobs_raw: row.jobs || "",
}));

const jobs = jobsFile.rows.map((row, index) => {
  const name = row["Job Name"]?.trim() || `Untitled legacy job ${index + 1}`;
  return {
    source_index: index,
    name,
    client_name: relationName(row.Client, "Clients"),
    invoice_number: relationName(row["INV-REF"], "Invoices"),
    photos_delivered: Math.max(0, Math.round(number(row["#photos"]))),
    legacy_value_cents: money(row.Value || row["$AUD Value"]),
    legacy_hours: Math.max(0, number(row.Hours)),
    shoot_date: date(row["Shoot Date"]),
    due_date: date(row["Due Date"]),
    location: row.Location || null,
    notes: [row.Notes, row["Files / Links"], row.Priority ? `Imported priority: ${row.Priority}` : null].filter(Boolean).join("\n\n") || null,
    status_key: row.Status === "Posted / Done" ? "delivered" : "planning",
    paid: row.Paid === "Yes",
  };
});

const orphanJobName = "Unassigned legacy tasks";
const tasks = tasksFile.rows.map((row, index) => ({
  source_index: index,
  name: row["Task Name"]?.trim() || `Untitled legacy asset ${index + 1}`,
  job_name: relationName(row.Job, "Jobs") || orphanJobName,
  status_key: row.Status === "Notes/Client Info" ? "final_draft_notes" : row.Status === "Posted / Done" ? "posted_done" : "not_started",
  asset_type: row["Captured By"] || null,
  due_date: date(row["Due Date"]),
  priority: priority(row.Priority),
  description: [row.Description, row.Notes, row["Files / Links"], row["Effort Level"] ? `Effort: ${row["Effort Level"]}` : null].filter(Boolean).join("\n\n") || null,
}));

const knownJobNames = new Set(jobs.map((job) => job.name));
const orphanCount = tasks.filter((task) => task.job_name === orphanJobName).length;
if (orphanCount) {
  jobs.push({ source_index: jobs.length, name: orphanJobName, client_name: null, invoice_number: null, photos_delivered: 0, legacy_value_cents: 0, legacy_hours: 0, shoot_date: null, due_date: null, location: null, notes: `${orphanCount} tasks had no job relationship in the source export.`, status_key: "planning", paid: false, is_orphan_container: true });
  knownJobNames.add(orphanJobName);
}

const allocations = [];
for (const invoice of invoices) {
  for (const job of jobs) {
    if (job.is_orphan_container) continue;
    if (job.invoice_number === invoice.invoice_number || invoice.jobs_raw.includes(`${job.name} (Jobs/`)) {
      allocations.push({ invoice_number: invoice.invoice_number, job_name: job.name });
    }
  }
}

jobs.forEach((job, index) => { job.job_number = `LEGACY-${String(index + 1).padStart(3, "0")}`; });
for (const task of tasks) {
  task.job_number = jobs.find((job) => job.name === task.job_name)?.job_number ?? null;
}
for (const allocation of allocations) {
  allocation.job_number = jobs.find((job) => job.name === allocation.job_name)?.job_number ?? null;
}
for (const invoice of invoices) {
  const related = allocations.filter((allocation) => allocation.invoice_number === invoice.invoice_number);
  invoice.paid = related.length > 0 && related.every((allocation) => jobs.find((job) => job.job_number === allocation.job_number)?.paid);
}

const unresolvedClients = jobs.filter((job) => job.client_name && !clients.some((client) => client.name.toLowerCase() === job.client_name.toLowerCase())).map((job) => ({ job: job.name, client: job.client_name }));
const unresolvedTasks = tasks.filter((task) => !knownJobNames.has(task.job_name)).map((task) => ({ task: task.name, job: task.job_name }));

process.stdout.write(JSON.stringify({
  checksum,
  clients,
  invoices: invoices.map((invoice) => ({
    source_index: invoice.source_index,
    invoice_number: invoice.invoice_number,
    total_cents: invoice.total_cents,
    paid: invoice.paid,
  })),
  jobs,
  tasks,
  allocations,
  reconciliation: {
    source_clients: clients.length,
    source_jobs: jobsFile.rows.length,
    source_tasks: tasks.length,
    source_invoices: invoices.length,
    orphan_tasks: orphanCount,
    created_orphan_container: orphanCount > 0,
    unresolved_clients: unresolvedClients,
    unresolved_tasks: unresolvedTasks,
    task_hours_backfill_required: tasks.length,
  },
}));
