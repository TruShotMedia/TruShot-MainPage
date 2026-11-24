import { jobWorkflow, type SharedJobProgress } from "./job-progress-share";

const ink = "#172956", muted = "#495b83", blue = "#2459ed", border = "#dce6ff";
const width = 1200;

function fitText(ctx: CanvasRenderingContext2D, label: string, maxWidth: number) {
  if (ctx.measureText(label).width <= maxWidth) return label;
  const chars = Array.from(label);
  let low = 0, high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(chars.slice(0, mid).join("") + "…").width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return chars.slice(0, low).join("") + "…";
}

/** The browser supplies fonts and rasterises locally; no image service gets job data. */
export async function createJobProgressPng(data: SharedJobProgress): Promise<Blob> {
  const { total, completed, percent } = data.progress;
  let available = 20;
  const sections = data.stages.filter(stage => stage.items.length).map(stage => {
    const shown = stage.items.slice(0, Math.min(available, 6));
    available -= shown.length;
    const extra = stage.items.length - shown.length;
    return { ...stage, shown, extra, height: 58 + shown.length * 30 + (extra ? 29 : 0) };
  });
  const height = 650 + sections.reduce((sum, stage) => sum + stage.height + 12, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image rendering isn’t available on this device.");
  const ctx = context;

  function box(x: number, y: number, w: number, h: number, radius: number, fill: string | CanvasGradient, stroke?: string) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function text(label: string, x: number, y: number, size: number, color = ink, weight = 400, align: CanvasTextAlign = "left", maxWidth = 1000) {
    ctx.font = `${weight} ${size}px system-ui, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(fitText(ctx, label.replace(/\s+/g, " "), maxWidth), x, y);
  }
  function line(points: [number, number][], stroke: string, thickness: number) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  const paper = ctx.createLinearGradient(0, 0, width, height);
  paper.addColorStop(0, "#e7f0ff"); paper.addColorStop(1, "#f8faff");
  box(0, 0, width, height, 0, paper);
  text("TRUSHOT  /  PROJECT PROGRESS", 48, 58, 18, blue, 750);
  text("EMAIL SNAPSHOT", 1152, 58, 16, muted, 700, "right");
  box(48, 88, 1104, 303, 26, "#fff", border);
  text("JOB PROGRESS", 79, 148, 17, blue, 750);
  text(data.title, 79, 207, 37, ink, 800, "left", 775);
  text(data.stageLabel, 79, 256, 25, muted, 700, "left", 775);
  text(total ? `${completed} of ${total} deliverables complete` : "Progress based on the job stage", 79, 327, 23, muted);
  ctx.beginPath(); ctx.arc(1000, 240, 85, 0, Math.PI * 2);
  ctx.lineWidth = 16; ctx.strokeStyle = "#e4ecff"; ctx.stroke();
  if (percent > 0) {
    ctx.beginPath(); ctx.arc(1000, 240, 85, -Math.PI / 2, Math.PI * (2 * percent / 100 - .5));
    ctx.strokeStyle = blue; ctx.lineCap = "round"; ctx.stroke();
  }
  text(`${percent}%`, 1000, 245, 42, ink, 800, "center");
  text("Overall progress", 1000, 271, 14, muted, 650, "center");
  line([[144, 436], [1056, 436]], "#bed0fc", 4);
  if (data.stageIndex > 0) line([[144, 436], [144 + 228 * data.stageIndex, 436]], blue, 4);
  jobWorkflow.forEach((stage, i) => {
    const x = 144 + 228 * i, reached = i <= data.stageIndex;
    box(x - 16, 420, 32, 32, 16, reached ? blue : "#fff", reached ? blue : "#bed0fc");
    if (i < data.stageIndex) line([[x - 6, 436], [x - 2, 440], [x + 6, 432]], "#fff", 2.5);
    else if (i === data.stageIndex) box(x - 4, 432, 8, 8, 4, "#fff");
    text(stage, x, 483, 18, reached ? blue : muted, reached ? 700 : 400, "center");
  });
  text(total ? "Deliverable pipeline" : "No linked deliverables yet", 48, 532, 26, ink, 750);
  let cumulative = 0;
  for (const stage of sections) {
    const next = cumulative + stage.items.length;
    const x = 48 + Math.round(cumulative / total * 1104);
    const w = 48 + Math.round(next / total * 1104) - x;
    if (w) box(x, 551, w, 11, 0, stage.color);
    cumulative = next;
  }
  let y = 582;
  for (const stage of sections) {
    box(48, y, 1104, stage.height, 17, "#fff", border);
    box(73, y + 22, 12, 12, 6, stage.color);
    text(stage.title, 99, y + 35, 21, ink, 750);
    text(String(stage.items.length), 1120, y + 35, 20, muted, 750, "right");
    stage.shown.forEach((name, index) => text(name, 99, y + 66 + index * 30, 19, muted));
    if (stage.extra) text(`+${stage.extra} more in this stage`, 99, y + 66 + stage.shown.length * 30, 18, blue);
    y += stage.height + 12;
  }
  const date = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Brisbane" }).format(new Date());
  text(`Progress snapshot · ${date}`, 48, height - 26, 17, muted);
  return new Promise((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png",
  ));
}
