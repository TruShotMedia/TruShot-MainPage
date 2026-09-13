export type ReceiptExtraction = {
  vendor: string | null;
  date: string | null;
  amountDollars: number | null;
  gstDollars: number | null;
  confidence: "high" | "medium" | "low";
};

const MONEY_PATTERN = /(?:AUD\s*)?\$?\s*(-?\d{1,6}(?:,\d{3})*\.\d{2})\b/gi;

function amountsOn(line: string) {
  return [...line.matchAll(MONEY_PATTERN)]
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter(Number.isFinite);
}

function findTotal(lines: string[]) {
  const candidates = lines.flatMap((line, index) => {
    const upper = line.toUpperCase();
    if (!/(GRAND\s+TOTAL|AMOUNT\s+DUE|BALANCE\s+DUE|TOTAL)/.test(upper)) return [];
    if (/(SUB\s*TOTAL|TOTAL\s+(?:GST|TAX|SAVINGS|DISCOUNT))/.test(upper)) return [];
    const score = /GRAND\s+TOTAL|AMOUNT\s+DUE|BALANCE\s+DUE/.test(upper) ? 3 : 2;
    return amountsOn(line).map((amount) => ({ amount, score, index }));
  });
  candidates.sort((a, b) => b.score - a.score || b.index - a.index || b.amount - a.amount);
  if (candidates[0]) return candidates[0].amount;
  const all = lines.flatMap(amountsOn).filter((amount) => amount > 0);
  return all.length ? Math.max(...all) : null;
}

function findGst(lines: string[]) {
  const candidates = lines.flatMap((line) => {
    if (!/\bGST\b|GOODS\s+AND\s+SERVICES\s+TAX/i.test(line)) return [];
    return amountsOn(line);
  });
  return candidates.length ? Math.min(...candidates.filter((amount) => amount >= 0)) : null;
}

function toIsoDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/.](0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const au = text.match(/\b(0?[1-9]|[12]\d|3[01])[-/.](0?[1-9]|1[0-2])[-/.](20\d{2}|\d{2})\b/);
  if (!au) return null;
  const year = au[3].length === 2 ? `20${au[3]}` : au[3];
  return `${year}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
}

function findVendor(lines: string[]) {
  return lines.find((line) => {
    const trimmed = line.trim();
    return trimmed.length >= 2
      && trimmed.length <= 80
      && /[A-Za-z]{2}/.test(trimmed)
      && !/TAX\s+INVOICE|RECEIPT|ABN|TOTAL|GST|THANK\s+YOU/i.test(trimmed)
      && amountsOn(trimmed).length === 0;
  })?.trim() ?? null;
}

export function parseReceiptText(text: string): ReceiptExtraction {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const vendor = findVendor(lines);
  const date = lines.map(toIsoDate).find(Boolean) ?? null;
  const amountDollars = findTotal(lines);
  const listedGst = findGst(lines);
  const gstDollars = listedGst ?? (
    amountDollars !== null && /(?:GST\s+INCL|INCL(?:UDES|USIVE)?\.?\s+GST|GST\s+INCLUSIVE)/i.test(text)
      ? Math.round(amountDollars / 11 * 100) / 100
      : null
  );
  const detected = [vendor, date, amountDollars].filter((value) => value !== null).length;
  return {
    vendor,
    date,
    amountDollars,
    gstDollars,
    confidence: detected === 3 && gstDollars !== null ? "high" : detected >= 2 ? "medium" : "low",
  };
}
