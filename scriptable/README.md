# TruShot CRM Lock Screen widget

This Scriptable widget displays live counts for:

- client requests requiring attention;
- jobs with one or more open tasks; and
- incomplete tasks.

## Install on iPhone

1. Open Scriptable and create a script named `TruShot CRM Lock Screen`.
2. Paste in the contents of `TruShot CRM Lock Screen.js`.
3. Run it once inside Scriptable and paste the private setup code when prompted.
4. Long-press the iPhone Lock Screen, choose **Customize**, tap the widget area above the clock, and add a **Scriptable** rectangular widget.
5. Tap the new widget and select `TruShot CRM Lock Screen` as its script.

The setup code is saved in the iPhone Keychain rather than inside the script. The script keeps a local copy of the last successful counts, refreshes no sooner than every 15 minutes, and opens the CRM overview when tapped.
