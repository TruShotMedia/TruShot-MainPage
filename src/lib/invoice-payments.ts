export type InvoiceStatus = "draft" | "sent" | "viewed" | "part_paid" | "paid" | "overdue" | "void";

export function invoicePaymentTotals(
  totalCents: number,
  payments: Array<{ amount_cents: number }>,
  status?: InvoiceStatus,
) {
  const ledgerPaidCents = payments.reduce((sum, payment) => sum + Number(payment.amount_cents), 0);
  const paidCents = status === "paid" ? Math.max(totalCents, ledgerPaidCents) : ledgerPaidCents;
  return {
    paidCents,
    balanceCents: status === "paid" ? 0 : Math.max(0, totalCents - ledgerPaidCents),
  };
}

export function invoiceStatusAfterEdit(requestedStatus: InvoiceStatus, totalCents: number, paidCents: number): InvoiceStatus {
  if (requestedStatus === "void" || requestedStatus === "paid") return requestedStatus;
  if (totalCents > 0 && paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "part_paid";
  return requestedStatus === "part_paid" ? "sent" : requestedStatus;
}
