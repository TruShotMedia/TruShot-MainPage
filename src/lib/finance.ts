export function incomeTax2026(taxableDollars: number) {
  if (taxableDollars <= 18_200) return 0;
  if (taxableDollars <= 45_000) return (taxableDollars - 18_200) * 0.15;
  if (taxableDollars <= 135_000) return 4_020 + (taxableDollars - 45_000) * 0.3;
  if (taxableDollars <= 190_000) return 31_020 + (taxableDollars - 135_000) * 0.37;
  return 51_370 + (taxableDollars - 190_000) * 0.45;
}

export function estimateSoleTraderTax(taxableDollars: number) {
  const grossIncomeTax = incomeTax2026(Math.max(0, taxableDollars));
  const smallBusinessOffset = Math.min(1_000, grossIncomeTax * 0.16);
  const medicareLevy = Math.max(0, taxableDollars) * 0.02;
  return {
    grossIncomeTax,
    smallBusinessOffset,
    medicareLevy,
    estimatedTax: Math.max(0, grossIncomeTax - smallBusinessOffset + medicareLevy),
  };
}

export function allocateInvoiceCents(totalCents: number, jobs: { id: string; hours: number }[]) {
  const totalHours = jobs.reduce((sum, job) => sum + Math.max(0, job.hours), 0);
  if (totalHours === 0) return jobs.map((job) => ({ ...job, allocatedCents: 0 }));
  const raw = jobs.map((job) => {
    const share = totalCents * Math.max(0, job.hours) / totalHours;
    return { ...job, base: Math.floor(share), remainder: share - Math.floor(share) };
  });
  let centsLeft = totalCents - raw.reduce((sum, job) => sum + job.base, 0);
  const ranked = [...raw].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  const bonus = new Set(ranked.slice(0, centsLeft).map((job) => job.id));
  centsLeft = Math.max(0, centsLeft);
  return raw.map((job) => ({ id: job.id, hours: job.hours, allocatedCents: job.base + (bonus.has(job.id) && centsLeft > 0 ? 1 : 0) }));
}

export type FinanceInvoice = {
  id: string;
  client_id: string | null;
  status: string;
  issue_date: string;
  due_date: string | null;
  total_cents: number;
  gst_cents: number;
};

export type FinancePayment = {
  invoice_id: string;
  amount_cents: number;
  paid_at: string;
};

export type FinanceExpense = {
  amount_cents: number;
  gst_credit_cents: number;
  deductible_percent: number;
  incurred_on: string;
  category?: { tax_category: string | null } | null;
};

export function dateInRange(value: string, from: string, to: string) {
  const day = value.slice(0, 10);
  return day >= from && day <= to;
}

export function buildReceivablesAgeing(invoices: FinanceInvoice[], payments: FinancePayment[], asOf = new Date()) {
  const paidByInvoice = new Map<string, number>();
  payments.forEach((payment) => paidByInvoice.set(payment.invoice_id, (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount_cents)));
  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  const asOfDay = new Date(`${asOf.toISOString().slice(0, 10)}T00:00:00Z`).getTime();

  for (const invoice of invoices) {
    if (invoice.status === "void" || invoice.status === "draft") continue;
    const outstanding = Math.max(0, Number(invoice.total_cents) - (paidByInvoice.get(invoice.id) ?? 0));
    if (!outstanding) continue;
    const dueDay = invoice.due_date ? new Date(`${invoice.due_date}T00:00:00Z`).getTime() : asOfDay;
    const overdueDays = Math.floor((asOfDay - dueDay) / 86_400_000);
    if (overdueDays <= 0) buckets.current += outstanding;
    else if (overdueDays <= 30) buckets.days1to30 += outstanding;
    else if (overdueDays <= 60) buckets.days31to60 += outstanding;
    else if (overdueDays <= 90) buckets.days61to90 += outstanding;
    else buckets.days90plus += outstanding;
  }
  return buckets;
}

export function buildBasEstimate({
  invoices,
  payments,
  expenses,
  from,
  to,
  basis,
  isGstRegistered,
}: {
  invoices: FinanceInvoice[];
  payments: FinancePayment[];
  expenses: FinanceExpense[];
  from: string;
  to: string;
  basis: "cash" | "accrual";
  isGstRegistered: boolean;
}) {
  const validInvoices = invoices.filter((invoice) => invoice.status !== "void" && invoice.status !== "draft");
  let totalSalesCents = 0;
  let gstOnSalesCents = 0;
  if (basis === "cash") {
    const invoiceById = new Map(validInvoices.map((invoice) => [invoice.id, invoice]));
    for (const payment of payments.filter((entry) => dateInRange(entry.paid_at, from, to))) {
      const invoice = invoiceById.get(payment.invoice_id);
      if (!invoice) continue;
      totalSalesCents += Number(payment.amount_cents);
      gstOnSalesCents += invoice.total_cents > 0
        ? Math.round(Number(payment.amount_cents) * Number(invoice.gst_cents) / Number(invoice.total_cents))
        : 0;
    }
  } else {
    for (const invoice of validInvoices.filter((entry) => dateInRange(entry.issue_date, from, to))) {
      totalSalesCents += Number(invoice.total_cents);
      gstOnSalesCents += Number(invoice.gst_cents);
    }
  }

  let capitalPurchasesCents = 0;
  let nonCapitalPurchasesCents = 0;
  let gstCreditsCents = 0;
  for (const expense of expenses.filter((entry) => dateInRange(entry.incurred_on, from, to))) {
    const deductible = Math.round(Number(expense.amount_cents) * Number(expense.deductible_percent) / 100);
    if (expense.category?.tax_category === "depreciating_assets") capitalPurchasesCents += deductible;
    else nonCapitalPurchasesCents += deductible;
    gstCreditsCents += Number(expense.gst_credit_cents);
  }

  if (!isGstRegistered) {
    gstOnSalesCents = 0;
    gstCreditsCents = 0;
  }
  return {
    totalSalesCents,
    gstOnSalesCents,
    capitalPurchasesCents,
    nonCapitalPurchasesCents,
    gstCreditsCents,
    netGstCents: gstOnSalesCents - gstCreditsCents,
  };
}
