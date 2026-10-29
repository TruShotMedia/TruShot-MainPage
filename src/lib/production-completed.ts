type CompletedRecord = { title: string; updated_at: string; completed_at?: string | null; delivered_at?: string | null };

function completionTime(record: CompletedRecord) {
  // Old imports can lack a completion timestamp. Never let an invalid date
  // destabilise the list; use its last recorded update as the fallback.
  for (const value of [record.completed_at, record.delivered_at, record.updated_at]) {
    if (value && Number.isFinite(Date.parse(value))) return Date.parse(value);
  }
  return 0;
}

export function compareCompletedRecords(left: CompletedRecord, right: CompletedRecord) {
  return completionTime(right) - completionTime(left) || left.title.localeCompare(right.title);
}
