#include "Provisioning.h"

#include <esp_system.h>

namespace {
constexpr unsigned long kConnectTimeoutMs = 18000UL;
}

TruShotProvisioning::TruShotProvisioning() : server_(80) {}

void TruShotProvisioning::begin() {
  preferences_.begin("trushot-net", false);
  const String ssid = preferences_.getString("ssid", "");
  const String password = preferences_.getString("password", "");

  const uint64_t chipId = ESP.getEfuseMac();
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%04X", static_cast<unsigned int>(chipId & 0xFFFF));
  apSsid_ = String("TruShot Hub-") + suffix;

  if (ssid.isEmpty()) {
    startPortal();
    return;
  }

  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid.c_str(), password.c_str());
  connectStartedAt_ = millis();
  state_ = TruShotNetworkState::Connecting;
}

void TruShotProvisioning::loop() {
  if (portalRunning_) {
    dns_.processNextRequest();
    server_.handleClient();
  }

  if (restartAt_ && static_cast<long>(millis() - restartAt_) >= 0) ESP.restart();

  if (WiFi.status() == WL_CONNECTED) {
    if (portalRunning_) stopPortal();
    state_ = TruShotNetworkState::Connected;
    return;
  }

  if (state_ == TruShotNetworkState::Connected) {
    state_ = TruShotNetworkState::Connecting;
    connectStartedAt_ = millis();
  }

  if (state_ == TruShotNetworkState::Connecting && millis() - connectStartedAt_ >= kConnectTimeoutMs) {
    startPortal();
  }
}

void TruShotProvisioning::resetWifi() {
  preferences_.clear();
  WiFi.disconnect(true, true);
  restartAt_ = millis() + 350;
}

bool TruShotProvisioning::connected() const { return WiFi.status() == WL_CONNECTED; }
TruShotNetworkState TruShotProvisioning::state() const { return state_; }
String TruShotProvisioning::portalSsid() const { return apSsid_; }
String TruShotProvisioning::portalPassword() const { return apPassword_; }
String TruShotProvisioning::connectedSsid() const { return connected() ? WiFi.SSID() : String(); }
int TruShotProvisioning::signalStrength() const { return connected() ? WiFi.RSSI() : -127; }

String TruShotProvisioning::qrPayload() const {
  return String("WIFI:T:WPA;S:") + apSsid_ + ";P:" + apPassword_ + ";;";
}

void TruShotProvisioning::startPortal() {
  if (portalRunning_) return;
  WiFi.disconnect(false, false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apSsid_.c_str(), apPassword_.c_str());
  dns_.start(53, "*", WiFi.softAPIP());

  server_.on("/", HTTP_GET, [this]() { handlePortal(); });
  server_.on("/save", HTTP_POST, [this]() { handleSave(); });
  server_.on("/generate_204", HTTP_ANY, [this]() { handlePortal(); });
  server_.on("/hotspot-detect.html", HTTP_ANY, [this]() { handlePortal(); });
  server_.on("/connecttest.txt", HTTP_ANY, [this]() { handlePortal(); });
  server_.onNotFound([this]() { handlePortal(); });
  server_.begin();
  portalRunning_ = true;
  state_ = TruShotNetworkState::Provisioning;
}

void TruShotProvisioning::stopPortal() {
  server_.stop();
  dns_.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portalRunning_ = false;
}

void TruShotProvisioning::handlePortal() {
  server_.sendHeader("Cache-Control", "no-store");
  server_.send(200, "text/html; charset=utf-8", portalHtml());
}

void TruShotProvisioning::handleSave() {
  const String ssid = server_.arg("ssid");
  const String password = server_.arg("password");
  if (ssid.isEmpty() || ssid.length() > 32 || password.length() > 64) {
    server_.send(400, "text/plain", "Please enter a valid Wi-Fi network and password.");
    return;
  }
  preferences_.putString("ssid", ssid);
  preferences_.putString("password", password);
  server_.send(200, "text/html; charset=utf-8",
    "<!doctype html><meta name=viewport content='width=device-width'><style>body{font-family:system-ui;background:#07130f;color:#f6f0e5;display:grid;place-items:center;min-height:100vh;text-align:center}div{max-width:24rem;padding:2rem}h1{color:#87cbaa}</style><div><h1>TruShot Hub is ready</h1><p>Your display is joining the network now. You can close this page.</p></div>");
  restartAt_ = millis() + 1200;
}

String TruShotProvisioning::portalHtml() const {
  int networkCount = WiFi.scanNetworks(false, true);
  String options;
  for (int i = 0; i < networkCount; ++i) {
    options += "<option value=\"" + escapeHtml(WiFi.SSID(i)) + "\">" + escapeHtml(WiFi.SSID(i));
    options += " · " + String(WiFi.RSSI(i)) + " dBm</option>";
  }
  WiFi.scanDelete();

  return String(F(
    "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'><title>Set up TruShot Hub</title><style>"
    "*{box-sizing:border-box}body{margin:0;background:#06110d;color:#f6f0e5;font-family:ui-sans-serif,system-ui;min-height:100vh;display:grid;place-items:center;padding:24px}"
    ".card{width:min(100%,430px);background:#0d2119;border:1px solid #24483a;border-radius:28px;padding:30px;box-shadow:0 24px 80px #0008}"
    ".eyebrow{color:#7fc69f;font-size:12px;letter-spacing:.18em;font-weight:800}.mark{font-size:28px;font-weight:900;letter-spacing:-.04em;margin:9px 0 8px}"
    "p{color:#a9b8b0;line-height:1.5;margin:0 0 25px}label{display:block;font-size:12px;font-weight:800;letter-spacing:.08em;margin:18px 0 8px}"
    "select,input{width:100%;border:1px solid #315846;border-radius:14px;background:#081710;color:#fff;padding:15px;font:inherit}button{width:100%;margin-top:22px;border:0;border-radius:15px;padding:16px;background:#75c49b;color:#06110d;font-weight:900;font-size:16px}"
    "small{display:block;color:#71847b;margin-top:18px;text-align:center}</style></head><body><form class=card method=post action=/save>"
    "<div class=eyebrow>TRUSHOT MEDIA</div><div class=mark>Connect your Hub</div><p>Choose the 2.4 GHz Wi-Fi network this display should use.</p><label>WI-FI NETWORK</label><select name=ssid required>"))
    + options + F("</select><label>PASSWORD</label><input name=password type=password maxlength=64 autocomplete=current-password><button>Connect display</button><small>Your password is stored only on this device.</small></form></body></html>");
}

String TruShotProvisioning::escapeHtml(const String &value) {
  String escaped;
  escaped.reserve(value.length() + 8);
  for (size_t i = 0; i < value.length(); ++i) {
    const char c = value[i];
    if (c == '&') escaped += F("&amp;");
    else if (c == '<') escaped += F("&lt;");
    else if (c == '>') escaped += F("&gt;");
    else if (c == '\"') escaped += F("&quot;");
    else escaped += c;
  }
  return escaped;
}
