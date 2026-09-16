// TruShot CRM — Scriptable Lock Screen widget
// Run this script once inside Scriptable to securely save the setup code.

const API_URL = "https://www.trushotmedia.com/api/widget/summary";
const CRM_URL = "https://www.trushotmedia.com/admin/overview";
const TOKEN_KEY = "com.trushotmedia.crm.widget.token";
const CACHE_FILE = "trushot-crm-widget-cache.json";
const REFRESH_MINUTES = 15;

const primary = Color.dynamic(new Color("#173E2C"), new Color("#F4FFF8"));
const secondary = Color.dynamic(new Color("#526159"), new Color("#CAD7CF"));
const divider = Color.dynamic(new Color("#173E2C", 0.22), new Color("#F4FFF8", 0.28));

function readCache() {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
    if (!fm.fileExists(path)) return null;
    return JSON.parse(fm.readString(path));
  } catch (error) {
    console.warn(`TruShot widget cache could not be read: ${error}`);
    return null;
  }
}

function writeCache(summary) {
  try {
    const fm = FileManager.local();
    const path = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
    fm.writeString(path, JSON.stringify(summary));
  } catch (error) {
    console.warn(`TruShot widget cache could not be written: ${error}`);
    // A cache failure should never prevent the live widget from rendering.
  }
}

async function requestSetupCode() {
  if (!config.runsInApp) return null;
  const prompt = new Alert();
  prompt.title = "Connect TruShot CRM";
  prompt.message = "Paste the private widget setup code supplied with this script. It will be stored securely in your iPhone Keychain.";
  prompt.addSecureTextField("Setup code");
  prompt.addAction("Connect");
  prompt.addCancelAction("Cancel");
  const choice = await prompt.presentAlert();
  if (choice < 0) return null;
  const token = prompt.textFieldValue(0).trim();
  if (!token) return null;
  Keychain.set(TOKEN_KEY, token);
  return token;
}

async function loadSummary(token) {
  const request = new Request(API_URL);
  request.method = "GET";
  request.timeoutInterval = 12;
  request.headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  const data = await request.loadJSON();
  if (request.response.statusCode !== 200) throw new Error(`CRM returned ${request.response.statusCode}`);
  const summary = {
    inbox: Number(data.inbox),
    jobsOutstanding: Number(data.jobsOutstanding),
    tasksOutstanding: Number(data.tasksOutstanding),
    updatedAt: data.updatedAt,
  };
  if (![summary.inbox, summary.jobsOutstanding, summary.tasksOutstanding].every(Number.isFinite)) {
    throw new Error("CRM returned invalid widget data");
  }
  writeCache(summary);
  return summary;
}

function addMetric(row, symbolName, value, label) {
  const metric = row.addStack();
  metric.layoutVertically();
  metric.centerAlignContent();
  metric.size = new Size(45, 0);

  const valueRow = metric.addStack();
  valueRow.centerAlignContent();
  valueRow.spacing = 3;
  const symbol = SFSymbol.named(symbolName);
  symbol.applyFont(Font.semiboldSystemFont(9));
  const icon = valueRow.addImage(symbol.image);
  icon.imageSize = new Size(9, 9);
  icon.tintColor = secondary;
  const count = valueRow.addText(String(value));
  count.font = Font.boldRoundedSystemFont(18);
  count.textColor = primary;
  count.minimumScaleFactor = 0.55;
  count.lineLimit = 1;

  metric.addSpacer(1);
  const caption = metric.addText(label.toUpperCase());
  caption.font = Font.semiboldRoundedSystemFont(6.5);
  caption.textColor = secondary;
  caption.minimumScaleFactor = 0.7;
  caption.lineLimit = 1;
  caption.centerAlignText();
}

function addDivider(row) {
  row.addSpacer(4);
  const rule = row.addStack();
  rule.size = new Size(1, 26);
  rule.backgroundColor = divider;
  row.addSpacer(4);
}

function buildWidget(summary, isStale) {
  const widget = new ListWidget();
  widget.url = CRM_URL;
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(5, 8, 5, 8);
  widget.refreshAfterDate = new Date(Date.now() + REFRESH_MINUTES * 60 * 1000);

  const header = widget.addStack();
  header.centerAlignContent();
  const title = header.addText("TRUSHOT CRM");
  title.font = Font.boldRoundedSystemFont(7.5);
  title.textColor = primary;
  title.lineLimit = 1;
  header.addSpacer();
  const status = header.addText(isStale ? "CACHED" : "LIVE");
  status.font = Font.semiboldRoundedSystemFont(5.5);
  status.textColor = secondary;
  status.lineLimit = 1;

  widget.addSpacer(3);
  const row = widget.addStack();
  row.centerAlignContent();
  addMetric(row, "tray.fill", summary.inbox, "Inbox");
  addDivider(row);
  addMetric(row, "briefcase.fill", summary.jobsOutstanding, "Jobs");
  addDivider(row);
  addMetric(row, "checkmark.circle.fill", summary.tasksOutstanding, "Tasks");
  return widget;
}

function buildSetupWidget(message) {
  const widget = new ListWidget();
  widget.url = "scriptable:///run/TruShot%20CRM%20Lock%20Screen";
  widget.addAccessoryWidgetBackground = true;
  widget.setPadding(8, 10, 8, 10);
  const title = widget.addText("TRUSHOT CRM");
  title.font = Font.boldRoundedSystemFont(10);
  title.textColor = primary;
  widget.addSpacer(3);
  const note = widget.addText(message);
  note.font = Font.mediumRoundedSystemFont(8);
  note.textColor = secondary;
  note.lineLimit = 2;
  note.minimumScaleFactor = 0.75;
  return widget;
}

let token = Keychain.contains(TOKEN_KEY) ? Keychain.get(TOKEN_KEY) : null;
if (!token) token = await requestSetupCode();

let summary = null;
let isStale = false;
if (token) {
  try {
    summary = await loadSummary(token);
  } catch (error) {
    console.warn(`TruShot widget refresh failed: ${error}`);
    summary = readCache();
    isStale = Boolean(summary);
  }
}

const widget = summary
  ? buildWidget(summary, isStale)
  : buildSetupWidget(token ? "CRM temporarily unavailable" : "Open this script to connect");

Script.setWidget(widget);
if (config.runsInApp) await widget.presentAccessoryRectangular();
Script.complete();
