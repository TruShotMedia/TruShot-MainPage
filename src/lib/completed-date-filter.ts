const BRISBANE_TIME_ZONE = "Australia/Brisbane";

function dateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function brisbaneDateInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = dateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function defaultCompletedDateRange(now = new Date()) {
  const to = brisbaneDateInput(now);
  const [year, month, day] = to.split("-").map(Number);
  const targetMonthIndex = year * 12 + (month - 1) - 3;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12 + 12) % 12 + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return {
    from: `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`,
    to,
  };
}

export function isDateInCompletedRange(
  timestamp: string | null | undefined,
  from: string,
  to: string,
) {
  if (!timestamp) return false;
  const date = brisbaneDateInput(timestamp);
  if (!date) return false;
  return (!from || date >= from) && (!to || date <= to);
}
