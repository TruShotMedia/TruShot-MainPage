#include "TruShotUI.h"

#include <cmath>
#include <ctime>

#include "DeviceConfig.h"
#include "board/Display_SPD2010.h"

namespace {
TruShotUI *activeUi = nullptr;

constexpr uint32_t kInk = 0x06110D;
constexpr uint32_t kPanel = 0x0D2119;
constexpr uint32_t kGreen = 0x1D6548;
constexpr uint32_t kMint = 0x84CDA8;
constexpr uint32_t kGold = 0xCBA968;
constexpr uint32_t kIvory = 0xF7F1E7;
constexpr uint32_t kMuted = 0x91A098;
constexpr uint32_t kBorder = 0x29473B;
constexpr uint32_t kAlert = 0xD57667;
constexpr int kCenter = 206;

lv_color_t color(uint32_t value) { return lv_color_hex(value); }

void makeScreen(lv_obj_t *screen) {
  lv_obj_remove_style_all(screen);
  lv_obj_set_size(screen, 412, 412);
  lv_obj_set_style_bg_color(screen, color(kInk), 0);
  lv_obj_set_style_bg_opa(screen, LV_OPA_COVER, 0);
  lv_obj_clear_flag(screen, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_add_flag(screen, LV_OBJ_FLAG_CLICKABLE);
}

lv_obj_t *makeLabel(lv_obj_t *parent, const char *text, const lv_font_t *font, uint32_t textColor) {
  lv_obj_t *label = lv_label_create(parent);
  lv_label_set_text(label, text);
  lv_obj_set_style_text_font(label, font, 0);
  lv_obj_set_style_text_color(label, color(textColor), 0);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, 0);
  return label;
}

lv_obj_t *makePanel(lv_obj_t *parent, int x, int y, int width, int height, int radius = 22) {
  lv_obj_t *panel = lv_obj_create(parent);
  lv_obj_remove_style_all(panel);
  lv_obj_set_pos(panel, x, y);
  lv_obj_set_size(panel, width, height);
  lv_obj_set_style_bg_color(panel, color(kPanel), 0);
  lv_obj_set_style_bg_opa(panel, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(panel, color(kBorder), 0);
  lv_obj_set_style_border_width(panel, 1, 0);
  lv_obj_set_style_radius(panel, radius, 0);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(panel, LV_OBJ_FLAG_CLICKABLE);
  return panel;
}

void setLineStyle(lv_obj_t *line, uint32_t lineColor, int width, bool rounded = true) {
  lv_obj_set_style_line_color(line, color(lineColor), 0);
  lv_obj_set_style_line_width(line, width, 0);
  lv_obj_set_style_line_rounded(line, rounded, 0);
}

String signalText(int rssi) {
  if (rssi > -55) return "Excellent signal";
  if (rssi > -67) return "Good signal";
  if (rssi > -75) return "Fair signal";
  return "Weak signal";
}

time_t utcEpoch(int year, unsigned month, unsigned day, int hour, int minute) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
  const unsigned dayOfYear = (153 * (month + (month > 2 ? -3 : 9)) + 2) / 5 + day - 1;
  const unsigned dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  const int64_t days = static_cast<int64_t>(era) * 146097 + dayOfEra - 719468;
  return static_cast<time_t>(days * 86400 + hour * 3600 + minute * 60);
}
}

void TruShotUI::begin() {
  activeUi = this;
  createWatch();
  createDashboard();
  createAgenda();
  createControls();
  createProvisioning();
  createNotification();
  lv_timer_create(clockTimer, 1000, this);
  showWatch();
}

void TruShotUI::loop(const TruShotSnapshot &snapshot, const TruShotProvisioning &network, bool syncing) {
  const unsigned long now = millis();
  if (now - lastUiUpdateAt_ >= 500) {
    lastUiUpdateAt_ = now;
    updateDashboard(snapshot, network, syncing);
    updateAgenda(snapshot);
    updateControls(network, syncing);
    lv_label_set_text(watchStatus_, network.connected() ? "●  CONNECTED" : "○  OFFLINE");
    lv_obj_set_style_text_color(watchStatus_, color(network.connected() ? kMint : kMuted), 0);
  }

  if (view_ == TruShotView::Notification && now - notificationShownAt_ >= TRUSHOT_NOTIFICATION_TIMEOUT_MS) {
    notificationReturnView_ == TruShotView::Dashboard ? showDashboard() : showWatch();
  } else if ((view_ == TruShotView::Dashboard || view_ == TruShotView::Agenda || view_ == TruShotView::Controls) &&
             now - lastInteractionAt_ >= TRUSHOT_IDLE_TIMEOUT_MS) {
    showWatch();
  }
}

void TruShotUI::showProvisioning(const String &qrPayload, const String &ssid, const String &password) {
  lv_qrcode_update(provisionQr_, qrPayload.c_str(), qrPayload.length());
  const String network = ssid + "\nPassword  " + password;
  lv_label_set_text(provisionNetwork_, network.c_str());
  load(provisionScreen_, TruShotView::Provisioning, false);
}

void TruShotUI::showWatch() { load(watchScreen_, TruShotView::Watch); }
void TruShotUI::showDashboard() { load(dashboardScreen_, TruShotView::Dashboard); }
void TruShotUI::showAgenda() { load(agendaScreen_, TruShotView::Agenda); }
void TruShotUI::showControls() { load(controlsScreen_, TruShotView::Controls); }

void TruShotUI::showNotification(const TruShotNotification &notification) {
  if (notification.id.isEmpty() || notification.id == lastNotificationId_) return;
  lastNotificationId_ = notification.id;
  notificationReturnView_ = view_ == TruShotView::Dashboard ? TruShotView::Dashboard : TruShotView::Watch;
  lv_label_set_text(notificationTitle_, notification.title.c_str());
  lv_label_set_text(notificationBody_, notification.body.c_str());
  notificationShownAt_ = millis();
  load(notificationScreen_, TruShotView::Notification);
}

bool TruShotUI::takeRefreshRequest() {
  const bool value = refreshRequested_;
  refreshRequested_ = false;
  return value;
}

bool TruShotUI::takeResetWifiRequest() {
  const bool value = resetWifiRequested_;
  resetWifiRequested_ = false;
  return value;
}

void TruShotUI::setBrightness(uint8_t value) {
  brightness_ = constrain(value, 8, 100);
  Set_Backlight(brightness_);
  if (brightnessSlider_) lv_slider_set_value(brightnessSlider_, brightness_, LV_ANIM_OFF);
}

uint8_t TruShotUI::brightness() const { return brightness_; }
TruShotView TruShotUI::view() const { return view_; }

void TruShotUI::screenEvent(lv_event_t *event) {
  if (!activeUi) return;
  const lv_event_code_t code = lv_event_get_code(event);
  activeUi->noteInteraction();

  if (code == LV_EVENT_CLICKED) {
    if (activeUi->view_ == TruShotView::Watch) activeUi->showDashboard();
    else if (activeUi->view_ == TruShotView::Notification) {
      activeUi->notificationReturnView_ == TruShotView::Dashboard ? activeUi->showDashboard() : activeUi->showWatch();
    }
    return;
  }

  if (code != LV_EVENT_GESTURE) return;
  lv_indev_t *input = lv_indev_get_act();
  if (!input) return;
  const lv_dir_t direction = lv_indev_get_gesture_dir(input);
  if (direction == LV_DIR_BOTTOM && activeUi->view_ != TruShotView::Provisioning) activeUi->showControls();
  else if (direction == LV_DIR_TOP && activeUi->view_ == TruShotView::Controls) activeUi->showWatch();
  else if (direction == LV_DIR_LEFT && activeUi->view_ == TruShotView::Dashboard) activeUi->showAgenda();
  else if (direction == LV_DIR_RIGHT && activeUi->view_ == TruShotView::Agenda) activeUi->showDashboard();
}

void TruShotUI::controlEvent(lv_event_t *event) {
  if (!activeUi || lv_event_get_code(event) != LV_EVENT_CLICKED) return;
  activeUi->noteInteraction();
  const char *action = static_cast<const char *>(lv_event_get_user_data(event));
  if (!action) return;
  if (strcmp(action, "refresh") == 0) activeUi->refreshRequested_ = true;
  else if (strcmp(action, "reset") == 0) activeUi->resetWifiRequested_ = true;
  else if (strcmp(action, "close") == 0) activeUi->showWatch();
}

void TruShotUI::brightnessEvent(lv_event_t *event) {
  if (!activeUi || lv_event_get_code(event) != LV_EVENT_VALUE_CHANGED) return;
  activeUi->noteInteraction();
  activeUi->setBrightness(static_cast<uint8_t>(lv_slider_get_value(lv_event_get_target(event))));
}

void TruShotUI::clockTimer(lv_timer_t *timer) {
  TruShotUI *ui = static_cast<TruShotUI *>(timer->user_data);
  if (ui) ui->updateClock();
}

void TruShotUI::createWatch() {
  watchScreen_ = lv_obj_create(nullptr);
  makeScreen(watchScreen_);
  lv_obj_add_event_cb(watchScreen_, screenEvent, LV_EVENT_ALL, nullptr);

  lv_obj_t *outer = lv_obj_create(watchScreen_);
  lv_obj_remove_style_all(outer);
  lv_obj_set_size(outer, 392, 392);
  lv_obj_center(outer);
  lv_obj_set_style_radius(outer, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(outer, color(0x09271C), 0);
  lv_obj_set_style_bg_opa(outer, LV_OPA_COVER, 0);
  lv_obj_set_style_bg_grad_color(outer, color(0x06110D), 0);
  lv_obj_set_style_bg_grad_dir(outer, LV_GRAD_DIR_VER, 0);
  lv_obj_set_style_border_color(outer, color(kGold), 0);
  lv_obj_set_style_border_width(outer, 2, 0);
  lv_obj_clear_flag(outer, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(outer, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *inner = lv_obj_create(outer);
  lv_obj_remove_style_all(inner);
  lv_obj_set_size(inner, 354, 354);
  lv_obj_center(inner);
  lv_obj_set_style_radius(inner, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_border_color(inner, color(0x54705F), 0);
  lv_obj_set_style_border_width(inner, 1, 0);
  lv_obj_clear_flag(inner, LV_OBJ_FLAG_CLICKABLE);

  for (int i = 0; i < 12; ++i) {
    const float angle = (i * 30.0f - 90.0f) * PI / 180.0f;
    lv_obj_t *marker = lv_obj_create(outer);
    lv_obj_remove_style_all(marker);
    lv_obj_set_size(marker, i % 3 == 0 ? 8 : 6, i % 3 == 0 ? 8 : 6);
    lv_obj_set_style_radius(marker, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(marker, color(i % 3 == 0 ? kIvory : kGold), 0);
    lv_obj_set_style_bg_opa(marker, LV_OPA_COVER, 0);
    lv_obj_clear_flag(marker, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_pos(marker, 196 + static_cast<int>(std::cos(angle) * 158), 196 + static_cast<int>(std::sin(angle) * 158));
  }

  lv_obj_t *brand = makeLabel(outer, "TRUSHOT", &lv_font_montserrat_18, kIvory);
  lv_obj_set_style_text_letter_space(brand, 2, 0);
  lv_obj_align(brand, LV_ALIGN_TOP_MID, 0, 96);
  lv_obj_t *media = makeLabel(outer, "M  E  D  I  A", &lv_font_montserrat_12, kGold);
  lv_obj_align(media, LV_ALIGN_TOP_MID, 0, 121);

  watchStatus_ = makeLabel(outer, "○  OFFLINE", &lv_font_montserrat_12, kMuted);
  lv_obj_align(watchStatus_, LV_ALIGN_BOTTOM_MID, 0, -76);
  watchDate_ = makeLabel(outer, "--", &lv_font_montserrat_14, kIvory);
  lv_obj_set_size(watchDate_, 58, 30);
  lv_obj_set_style_bg_color(watchDate_, color(0x04100B), 0);
  lv_obj_set_style_bg_opa(watchDate_, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(watchDate_, color(kGold), 0);
  lv_obj_set_style_border_width(watchDate_, 1, 0);
  lv_obj_set_style_radius(watchDate_, 6, 0);
  lv_obj_set_style_pad_top(watchDate_, 6, 0);
  lv_obj_align(watchDate_, LV_ALIGN_RIGHT_MID, -37, 0);

  hourHand_ = lv_line_create(outer);
  minuteHand_ = lv_line_create(outer);
  secondHand_ = lv_line_create(outer);
  setLineStyle(hourHand_, kIvory, 8);
  setLineStyle(minuteHand_, kIvory, 5);
  setLineStyle(secondHand_, kAlert, 2);

  lv_obj_t *pin = lv_obj_create(outer);
  lv_obj_remove_style_all(pin);
  lv_obj_set_size(pin, 15, 15);
  lv_obj_set_style_radius(pin, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(pin, color(kGold), 0);
  lv_obj_set_style_bg_opa(pin, LV_OPA_COVER, 0);
  lv_obj_center(pin);
  lv_obj_clear_flag(pin, LV_OBJ_FLAG_CLICKABLE);
  updateClock();
}

void TruShotUI::createDashboard() {
  dashboardScreen_ = lv_obj_create(nullptr);
  makeScreen(dashboardScreen_);
  lv_obj_add_event_cb(dashboardScreen_, screenEvent, LV_EVENT_ALL, nullptr);

  lv_obj_t *eyebrow = makeLabel(dashboardScreen_, "TRUSHOT  ·  LIVE", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(eyebrow, 2, 0);
  lv_obj_align(eyebrow, LV_ALIGN_TOP_MID, 0, 35);
  lv_obj_t *title = makeLabel(dashboardScreen_, "Your studio, at a glance", &lv_font_montserrat_24, kIvory);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 60);

  const char *names[3] = {"INBOX", "JOBS", "TASKS"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *panel = makePanel(dashboardScreen_, 31 + i * 119, 113, 111, 108, 20);
    dashboardCounts_[i] = makeLabel(panel, "—", &lv_font_montserrat_32, kIvory);
    lv_obj_align(dashboardCounts_[i], LV_ALIGN_TOP_MID, 0, 17);
    lv_obj_t *name = makeLabel(panel, names[i], &lv_font_montserrat_12, i == 0 ? kGold : kMuted);
    lv_obj_set_style_text_letter_space(name, 1, 0);
    lv_obj_align(name, LV_ALIGN_BOTTOM_MID, 0, -17);
  }

  lv_obj_t *nextPanel = makePanel(dashboardScreen_, 43, 241, 326, 113, 24);
  lv_obj_t *nextEyebrow = makeLabel(nextPanel, "UP NEXT", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(nextEyebrow, 2, 0);
  lv_obj_align(nextEyebrow, LV_ALIGN_TOP_LEFT, 19, 16);
  dashboardNextTitle_ = makeLabel(nextPanel, "Waiting for CRM…", &lv_font_montserrat_18, kIvory);
  lv_obj_set_width(dashboardNextTitle_, 286);
  lv_label_set_long_mode(dashboardNextTitle_, LV_LABEL_LONG_DOT);
  lv_obj_set_style_text_align(dashboardNextTitle_, LV_TEXT_ALIGN_LEFT, 0);
  lv_obj_align(dashboardNextTitle_, LV_ALIGN_TOP_LEFT, 19, 42);
  dashboardNextMeta_ = makeLabel(nextPanel, "", &lv_font_montserrat_12, kMuted);
  lv_obj_set_width(dashboardNextMeta_, 286);
  lv_obj_set_style_text_align(dashboardNextMeta_, LV_TEXT_ALIGN_LEFT, 0);
  lv_obj_align(dashboardNextMeta_, LV_ALIGN_BOTTOM_LEFT, 19, -14);

  dashboardSync_ = makeLabel(dashboardScreen_, "SWIPE LEFT FOR AGENDA", &lv_font_montserrat_12, kMuted);
  lv_obj_set_style_text_letter_space(dashboardSync_, 1, 0);
  lv_obj_align(dashboardSync_, LV_ALIGN_BOTTOM_MID, 0, -33);
}

void TruShotUI::createAgenda() {
  agendaScreen_ = lv_obj_create(nullptr);
  makeScreen(agendaScreen_);
  lv_obj_add_event_cb(agendaScreen_, screenEvent, LV_EVENT_ALL, nullptr);
  lv_obj_t *eyebrow = makeLabel(agendaScreen_, "NEXT ON THE CALENDAR", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(eyebrow, 2, 0);
  lv_obj_align(eyebrow, LV_ALIGN_TOP_MID, 0, 35);
  lv_obj_t *title = makeLabel(agendaScreen_, "Agenda", &lv_font_montserrat_32, kIvory);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 56);

  for (int i = 0; i < 3; ++i) {
    lv_obj_t *panel = makePanel(agendaScreen_, 45, 111 + i * 84, 322, 72, 18);
    agendaRows_[i] = makeLabel(panel, "Nothing scheduled", &lv_font_montserrat_16, kIvory);
    lv_obj_set_width(agendaRows_[i], 278);
    lv_label_set_long_mode(agendaRows_[i], LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(agendaRows_[i], LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_align(agendaRows_[i], LV_ALIGN_TOP_LEFT, 18, 12);
    agendaMeta_[i] = makeLabel(panel, "", &lv_font_montserrat_12, kMuted);
    lv_obj_set_width(agendaMeta_[i], 278);
    lv_label_set_long_mode(agendaMeta_[i], LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_align(agendaMeta_[i], LV_TEXT_ALIGN_LEFT, 0);
    lv_obj_align(agendaMeta_[i], LV_ALIGN_BOTTOM_LEFT, 18, -11);
  }
  lv_obj_t *hint = makeLabel(agendaScreen_, "SWIPE RIGHT TO RETURN", &lv_font_montserrat_12, kMuted);
  lv_obj_set_style_text_letter_space(hint, 1, 0);
  lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -26);
}

void TruShotUI::createControls() {
  controlsScreen_ = lv_obj_create(nullptr);
  makeScreen(controlsScreen_);
  lv_obj_add_event_cb(controlsScreen_, screenEvent, LV_EVENT_ALL, nullptr);
  lv_obj_t *eyebrow = makeLabel(controlsScreen_, "CONTROL CENTRE", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(eyebrow, 2, 0);
  lv_obj_align(eyebrow, LV_ALIGN_TOP_MID, 0, 34);
  controlWifi_ = makeLabel(controlsScreen_, "Wi-Fi offline", &lv_font_montserrat_20, kIvory);
  lv_obj_align(controlWifi_, LV_ALIGN_TOP_MID, 0, 62);
  controlSync_ = makeLabel(controlsScreen_, "Waiting to sync", &lv_font_montserrat_12, kMuted);
  lv_obj_align(controlSync_, LV_ALIGN_TOP_MID, 0, 91);

  lv_obj_t *brightnessPanel = makePanel(controlsScreen_, 50, 128, 312, 99, 23);
  lv_obj_t *brightnessLabel = makeLabel(brightnessPanel, "BRIGHTNESS", &lv_font_montserrat_12, kMuted);
  lv_obj_set_style_text_letter_space(brightnessLabel, 1, 0);
  lv_obj_align(brightnessLabel, LV_ALIGN_TOP_LEFT, 17, 14);
  brightnessSlider_ = lv_slider_create(brightnessPanel);
  lv_obj_set_size(brightnessSlider_, 267, 12);
  lv_slider_set_range(brightnessSlider_, 8, 100);
  lv_slider_set_value(brightnessSlider_, brightness_, LV_ANIM_OFF);
  lv_obj_align(brightnessSlider_, LV_ALIGN_BOTTOM_MID, 0, -23);
  lv_obj_set_style_bg_color(brightnessSlider_, color(0x243D33), LV_PART_MAIN);
  lv_obj_set_style_bg_color(brightnessSlider_, color(kMint), LV_PART_INDICATOR);
  lv_obj_set_style_bg_color(brightnessSlider_, color(kIvory), LV_PART_KNOB);
  lv_obj_add_event_cb(brightnessSlider_, brightnessEvent, LV_EVENT_VALUE_CHANGED, nullptr);

  const char *labels[3] = {"REFRESH", "RESET WI-FI", "CLOSE"};
  const char *actions[3] = {"refresh", "reset", "close"};
  for (int i = 0; i < 3; ++i) {
    lv_obj_t *button = lv_btn_create(controlsScreen_);
    lv_obj_set_size(button, i == 2 ? 145 : 145, 58);
    lv_obj_set_pos(button, i < 2 ? 54 + i * 159 : 134, i < 2 ? 249 : 320);
    lv_obj_set_style_bg_color(button, color(i == 1 ? 0x35201D : kPanel), 0);
    lv_obj_set_style_border_color(button, color(i == 1 ? 0x75433B : kBorder), 0);
    lv_obj_set_style_border_width(button, 1, 0);
    lv_obj_set_style_radius(button, 18, 0);
    lv_obj_set_style_shadow_width(button, 0, 0);
    lv_obj_t *label = makeLabel(button, labels[i], &lv_font_montserrat_12, i == 1 ? kAlert : kIvory);
    lv_obj_center(label);
    lv_obj_add_event_cb(button, controlEvent, LV_EVENT_CLICKED, const_cast<char *>(actions[i]));
  }
}

void TruShotUI::createProvisioning() {
  provisionScreen_ = lv_obj_create(nullptr);
  makeScreen(provisionScreen_);
  lv_obj_t *eyebrow = makeLabel(provisionScreen_, "WELCOME TO TRUSHOT HUB", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(eyebrow, 2, 0);
  lv_obj_align(eyebrow, LV_ALIGN_TOP_MID, 0, 25);
  lv_obj_t *title = makeLabel(provisionScreen_, "Scan to set up", &lv_font_montserrat_24, kIvory);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 49);
  provisionQr_ = lv_qrcode_create(provisionScreen_, 224, color(kInk), color(kIvory));
  lv_obj_align(provisionQr_, LV_ALIGN_CENTER, 0, 3);
  lv_obj_set_style_border_color(provisionQr_, color(kIvory), 0);
  lv_obj_set_style_border_width(provisionQr_, 10, 0);
  provisionNetwork_ = makeLabel(provisionScreen_, "Preparing Wi-Fi…", &lv_font_montserrat_12, kMuted);
  lv_obj_set_style_text_line_space(provisionNetwork_, 6, 0);
  lv_obj_align(provisionNetwork_, LV_ALIGN_BOTTOM_MID, 0, -35);
}

void TruShotUI::createNotification() {
  notificationScreen_ = lv_obj_create(nullptr);
  makeScreen(notificationScreen_);
  lv_obj_add_event_cb(notificationScreen_, screenEvent, LV_EVENT_ALL, nullptr);
  lv_obj_t *halo = lv_obj_create(notificationScreen_);
  lv_obj_remove_style_all(halo);
  lv_obj_set_size(halo, 390, 390);
  lv_obj_center(halo);
  lv_obj_set_style_radius(halo, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_bg_color(halo, color(0x102C22), 0);
  lv_obj_set_style_bg_opa(halo, LV_OPA_COVER, 0);
  lv_obj_set_style_border_color(halo, color(kMint), 0);
  lv_obj_set_style_border_width(halo, 2, 0);
  lv_obj_clear_flag(halo, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_clear_flag(halo, LV_OBJ_FLAG_CLICKABLE);

  lv_obj_t *bell = makeLabel(halo, "!", &lv_font_montserrat_24, kInk);
  lv_obj_set_size(bell, 52, 52);
  lv_obj_set_style_bg_color(bell, color(kMint), 0);
  lv_obj_set_style_bg_opa(bell, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(bell, LV_RADIUS_CIRCLE, 0);
  lv_obj_set_style_pad_top(bell, 11, 0);
  lv_obj_align(bell, LV_ALIGN_TOP_MID, 0, 54);
  lv_obj_t *eyebrow = makeLabel(halo, "CALENDAR REMINDER", &lv_font_montserrat_12, kMint);
  lv_obj_set_style_text_letter_space(eyebrow, 2, 0);
  lv_obj_align(eyebrow, LV_ALIGN_TOP_MID, 0, 120);
  notificationTitle_ = makeLabel(halo, "Reminder", &lv_font_montserrat_24, kIvory);
  lv_obj_set_width(notificationTitle_, 300);
  lv_label_set_long_mode(notificationTitle_, LV_LABEL_LONG_WRAP);
  lv_obj_align(notificationTitle_, LV_ALIGN_TOP_MID, 0, 149);
  notificationBody_ = makeLabel(halo, "", &lv_font_montserrat_16, kMuted);
  lv_obj_set_width(notificationBody_, 292);
  lv_label_set_long_mode(notificationBody_, LV_LABEL_LONG_WRAP);
  lv_obj_set_style_text_line_space(notificationBody_, 5, 0);
  lv_obj_align(notificationBody_, LV_ALIGN_TOP_MID, 0, 222);
  lv_obj_t *hint = makeLabel(halo, "TAP TO DISMISS", &lv_font_montserrat_12, kGold);
  lv_obj_set_style_text_letter_space(hint, 1, 0);
  lv_obj_align(hint, LV_ALIGN_BOTTOM_MID, 0, -47);
}

void TruShotUI::load(lv_obj_t *screen, TruShotView view, bool animate) {
  if (!screen || (view_ == view && lv_scr_act() == screen)) return;
  view_ = view;
  noteInteraction();
  lv_scr_load_anim(screen, animate ? LV_SCR_LOAD_ANIM_FADE_ON : LV_SCR_LOAD_ANIM_NONE, animate ? 180 : 0, 0, false);
}

void TruShotUI::noteInteraction() { lastInteractionAt_ = millis(); }

void TruShotUI::updateClock() {
  time_t now = time(nullptr);
  struct tm local = {};
  if (now < 1704067200) {
    local.tm_hour = 10;
    local.tm_min = 10;
    local.tm_sec = 0;
    local.tm_mday = 1;
  } else {
    localtime_r(&now, &local);
  }

  const float hourAngle = ((local.tm_hour % 12) + local.tm_min / 60.0f) * 30.0f * PI / 180.0f;
  const float minuteAngle = (local.tm_min + local.tm_sec / 60.0f) * 6.0f * PI / 180.0f;
  const float secondAngle = local.tm_sec * 6.0f * PI / 180.0f;

  auto setHand = [](lv_point_t *points, float angle, int length, int tail) {
    points[0].x = 196 - static_cast<int>(std::sin(angle) * tail);
    points[0].y = 196 + static_cast<int>(std::cos(angle) * tail);
    points[1].x = 196 + static_cast<int>(std::sin(angle) * length);
    points[1].y = 196 - static_cast<int>(std::cos(angle) * length);
  };
  setHand(hourPoints_, hourAngle, 82, 12);
  setHand(minutePoints_, minuteAngle, 119, 16);
  setHand(secondPoints_, secondAngle, 135, 24);
  lv_line_set_points(hourHand_, hourPoints_, 2);
  lv_line_set_points(minuteHand_, minutePoints_, 2);
  lv_line_set_points(secondHand_, secondPoints_, 2);

  char dateText[8];
  snprintf(dateText, sizeof(dateText), "%02d", local.tm_mday);
  lv_label_set_text(watchDate_, dateText);
}

void TruShotUI::updateDashboard(const TruShotSnapshot &snapshot, const TruShotProvisioning &network, bool syncing) {
  char value[12];
  const int counts[3] = {snapshot.inbox, snapshot.jobsOutstanding, snapshot.tasksOutstanding};
  for (int i = 0; i < 3; ++i) {
    if (snapshot.valid) snprintf(value, sizeof(value), "%d", counts[i]);
    else snprintf(value, sizeof(value), "—");
    lv_label_set_text(dashboardCounts_[i], value);
  }

  if (snapshot.agendaCount > 0) {
    lv_label_set_text(dashboardNextTitle_, snapshot.agenda[0].title.c_str());
    const String meta = formatOccurrence(snapshot.agenda[0].occursAt) +
      (snapshot.agenda[0].context.isEmpty() ? "" : "  ·  " + snapshot.agenda[0].context);
    lv_label_set_text(dashboardNextMeta_, meta.c_str());
  } else {
    lv_label_set_text(dashboardNextTitle_, snapshot.valid ? "Your calendar is clear" : "Waiting for CRM…");
    lv_label_set_text(dashboardNextMeta_, snapshot.valid ? "Nothing upcoming in the next 14 days" : "Connect to sync your workspace");
  }

  if (syncing) lv_label_set_text(dashboardSync_, "SYNCING WITH CRM…");
  else if (!network.connected()) lv_label_set_text(dashboardSync_, "OFFLINE  ·  SHOWING LAST UPDATE");
  else lv_label_set_text(dashboardSync_, "SWIPE LEFT FOR AGENDA");
}

void TruShotUI::updateAgenda(const TruShotSnapshot &snapshot) {
  for (int i = 0; i < 3; ++i) {
    if (i < static_cast<int>(snapshot.agendaCount)) {
      const TruShotAgendaItem &item = snapshot.agenda[i];
      lv_label_set_text(agendaRows_[i], item.title.c_str());
      String meta = formatOccurrence(item.occursAt);
      if (!item.context.isEmpty()) meta += "  ·  " + item.context;
      lv_label_set_text(agendaMeta_[i], meta.c_str());
    } else {
      lv_label_set_text(agendaRows_[i], i == 0 && !snapshot.valid ? "Waiting for CRM…" : "Open space");
      lv_label_set_text(agendaMeta_[i], i == 0 && !snapshot.valid ? "Connect to load your agenda" : "Nothing scheduled");
    }
  }
}

void TruShotUI::updateControls(const TruShotProvisioning &network, bool syncing) {
  if (network.connected()) {
    const String wifi = network.connectedSsid();
    lv_label_set_text(controlWifi_, wifi.c_str());
    const String status = signalText(network.signalStrength()) + (syncing ? "  ·  Syncing" : "  ·  CRM ready");
    lv_label_set_text(controlSync_, status.c_str());
  } else {
    lv_label_set_text(controlWifi_, "Wi-Fi offline");
    lv_label_set_text(controlSync_, "Reset Wi-Fi to reconnect");
  }
}

String TruShotUI::formatOccurrence(const String &iso) {
  if (iso.length() < 16) return "UPCOMING";
  struct tm utc = {};
  if (sscanf(iso.c_str(), "%d-%d-%dT%d:%d", &utc.tm_year, &utc.tm_mon, &utc.tm_mday, &utc.tm_hour, &utc.tm_min) != 5) return "UPCOMING";
  utc.tm_year -= 1900;
  utc.tm_mon -= 1;
  time_t timestamp = utcEpoch(utc.tm_year + 1900, utc.tm_mon + 1, utc.tm_mday, utc.tm_hour, utc.tm_min);
  struct tm local = {};
  localtime_r(&timestamp, &local);
  time_t current = time(nullptr);
  struct tm today = {};
  localtime_r(&current, &today);
  const char *weekdays[] = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
  char buffer[32];
  const bool sameDay = local.tm_year == today.tm_year && local.tm_yday == today.tm_yday;
  const int displayHour = local.tm_hour % 12 == 0 ? 12 : local.tm_hour % 12;
  snprintf(buffer, sizeof(buffer), "%s · %d:%02d %s", sameDay ? "TODAY" : weekdays[local.tm_wday], displayHour, local.tm_min, local.tm_hour >= 12 ? "PM" : "AM");
  return String(buffer);
}
