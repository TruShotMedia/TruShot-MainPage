#pragma once

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>

struct TruShotAgendaItem {
  String id;
  String kind;
  String title;
  String context;
  String occursAt;
  bool allDay = false;
};

struct TruShotNotification {
  String id;
  String title;
  String body;
  String occursAt;
};

struct TruShotSnapshot {
  int inbox = 0;
  int jobsOutstanding = 0;
  int tasksOutstanding = 0;
  TruShotAgendaItem agenda[8];
  size_t agendaCount = 0;
  TruShotNotification notifications[4];
  size_t notificationCount = 0;
  String updatedAt;
  bool valid = false;
};

class TruShotCrmClient {
 public:
  void begin();
  void loop(bool connected);
  void refreshNow();
  void copySnapshot(TruShotSnapshot &destination) const;
  bool syncing() const;
  String lastError() const;

 private:
  static void fetchTask(void *context);
  bool fetchSnapshot();
  TruShotSnapshot snapshot_;
  mutable SemaphoreHandle_t mutex_ = nullptr;
  unsigned long lastAttemptAt_ = 0;
  bool forceRefresh_ = true;
  volatile bool syncing_ = false;
  String lastError_;
};
