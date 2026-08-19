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
