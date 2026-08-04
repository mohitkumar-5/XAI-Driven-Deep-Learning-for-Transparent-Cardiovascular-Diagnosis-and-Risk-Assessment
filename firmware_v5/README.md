# ESP32 Hardware Firmware (Arduino IDE)

This directory contains the production C++ firmware for the ESP32 wearable sensor array.

## Features
- **AD8232 ECG Acquisition:** 500 Hz high-frequency sampling buffer.
- **MAX30102 SpO2 & Heart Rate:** I2C PPG pulse oximetry.
- **MLX90614 Temperature Sensor:** Non-contact IR body & ambient temperature.
- **GSR Galvanic Skin Response:** Galvanic skin conductance for stress level monitoring.
- **Web Server Endpoints:**
  - `GET /data`: Fast JSON telemetry feed (`bpm`, `spo2`, `objTemp`, `gsr`, `ax`, `ay`, `az`).
  - `GET /ecg`: High-speed 500-sample ECG waveform buffer.

## Flashing Instructions
1. Open `firmware_v5.ino` in **Arduino IDE**.
2. Select Board: **ESP32 Dev Module**.
3. Install Libraries: `Adafruit_MLX90614`, `MAX30105`, `ArduinoJson`.
4. Update Wi-Fi SSID and Password in the code.
5. Upload to ESP32 board.
