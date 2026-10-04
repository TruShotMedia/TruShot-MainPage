# TruShot Hub firmware

Native firmware for the Waveshare ESP32-S3-Touch-LCD-1.46 (412 × 412). It is a
small, purpose-built companion to the TruShot CRM rather than a browser kiosk.

## Experience

- A dark-green heritage chronometer face is the idle screen. It is original
  TruShot artwork and deliberately does not reproduce another watchmaker's
  trademark or dial.
- Tap the face for live inbox, outstanding-job and outstanding-task totals.
- Swipe left for the next three calendar items. Swipe down for brightness,
  refresh and Wi-Fi controls.
- Calendar reminders appear as full-screen, auto-dismissing notification cards.
- On first boot (or after **Reset Wi-Fi**) the display presents a QR code. Scan
  it, join the temporary TruShot Hub network and choose the local 2.4 GHz Wi-Fi.
- The last successfully loaded dashboard remains usable during short outages.

## Security and network use

The Hub polls one read-only API endpoint at most once per minute. HTTPS is
validated with the ISRG Root X1 certificate; certificate checks are never
disabled. The API token is separate from Supabase credentials, kept server-side
in Vercel and compiled into the one device. Wi-Fi credentials remain in the
ESP32's local Preferences/NVS storage and are not sent to TruShot.

If the device is lost, rotate `TRUSHOT_DEVICE_TOKEN` in Vercel and flash a new
build. The token can only read the purpose-built summary response.

## Reproducible build

Required versions:

- Arduino CLI 1.5.1
- Espressif `esp32:esp32` 3.1.1
- ArduinoJson 7.4.3
- LVGL 8.3.10

Install the dependencies, copy `src/DeviceConfig.example.h` to the ignored
`src/DeviceConfig.local.h`, and place the device token in it. Then run:

```sh
ARDUINO_CLI_BIN=/path/to/arduino-cli bash tools/build.sh
```

The exact board options (16 MB DIO flash, 8 MB OPI PSRAM, hardware USB CDC) are
encoded in the build script. Before the first replacement flash, preserve the
existing 16 MB image with `esptool read_flash` while the board is in download
mode.

## Board support provenance

The low-level SPD2010 display/touch, TCA9554 and PCF85063 drivers are adapted
from Waveshare's official Arduino 3.1.1 example. See `NOTICE.md` for the source
commit. The TruShot UI, provisioning, secure CRM client and interaction model
are original project code.
