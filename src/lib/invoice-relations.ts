export type ExistingInvoiceRelation = {
  invoice_id: string;
  is_locked: boolean;
};

export function getInvoiceRelationChanges(existing: ExistingInvoiceRelation[], desiredInvoiceIds: string[]) {
  const desired = new Set(desiredInvoiceIds);
  const current = new Set(existing.map((relation) => relation.invoice_id));
  const additions = [...desired].filter((invoiceId) => !current.has(invoiceId));
  const removals = existing.filter((relation) => !desired.has(relation.invoice_id));

  return {
    additions,
    removals: removals.filter((relation) => !relation.is_locked).map((relation) => relation.invoice_id),
    lockedRemovals: removals.filter((relation) => relation.is_locked).map((relation) => relation.invoice_id),
  };
}
