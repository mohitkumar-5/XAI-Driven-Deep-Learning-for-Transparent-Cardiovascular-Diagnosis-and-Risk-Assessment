# 🫀 DeepCardio-XAI — IoT-Enabled XAI-Driven Deep Learning for Transparent Cardiovascular Diagnosis and Risk Assessment

<p align="center">
  <img src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/PyTorch-EE4C2C?style=for-the-badge&logo=pytorch&logoColor=white" alt="PyTorch">
  <img src="https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
  <img src="https://img.shields.io/badge/AWS_EC2-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white" alt="AWS EC2">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/ESP32-000000?style=for-the-badge&logo=espressif&logoColor=white" alt="ESP32">
  <img src="https://img.shields.io/badge/SHAP_XAI-4B0082?style=for-the-badge&logo=python&logoColor=white" alt="SHAP">
</p>

<p align="center">
  <b>DeepCardio-XAI</b> is an end-to-end intelligent cardiac tele-monitoring system combining IoT wearable telemetry (LoRa + ESP32), high-accuracy deep learning (1D CNN + BiLSTM), Explainable AI (SHAP waveform attribution), and an interactive clinical web platform deployed on AWS.
</p>

<p align="center">
  🌐 <b>Live Web Application:</b> <a href="http://13.235.48.212:8000/">http://13.235.48.212:8000/</a><br>
  🎥 <b>Video Demonstration:</b> <a href="https://drive.google.com/file/d/1wGAgnRML3pNX1igHM0U-9ZwjHkGgzp-m/view?usp=sharing">Watch Video Walkthrough</a>
</p>

---

## 💡 Why I Built This Project

Cardiovascular diseases (CVDs) remain the leading cause of global mortality. Traditional clinical cardiac diagnosis relies heavily on static, in-clinic 12-lead ECG machines, which cannot capture transient arrhythmias or silent ischemic events occurring during daily activities. Furthermore, existing AI diagnostic models act as opaque "black boxes," leaving cardiologists skeptical of automated risk predictions.

I built **DeepCardio-XAI** to solve these critical challenges by bridging **hardware telemetry, edge AI, and transparent clinical explainability**:

1. **Continuous Remote Telemetry:** Patients wear a lightweight ESP32-powered sensor package that continuously captures single-lead ECG, blood oxygen (SpO2), skin temperature, stress levels (GSR), and movement, transmitting signals long-range via LoRa telemetry.
2. **Real-Time Deep Learning:** Raw ECG waveforms are filtered, segmented, and evaluated by a combined 1D CNN + BiLSTM neural network trained on PhysioNet's PTB-XL benchmark dataset.
3. **Transparent Explainable AI (XAI):** Using SHAP (SHapley Additive exPlanations), the system highlights exact millisecond regions of the ECG waveform that contributed to the diagnostic prediction (e.g., ST-segment elevation or T-wave inversion).
4. **Context-Aware AI Companion:** An integrated LLM assistant translates complex cardiac metrics into plain-language summaries and lifestyle guidance for patients and clinicians alike.

---

## ✨ Features

* 🫀 **Multi-Vital Telemetry Acquisition:** Captures real-time ECG (AD8232), Pulse Oximetry & HR (MAX30102), Body Temp (MLX90614), Galvanic Skin Response (Grove GSR), and Motion (MPU6050).
* 📡 **Long-Range LoRa Wireless Telemetry:** Uses SX1278 transceiver pairs for robust wireless data transmission from patient wearable to local edge gateway.
* 🧠 **1D CNN + BiLSTM Neural Architecture:** Multi-class cardiac rhythm classification into 5 primary PTB-XL diagnostic categories (`NORM`, `MI`, `CD`, `HYP`, `STTC`).
* 🔍 **SHAP Waveform Attribution:** Generates lead-specific feature attribution maps providing full visual transparency for diagnostic predictions.
* 🤖 **Interactive AI Companion:** Context-aware LLM companion capable of answering patient queries, explaining medical terminology, and suggesting actionable risk interventions.
* ☁️ **AWS Cloud & Dockerized Deployment:** Containerized with Docker and deployed live on AWS EC2 with FastAPI real-time streaming endpoints.
* 📊 **Clinical Grade Web Dashboard:** Real-time waveform visualizer, LoRa telemetry health metrics, risk scoring, and interactive patient history logs.

---

## 🎨 System Architecture & Workflow

Here is the architectural overview of how DeepCardio-XAI ingests live wearable signals, processes deep inference, generates SHAP explainability, and serves clinical web dashboards:

![System Architecture](assets/architecture.jpg)

### 1. Offline Model Training Pipeline (PTB-XL Lead II)
Before real-time deployment, the deep learning core is trained on PhysioNet's PTB-XL 12-lead ECG dataset:
* **Dataset Standardization:** 21,837 clinical 12-lead ECG recordings are processed, isolating **Lead II** to mirror single-lead wearable acquisition.
* **Preprocessing & Segmentation:** ECG signals undergo bandpass noise filtering, baseline wander removal, normalization, and fixed-length window segmentation.
* **1D CNN + BiLSTM Model:** Spatial morphological features are extracted via 1D Convolutional layers, followed by Bidirectional LSTM units to capture temporal dynamics.
* **5 Target Classes:**
  * **NORM:** Normal Sinus Rhythm
  * **MI:** Myocardial Infarction
  * **CD:** Conduction Disturbance
  * **HYP:** Hypertrophy
  * **STTC:** ST/T-Wave Changes

### 2. Real-Time Telemetry & Inference Execution
When the wearable device is active:
1. **Sensor Data Collection:** ESP32 micro-controller reads analog ECG signals alongside ambient vitals (SpO2, Temp, GSR).
2. **LoRa Transmission:** The SX1278 transmitter broadcasts encrypted telemetry packets to the local gateway receiver.
3. **FastAPI Cloud Backend:** The server receives the telemetry stream at `http://13.235.48.212:8000/`.
4. **Deep Model & XAI Execution:** The backend runs real-time 1D CNN + BiLSTM classification and computes SHAP attribution values for the active signal frame.
5. **AI Companion Context Assembly:** Telemetry metrics, risk score, and SHAP outputs are fed into the LLM context frame to answer natural language patient/doctor questions.
6. **Live Dashboard Streaming:** Web UI renders live ECG waveforms, vitals breakdown, telemetry RSSI/SNR packet rates, and risk assessment indicators.

---

## 🔌 Hardware Architecture & Circuit Schematic

The DeepCardio-XAI hardware package consists of a custom wearable sensor board powered by an ESP32 micro-controller and wireless LoRa modules.

### 📷 Hardware Setup Photo
![Hardware Setup](hardware/hardware_photo.png)

### 📐 Circuit Schematic Diagram
![Circuit Schematic Diagram](hardware/schematic.png)

### 📌 ESP32 Pin Mapping & Component Specification

| Component / Sensor Module | ESP32 Pin Connections | Interface Type | Functional Role |
| :--- | :--- | :--- | :--- |
| **AD8232 Single-Lead ECG** | `GPIO 34` (Output), `GPIO 35` (LO+), `GPIO 32` (LO-) | Analog ADC / Digital | Single-Lead Electrocardiogram & Electrode Disconnection |
| **MAX30102 Pulse Oximeter** | `GPIO 21` (SDA), `GPIO 22` (SCL) | I2C | SpO2 Blood Oxygen Saturation & Optical Pulse Rate |
| **MLX90614 Infrared Temp** | `GPIO 21` (SDA), `GPIO 22` (SCL) | I2C | Non-Contact Core Body & Ambient Temperature |
| **Grove GSR Stress Sensor** | `GPIO 33` | Analog ADC | Electrodermal Activity & Galvanic Skin Conductance |
| **SX1278 LoRa Transceiver** | `GPIO 5` (NSS), `GPIO 18` (SCK), `GPIO 19` (MISO), `GPIO 23` (MOSI) | SPI | 433MHz Long-Range Wireless Packet Telemetry |
| **0.96" OLED Display** | `GPIO 21` (SDA), `GPIO 22` (SCL) | I2C | Local Real-Time Device Vitals & Status Display |
| **TP4056 + 18650 Battery** | `VIN` / `GND` | Power Management | 3.7V Li-ion Battery Power & USB Micro Charging |

---

## 💻 Live Web Dashboard & Video Demo

### 🖥️ Clinical Dashboard Screenshot
The web dashboard provides real-time monitoring of incoming sensor telemetry, live ECG waveform visualization, LoRa telemetry packet health, and automated AI risk classification:

![Live Web Dashboard](assets/dashboard.png)

* 🌐 **Live Website Link:** [http://13.235.48.212:8000/](http://13.235.48.212:8000/)
* 🎥 **Video Demo Walkthrough:** [Watch Project Demo Video on Google Drive](https://drive.google.com/file/d/1wGAgnRML3pNX1igHM0U-9ZwjHkGgzp-m/view?usp=sharing)

---

## 📂 Repository Structure

```text
Cardivascular_project/
├── AI/                          # Deep Learning & XAI Core Codebase
│   ├── data/                    # PTB-XL & MIT-BIH dataset extractors
│   ├── feature_extraction/      # Time, frequency, and morphological feature builders
│   ├── inference/               # Real-time model predictor & XAI SHAP generator
│   ├── models/                  # 1D CNN, BiLSTM, & hybrid classifier weights
│   ├── preprocessing/          # Signal filtering, R-peak detection, & segmentation
│   ├── training/                # Training pipelines & evaluation scripts
│   └── utils/                   # Config, logging, & visualization utilities
├── assets/                      # System architecture, dashboard, & image assets
│   ├── architecture.jpg         # Full system pipeline architecture diagram
│   ├── dashboard.png            # Live web dashboard interface screenshot
│   ├── hardware_photo.png       # Physical hardware circuit build photo
│   └── schematic.png            # High-resolution circuit schematic diagram
├── firmware_v5/                 # ESP32 C++ Firmware
│   └── firmware_v5.ino          # Arduino/ESP32 sensor acquisition & LoRa code
├── frontend/                    # Single Page React Application
│   ├── src/                     # React UI components, hooks, & state management
│   ├── package.json             # Frontend package dependencies
│   └── vite.config.js           # Vite build configuration
├── hardware/                    # Hardware Diagrams & Documentation
│   ├── README.md                # Pinout map & hardware documentation
│   ├── hardware_photo.png       # Physical prototype photo
│   ├── schematic.pdf            # Vector schematic document
│   └── schematic.png            # Rendered schematic image
├── main.py                      # FastAPI Backend server entry point
├── Dockerfile                   # Multi-stage production Docker build file
├── docker-compose.yml           # Docker deployment compose manifest
├── requirements.txt             # Python backend dependencies
└── README.md                    # Main repository documentation
```

---

## 🧠 Deep Learning Architecture & XAI

* **Primary Classifier:** Hybrid 1D CNN + BiLSTM Network trained on PTB-XL Lead II ECG data.
* **Explainability Framework:** SHAP (SHapley Additive exPlanations) for local feature attribution and waveform region highlighting.
* **AI Companion LLM:** Context-infused LLM chain providing instant medical query resolution and patient guidance.

---

## ⚙️ Local Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/mohitkumar-5/XAI-Driven-Deep-Learning-for-Transparent-Cardiovascular-Diagnosis-and-Risk-Assessment.git
cd XAI-Driven-Deep-Learning-for-Transparent-Cardiovascular-Diagnosis-and-Risk-Assessment
```

### 2. Create and Activate Virtual Environment
```bash
python -m venv venv

# On Windows:
venv\Scripts\activate

# On macOS/Linux:
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the Backend & Frontend Application locally
```bash
python main.py
```
Open your browser and navigate to `http://localhost:8000`.

---

## 🐳 Docker Deployment

To build and run the application locally using Docker:

```bash
# Build the unified container
docker-compose build

# Start the application
docker-compose up -d
```

---

## 📜 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
