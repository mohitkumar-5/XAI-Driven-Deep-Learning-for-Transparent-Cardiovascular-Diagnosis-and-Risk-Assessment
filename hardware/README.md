# 🔌 Hardware Setup & Circuit Schematics

This directory contains the hardware pinout configurations, physical prototype photos, circuit schematics, and sensor wiring diagrams for the **DeepCardio-XAI** wearable device.

---

## 📷 Physical Hardware Build Prototype

![Physical Hardware Setup](hardware_photo.png)

---

## 📐 Circuit Schematic Diagram

![ESP32 Hardware Schematic Diagram](schematic.png)

> 📁 *Vector PDF version available at [schematic.pdf](schematic.pdf).*

---

## 📌 ESP32 WROOM-32 Sensor Wiring Map

| Sensor Module | ESP32 Pin | Signal Type | Sensor Function |
| :--- | :--- | :--- | :--- |
| **AD8232 ECG Output** | GPIO 34 | Analog In (ADC1_CH6) | Single-Lead Electrocardiogram Waveform |
| **AD8232 LO+ (Leads-Off)** | GPIO 35 | Digital In | Electrode Disconnection Detection |
| **AD8232 LO- (Leads-Off)** | GPIO 32 | Digital In | Electrode Disconnection Detection |
| **MAX30102 PPG Sensor** | SDA (GPIO 21), SCL (GPIO 22) | I2C | SpO2 Pulse Oximetry & Heart Rate |
| **MLX90614 Infrared Temp** | SDA (GPIO 21), SCL (GPIO 22) | I2C | Non-Contact Body & Ambient Temperature |
| **Grove GSR Stress Sensor** | GPIO 33 | Analog In | Galvanic Skin Response & Conductance |
| **SX1278 LoRa Module** | GPIO 5 (NSS), 18 (SCK), 19 (MISO), 23 (MOSI) | SPI | 433MHz Long-Range Telemetry |
| **0.96" OLED Display** | SDA (GPIO 21), SCL (GPIO 22) | I2C | Local Vitals & Status Display |
| **TP4056 Charger** | VIN / GND | Power | 18650 3.7V Li-ion Battery Charging |

---

## 🛠️ Firmware

The micro-controller source code for signal reading, baseline filtering, and LoRa packet transmission is located in the [`firmware_v5/`](../firmware_v5/) directory.
