#include "CrmClient.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

#include "DeviceConfig.h"
#include "TrustedRoot.h"

void TruShotCrmClient::begin() {
  mutex_ = xSemaphoreCreateMutex();
  forceRefresh_ = true;
}

void TruShotCrmClient::loop(bool connected) {
  if (!connected || syncing_) return;
  const unsigned long now = millis();
  if (!forceRefresh_ && now - lastAttemptAt_ < TRUSHOT_POLL_INTERVAL_MS) return;
  lastAttemptAt_ = now;
  forceRefresh_ = false;
  syncing_ = true;
  if (xTaskCreatePinnedToCore(fetchTask, "crm-sync", 12288, this, 1, nullptr, 0) != pdPASS) {
    syncing_ = false;
    if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(50)) == pdTRUE) {
      lastError_ = "Could not start CRM sync";
      xSemaphoreGive(mutex_);
    }
  }
}

void TruShotCrmClient::refreshNow() {
  forceRefresh_ = true;
}

void TruShotCrmClient::copySnapshot(TruShotSnapshot &destination) const {
  if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(30)) == pdTRUE) {
    destination = snapshot_;
    xSemaphoreGive(mutex_);
  }
}

bool TruShotCrmClient::syncing() const {
  return syncing_;
}

String TruShotCrmClient::lastError() const {
  String result;
  if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(30)) == pdTRUE) {
    result = lastError_;
    xSemaphoreGive(mutex_);
  }
  return result;
}

void TruShotCrmClient::fetchTask(void *context) {
  TruShotCrmClient *client = static_cast<TruShotCrmClient *>(context);
  client->fetchSnapshot();
  client->syncing_ = false;
  vTaskDelete(nullptr);
}

bool TruShotCrmClient::fetchSnapshot() {
  if (strlen(TRUSHOT_DEVICE_TOKEN) < 32) {
    if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(50)) == pdTRUE) {
      lastError_ = "Device token is not configured";
      xSemaphoreGive(mutex_);
    }
    return false;
  }
  WiFiClientSecure secureClient;
  secureClient.setCACert(TRUSHOT_ISRG_ROOT_X1);
  secureClient.setHandshakeTimeout(15);

  HTTPClient http;
  http.setConnectTimeout(10000);
  http.setTimeout(12000);
  if (!http.begin(secureClient, TRUSHOT_DEVICE_API_URL)) {
    if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(50)) == pdTRUE) {
      lastError_ = "Could not start secure request";
      xSemaphoreGive(mutex_);
    }
    return false;
  }

  http.addHeader("Authorization", String("Bearer ") + TRUSHOT_DEVICE_TOKEN);
  http.addHeader("Accept", "application/json");
  http.addHeader("User-Agent", "TruShot-Hub/1.0");

  const int status = http.GET();
  if (status != HTTP_CODE_OK) {
    if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(50)) == pdTRUE) {
      lastError_ = String("CRM returned ") + status;
      xSemaphoreGive(mutex_);
    }
    http.end();
    return false;
  }

  JsonDocument json;
  const DeserializationError jsonError = deserializeJson(json, http.getStream());
  http.end();
  if (jsonError) {
    if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(50)) == pdTRUE) {
      lastError_ = String("Invalid CRM response: ") + jsonError.c_str();
      xSemaphoreGive(mutex_);
    }
    return false;
  }

  TruShotSnapshot next;
  next.inbox = json["counts"]["inbox"] | 0;
  next.jobsOutstanding = json["counts"]["jobsOutstanding"] | 0;
  next.tasksOutstanding = json["counts"]["tasksOutstanding"] | 0;
  next.updatedAt = String((const char *)(json["updatedAt"] | ""));

  JsonArray agenda = json["agenda"].as<JsonArray>();
  for (JsonObject item : agenda) {
    if (next.agendaCount >= 8) break;
    TruShotAgendaItem &target = next.agenda[next.agendaCount++];
    target.id = String((const char *)(item["id"] | ""));
    target.kind = String((const char *)(item["kind"] | ""));
    target.title = String((const char *)(item["title"] | "Untitled"));
    target.context = String((const char *)(item["context"] | ""));
    target.occursAt = String((const char *)(item["occursAt"] | ""));
    target.allDay = item["allDay"] | false;
  }

  JsonArray notifications = json["notifications"].as<JsonArray>();
  for (JsonObject item : notifications) {
    if (next.notificationCount >= 4) break;
    TruShotNotification &target = next.notifications[next.notificationCount++];
    target.id = String((const char *)(item["id"] | ""));
    target.title = String((const char *)(item["title"] | "Reminder"));
    target.body = String((const char *)(item["body"] | ""));
    target.occursAt = String((const char *)(item["occursAt"] | ""));
  }

  next.valid = true;
  if (mutex_ && xSemaphoreTake(mutex_, pdMS_TO_TICKS(100)) == pdTRUE) {
    snapshot_ = next;
    lastError_ = "";
    xSemaphoreGive(mutex_);
  }
  return true;
}
