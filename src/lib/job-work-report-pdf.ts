import { existsSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import type { JobWorkReport } from "./job-work-report";

const GREEN = "#1F5E41";
const GREEN_DARK = "#153D2B";
const INK = "#151915";
const MUTED = "#70786F";
const PAPER = "#F4F1E9";
const PALE_GREEN = "#EAF1EB";
const LINE = "#DDE3DC";
const MARGIN = 42;
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - 66;

function printable(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200B-\u200D\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function generatedDate(value: Date) {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" }).format(value);
}

function hours(value: number) {
  return `${new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} h`;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function text(doc: PDFKit.PDFDocument, value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions & { font?: string; size?: number; color?: string } = {}) {
  const { font = "Helvetica", size = 10, color = INK, ...textOptions } = options;
  doc.font(font).fontSize(size).fillColor(color).text(printable(value), x, y, { ...textOptions, lineGap: textOptions.lineGap ?? 1 });
}

function drawWordmark(doc: PDFKit.PDFDocument, y: number, compact = false) {
  const logoPath = join(process.cwd(), "public", "brand", "logo-white.png");
  if (existsSync(logoPath)) {
    try {
      doc.image(logoPath, MARGIN, y, { fit: compact ? [145, 43] : [185, 63], valign: "center" });
      return;
    } catch {
      // A bundled font-only wordmark keeps the report usable if the static image is unavailable at runtime.
    }
  }
  text(doc, "TRUSHOT", MARGIN, y + (compact ? 3 : 7), { font: "Helvetica-Bold", size: compact ? 19 : 26, color: "#FFFFFF", width: 200, lineBreak: false });
  text(doc, "MEDIA", MARGIN + (compact ? 43 : 62), y + (compact ? 25 : 37), { font: "Helvetica-Bold", size: compact ? 7 : 9, color: "#FFFFFF", characterSpacing: 4, lineBreak: false });
}

function drawOpening(doc: PDFKit.PDFDocument, report: JobWorkReport) {
  doc.rect(0, 0, PAGE_WIDTH, 183).fill(GREEN_DARK);
  doc.rect(0, 180, PAGE_WIDTH, 3).fill("#7BAE8E");
  drawWordmark(doc, 23);
  text(doc, "CLIENT WORK REPORT", PAGE_WIDTH - 209, 41, { font: "Helvetica-Bold", size: 8, color: "#B9D7C4", width: 167, align: "right", characterSpacing: 1.4 });
  text(doc, "WORK SUMMARY", MARGIN, 102, { font: "Helvetica-Bold", size: 30, color: "#FFFFFF", width: CONTENT_WIDTH, lineBreak: false });
  text(doc, `Prepared for ${report.clientName}`, MARGIN, 152, { size: 11, color: "#D6E8DA", width: CONTENT_WIDTH - 75, height: 17, ellipsis: true });

  const columns = report.includePricing ? [
    ["JOBS", String(report.jobs.length)],
    ["ASSETS", String(report.totals.assetCount)],
    ["RECORDED HOURS", hours(report.totals.recordedHours)],
    ["ALLOCATED VALUE", report.totals.hasPricedJobs ? money(report.totals.valueCents) : "Not allocated"],
  ] : [
    ["JOBS", String(report.jobs.length)],
    ["ASSETS", String(report.totals.assetCount)],
    ["RECORDED HOURS", hours(report.totals.recordedHours)],
    ["PHOTOS DELIVERED", String(report.totals.photosDelivered)],
  ];
  doc.roundedRect(MARGIN, 199, CONTENT_WIDTH, 88, 13).fill(PAPER);
  const columnWidth = CONTENT_WIDTH / columns.length;
  columns.forEach(([label, value], index) => {
    const x = MARGIN + index * columnWidth;
    if (index) doc.moveTo(x, 214).lineTo(x, 273).lineWidth(0.7).strokeColor("#D8DCD5").stroke();
    text(doc, label, x + 15, 215, { font: "Helvetica-Bold", size: 7.5, color: GREEN, width: columnWidth - 26, characterSpacing: 0.8, height: 18, ellipsis: true });
    text(doc, value, x + 15, 242, { font: "Helvetica-Bold", size: report.includePricing && index === 3 ? (report.totals.hasPricedJobs ? 14 : 10.5) : 17, color: INK, width: columnWidth - 26, height: 27, ellipsis: true });
  });
  text(doc, `Generated ${generatedDate(report.generatedAt)}  |  ${report.includePricing ? "Allocated pricing shown" : "Pricing intentionally omitted"}`, MARGIN, 302, { size: 9, color: MUTED, width: CONTENT_WIDTH });
}

function drawContinuationHeader(doc: PDFKit.PDFDocument, report: JobWorkReport) {
  doc.rect(0, 0, PAGE_WIDTH, 92).fill(GREEN_DARK);
  doc.rect(0, 89, PAGE_WIDTH, 3).fill("#7BAE8E");
  drawWordmark(doc, 18, true);
  text(doc, `WORK SUMMARY  |  ${report.clientName}`, PAGE_WIDTH - 297, 33, { font: "Helvetica-Bold", size: 9, color: "#D6E8DA", width: 255, align: "right", height: 27, ellipsis: true });
}

function drawTaskHeading(doc: PDFKit.PDFDocument, y: number) {
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 27, 5).fill(PALE_GREEN);
  text(doc, "ASSET / PROGRESS", MARGIN + 13, y + 8, { font: "Helvetica-Bold", size: 8, color: GREEN, characterSpacing: 0.8, width: 380, lineBreak: false });
  text(doc, "HOURS", PAGE_WIDTH - 116, y + 8, { font: "Helvetica-Bold", size: 8, color: GREEN, characterSpacing: 0.8, width: 62, align: "right", lineBreak: false });
}

function taskRowHeight(doc: PDFKit.PDFDocument, title: string) {
  const titleHeight = doc.font("Helvetica-Bold").fontSize(10.5).heightOfString(printable(title), { width: 375, lineGap: 1 });
  return Math.max(40, titleHeight + 27);
}

function drawTaskRow(doc: PDFKit.PDFDocument, task: JobWorkReport["jobs"][number]["tasks"][number], y: number, height: number) {
  const titleHeight = doc.font("Helvetica-Bold").fontSize(10.5).heightOfString(printable(task.title), { width: 375, lineGap: 1 });
  text(doc, task.title, MARGIN + 13, y + 8, { font: "Helvetica-Bold", size: 10.5, width: 375 });
  const detail = [task.assetType, task.statusLabel].filter(Boolean).join("  |  ");
  text(doc, detail, MARGIN + 13, y + 10 + titleHeight, { size: 8.5, color: MUTED, width: 375, height: 13, ellipsis: true });
  text(doc, task.hours == null ? "Not logged" : hours(task.hours), PAGE_WIDTH - 130, y + 9, { font: "Helvetica-Bold", size: task.hours == null ? 8.5 : 10, color: task.hours == null ? "#9B633E" : INK, width: 76, align: "right", height: 18 });
  doc.moveTo(MARGIN + 13, y + height - 1).lineTo(PAGE_WIDTH - MARGIN - 13, y + height - 1).lineWidth(0.5).strokeColor(LINE).stroke();
}

export async function renderJobWorkReportPdf(report: JobWorkReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true, compress: true });
  doc.info.Title = `TruShot Media - Work summary for ${printable(report.clientName)}`;
  doc.info.Author = "TruShot Media";
  doc.info.Subject = "Client work and asset hours report";

  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  drawOpening(doc, report);
  let y = 337;

  function nextPage() {
    doc.addPage();
    drawContinuationHeader(doc, report);
    y = 116;
  }

  function ensureSpace(required: number) {
    if (y + required <= BOTTOM_LIMIT) return false;
    nextPage();
    return true;
  }

  for (const [index, job] of report.jobs.entries()) {
    const titleHeight = doc.font("Helvetica-Bold").fontSize(18).heightOfString(printable(job.title), { width: CONTENT_WIDTH - 30, lineGap: 1 });
    const warningHeight = job.unloggedHoursCount ? 18 : 0;
    const blockHeight = 42 + titleHeight + 22 + 52 + warningHeight + (job.tasks.length ? 31 + taskRowHeight(doc, job.tasks[0].title) : 42);
    ensureSpace(blockHeight);
    doc.rect(MARGIN, y, 4, 34 + titleHeight).fill(GREEN);
    text(doc, `JOB ${String(index + 1).padStart(2, "0")}${job.jobNumber ? `  |  ${job.jobNumber}` : ""}`, MARGIN + 16, y, { font: "Helvetica-Bold", size: 8.5, color: GREEN, width: CONTENT_WIDTH - 25, characterSpacing: 0.6 });
    text(doc, job.title, MARGIN + 16, y + 17, { font: "Helvetica-Bold", size: 18, color: INK, width: CONTENT_WIDTH - 30 });
    y += 24 + titleHeight;
    text(doc, `Shoot ${displayDate(job.shootDate)}  |  Due ${displayDate(job.dueDate)}`, MARGIN + 16, y + 2, { size: 8.5, color: MUTED, width: CONTENT_WIDTH - 30 });
    y += 23;

    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 52, 7).fill(PALE_GREEN);
    const stats: Array<[string, string]> = [
      ["ASSETS CREATED", String(job.assetCount)],
      ["RECORDED HOURS", hours(job.recordedHours)],
      ["PHOTOS DELIVERED", String(job.photosDelivered)],
    ];
    if (report.includePricing) stats.push(["ALLOCATED VALUE", job.valueCents == null ? "Not allocated" : `${money(job.valueCents)}${job.pricingIsPartial ? " (partial)" : ""}`]);
    const statWidth = CONTENT_WIDTH / stats.length;
    stats.forEach(([label, value], statIndex) => {
      const x = MARGIN + 13 + statIndex * statWidth;
      text(doc, label, x, y + 9, { font: "Helvetica-Bold", size: 7.1, color: GREEN, width: statWidth - 17, characterSpacing: 0.3, height: 11, ellipsis: true });
      text(doc, value, x, y + 26, { font: "Helvetica-Bold", size: report.includePricing && statIndex === 3 ? (job.valueCents == null || job.pricingIsPartial ? 9 : 11) : 12.5, color: INK, width: statWidth - 17, height: 18, ellipsis: true });
    });
    y += 60;
    if (job.unloggedHoursCount) {
      text(doc, `${job.unloggedHoursCount} ${job.unloggedHoursCount === 1 ? "asset has" : "assets have"} no logged hours; totals reflect recorded hours only.`, MARGIN + 13, y, { size: 8, color: "#9B633E", width: CONTENT_WIDTH - 26 });
      y += 18;
    }
    if (!job.tasks.length) {
      doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 37, 6).fill(PAPER);
      text(doc, "No assets are recorded beneath this job yet.", MARGIN + 13, y + 11, { size: 9, color: MUTED, width: CONTENT_WIDTH - 26 });
      y += 37;
    } else {
      drawTaskHeading(doc, y);
      y += 31;
      for (const task of job.tasks) {
        const rowHeight = taskRowHeight(doc, task.title);
        if (ensureSpace(rowHeight + 3)) {
          text(doc, `${job.title} - continued`, MARGIN, y, { font: "Helvetica-Bold", size: 10, color: GREEN, width: CONTENT_WIDTH, height: 20, ellipsis: true });
          y += 23;
          drawTaskHeading(doc, y);
          y += 31;
        }
        drawTaskRow(doc, task, y, rowHeight);
        y += rowHeight;
      }
    }
    y += 26;
  }

  const notes = [
    report.totals.unloggedHoursCount ? `${report.totals.unloggedHoursCount} assets have no logged hours. Recorded hours are a minimum, not a complete total.` : null,
    report.includePricing
      ? `Allocated values reflect currently linked, non-void invoices${report.totals.hasUnpricedJobs ? "; the displayed total is partial because some jobs have no usable allocation" : ""}. This is a work summary, not a tax invoice or final quote.`
      : "This work summary shows scope and recorded time only. Pricing has been intentionally omitted for discussion.",
  ].filter((note): note is string => Boolean(note));
  const noteHeight = 20 + notes.reduce((sum, note) => sum + doc.font("Helvetica").fontSize(8.5).heightOfString(note, { width: CONTENT_WIDTH - 26, lineGap: 1 }) + 4, 0);
  ensureSpace(noteHeight + 16);
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, noteHeight, 7).fill(PAPER);
  text(doc, "REPORT NOTES", MARGIN + 13, y + 12, { font: "Helvetica-Bold", size: 8, color: GREEN, characterSpacing: 0.7 });
  let noteY = y + 30;
  for (const note of notes) {
    text(doc, note, MARGIN + 13, noteY, { size: 8.5, color: MUTED, width: CONTENT_WIDTH - 26 });
    noteY += doc.font("Helvetica").fontSize(8.5).heightOfString(note, { width: CONTENT_WIDTH - 26, lineGap: 1 }) + 4;
  }

  const pageRange = doc.bufferedPageRange();
  for (let page = pageRange.start; page < pageRange.start + pageRange.count; page++) {
    doc.switchToPage(page);
    doc.moveTo(MARGIN, PAGE_HEIGHT - 49).lineTo(PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 49).lineWidth(0.7).strokeColor(LINE).stroke();
    text(doc, "TRUSHOT MEDIA  |  trushotmedia.com", MARGIN, PAGE_HEIGHT - 39, { font: "Helvetica-Bold", size: 8, color: GREEN, width: 330, characterSpacing: 0.4 });
    text(doc, `${page + 1} / ${pageRange.count}`, PAGE_WIDTH - MARGIN - 60, PAGE_HEIGHT - 39, { size: 8, color: MUTED, width: 60, align: "right" });
  }

  doc.end();
  return output;
}
