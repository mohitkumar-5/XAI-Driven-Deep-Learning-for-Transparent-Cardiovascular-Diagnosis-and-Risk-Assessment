# Hardware & Circuit Documentation

This directory contains hardware schematics, pinout diagrams, and circuit photos for the DeepCardio-XAI wearable device.

## Pinout Mapping (ESP32 WROOM-32)

| Sensor Module | ESP32 Pin | Signal Type |
| :--- | :--- | :--- |
| AD8232 ECG Output | GPIO 34 | Analog In (ADC1_CH6) |
| AD8232 LO+ (Leads Off) | GPIO 35 | Digital In |
| AD8232 LO- (Leads Off) | GPIO 32 | Digital In |
| MAX30102 SpO2 / HR | SDA (GPIO 21), SCL (GPIO 22) | I2C |
| MLX90614 Body Temp | SDA (GPIO 21), SCL (GPIO 22) | I2C |
| GSR Stress Sensor | GPIO 33 | Analog In |

---

*Add circuit diagrams and hardware setup images in this folder.*
