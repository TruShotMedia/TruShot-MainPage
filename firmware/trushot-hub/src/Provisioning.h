#pragma once

#include <DNSServer.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>

enum class TruShotNetworkState {
  Starting,
  Connecting,
  Connected,
  Provisioning,
  Failed,
};

class TruShotProvisioning {
 public:
  TruShotProvisioning();
  void begin();
  void loop();
  void resetWifi();
  bool connected() const;
  TruShotNetworkState state() const;
  String portalSsid() const;
  String portalPassword() const;
  String qrPayload() const;
  String connectedSsid() const;
  int signalStrength() const;

 private:
  void startPortal();
  void stopPortal();
  void handlePortal();
  void handleSave();
  String portalHtml() const;
  static String escapeHtml(const String &value);

  DNSServer dns_;
  WebServer server_;
  Preferences preferences_;
  TruShotNetworkState state_ = TruShotNetworkState::Starting;
  unsigned long connectStartedAt_ = 0;
  unsigned long restartAt_ = 0;
  bool portalRunning_ = false;
  String apSsid_;
  String apPassword_ = "trushot13";
};
