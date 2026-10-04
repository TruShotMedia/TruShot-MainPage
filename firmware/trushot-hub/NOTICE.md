# Third-party board support

The files under `src/board/` are adapted from Waveshare's official
`ESP32-S3-Touch-LCD-1.46` Arduino 3.1.1 example at commit
`fda89ff2ff32eb1bce561901225c6a36fa684237`:

https://github.com/waveshareteam/ESP32-S3-Touch-LCD-1.46

Copyright remains with the respective authors. SPDX and copyright notices in
the imported source files have been retained. Local changes remove the demo UI,
reduce unnecessary full-screen refreshes, and supply the TruShot-specific LVGL
configuration.
