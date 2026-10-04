#include <Arduino.h>
#include <ArduinoJson.h>
#include <lvgl.h>
#include <sys/time.h>
#include <time.h>

#include "src/CrmClient.h"
#include "src/DeviceConfig.h"
#include "src/Provisioning.h"
#include "src/TruShotUI.h"
#include "src/board/Display_SPD2010.h"
#include "src/board/I2C_Driver.h"
#include "src/board/LVGL_Driver.h"
#include "src/board/RTC_PCF85063.h"
#include "src/board/TCA9554PWR.h"

namespace {
TruShotProvisioning network;
TruShotCrmClient crm;
TruShotUI ui;
TruShotSnapshot snapshot;
TruShotNetworkState previousNetworkState = TruShotNetworkState::Starting;
bool ntpStarted = false;
bool rtcUpdatedFromNetwork = false;
unsigned long ntpStartedAt = 0;
unsigned long lastRtcUpdateAt = 0;

void restoreClockFromRtc() {
  datetime_t rtc = {};
  PCF85063_Read_Time(&rtc);
  if (rtc.year < 2024 || rtc.year > 2099 || rtc.month < 1 || rtc.month > 12 || rtc.day < 1 || rtc.day > 31) return;

  struct tm local = {};
  local.tm_year = rtc.year - 1900;
  local.tm_mon = rtc.month - 1;
  local.tm_mday = rtc.day;
  local.tm_hour = rtc.hour;
  local.tm_min = rtc.minute;
  local.tm_sec = rtc.second;
  local.tm_isdst = 0;
  const time_t epoch = mktime(&local);
  if (epoch <= 0) return;
  timeval value = {.tv_sec = epoch, .tv_usec = 0};
  settimeofday(&value, nullptr);
}

void updateRtcFromSystem() {
  time_t now = time(nullptr);
  if (now < 1704067200) return;
  struct tm local = {};
  localtime_r(&now, &local);
  datetime_t rtc = {};
  rtc.year = local.tm_year + 1900;
  rtc.month = local.tm_mon + 1;
  rtc.day = local.tm_mday;
  rtc.dotw = local.tm_wday;
  rtc.hour = local.tm_hour;
  rtc.minute = local.tm_min;
  rtc.second = local.tm_sec;
  PCF85063_Set_All(rtc);
  rtcUpdatedFromNetwork = true;
  lastRtcUpdateAt = millis();
}

void serviceClock() {
  if (!network.connected()) {
    ntpStarted = false;
    return;
  }
  if (!ntpStarted) {
    configTzTime(TRUSHOT_TIMEZONE, "time.cloudflare.com", "time.google.com", "pool.ntp.org");
    ntpStarted = true;
    ntpStartedAt = millis();
  }

  if ((!rtcUpdatedFromNetwork && millis() - ntpStartedAt > 1500) || millis() - lastRtcUpdateAt > 21600000UL) {
    time_t now = time(nullptr);
    if (now >= 1704067200) updateRtcFromSystem();
  }
}

void serviceNetworkView() {
  const TruShotNetworkState current = network.state();
  if (current == previousNetworkState) return;
  previousNetworkState = current;
  if (current == TruShotNetworkState::Provisioning) {
    ui.showProvisioning(network.qrPayload(), network.portalSsid(), network.portalPassword());
  } else if (ui.view() == TruShotView::Provisioning) {
    ui.showWatch();
  }
}
}

void setup() {
  Serial.begin(115200);
  delay(120);
  Serial.println("\nTruShot Hub starting");

  setenv("TZ", TRUSHOT_TIMEZONE, 1);
  tzset();

  I2C_Init();
  TCA9554PWR_Init(0x00);
  Backlight_Init();
  Set_Backlight(72);
  PCF85063_Init();
  restoreClockFromRtc();
  LCD_Init();
  Lvgl_Init();
  ui.begin();
  ui.setBrightness(72);

  network.begin();
  crm.begin();
  previousNetworkState = TruShotNetworkState::Starting;
  serviceNetworkView();
}

void loop() {
  Lvgl_Loop();
  network.loop();
  serviceNetworkView();
  serviceClock();

  if (ui.takeResetWifiRequest()) network.resetWifi();
  if (ui.takeRefreshRequest()) crm.refreshNow();
  crm.loop(network.connected());
  crm.copySnapshot(snapshot);

  if (snapshot.notificationCount > 0) ui.showNotification(snapshot.notifications[0]);
  ui.loop(snapshot, network, crm.syncing());
  delay(5);
}
