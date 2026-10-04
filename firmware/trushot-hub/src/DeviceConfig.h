#pragma once

#define TRUSHOT_DEVICE_API_URL "https://www.trushotmedia.com/api/device/hub"
#define TRUSHOT_TIMEZONE "AEST-10"
#define TRUSHOT_POLL_INTERVAL_MS 60000UL
#define TRUSHOT_IDLE_TIMEOUT_MS 25000UL
#define TRUSHOT_NOTIFICATION_TIMEOUT_MS 12000UL

#if __has_include("DeviceConfig.local.h")
#include "DeviceConfig.local.h"
#endif

#ifndef TRUSHOT_DEVICE_TOKEN
#define TRUSHOT_DEVICE_TOKEN ""
#endif
