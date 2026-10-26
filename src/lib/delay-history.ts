import type { DelayHistoryEntry, DelayInfo } from "@/lib/types";

type DelayLinkRow = {
  id: string;
  source_id: string;
  successor_id: string;
  reason: string;
  source_date: string | null;
  rescheduled_date: string;
  created_at: string;
};

/**
 * Converts immutable delay edges into per-record lineage. Each successor can
 * become the source of a later delay, so a simple single relation is not
 * enough to render the complete history safely.
 */
export function buildDelayInfoByRecord(rows: DelayLinkRow[]) {
  const links = rows.map((row): DelayHistoryEntry => ({ ...row }));
  const incomingByRecord = new Map(links.map((link) => [link.successor_id, link]));
  const outgoingByRecord = new Map(links.map((link) => [link.source_id, link]));
  const recordIds = new Set(links.flatMap((link) => [link.source_id, link.successor_id]));
  const result = new Map<string, DelayInfo>();

  for (const recordId of recordIds) {
    const backwards: DelayHistoryEntry[] = [];
    const forwards: DelayHistoryEntry[] = [];
    const seen = new Set<string>();
    let current = recordId;
    let incoming = incomingByRecord.get(current);
    while (incoming && !seen.has(incoming.id)) {
      seen.add(incoming.id);
      backwards.unshift(incoming);
      current = incoming.source_id;
      incoming = incomingByRecord.get(current);
    }

    current = recordId;
    let outgoing = outgoingByRecord.get(current);
    while (outgoing && !seen.has(outgoing.id)) {
      seen.add(outgoing.id);
      forwards.push(outgoing);
      current = outgoing.successor_id;
      outgoing = outgoingByRecord.get(current);
    }

    result.set(recordId, {
      delayed_from: incomingByRecord.get(recordId) ?? null,
      delayed_to: outgoingByRecord.get(recordId) ?? null,
      history: [...backwards, ...forwards],
    });
  }
  return result;
}
