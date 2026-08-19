type WorkflowRecord = {
  id: string;
  status_id: string;
};

type WorkflowStatus = {
  id: string;
  key: string;
  position: number;
};

export function changeWorkflowStatus<T extends WorkflowRecord>(records: T[], recordIds: Iterable<string>, statusId: string) {
  const selectedIds = new Set(recordIds);
  return records.map((record) => selectedIds.has(record.id) ? { ...record, status_id: statusId } : record);
}

export function getGroupSelectionState(recordIds: string[], selectedIds: ReadonlySet<string>) {
  const selectedCount = recordIds.reduce((count, id) => count + Number(selectedIds.has(id)), 0);
  return {
    allSelected: recordIds.length > 0 && selectedCount === recordIds.length,
    partiallySelected: selectedCount > 0 && selectedCount < recordIds.length,
    selectedCount,
  };
}

export function sortWorkflowStatuses<T extends WorkflowStatus>(statuses: T[]) {
  return [...statuses].sort((left, right) => left.position - right.position);
}

export function visiblePipelineStatuses<T extends WorkflowStatus>(statuses: T[]) {
  return sortWorkflowStatuses(statuses).filter((status) => status.key !== "posted_done");
}
