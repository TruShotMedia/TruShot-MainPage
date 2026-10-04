#pragma once

#include <Arduino.h>
#include <lvgl.h>

#include "CrmClient.h"
#include "Provisioning.h"

enum class TruShotView {
  Boot,
  Provisioning,
  Watch,
  Dashboard,
  Agenda,
  Controls,
  Notification,
};

class TruShotUI {
 public:
  void begin();
  void loop(const TruShotSnapshot &snapshot, const TruShotProvisioning &network, bool syncing);
  void showProvisioning(const String &qrPayload, const String &ssid, const String &password);
  void showWatch();
  void showDashboard();
  void showAgenda();
  void showControls();
  void showNotification(const TruShotNotification &notification);
  bool takeRefreshRequest();
  bool takeResetWifiRequest();
  void setBrightness(uint8_t value);
  uint8_t brightness() const;
  TruShotView view() const;

 private:
  static void screenEvent(lv_event_t *event);
  static void controlEvent(lv_event_t *event);
  static void brightnessEvent(lv_event_t *event);
  static void clockTimer(lv_timer_t *timer);

  void createWatch();
  void createDashboard();
  void createAgenda();
  void createControls();
  void createProvisioning();
  void createNotification();
  void load(lv_obj_t *screen, TruShotView view, bool animate = true);
  void noteInteraction();
  void updateClock();
  void updateDashboard(const TruShotSnapshot &snapshot, const TruShotProvisioning &network, bool syncing);
  void updateAgenda(const TruShotSnapshot &snapshot);
  void updateControls(const TruShotProvisioning &network, bool syncing);
  static String formatOccurrence(const String &iso);

  lv_obj_t *watchScreen_ = nullptr;
  lv_obj_t *dashboardScreen_ = nullptr;
  lv_obj_t *agendaScreen_ = nullptr;
  lv_obj_t *controlsScreen_ = nullptr;
  lv_obj_t *provisionScreen_ = nullptr;
  lv_obj_t *notificationScreen_ = nullptr;

  lv_obj_t *watchDate_ = nullptr;
  lv_obj_t *watchStatus_ = nullptr;
  lv_obj_t *dashboardCounts_[3] = {};
  lv_obj_t *dashboardNextTitle_ = nullptr;
  lv_obj_t *dashboardNextMeta_ = nullptr;
  lv_obj_t *dashboardSync_ = nullptr;
  lv_obj_t *agendaRows_[3] = {};
  lv_obj_t *agendaMeta_[3] = {};
  lv_obj_t *controlWifi_ = nullptr;
  lv_obj_t *controlSync_ = nullptr;
  lv_obj_t *brightnessSlider_ = nullptr;
  lv_obj_t *provisionQr_ = nullptr;
  lv_obj_t *provisionNetwork_ = nullptr;
  lv_obj_t *notificationTitle_ = nullptr;
  lv_obj_t *notificationBody_ = nullptr;

  lv_point_t hourPoints_[2] = {};
  lv_point_t minutePoints_[2] = {};
  lv_point_t secondPoints_[2] = {};
  lv_obj_t *hourHand_ = nullptr;
  lv_obj_t *minuteHand_ = nullptr;
  lv_obj_t *secondHand_ = nullptr;

  TruShotView view_ = TruShotView::Boot;
  TruShotView notificationReturnView_ = TruShotView::Watch;
  unsigned long lastInteractionAt_ = 0;
  unsigned long lastUiUpdateAt_ = 0;
  unsigned long notificationShownAt_ = 0;
  bool refreshRequested_ = false;
  bool resetWifiRequested_ = false;
  uint8_t brightness_ = 72;
  String lastNotificationId_;
};
