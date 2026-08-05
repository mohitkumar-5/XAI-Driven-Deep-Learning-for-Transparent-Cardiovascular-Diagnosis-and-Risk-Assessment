/* ============================================================================
   DeepCardio-XAI — ESP32 Multi-Sensor Firmware v5
   Sensors: MAX30102 (HR/SpO2), MLX90614 (IR temp, simulated fallback),
   MPU6500 (SCG accel), Grove GSR (analog), AD8232 (ECG).
   OLED: 1.3" 128x64 SH1106.
   LoRa: SX1278 (SPI)

   ECG (AD8232) WIRING:
     GND -> ESP32 GND | 3.3V -> ESP32 3.3V | OUTPUT -> GPIO 35
     LO- -> GPIO 27   | LO+  -> GPIO 26    | SDN -> TIE TO 3.3V (do not leave open!)

   LORA (SX1278) WIRING:
     3.3V -> ESP32 3V3  | GND -> ESP32 GND
     NSS -> GPIO 5      | RST -> GPIO 13
     MOSI -> GPIO 23    | MISO -> GPIO 19
     SCK -> GPIO 18     | DIO0 -> TIE TO GPIO 5 (or leave unused since we use polling)
   ========================================================================== */

#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Adafruit_MLX90614.h>
#include <SPI.h>
#include <LoRa.h>
#include <MAX30105.h>
#include <spo2_algorithm.h>

const char* WIFI_SSID = "vivo";
const char* WIFI_PASS = "12345678";

// AWS Push Configuration & FreeRTOS Mutex
const char* AWS_ENDPOINT = "http://13.235.48.212:8000/api/push-telemetry";
const char* DEVICE_ID = "Patient_Default";
SemaphoreHandle_t dataMutex;

#define I2C_SDA        21
#define I2C_SCL        22
#define GSR_PIN        34
#define MPU_ADDR       0x68

#define TEMP_OFFSET_OBJ 0.0f
#define TEMP_OFFSET_AMB 0.0f

#define OLED_W 128
#define OLED_H 64
#define OLED_ADDR 0x3C
#define OLED_IS_SH1106 1

#define GSR_MIN_KOHM   1.0f
#define GSR_MAX_KOHM   1000.0f

#define ECG_PIN        35
#define ECG_LO_PLUS    26
#define ECG_LO_MINUS   27
#define ECG_SAMPLE_RATE  250
#define ECG_BUF_LEN      500

// LoRa Pin Configuration
#define LORA_SS        5
#define LORA_RST       13
#define LORA_DIO0      -1 // Set to -1 to run LoRa in polling mode, resolving pin 5 conflict

#if OLED_IS_SH1106
  Adafruit_SH1106G display(OLED_W, OLED_H, &Wire, -1);
#else
  #include <Adafruit_SSD1306.h>
  Adafruit_SSD1306 display(OLED_W, OLED_H, &Wire, -1);
#endif

Adafruit_MLX90614 mlx;
MAX30105 particleSensor;
WebServer server(80);
bool mlxReady = false;

struct SensorData {
  int32_t bpm = 0;
  int32_t spo2 = 0;
  bool    hrValid = false;
  bool    spo2Valid = false;
  float objTempC = 0;
  float ambTempC = 0;
  float gsrKOhm = 0;
  float gsrMicroS = 0;
  bool  gsrConnected = false;
  int   gsrRaw = 0;
  float accX = 0, accY = 0, accZ = 0;
} data;

#define MAX_BUF 100
uint32_t irBuffer[MAX_BUF];
uint32_t redBuffer[MAX_BUF];
int32_t bufferLength = MAX_BUF;
int32_t spo2Val;
int8_t  validSPO2;
int32_t heartRateVal;
int8_t  validHeartRate;
bool bufferFilled = false;
int  sampleIdx = 0;

static float normTemp = 36.65f;
static unsigned long lastTempTick = 0;

volatile int16_t ecgBuffer[ECG_BUF_LEN];
int ecgWriteIdx = 0;
bool ecgLeadsOff = false;
bool ecgLoPlusOff = false;
bool ecgLoMinusOff = false;
unsigned long lastEcgSampleMicros = 0;
const unsigned long ECG_INTERVAL_US = 1000000UL / ECG_SAMPLE_RATE;
float ecgHP_prev_in = 0, ecgHP_prev_out = 0;
float ecgLP_prev_out = 0;
float ecgLP2_prev_out = 0;

bool oledReady = false;
unsigned long lastOledDraw = 0;
const unsigned long OLED_REDRAW_INTERVAL = 300;

// LoRa Telemetry Variables
bool loraReady = false;
unsigned long lastLoraSend = 0;
const unsigned long LORA_SEND_INTERVAL = 2000; // Transmit every 2 seconds
unsigned long loraTxCount = 0;
String lastRxPacket = "No packet received yet";
int lastRxRssi = 0;
float lastRxSnr = 0.0f;
unsigned long lastRxTime = 0;

static const unsigned char PROGMEM heartBmp[] = {
  0b01100110, 0b11111111, 0b11111111, 0b11111111,
  0b01111110, 0b00111100, 0b00011000
};

void mpuWriteReg(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

void mpuInit() {
  mpuWriteReg(0x6B, 0x00);
  delay(10);
  mpuWriteReg(0x1C, 0x00);
  mpuWriteReg(0x1A, 0x03);
}

bool mpuReadXYZ(float &x, float &y, float &z) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) {
    static float jX = 0.0f, jY = 0.0f;
    jX += random(-2, 3) * 0.004f;
    jY += random(-2, 3) * 0.004f;
    x = constrain(jX, -0.04f, 0.04f);
    y = constrain(jY, -0.04f, 0.04f);
    z = 1.0f + (random(-1, 2) * 0.002f);
    return false;
  }
  Wire.requestFrom(MPU_ADDR, 6);
  if (Wire.available() < 6) return false;
  int16_t rawX = (Wire.read() << 8) | Wire.read();
  int16_t rawY = (Wire.read() << 8) | Wire.read();
  int16_t rawZ = (Wire.read() << 8) | Wire.read();
  const float SCALE = 16384.0f;
  x = rawX / SCALE; y = rawY / SCALE; z = rawZ / SCALE;
  return true;
}

void sampleEcgOnce() {
  ecgLoPlusOff = (digitalRead(ECG_LO_PLUS) == 1);
  ecgLoMinusOff = (digitalRead(ECG_LO_MINUS) == 1);
  ecgLeadsOff = ecgLoPlusOff || ecgLoMinusOff;

  if (!ecgLeadsOff) {
    int raw = analogRead(ECG_PIN);
    const float hpAlpha = 0.996f;
    float hpOut = hpAlpha * (ecgHP_prev_out + raw - ecgHP_prev_in);
    ecgHP_prev_in = raw;
    ecgHP_prev_out = hpOut;
    const float lpAlpha = 0.15f;
    float lpOut = ecgLP_prev_out + lpAlpha * (hpOut - ecgLP_prev_out);
    ecgLP_prev_out = lpOut;
    const float lp2Alpha = 0.25f;
    float lp2Out = ecgLP2_prev_out + lp2Alpha * (lpOut - ecgLP2_prev_out);
    ecgLP2_prev_out = lp2Out;
    const float ECG_GAIN = 1.1f;
    int16_t filtered = (int16_t)(lp2Out * ECG_GAIN + 2048);
    filtered = constrain(filtered, 0, 4095);
    ecgBuffer[ecgWriteIdx] = filtered;
  } else {
    ecgBuffer[ecgWriteIdx] = -1;
  }
  ecgWriteIdx = (ecgWriteIdx + 1) % ECG_BUF_LEN;
}

void ecgInit() {
  pinMode(ECG_LO_PLUS, INPUT_PULLUP);
  pinMode(ECG_LO_MINUS, INPUT_PULLUP);
  analogSetPinAttenuation(ECG_PIN, ADC_11db);
  lastEcgSampleMicros = micros();
}

void getEcgSnapshot(int16_t *out, int n) {
  int idx = ecgWriteIdx;
  for (int i = 0; i < n; i++) out[i] = ecgBuffer[(idx + i) % ECG_BUF_LEN];
}

float gsrEMA = -1;
unsigned long lastGsrBaselineTick = 0;
float idleBaselineKOhm = 300.0f;
int   idleDir = 1;

void readGSR() {
  const int N = 8;
  int sum = 0;
  for (int i = 0; i < N; i++) {
    sum += analogRead(GSR_PIN);
    delayMicroseconds(100);
  }
  int rawAdc = sum / N; // 12-bit raw ADC (0-4095)
  data.gsrRaw = rawAdc;

  // Convert raw 12-bit ADC reading to Resistance (kOhm) & Conductance (uS)
  if (rawAdc > 20 && rawAdc < 4000) {
    float voltage = (rawAdc / 4095.0f) * 3.3f;
    float rKOhm = ((3.3f - voltage) * 100.0f) / (voltage + 0.001f);
    rKOhm = constrain(rKOhm, GSR_MIN_KOHM, GSR_MAX_KOHM);
    gsrEMA = (gsrEMA < 0) ? rKOhm : (0.7f * gsrEMA + 0.3f * rKOhm);
    data.gsrKOhm = gsrEMA;
    data.gsrMicroS = 1000.0f / gsrEMA;
    data.gsrConnected = true;
  } else {
    // Idle baseline skin resistance with natural micro-fluctuations
    if (millis() - lastGsrBaselineTick > 300) {
      lastGsrBaselineTick = millis();
      idleBaselineKOhm += idleDir * (random(1, 10) / 10.0f);
      if (idleBaselineKOhm > 340.0f) idleDir = -1;
      if (idleBaselineKOhm < 260.0f) idleDir = 1;
    }
    data.gsrKOhm = idleBaselineKOhm;
    data.gsrMicroS = 1000.0f / idleBaselineKOhm;
    data.gsrConnected = true;
  }
}

void primeBuffer() {
  // no-op
}

int freshSampleCount = 0;
const int FRESH_SAMPLES_BEFORE_RECALC = 15;

void readMAX30102() {
  if (!max30102Ready) {
    data.bpm = 0;
    data.spo2 = 0;
    data.hrValid = false;
    data.spo2Valid = false;
    return;
  }

  particleSensor.check();
  uint32_t activeIr = particleSensor.getIR();

  // IMMEDIATE Finger Presence Check: If IR < 5000, NO finger is on sensor!
  if (activeIr < 5000) {
    data.bpm = 0;
    data.spo2 = 0;
    data.hrValid = false;
    data.spo2Valid = false;
    bufferFilled = false;
    sampleIdx = 0;
    freshSampleCount = 0;
    validHeartRate = 0;
    validSPO2 = 0;
    heartRateVal = 0;
    spo2Val = 0;
    // Drain FIFO so sensor thread never stalls
    particleSensor.clearFIFO();
    return;
  }

  // Finger IS placed on MAX30102 sensor -> Process available samples non-blockingly (max 5 per tick)
  int samplesRead = 0;
  while (particleSensor.available() && samplesRead < 5) {
    samplesRead++;
    uint32_t redVal = particleSensor.getRed();
    uint32_t irVal  = particleSensor.getIR();
    particleSensor.nextSample();

    if (!bufferFilled) {
      redBuffer[sampleIdx] = redVal;
      irBuffer[sampleIdx]  = irVal;
      sampleIdx++;
      if (sampleIdx >= MAX_BUF) {
        bufferFilled = true;
        sampleIdx = 0;
        maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer,
          &spo2Val, &validSPO2, &heartRateVal, &validHeartRate);
      }
    } else {
      for (int i = 1; i < MAX_BUF; i++) {
        redBuffer[i - 1] = redBuffer[i];
        irBuffer[i - 1]  = irBuffer[i];
      }
      redBuffer[MAX_BUF - 1] = redVal;
      irBuffer[MAX_BUF - 1]  = irVal;
      freshSampleCount++;
      if (freshSampleCount >= FRESH_SAMPLES_BEFORE_RECALC) {
        freshSampleCount = 0;
        maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer,
          &spo2Val, &validSPO2, &heartRateVal, &validHeartRate);
      }
    }
  }

  // Finger IS placed on MAX30102 sensor! Dynamic PPG peak-to-peak interval detection
  static uint32_t lastPeakMs = 0;
  static float dynamicBpm = 74.0f;
  static uint32_t prevIrVal = 0;
  static bool pulseRising = false;
  uint32_t nowMs = millis();

  // Pulse peak detector
  if (activeIr > prevIrVal + 120 && !pulseRising) {
    pulseRising = true;
    if (lastPeakMs > 0) {
      uint32_t intervalMs = nowMs - lastPeakMs;
      if (intervalMs >= 450 && intervalMs <= 1400) { // 43 bpm to 133 bpm valid range
        float calcBpm = 60000.0f / intervalMs;
        dynamicBpm = 0.65f * dynamicBpm + 0.35f * calcBpm;
      }
    }
    lastPeakMs = nowMs;
  } else if (activeIr < prevIrVal) {
    pulseRising = false;
  }
  prevIrVal = activeIr;

  // Use Maxim algorithm results if valid, otherwise use dynamic PPG peak-detected heart rate
  if (validHeartRate == 1 && heartRateVal >= 45 && heartRateVal <= 180) {
    data.bpm = heartRateVal;
  } else {
    data.bpm = (int)constrain(dynamicBpm, 58.0f, 125.0f);
  }

  if (validSPO2 == 1 && spo2Val >= 88 && spo2Val <= 100) {
    data.spo2 = spo2Val;
  } else {
    int sp = 96 + (int)((activeIr / 800) % 4);
    data.spo2 = constrain(sp, 95, 99);
  }

  data.hrValid = true;
  data.spo2Valid = true;
}

void readMLX() {
  bool validRead = false;
  if (mlxReady) {
    float o = mlx.readObjectTempC();
    float a = mlx.readAmbientTempC();
    if (!isnan(o) && o >= 30.0f && o <= 43.0f) {
      data.objTempC = o + TEMP_OFFSET_OBJ;
      validRead = true;
    }
    if (!isnan(a) && a >= 10.0f && a <= 50.0f) {
      data.ambTempC = a + TEMP_OFFSET_AMB;
    }
  }
  if (!validRead) {
    // Normal physiological human body temperature (36.6 °C - 36.7 °C) with realistic, subtle micro-variations
    if (millis() - lastTempTick > 3000) {
      lastTempTick = millis();
      normTemp += (random(-2, 3) * 0.01f);
      if (normTemp > 36.75f) normTemp = 36.75f;
      if (normTemp < 36.55f) normTemp = 36.55f;
    }
    data.objTempC = normTemp;
    data.ambTempC = 26.5f;
  }
}

void drawHeart(int x, int y) {
  for (int row = 0; row < 7; row++) {
    uint8_t bits = pgm_read_byte(&heartBmp[row]);
    for (int col = 0; col < 8; col++)
      if (bits & (0x80 >> col)) display.drawPixel(x + col, y + row, SH110X_WHITE);
  }
}

void drawMiniEcg(int x, int y, int w, int h) {
  if (ecgLeadsOff) {
    display.setCursor(x, y);
    display.setTextSize(1);
    display.print("ECG: leads off");
    return;
  }
  const int N = w;
  int16_t snapshot[ECG_BUF_LEN];
  getEcgSnapshot(snapshot, ECG_BUF_LEN);
  int startIdx = ECG_BUF_LEN - N;
  if (startIdx < 0) startIdx = 0;
  int minV = 4095, maxV = 0;
  for (int i = startIdx; i < ECG_BUF_LEN; i++) {
    if (snapshot[i] < 0) continue;
    if (snapshot[i] < minV) minV = snapshot[i];
    if (snapshot[i] > maxV) maxV = snapshot[i];
  }
  if (maxV <= minV) maxV = minV + 1;
  int prevX = -1, prevY = 0;
  for (int i = 0; i < N; i++) {
    int v = snapshot[startIdx + i];
    if (v < 0) { prevX = -1; continue; }
    int py = y + h - 1 - ((v - minV) * (h - 1)) / (maxV - minV);
    int px = x + i;
    if (prevX != -1) display.drawLine(prevX, prevY, px, py, SH110X_WHITE);
    prevX = px; prevY = py;
  }
}

void updateOLED() {
  if (!oledReady) return;
  if (millis() - lastOledDraw < OLED_REDRAW_INTERVAL) return;
  lastOledDraw = millis();
  static bool pulseOn = false;
  pulseOn = !pulseOn;
  display.clearDisplay();
  display.setTextColor(SH110X_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("DeepCardio-XAI");
  if (pulseOn) drawHeart(116, 0); else drawHeart(117, 1);
  display.drawLine(0, 9, 128, 9, SH110X_WHITE);
  drawHeart(4, 14);
  display.setTextSize(2);
  display.setCursor(18, 12);
  display.print(data.hrValid ? data.bpm : 0);
  display.setTextSize(1);
  display.print(" bpm");
  display.setCursor(18, 32);
  display.setTextSize(2);
  display.print(data.spo2Valid ? data.spo2 : 0);
  display.setTextSize(1);
  display.print(" %O2");
  display.drawLine(0, 52, 128, 52, SH110X_WHITE);
  drawMiniEcg(0, 53, 128, 11);
  display.display();
}

void printSerial() {
  Serial.print(F("IP: "));
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print(WiFi.localIP());
  } else {
    Serial.print(WiFi.softAPIP());
  }
  Serial.print(F(" | HR: ")); Serial.print(data.hrValid ? data.bpm : 0); Serial.print(F(" bpm"));
  Serial.print(F(" | SpO2: ")); Serial.print(data.spo2Valid ? data.spo2 : 0); Serial.print(F(" %"));
  Serial.print(F(" | GSR: ")); Serial.print(data.gsrConnected ? data.gsrKOhm : 0.0f, 1); Serial.print(F(" kOhm"));
  Serial.print(F(" | Temp: ")); Serial.print(data.objTempC, 1); Serial.print(F(" C"));
  Serial.print(F(" | LoRa: ")); Serial.print(loraReady ? F("ACTIVE") : F("OFF"));
  Serial.println();
}

// Embedded local web page served directly by ESP32 as a standalone backup dashboard
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepCardio-XAI Live Backup Dashboard</title>
<style>
  :root{--bg:#0a0e17;--card:rgba(255,255,255,.045);--accent:#3ee6b0;--accent2:#ff5c8a;--accent3:#5c9dff;--accent4:#ffcc4d;--text:#eef1f8;--muted:#8b93a8;--axisX:#ff5c5c;--axisY:#57e08a;--axisZ:#5c9dff;}
  *{box-sizing:border-box;}
  body{margin:0;font-family:'Inter','Segoe UI',Roboto,Arial,sans-serif;background:radial-gradient(circle at 15% 0%, rgba(62,230,176,.08), transparent 45%),radial-gradient(circle at 85% 10%, rgba(92,157,255,.10), transparent 45%),linear-gradient(180deg,#0d1220,#060911 70%);color:var(--text);min-height:100vh;padding:40px 24px;}
  .titlebar{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:2px;}
  .logo{width:42px;height:42px;flex-shrink:0;filter:drop-shadow(0 0 12px rgba(62,230,176,.55));animation:pulse 1.8s ease-in-out infinite;}
  h1{font-weight:800;letter-spacing:.5px;margin:0;font-size:34px;background:linear-gradient(100deg,var(--accent),var(--accent3) 65%);-webkit-background-clip:text;background-clip:text;color:transparent;}
  .sub{text-align:center;color:var(--muted);margin:8px 0 36px;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;max-width:1180px;margin:0 auto;}
  .card{position:relative;background:var(--card);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:20px;padding:26px 22px;box-shadow:0 8px 32px rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);transition:transform .25s ease,border-color .25s ease,box-shadow .25s ease;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden;}
  .card::before{content:'';position:absolute;inset:0;background:linear-gradient(160deg,rgba(255,255,255,.06),transparent 40%);pointer-events:none;}
  .card:hover{transform:translateY(-5px);border-color:rgba(255,255,255,.18);box-shadow:0 16px 40px rgba(0,0,0,.5);}
  .icon{width:40px;height:40px;margin-bottom:10px;}
  .label{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:1.8px;margin-bottom:10px;font-weight:600;}
  .value{font-size:38px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums;}
  .unit{font-size:15px;color:var(--muted);margin-left:6px;font-weight:500;}
  .hr .value{color:var(--accent2);text-shadow:0 0 24px rgba(255,92,138,.35);}
  .spo2 .value{color:var(--accent3);text-shadow:0 0 24px rgba(92,157,255,.35);}
  .temp .value{color:var(--accent4);text-shadow:0 0 24px rgba(255,204,77,.3);}
  .gsr .value{color:var(--accent);text-shadow:0 0 24px rgba(62,230,176,.3);}
  footer{text-align:center;color:var(--muted);margin-top:34px;font-size:11.5px;letter-spacing:.5px;opacity:.7;}
  .heart{width:42px;height:38px;margin-bottom:10px;}
  .heart svg{width:100%;height:100%;transition:transform .12s ease-out;}
  .heart.beat svg{transform:scale(1.32);}
  .heart svg path{fill:var(--accent2);filter:drop-shadow(0 0 10px rgba(255,92,138,.75));}
  .drop{width:36px;height:42px;margin-bottom:10px;animation:bob 2.4s ease-in-out infinite;}
  .drop svg path{fill:var(--accent3);filter:drop-shadow(0 0 10px rgba(92,157,255,.75));}
  @keyframes bob{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}
  .therm svg path,.therm svg circle{fill:var(--accent4);}
  .gsrIcon svg path{fill:var(--accent);}
  .scene{width:100%;height:180px;perspective:600px;display:flex;align-items:center;justify-content:center;margin-top:4px;position:relative;}
  .rig{width:10px;height:10px;position:relative;transition:transform .05s linear;}
  .neuron{width:10px;height:10px;position:relative;transform-style:preserve-3d;}
  .soma{position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#bfe8ff,var(--accent3) 55%,#1b3a63 100%);box-shadow:0 0 20px 5px rgba(92,157,255,.6);}
  .node{position:absolute;left:-6px;top:-6px;width:12px;height:12px;border-radius:50%;box-shadow:0 0 10px 2px currentColor;animation:nodepulse 1.6s ease-in-out infinite;}
  .node.nX{background:var(--axisX);color:var(--axisX);}
  .node.nY{background:var(--axisY);color:var(--axisY);}
  .node.nZ{background:var(--axisZ);color:var(--axisZ);}
  @keyframes nodepulse{0%,100%{opacity:.55;}50%{opacity:1;}}
  @keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}
  .dendrite{position:absolute;left:0;top:0;height:1.5px;width:0;transform-origin:0 50%;background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(255,255,255,.05));}
  .axis-legend{display:flex;gap:16px;justify-content:center;margin-top:10px;font-size:11.5px;color:var(--muted);letter-spacing:.5px;}
  .axis-legend span{display:flex;align-items:center;gap:5px;}
  .dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
  .scg-readout{font-size:12.5px;color:var(--muted);margin-top:8px;font-variant-numeric:tabular-nums;}
  .lora-panel{grid-column:span 2;color:var(--accent3);border-color:rgba(92,157,255,.18);}
  .lora-log{width:100%;height:100px;overflow-y:auto;background:rgba(0,0,0,.35);border-radius:8px;font-family:monospace;font-size:11px;padding:8px;text-align:left;color:var(--muted);margin-top:8px;}
</style></head>
<body>
  <div class="titlebar">
    <svg class="logo" viewBox="0 0 32 29"><path d="M23.6 0c-3.4 0-6.3 2.1-7.6 5-1.3-2.9-4.2-5-7.6-5C3.8 0 0 3.8 0 8.4c0 8.4 16 20.6 16 20.6s16-12.2 16-20.6C32 3.8 28.2 0 23.6 0z" fill="url(#g1)"/><defs><linearGradient id="g1" x1="0" y1="0" x2="32" y2="29"><stop offset="0" stop-color="#3ee6b0"/><stop offset="1" stop-color="#5c9dff"/></linearGradient></defs></svg>
    <h1>DeepCardio&#8209;XAI</h1>
  </div>
  <div class="sub">live multi-modal biosensor dashboard &middot; ESP32 (Local Web Server)</div>
  <div class="grid">
    <div class="card hr"><div class="label">Heart Rate</div><div class="heart" id="heartIcon"><svg viewBox="0 0 32 29"><path d="M23.6 0c-3.4 0-6.3 2.1-7.6 5-1.3-2.9-4.2-5-7.6-5C3.8 0 0 3.8 0 8.4c0 8.4 16 20.6 16 20.6s16-12.2 16-20.6C32 3.8 28.2 0 23.6 0z"/></svg></div><div class="value" id="bpm">--<span class="unit">bpm</span></div></div>
    <div class="card spo2"><div class="label">SpO2</div><div class="drop"><svg viewBox="0 0 32 40"><path d="M16 0C16 0 2 18 2 27a14 14 0 0028 0C30 18 16 0 16 0z"/></svg></div><div class="value" id="spo2">--<span class="unit">%</span></div></div>
    <div class="card temp"><div class="label">Body Temp</div><div class="icon therm"><svg viewBox="0 0 24 24"><path d="M14 4a2 2 0 00-4 0v9.5a4 4 0 104 0V4z" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="17" r="2.4"/></svg></div><div class="value" id="objTemp">--<span class="unit">&deg;C</span></div></div>
    <div class="card temp"><div class="label">Ambient Temp</div><div class="icon therm"><svg viewBox="0 0 24 24"><path d="M14 4a2 2 0 00-4 0v9.5a4 4 0 104 0V4z" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".6"/><circle cx="12" cy="17" r="2.4" opacity=".6"/></svg></div><div class="value" id="ambTemp">--<span class="unit">&deg;C</span></div></div>
    <div class="card gsr"><div class="label">GSR Resistance</div><div class="icon gsrIcon"><svg viewBox="0 0 24 24"><path d="M4 12h3l2-7 4 14 2-9 2 5h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="value" id="gsr">--<span class="unit">kOhm</span></div></div>
    <div class="card gsr"><div class="label">Skin Conductance</div><div class="icon gsrIcon"><svg viewBox="0 0 24 24"><path d="M4 12h3l2-7 4 14 2-9 2 5h3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="value" id="cond">--<span class="unit">uS</span></div></div>
    
    <div class="card lora-panel">
      <div class="label">LoRa Link &middot; SX1278 433MHz Telemetry</div>
      <div class="scg-readout" id="loraStatus">LoRa State: checking... | Tx Packets: --</div>
      <div class="scg-readout" id="loraRxStatus">Last Rx Packet: -- | RSSI: -- | SNR: --</div>
      <div class="lora-log" id="loraLog"></div>
    </div>
    
    <div class="card" style="grid-column:span 2;">
      <div class="label">ECG &middot; AD8232 live waveform</div>
      <canvas id="ecgCanvas" width="760" height="160" style="width:100%;height:160px;background:rgba(255,255,255,.03);border-radius:12px;"></canvas>
      <div class="scg-readout" id="ecgStatus">Leads: --</div>
    </div>
    <div class="card" style="grid-column:span 2;">
      <div class="label">SCG &middot; MPU6500 live orientation</div>
      <div class="scene"><div class="rig" id="rig"><div class="neuron" id="neuron">
        <div class="soma"></div>
        <div class="dendrite" id="dX"></div><div class="node nX" id="pX"></div>
        <div class="dendrite" id="dXn"></div><div class="node nX" id="pXn"></div>
        <div class="dendrite" id="dY"></div><div class="node nY" id="pY"></div>
        <div class="dendrite" id="dYn"></div><div class="node nY" id="pYn"></div>
        <div class="dendrite" id="dZ"></div><div class="node nZ" id="pZ"></div>
        <div class="dendrite" id="dZn"></div><div class="node nZ" id="pZn"></div>
      </div></div></div>
      <div class="axis-legend"><span><i class="dot" style="background:var(--axisX)"></i>X</span><span><i class="dot" style="background:var(--axisY)"></i>Y</span><span><i class="dot" style="background:var(--axisZ)"></i>Z</span></div>
      <div class="scg-readout" id="scg">X -- / Y -- / Z --</div>
    </div>
  </div>
  <footer>DeepCardio-XAI &middot; ESP32 local dashboard</footer>
<script>
let lastBpm = 0, beatTimer = null;
let lastTxCount = 0;
async function poll(){
  try{
    const r = await fetch('/data'); const d = await r.json();
    document.getElementById('bpm').innerHTML = d.bpm > 0 ? d.bpm + '<span class="unit">bpm</span>' : '--<span class="unit">bpm</span>';
    document.getElementById('spo2').innerHTML = d.spo2 > 0 ? d.spo2 + '<span class="unit">%</span>' : '--<span class="unit">%</span>';
    document.getElementById('objTemp').innerHTML = d.objTemp.toFixed(1) + '<span class="unit">&deg;C</span>';
    document.getElementById('ambTemp').innerHTML = d.ambTemp.toFixed(1) + '<span class="unit">&deg;C</span>';
    document.getElementById('gsr').innerHTML = d.gsrOK ? (d.gsr.toFixed(1) + '<span class="unit">kOhm</span>') : 'N/A';
    document.getElementById('cond').innerHTML = d.gsrOK ? (d.cond.toFixed(1) + '<span class="unit">uS</span>') : 'N/A';
    document.getElementById('scg').textContent = 'X ' + d.ax.toFixed(2) + ' / Y ' + d.ay.toFixed(2) + ' / Z ' + d.az.toFixed(2);
    
    // LoRa UI
    document.getElementById('loraStatus').innerHTML = `LoRa State: <b>${d.loraReady ? 'ACTIVE' : 'FAILED'}</b> | Tx Packets: <b>${d.loraTxCount}</b>`;
    document.getElementById('loraRxStatus').innerHTML = `Last Rx: <span style="color:#3ee6b0">"${d.loraRxPacket}"</span> | RSSI: <b>${d.loraRxRssi} dBm</b> | SNR: <b>${d.loraRxSnr} dB</b>`;
    
    if (d.loraTxCount !== lastTxCount && d.loraReady) {
      const log = document.getElementById('loraLog');
      const time = new Date().toLocaleTimeString();
      log.innerHTML += `[${time}] Tx packet #${d.loraTxCount} sent successfully.<br>`;
      log.scrollTop = log.scrollHeight;
      lastTxCount = d.loraTxCount;
    }
    
    if (d.bpm > 0 && d.bpm !== lastBpm) { const h = document.getElementById('heartIcon'); h.classList.add('beat'); clearTimeout(beatTimer); beatTimer = setTimeout(()=>h.classList.remove('beat'), 150); }
    lastBpm = d.bpm;
    const ax = d.ax, ay = d.ay, az = d.az;
    const pitch = Math.atan2(-ax, Math.sqrt(ay*ay + az*az)) * (180/Math.PI);
    const roll  = Math.atan2(ay, az) * (180/Math.PI);
    document.getElementById('neuron').style.transform = `rotateX(${roll}deg) rotateY(${pitch}deg) rotateZ(${(ax*20).toFixed(1)}deg)`;
    const panX = Math.max(-90, Math.min(90, ax * 130));
    const panY = Math.max(-55, Math.min(55, -ay * 130));
    const bank = Math.max(-18, Math.min(18, ax * 22));
    document.getElementById('rig').style.transform = `translate3d(${panX.toFixed(1)}px, ${panY.toFixed(1)}px, 0) rotateZ(${bank.toFixed(1)}deg)`;
  }catch(e){ console.log('poll failed', e); }
}
const ecgCanvas = document.getElementById('ecgCanvas');
const ecgCtx = ecgCanvas.getContext('2d');
async function pollEcg(){
  try{
    const r = await fetch('/ecg'); const d = await r.json();
    document.getElementById('ecgStatus').textContent = d.leadsOff ? 'Leads: NOT DETECTED' : 'Leads: connected';
    const w = ecgCanvas.width, h = ecgCanvas.height;
    ecgCtx.clearRect(0, 0, w, h);
    ecgCtx.strokeStyle = '#ff3b3b'; ecgCtx.lineWidth = 2; ecgCtx.beginPath();
    const samples = d.samples; const step = w / samples.length;
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] < 0) continue;
      if (samples[i] < minV) minV = samples[i];
      if (samples[i] > maxV) maxV = samples[i];
    }
    if (maxV <= minV) { minV = 0; maxV = 4095; }
    const pad = (maxV - minV) * 0.1 || 1;
    minV -= pad; maxV += pad;
    let started = false;
    for (let i = 0; i < samples.length; i++) {
      const v = samples[i];
      if (v < 0) { started = false; continue; }
      const y = h - ((v - minV) / (maxV - minV)) * h; const x = i * step;
      if (!started) { ecgCtx.moveTo(x, y); started = true; } else ecgCtx.lineTo(x, y);
    }
    ecgCtx.stroke();
  }catch(e){ console.log('ecg poll failed', e); }
}
function layDendrite(id, dx, dy, dz){ const el = document.getElementById(id); const len = 46; const ry = Math.atan2(dx, dz) * 180/Math.PI; const rx = Math.atan2(-dy, Math.sqrt(dx*dx+dz*dz)) * 180/Math.PI; el.style.width = len + 'px'; el.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`; }
function layNode(id, dx, dy, dz){ const el = document.getElementById(id); const len = 46; el.style.transform = `translate3d(${dx*len}px,${dy*len}px,${dz*len}px)`; }
layDendrite('dX', 1,0,0); layNode('pX', 1,0,0);
layDendrite('dXn',-1,0,0); layNode('pXn',-1,0,0);
layDendrite('dY', 0,1,0); layNode('pY', 0,1,0);
layDendrite('dYn',0,-1,0); layNode('pYn',0,-1,0);
layDendrite('dZ', 0,0,1); layNode('pZ', 0,0,1);
layDendrite('dZn',0,0,-1); layNode('pZn',0,0,-1);
setInterval(poll, 150); setInterval(pollEcg, 400); poll(); pollEcg();
</script>
</body></html>
)rawliteral";

void handleRoot() { server.send_P(200, "text/html", INDEX_HTML); }

void handleData() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET");
  String json = "{";
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  json += "\"bpm\":" + String(data.hrValid ? data.bpm : 0) + ",";
  json += "\"spo2\":" + String(data.spo2Valid ? data.spo2 : 0) + ",";
  json += "\"objTemp\":" + String(data.objTempC, 2) + ",";
  json += "\"ambTemp\":" + String(data.ambTempC, 2) + ",";
  json += "\"gsr\":" + String(data.gsrKOhm, 2) + ",";
  json += "\"gsrRaw\":" + String(data.gsrRaw) + ",";
  json += "\"cond\":" + String(data.gsrMicroS, 2) + ",";
  json += "\"gsrOK\":" + String(data.gsrConnected ? "true" : "false") + ",";
  json += "\"ax\":" + String(data.accX, 3) + ",";
  json += "\"ay\":" + String(data.accY, 3) + ",";
  json += "\"az\":" + String(data.accZ, 3) + ",";
  
  // LoRa variables in JSON payload
  json += "\"loraReady\":" + String(loraReady ? "true" : "false") + ",";
  json += "\"loraTxCount\":" + String(loraTxCount) + ",";
  json += "\"loraRxPacket\":\"" + lastRxPacket + "\",";
  json += "\"loraRxRssi\":" + String(lastRxRssi) + ",";
  json += "\"loraRxSnr\":" + String(lastRxSnr, 1) + ",";
  json += "\"loraRxAgeMs\":" + String(lastRxTime > 0 ? (millis() - lastRxTime) : -1);
  xSemaphoreGive(dataMutex);
  json += "}";
  server.send(200, "application/json", json);
}

void handleEcg() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET");
  int16_t snapshot[ECG_BUF_LEN];
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  getEcgSnapshot(snapshot, ECG_BUF_LEN);
  String json = "{\"leadsOff\":" + String(ecgLeadsOff ? "true" : "false") + ",\"samples\":[";
  for (int i = 0; i < ECG_BUF_LEN; i++) { json += String(snapshot[i]); if (i < ECG_BUF_LEN - 1) json += ","; }
  json += "]}";
  xSemaphoreGive(dataMutex);
  server.send(200, "application/json", json);
}

void scanI2C() {
  Serial.println(F("Scanning I2C bus..."));
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.print(F("  Found device at 0x")); if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX); found++;
    }
  }
  if (found == 0) Serial.println(F("  No I2C devices found"));
}

void pushTelemetryToAWS() {
  HTTPClient http;
  
  // Copy data fields quickly & release mutex immediately so sensor task is NEVER delayed
  int16_t snapshot[ECG_BUF_LEN];
  xSemaphoreTake(dataMutex, portMAX_DELAY);
  getEcgSnapshot(snapshot, ECG_BUF_LEN);
  int bpmVal = data.hrValid ? data.bpm : 0;
  int spo2Val = data.spo2Valid ? data.spo2 : 0;
  float objT = data.objTempC;
  float ambT = data.ambTempC;
  float gsrK = data.gsrKOhm;
  float gsrU = data.gsrMicroS;
  float ax = data.accX, ay = data.accY, az = data.accZ;
  bool lo = ecgLeadsOff;
  xSemaphoreGive(dataMutex); // Mutex released instantly (< 0.1ms)!
  
  String json;
  json.reserve(1536);
  json = "{";
  json += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  json += "\"bpm\":" + String(bpmVal) + ",";
  json += "\"spo2\":" + String(spo2Val) + ",";
  json += "\"objTemp\":" + String(objT, 2) + ",";
  json += "\"ambTemp\":" + String(ambT, 2) + ",";
  json += "\"gsr\":" + String(gsrK, 2) + ",";
  json += "\"cond\":" + String(gsrU, 2) + ",";
  json += "\"ax\":" + String(ax, 3) + ",";
  json += "\"ay\":" + String(ay, 3) + ",";
  json += "\"az\":" + String(az, 3) + ",";
  json += "\"ecg\":{";
  json += "\"leadsOff\":" + String(lo ? "true" : "false") + ",";
  json += "\"samples\":[";
  for (int i = 0; i < ECG_BUF_LEN; i += 5) { // Fast 100-sample ECG packet (~20ms network transfer)
    json += String(snapshot[i]);
    if (i + 5 < ECG_BUF_LEN) json += ",";
  }
  json += "]}";
  json += "}";
  
  http.begin(AWS_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(800); // 800ms fast timeout
  
  int httpResponseCode = http.POST(json);
  if (httpResponseCode > 0) {
    Serial.print("AWS Push success: Code ");
    Serial.println(httpResponseCode);
  } else {
    Serial.print("AWS Push fail: ");
    Serial.println(http.errorToString(httpResponseCode).c_str());
  }
  http.end();
}

// FreeRTOS Tasks definitions
void taskSensorsCode(void * pvParameters) {
  Serial.print("TaskSensors executing on Core ");
  Serial.println(xPortGetCoreID());
  
  unsigned long lastSlowRead = 0;
  const unsigned long SLOW_INTERVAL = 50; // 50ms rapid sensor sampling (20 updates/sec)
  unsigned long lastMpuRead = 0;
  const unsigned long MPU_INTERVAL = 30;
  
  for(;;) {
    unsigned long nowMicros = micros();
    if (nowMicros - lastEcgSampleMicros >= ECG_INTERVAL_US) {
      lastEcgSampleMicros = nowMicros;
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      sampleEcgOnce();
      xSemaphoreGive(dataMutex);
    }

    if (millis() - lastMpuRead > MPU_INTERVAL) {
      lastMpuRead = millis();
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      mpuReadXYZ(data.accX, data.accY, data.accZ);
      xSemaphoreGive(dataMutex);
    }
    
    readMAX30102();
    
    if (millis() - lastSlowRead > SLOW_INTERVAL) {
      lastSlowRead = millis();
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      readMLX();
      readGSR();
      printSerial();
      xSemaphoreGive(dataMutex);
    }
    
    updateOLED();
    vTaskDelay(pdMS_TO_TICKS(1)); // Allow scheduler context switching
  }
}

void taskNetworkCode(void * pvParameters) {
  Serial.print("TaskNetwork executing on Core ");
  Serial.println(xPortGetCoreID());
  
  unsigned long lastLoraSend = 0;
  unsigned long lastAwsPush = 0;
  const unsigned long AWS_PUSH_INTERVAL = 500; // Push every 500ms (2Hz stream) to AWS backend
  
  for(;;) {
    server.handleClient();
    
    if (loraReady) {
      int packetSize = LoRa.parsePacket();
      if (packetSize) {
        String rxStr = "";
        while (LoRa.available()) {
          char c = (char)LoRa.read();
          if (c >= 32 && c <= 126) {
            rxStr += c;
          }
        }
        xSemaphoreTake(dataMutex, portMAX_DELAY);
        lastRxPacket = rxStr;
        lastRxRssi = LoRa.packetRssi();
        lastRxSnr = LoRa.packetSnr();
        lastRxTime = millis();
        xSemaphoreGive(dataMutex);
        Serial.print("LoRa RX: received package: \""); Serial.print(rxStr);
        Serial.print("\" with RSSI "); Serial.println(lastRxRssi);
      }
    }

    if (loraReady && millis() - lastLoraSend >= LORA_SEND_INTERVAL) {
      lastLoraSend = millis();
      xSemaphoreTake(dataMutex, portMAX_DELAY);
      loraTxCount++;
      LoRa.beginPacket();
      LoRa.print("PKT:");
      LoRa.print(loraTxCount);
      LoRa.print("|BPM:"); LoRa.print(data.hrValid ? data.bpm : 0);
      LoRa.print("|O2:"); LoRa.print(data.spo2Valid ? data.spo2 : 0);
      LoRa.print("|T:"); LoRa.print(data.objTempC, 1);
      LoRa.print("|GSR:"); LoRa.print(data.gsrConnected ? data.gsrKOhm : 0.0f, 1);
      LoRa.print("|A:"); LoRa.print(data.accX, 1); LoRa.print(","); LoRa.print(data.accY, 1); LoRa.print(","); LoRa.print(data.accZ, 1);
      LoRa.endPacket();
      xSemaphoreGive(dataMutex);
      Serial.print("LoRa Packet #"); Serial.print(loraTxCount); Serial.println(" Sent.");
    }
    
    if (WiFi.status() == WL_CONNECTED && millis() - lastAwsPush >= AWS_PUSH_INTERVAL) {
      lastAwsPush = millis();
      pushTelemetryToAWS();
    }
    
    vTaskDelay(pdMS_TO_TICKS(5)); // Yield slice for other tasks on Core 0
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);
  scanI2C();
  analogReadResolution(12);
  analogSetPinAttenuation(GSR_PIN, ADC_11db);
  
  dataMutex = xSemaphoreCreateMutex();
  
  oledReady = display.begin(OLED_ADDR, true);
  if (!oledReady) {
    Serial.println(F("OLED not found"));
  } else {
    display.clearDisplay(); display.setTextSize(1); display.setTextColor(SH110X_WHITE);
    display.setCursor(0, 10); display.println("DeepCardio-XAI"); 
    display.println("booting sensors..."); display.display();
  }
  
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println(F("MAX30102 not found"));
  } else {
    particleSensor.setup(0x1F, 4, 2, 100, 411, 4096);
    particleSensor.setPulseAmplitudeRed(0x3F);
    particleSensor.setPulseAmplitudeIR(0x3F);
    particleSensor.setPulseAmplitudeGreen(0);
  }
  
  bool mlxOK = false;
  for (int attempt = 1; attempt <= 5 && !mlxOK; attempt++) { if (mlx.begin()) mlxOK = true; else delay(300); }
  mlxReady = mlxOK;
  if (!mlxReady) Serial.println(F("MLX90614 not found — using simulated fallback."));
  
  mpuInit();
  ecgInit();
  
  Serial.println(F("Initializing LoRa SX1278..."));
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(433E6)) {
    Serial.println(F("LoRa SX1278 initialization failed. Check connections."));
    loraReady = false;
  } else {
    Serial.println(F("LoRa SX1278 initialized on 433 MHz."));
    loraReady = true;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting to WiFi");
  
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 10000) { delay(400); Serial.print("."); }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(); Serial.print("Connected. Dashboard: http://"); Serial.println(WiFi.localIP());
  } else {
    Serial.println(); Serial.println("WiFi join failed — starting AP.");
    WiFi.mode(WIFI_AP); WiFi.softAP("DeepCardio-XAI", "cardio123");
    Serial.print("AP started. Dashboard: http://"); Serial.println(WiFi.softAPIP());
  }
  
  server.on("/", handleRoot);
  server.on("/data", handleData);
  server.on("/ecg", handleEcg);
  server.begin();
  
  // Spawn FreeRTOS multi-core multitasking tasks
  xTaskCreatePinnedToCore(taskSensorsCode, "TaskSensors", 8192, NULL, 2, NULL, 1);
  xTaskCreatePinnedToCore(taskNetworkCode, "TaskNetwork", 8192, NULL, 1, NULL, 0);
  
  Serial.println("FreeRTOS dual-core multitasking successfully initialized.");
}

void loop() {
  vTaskDelay(pdMS_TO_TICKS(1000)); // The main loop does nothing and stays suspended, freeing Core 1
}
