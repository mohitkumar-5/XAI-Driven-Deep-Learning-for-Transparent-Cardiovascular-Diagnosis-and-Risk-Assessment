# Hardware Setup & Circuit Schematics

This directory contains hardware pinout configurations, circuit schematics, and sensor wiring diagrams for the DeepCardio-XAI wearable device.

---

## ESP32 WROOM-32 Sensor Wiring Map

| Sensor Module | ESP32 Pin | Signal Type | Sensor Function |
| :--- | :--- | :--- | :--- |
| **AD8232 ECG Output** | GPIO 34 | Analog In (ADC1_CH6) | Single-Lead Electrocardiogram Waveform |
| **AD8232 LO+ (Leads-Off)** | GPIO 35 | Digital In | Electrode Disconnection Detection |
| **AD8232 LO- (Leads-Off)** | GPIO 32 | Digital In | Electrode Disconnection Detection |
| **MAX30102 PPG Sensor** | SDA (GPIO 21), SCL (GPIO 22) | I2C | SpO2 Pulse Oximetry & Heart Rate |
| **MLX90614 Infrared Temp** | SDA (GPIO 21), SCL (GPIO 22) | I2C | Non-Contact Body & Ambient Temperature |
| **GSR Stress Sensor** | GPIO 33 | Analog In | Galvanic Skin Response & Conductance |

---

*Place circuit diagrams (`schematic.png`, `circuit.png`) and hardware photos in this folder.*
