export type InvoicePaymentDateUpdate = {
  paymentId: string;
  paidAt: string;
};

export function paymentDateToTimestamp(date: string) {
  return `${date}T12:00:00+10:00`;
}

export function pairInvoicePaymentDates(paymentIds: string[], paymentDates: string[]) {
  if (paymentIds.length !== paymentDates.length) {
    throw new Error("Payment dates could not be matched to their records.");
  }

  if (new Set(paymentIds).size !== paymentIds.length) {
    throw new Error("A payment record was submitted more than once.");
  }

  return paymentIds.map<InvoicePaymentDateUpdate>((paymentId, index) => ({
    paymentId,
    paidAt: paymentDateToTimestamp(paymentDates[index]),
  }));
}
