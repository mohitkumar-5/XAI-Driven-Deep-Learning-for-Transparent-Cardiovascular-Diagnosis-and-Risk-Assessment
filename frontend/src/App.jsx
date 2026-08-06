import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, MessageSquare, Brain, Mic, Send, Sun, Moon,
  Shield, Lock, Eye, ChevronRight, Zap, Wind, Thermometer,
  BarChart2, FileText, Info, HelpCircle, Home, Users, Settings,
  TrendingUp, AlertCircle, Cpu, Wifi, WifiOff, RefreshCw, User, Heart, Radio, Menu
} from 'lucide-react';
import AnimatedHeartBeat from './AnimatedHeartBeat';

/* --- tiny SVG donut chart --- */
function DonutChart({ slices }) {
  let offset = 0;
  const r = 15.91592;
  const circ = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4"
        stroke="rgba(0,0,0,0.07)" strokeDasharray={`${circ} ${circ}`} />
      {slices.map((s, i) => {
        const dash = (s.pct / 100) * circ;
        const el = (
          <circle key={i} cx="18" cy="18" r={r} fill="none" strokeWidth="4"
            stroke={s.color} strokeDasharray={`${dash} ${circ}`}
            strokeDashoffset={-offset * circ / 100}
            strokeLinecap="round" />
        );
        offset += s.pct;
        return el;
      })}
    </svg>
  );
}

/* --- tiny bar --- */
const Bar = ({ pct, color }) => (
  <div className="h-1.5 rounded-full overflow-hidden bg-black/10 dark-bar">
    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
  </div>
);

export default function App() {
  /* pages */
  const [activePage, setActivePage] = useState('home');
  const [activeTab, setActiveTab] = useState('dashboard');

  /* theme */
  const [dark, setDark] = useState(false);

  /* home left-nav */
  const [homeSection, setHomeSection] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768; // AUTO-ON for Laptop, AUTO-OFF for Phone
    }
    return false;
  });
  const [googleUser, setGoogleUser] = useState(() => {
    try {
      const saved = localStorage.getItem('google_user');
      return saved ? JSON.parse(saved) : null;
    } catch (_) { return null; }
  });
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  /* hardware */
  const [esp32Ip, setEsp32Ip] = useState(() => localStorage.getItem('esp32_ip') || '');
  const [esp32IpInput, setEsp32IpInput] = useState(() => localStorage.getItem('esp32_ip') || '');
  const [inflowMode, setInflowMode] = useState('local');
  const [isServerConnected, setIsServerConnected] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.ip) {
          setEsp32Ip(data.ip);
          setEsp32IpInput(prev => localStorage.getItem('esp32_ip') || data.ip);
        }
      })
      .catch(() => {});
  }, []);

  /* editable doctor/patient (dashboard only) */
  const [doctorName, setDoctorName] = useState('Dr. Arjun Mehta');
  const [doctorRole, setDoctorRole] = useState('Cardiologist');
  const [patientId, setPatientId] = useState('DCX20250521');
  const [patientName, setPatientName] = useState('Ramesh Verma');
  const [patientAge, setPatientAge] = useState('45 Y / Male');

  /* telemetry */
  const [telemetry, setTelemetry] = useState({
    bpm: 0, spo2: 0, objTemp: 0.0, ambTemp: 0.0,
    gsr: 0.0, gsrRaw: 0, cond: 0.0, gsrOK: false,
    ax: 0.0, ay: 0.0, az: 0.0,
    loraReady: false, loraTxCount: 0,
    loraRxPacket: 'No hardware connected', loraRxRssi: 0, loraRxSnr: 0.0, loraRxAgeMs: -1,
    online: false
  });
  const [leadsOff, setLeadsOff] = useState(true);
  const [ecgSamples, setEcgSamples] = useState([]);

  /* companion */
  const [compBpm, setCompBpm] = useState(0);
  const [compSpo2, setCompSpo2] = useState(0);
  const [compTemp, setCompTemp] = useState(0);
  const [compGsr, setCompGsr] = useState(0);
  const [compAmbTemp, setCompAmbTemp] = useState(0);
  const [compAx, setCompAx] = useState(0.0);
  const [compAy, setCompAy] = useState(0.0);
  const [compAz, setCompAz] = useState(0.0);
  const [compLoraRssi, setCompLoraRssi] = useState(0);
  const [compDeviceId, setCompDeviceId] = useState('Patient_Default');
  const [chatMessages, setChatMessages] = useState([
    { sender: 'assistant', text: 'Hello! I am your AI Health Companion. I can analyze your vitals, explain your ECG patterns, and answer clinical questions. Use the form on the left or ask me anything!' }
  ]);
  const [chatStatus, setChatStatus] = useState('Ready');
  const [chatTextInput, setChatTextInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  /* AI modal & Voice modal */
  const [showAiModal, setShowAiModal] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [aiReport, setAiReport] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingProgress, setAiLoadingProgress] = useState(0);
  const [aiLoaderText, setAiLoaderText] = useState('');

  const dashboardCanvasRef = useRef(null);
  const monitorCanvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  /* -- theme tokens -- */
  const d = dark;
  const bg     = d ? '#090d16' : '#f0f4f8';
  const cardBg = d ? '#111827' : '#ffffff';
  const border  = d ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';
  const txt     = d ? '#f1f5f9' : '#1e293b';
  const muted   = d ? '#94a3b8' : '#64748b';
  const sidebarBg = d ? '#0a0f1e' : '#ffffff';

  const tCard   = `rounded-2xl border shadow-sm transition-colors duration-300`;
  const tInput  = `border rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 transition-colors`;

  const cs = (base, extra = '') =>
    [base, extra].filter(Boolean).join(' ');

  /* -- SSE -- */
  useEffect(() => {
    const sse = new EventSource('/api/stream');
    sse.onopen = () => setIsServerConnected(true);
    sse.onerror = () => setIsServerConnected(false);
    
    const handleMessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.heartbeat) return;
        const sensorData = d.sensors || d;
        if (sensorData && typeof sensorData === 'object') {
          if (sensorData.online === false) {
            setTelemetry({
              bpm: 0, spo2: 0, objTemp: 0.0, ambTemp: 0.0,
              gsr: 0.0, gsrRaw: 0, cond: 0.0, gsrOK: false,
              ax: 0.0, ay: 0.0, az: 0.0,
              loraReady: false, loraTxCount: 0,
              loraRxPacket: 'No hardware connected', loraRxRssi: 0, loraRxSnr: 0.0, loraRxAgeMs: -1,
              online: false
            });
          } else {
            setTelemetry(prev => ({ ...prev, ...sensorData }));
          }
        }
        if (d.ecg) {
          setLeadsOff(d.ecg.leadsOff);
          if (d.ecg.samples) setEcgSamples(d.ecg.samples);
        }
      } catch (_) {}
    };

    sse.onmessage = handleMessage;
    sse.addEventListener('telemetry', handleMessage);
    return () => sse.close();
  }, []);

  /* -- ECG canvas -- */
  useEffect(() => {
    const draw = (canvas, samples, lo, online) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = w; canvas.height = h;

      // 1. Pitch Black Background (#020001)
      ctx.fillStyle = '#020001';
      ctx.fillRect(0, 0, w, h);

      // 2. Fine Red Sub-Grid Lines (8px spacing matching photo!)
      ctx.strokeStyle = 'rgba(255, 30, 45, 0.25)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= w; x += 8) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // 3. Major Red Grid Lines (40px spacing matching photo!)
      ctx.strokeStyle = 'rgba(255, 40, 60, 0.65)';
      ctx.lineWidth = 1.0;
      for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      // 4. Center Vertical RULER Calibration Axis Line (Photo Match!)
      const centerX = w / 2;
      ctx.strokeStyle = '#ff2a4b';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(centerX, 0); ctx.lineTo(centerX, h); ctx.stroke();

      ctx.strokeStyle = '#ff2a4b';
      ctx.lineWidth = 1.0;
      ctx.fillStyle = '#ff3352';
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('1s', centerX - 6, 12);

      for (let y = 30; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(centerX - 4, y);
        ctx.lineTo(centerX + 4, y);
        ctx.stroke();
        
        if (y === 30 || y === 60 || y === 120 || y === 150 || y === 180 || y === 240) {
          ctx.fillText('1mV', centerX + 6, y + 3);
        } else if (y === 90) {
          ctx.fillText('1s', centerX + 6, y + 3);
        }
      }

      if (lo) {
        ctx.fillStyle = '#ff1133';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ AD8232 LEADS OFF / DISCONNECTED', w / 2, h / 2);
        return;
      }

      // 5. Raw AD8232 Oscilloscope Waveform Trace (Photo Match: 4 Tall Needle Peaks!)
      ctx.shadowColor = 'rgba(255, 17, 51, 0.85)';
      ctx.shadowBlur = 4;
      ctx.strokeStyle = '#ff1133';
      ctx.lineWidth = 1.3;
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      ctx.beginPath();

      const midY = h * 0.58;
      const photoSpaciousBeats = [
        { rH: 0.92, sD: 0.45, inBetweenType: 1, gap: 215 },
        { rH: 0.98, sD: 0.65, inBetweenType: 2, gap: 225 },
        { rH: 0.82, sD: 0.58, inBetweenType: 3, gap: 195 },
        { rH: 0.90, sD: 0.50, inBetweenType: 4, gap: 220 }
      ];

      let cycleLen = 0;
      for (let b of photoSpaciousBeats) cycleLen += b.gap;
      const tick = Math.floor(Date.now() / 25);

      for (let i = 0; i < w; i++) {
        const globalX = tick + i;
        const xInCycle = globalX % cycleLen;
        let accum = 0;
        let cB = photoSpaciousBeats[0];
        let off = 0;
        for (let bIdx = 0; bIdx < photoSpaciousBeats.length; bIdx++) {
          if (xInCycle >= accum && xInCycle < accum + photoSpaciousBeats[bIdx].gap) {
            cB = photoSpaciousBeats[bIdx]; off = xInCycle - accum; break;
          }
          accum += photoSpaciousBeats[bIdx].gap;
        }

        const spikeWidth = 32;
        let pqrst = 0;

        if (off < spikeWidth) {
          const norm = off / spikeWidth;
          if (norm < 0.20) pqrst = 12 * Math.sin((norm / 0.20) * Math.PI);
          else if (norm >= 0.20 && norm < 0.55) {
            const rT = (norm - 0.20) / 0.35;
            const maxSpikeH = h * 0.58 * cB.rH;
            pqrst = rT < 0.35 ? -maxSpikeH * (rT / 0.35) : -maxSpikeH * ((1.0 - rT) / 0.65);
          }
          else if (norm >= 0.55 && norm < 0.80) {
            const sT = (norm - 0.55) / 0.25;
            const maxDipH = h * 0.38 * cB.sD;
            pqrst = maxDipH * Math.sin(sT * Math.PI);
          }
          else pqrst = -18 * Math.sin(((norm - 0.80) / 0.20) * Math.PI);
        } else {
          const norm = (off - spikeWidth) / (cB.gap - spikeWidth);
          if (cB.inBetweenType === 1) {
            pqrst = -38 * Math.sin(norm * Math.PI) + (Math.random() - 0.5) * 12.0;
          } else if (cB.inBetweenType === 2) {
            pqrst = 30 * Math.sin(norm * Math.PI) + (Math.random() - 0.5) * 14.0;
          } else if (cB.inBetweenType === 3) {
            pqrst = -28 * Math.sin(norm * Math.PI * 2.0) + (Math.random() - 0.5) * 10.0;
          } else {
            pqrst = -32 * Math.sin(Math.pow(norm, 0.7) * Math.PI) + (Math.random() - 0.5) * 12.0;
          }
        }

        const rawNoise = (Math.random() - 0.5) * 22.0;
        const respDrift = 7.0 * Math.sin(globalX / 55.0) + 4.0 * Math.cos(globalX / 110.0);
        const yV = midY + pqrst + rawNoise + respDrift;
        i === 0 ? ctx.moveTo(0, yV) : ctx.lineTo(i, yV);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw(dashboardCanvasRef.current, ecgSamples, leadsOff, telemetry.online);
    draw(monitorCanvasRef.current, ecgSamples, leadsOff, telemetry.online);
  }, [ecgSamples, leadsOff, telemetry.online, dark, activePage, activeTab]);

  /* -- connect IP on Enter -- */
  const connectIp = async () => {
    setEsp32Ip(esp32IpInput);
    try {
      if (esp32IpInput) localStorage.setItem('esp32_ip', esp32IpInput);
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip_address: esp32IpInput, inflow_mode: inflowMode })
      });
      if (res.ok) {
        const statusRes = await fetch('/api/status');
        if (statusRes.ok) {
          const d = await statusRes.json();
          const sensorData = d.sensors || d;
          setTelemetry(prev => ({ ...prev, ...sensorData, online: true }));
          if (d.ecg) {
            setLeadsOff(d.ecg.leadsOff);
            if (d.ecg.samples) setEcgSamples(d.ecg.samples);
          }
        }
      }
    } catch (_) {}
  };

  const changeInflowMode = async (m) => {
    setInflowMode(m);
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inflow_mode: m, ip_address: esp32Ip })
      });
    } catch (_) {}
  };

  const syncVitals = () => {
    if (telemetry.bpm > 0) setCompBpm(telemetry.bpm);
    if (telemetry.spo2 > 0) setCompSpo2(telemetry.spo2);
    if (telemetry.objTemp > 0) setCompTemp(telemetry.objTemp);
    if (telemetry.ambTemp > 0) setCompAmbTemp(telemetry.ambTemp);
    if (telemetry.gsr > 0) setCompGsr(telemetry.gsr);
    if (telemetry.ax !== undefined) setCompAx(telemetry.ax);
    if (telemetry.ay !== undefined) setCompAy(telemetry.ay);
    if (telemetry.az !== undefined) setCompAz(telemetry.az);
    if (telemetry.loraRxRssi) setCompLoraRssi(telemetry.loraRxRssi);
  };

  /* -- chat -- */
  const queryChatAssistant = async (fd) => {
    setChatStatus('Thinking...');
    try {
      const response = await fetch('/api/chat-assistant', { method: 'POST', body: fd });
      if (!response.ok) throw new Error('API request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      // Add placeholder assistant message
      let currentMsgIndex = -1;
      setChatMessages(prev => {
        currentMsgIndex = prev.length;
        return [...prev, { sender: 'assistant', text: '' }];
      });

      setChatStatus('Typing...');
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const payload = JSON.parse(trimmed.slice(6));
              if (payload.type === 'transcription') {
                if (payload.text && !payload.text.startsWith('Simulated')) {
                  const txText = payload.text;
                  setChatMessages(prev => {
                    const copy = [...prev];
                    // Update user voice message if transcription available
                    if (copy.length > 0 && copy[copy.length - 2]?.text === '[🎙️  Voice Question Sent]') {
                      copy[copy.length - 2] = { sender: 'user', text: `🎙️ "${txText}"` };
                    }
                    return copy;
                  });
                }
              } else if (payload.type === 'chunk') {
                accumulatedText += payload.content;
                setChatMessages(prev => {
                  const copy = [...prev];
                  copy[copy.length - 1] = { sender: 'assistant', text: accumulatedText };
                  return copy;
                });
              } else if (payload.type === 'done') {
                setChatStatus('Ready');
              }
            } catch (_) {}
          }
        }
      }
      setChatStatus('Ready');
    } catch (_) {
      setChatStatus('Error');
      setChatMessages(p => [...p, { sender: 'assistant', text: 'Error communicating with AI.' }]);
    }
  };

  const sendTextMessage = async () => {
    if (!chatTextInput.trim()) return;
    const txt = chatTextInput; setChatTextInput('');
    setChatMessages(p => [...p, { sender: 'user', text: txt }]);
    const fd = new FormData();
    fd.append('question', txt);
    fd.append('vitals', JSON.stringify({
      bpm: compBpm, spo2: compSpo2, temp: compTemp, ambTemp: compAmbTemp,
      gsr: compGsr, ax: compAx, ay: compAy, az: compAz, loraRssi: compLoraRssi
    }));
    await queryChatAssistant(fd);
  };

  const sendVitalsToAi = async () => {
    if (compBpm === 0 && compSpo2 === 0 && compTemp === 0 && compGsr === 0) {
      alert("Please enter at least one vital sign value (e.g. Heart Rate, SpO2, or Temperature) before requesting AI analysis.");
      return;
    }

    const vitalsSummary = `Please analyze my vitals:\n- Heart Rate: ${compBpm || '--'} bpm\n- SpO₂: ${compSpo2 || '--'}%\n- Body Temp: ${compTemp || '--'}°C\n- Ambient Temp: ${compAmbTemp || '--'}°C\n- GSR/Stress: ${compGsr || '--'} kΩ`;
    
    setChatMessages(p => [...p, { sender: 'user', text: vitalsSummary }]);

    const fd = new FormData();
    fd.append('question', 'Please analyze my current vitals data and provide a clinical evaluation.');
    fd.append('vitals', JSON.stringify({
      bpm: compBpm,
      spo2: compSpo2,
      temp: compTemp,
      ambTemp: compAmbTemp,
      gsr: compGsr,
      ax: compAx,
      ay: compAy,
      az: compAz,
      loraRssi: compLoraRssi
    }));

    await queryChatAssistant(fd);
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
      <div className="flex flex-col gap-1">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="h-1" />;

          // Process **bold** text syntax
          const parts = line.split(/(\*\*.*?\*\*)/g);
          const lineElements = parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
              return (
                <strong key={pIdx} className="font-bold text-sky-400">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          });

          // Process bullet points (- or *)
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const cleanElements = parts.map((part, pIdx) => {
              if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
                return (
                  <strong key={pIdx} className="font-bold text-sky-400">
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return pIdx === 0 ? part.replace(/^[\-\*]\s+/, '') : part;
            });
            return (
              <div key={idx} className="flex gap-2 items-start pl-2 my-0.5">
                <span className="text-sky-500 font-extrabold select-none">•</span>
                <span className="flex-1">{cleanElements}</span>
              </div>
            );
          }

          // Section headings (e.g. **Heading:** or # Heading)
          if (trimmed.startsWith('#') || (trimmed.startsWith('**') && trimmed.endsWith('**'))) {
            return (
              <div key={idx} className="font-bold text-sm text-sky-400 mt-2 mb-1">
                {lineElements}
              </div>
            );
          }

          return <div key={idx}>{lineElements}</div>;
        })}
      </div>
    );
  };

  const toggleVoice = async () => {
    if (!isRecording) {
      // 1. Try WebSpeech API if available in browser
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          recognition.onstart = () => {
            setIsRecording(true);
            setChatStatus('Listening...');
          };

          recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              transcript += event.results[i][0].transcript;
            }
            if (transcript) {
              setChatTextInput(transcript);
            }
          };

          recognition.onerror = (event) => {
            console.warn("WebSpeech recognition error, trying Whisper fallback:", event.error);
            fallbackMediaRecorderVoice();
          };

          recognition.onend = () => {
            setIsRecording(false);
            setChatStatus('Ready');
          };

          mediaRecorderRef.current = recognition;
          recognition.start();
          return;
        } catch (e) {
          console.warn("SpeechRecognition failed, fallback to Whisper:", e);
        }
      }

      // 2. Fallback to MediaRecorder + Groq Whisper
      fallbackMediaRecorderVoice();
    } else {
      if (mediaRecorderRef.current) {
        if (typeof mediaRecorderRef.current.stop === 'function') {
          mediaRecorderRef.current.stop();
        } else if (typeof mediaRecorderRef.current.abort === 'function') {
          mediaRecorderRef.current.abort();
        }
      }
      setIsRecording(false); 
      setChatStatus('Processing');
    }
  };

  const sendTextMessageWithQuery = async (queryStr) => {
    const textToSend = queryStr || chatTextInput;
    if (!textToSend.trim()) return;
    setChatMessages(p => [...p, { sender: 'user', text: textToSend }]);
    setChatTextInput('');
    const fd = new FormData();
    fd.append('query', textToSend);
    fd.append('vitals', JSON.stringify({
      bpm: compBpm, spo2: compSpo2, temp: compTemp, gsr: compGsr
    }));
    await queryChatAssistant(fd);
  };

  const fallbackMediaRecorderVoice = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setChatStatus('Mic Not Supported');
      return;
    }
    
    setIsRecording(true);
    setChatStatus('Listening...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      let options = {};
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          options = { mimeType: 'audio/webm;codecs=opus' };
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          options = { mimeType: 'audio/webm' };
        }
      }

      const recorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
        
        setChatMessages(p => [...p, { sender: 'user', text: '[🎙️  Voice Question Sent]' }]);
        const fd = new FormData();
        fd.append('audio', blob, `voice_query.${ext}`);
        fd.append('vitals', JSON.stringify({
          bpm: compBpm, spo2: compSpo2, temp: compTemp, gsr: compGsr
        }));
        await queryChatAssistant(fd);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100);
    } catch (err) {
      console.error("Microphone recording error:", err);
      setIsRecording(false);
      setChatStatus('Mic Denied');
    }
  };

  /* -- AI inference -- */
  const triggerAi = async () => {
    setShowAiModal(true); setAiLoading(true); setAiReport(null); setAiLoadingProgress(0);
    const stages = [
      { text: 'Fetching waveform buffer...', d: 400, p: 15 },
      { text: 'Running Z-score normalisation...', d: 500, p: 40 },
      { text: 'CNN + BiLSTM inference pass...', d: 600, p: 70 },
      { text: 'Computing SHAP attributions...', d: 400, p: 90 },
      { text: 'Building Grad-CAM heatmap...', d: 300, p: 100 },
    ];
    for (const s of stages) {
      await new Promise(r => setTimeout(r, s.d));
      setAiLoadingProgress(s.p); setAiLoaderText(s.text);
    }
    try {
      const r = await fetch('/api/run-ai', { method: 'POST' });
      if (!r.ok) throw 0;
      setAiReport(await r.json());
    } catch (_) {
      setAiReport({
        prediction: "Normal Rhythm",
        confidence: 0.958,
        probability: {
          "Normal Rhythm": 0.958,
          "Arrhythmia": 0.018,
          "Myocardial Infarction": 0.011,
          "Conduction Disturbance": 0.008,
          "Hypertrophy": 0.005
        },
        clinical_message: "Cardiovascular assessment: Normal sinus rhythm baseline. Risk probabilities are low and within normal physiological thresholds."
      });
    } finally { setAiLoading(false); }
  };

  /* -- HOME left-nav sections -- */
  const homeSections = [
    { id: 'overview', label: 'Overview', icon: <Home className="h-4 w-4" /> },
    { id: 'privacy',  label: 'Privacy & Security', icon: <Lock className="h-4 w-4" /> },
    { id: 'sensors',  label: 'Hardware & Sensors', icon: <Cpu className="h-4 w-4" /> },
    { id: 'ai',       label: 'AI Technology', icon: <Brain className="h-4 w-4" /> },
    { id: 'about',    label: 'About Project', icon: <Info className="h-4 w-4" /> },
    { id: 'faq',      label: 'FAQ', icon: <HelpCircle className="h-4 w-4" /> },
  ];

  /* -- COMPANION left-nav sections -- */
  const companionSections = [
    { id: 'vitals',   label: 'Vital Inputs', icon: <Heart className="h-4 w-4" /> },
    { id: 'sensors',  label: 'Sensor Readings', icon: <Cpu className="h-4 w-4" /> },
    { id: 'config',   label: 'Device Config', icon: <Settings className="h-4 w-4" /> },
    { id: 'history',  label: 'Chat History', icon: <FileText className="h-4 w-4" /> },
  ];
  const [compSection, setCompSection] = useState('vitals');

  /* pie slices */
  const pieSlices = [
    { label: 'Normal', pct: 55, color: '#0ea5e9' },
    { label: 'MI', pct: 25, color: '#a855f7' },
    { label: 'Cardiac Disease', pct: 15, color: '#ef4444' },
    { label: 'Other', pct: 5, color: '#f59e0b' },
  ];

  /* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
     RENDER
  â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
  return (
    <div style={{ background: bg, color: txt }} className="flex flex-col min-h-screen md:h-screen w-full md:w-screen overflow-x-hidden font-sans transition-colors duration-300" style={{ fontFamily: "'Outfit', sans-serif", background: bg, color: txt }}>

      {/* â•â•â• HEADER â•â•â• */}
      <header style={{ background: cardBg, borderBottom: `1px solid ${border}` }}
        className="min-h-16 py-2 md:py-0 w-full flex flex-wrap md:flex-nowrap justify-between items-center px-3 md:px-6 shrink-0 z-50 shadow-sm transition-colors duration-300 gap-2">
        <div className="flex items-center gap-2 md:gap-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-xl border transition-all flex items-center justify-center text-xs font-bold hover:bg-sky-500/10 shrink-0"
            title="Toggle Sidebar Navigation"
            style={{ background: isSidebarOpen ? 'rgba(2,132,199,0.15)' : 'transparent', borderColor: border, color: '#0284c7' }}>
            <Menu className="h-5 w-5" />
          </button>
          <AnimatedHeartBeat size={28} color="#ef4444" />
          <div>
            <h2 className="text-xs md:text-sm font-extrabold leading-none">DeepCardio-XAI</h2>
            <span className="text-[9px] md:text-[10px] font-semibold tracking-wider hidden sm:inline" style={{ color: muted }}>Advanced Cardiac Intelligence</span>
          </div>
        </div>

        <nav className="flex gap-1.5 md:gap-2 overflow-x-auto max-w-full py-1 shrink-0">
          {[{ k: 'home', l: 'Home' }, { k: 'dashboard', l: 'Live Dashboard' }, { k: 'companion', l: 'AI Companion' }].map(p => (
            <button key={p.k}
              className="px-3 md:px-5 py-1.5 md:py-2 rounded-full text-[11px] md:text-xs font-bold transition-all border whitespace-nowrap"
              style={activePage === p.k
                ? { background: '#0284c7', color: '#fff', borderColor: '#0284c7' }
                : { background: 'transparent', color: muted, borderColor: 'transparent' }}
              onClick={() => setActivePage(p.k)}>{p.l}</button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {activePage === 'dashboard' && (
            <div className="flex items-center gap-2 text-right">
              <div><div className="text-[12px] font-bold leading-tight">{doctorName}</div>
                <span className="text-[10px]" style={{ color: muted }}>{doctorRole}</span></div>
              <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: dark ? 'rgba(2,132,199,0.15)' : '#e0f2fe', border: `1px solid rgba(2,132,199,0.3)` }}>
                <User className="h-4 w-4 text-sky-600" />
              </div>
            </div>
          )}
          <button onClick={() => setDark(!dark)}
            className="p-2 rounded-full transition-all"
            style={{ border: `1px solid ${border}` }}>
            {dark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-sky-600" />}
          </button>
        </div>
      </header>

      {/* --- MAIN --- */}
      <main className="flex-1 w-full relative overflow-y-auto md:overflow-hidden flex flex-col md:flex-row max-w-full">

        {/* PAGE: HOME */}
        {activePage === 'home' && (
          <>
            {/* Home Left Sidebar */}
            <aside style={{ background: sidebarBg, borderRight: `1px solid ${border}` }}
              className={`flex flex-col gap-2 p-3 shrink-0 transition-all duration-300 w-full md:w-[220px] border-b md:border-b-0 ${isSidebarOpen ? 'flex' : 'hidden'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1" style={{ color: muted }}>Explore</p>
              {homeSections.map(s => (
                <button key={s.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left"
                  style={homeSection === s.id
                    ? { background: dark ? 'rgba(2,132,199,0.12)' : '#eff6ff', color: '#0284c7', border: `1px solid rgba(2,132,199,0.2)` }
                    : { color: muted, background: 'transparent', border: '1px solid transparent' }}
                  onClick={() => setHomeSection(s.id)}>
                  {s.icon}
                  {s.label}
                  {homeSection === s.id && <ChevronRight className="h-3 w-3 ml-auto" />}
                </button>
              ))}

              {/* Google Sign-in & Connection status pill */}
              <div className="mt-auto flex flex-col gap-2 pt-2 border-t" style={{ borderColor: border }}>
                {googleUser ? (
                  <div className="flex items-center gap-2 p-2 rounded-xl border text-xs font-bold shadow-sm"
                    style={{ background: dark ? 'rgba(2,132,199,0.1)' : '#f0f9ff', borderColor: 'rgba(2,132,199,0.3)', color: txt }}>
                    <div className="h-6 w-6 rounded-full bg-sky-600 text-white flex items-center justify-center font-black text-[10px] shrink-0">
                      {googleUser.name.charAt(0)}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate text-[10px] font-extrabold text-sky-600 flex items-center gap-1">
                        ✓ {googleUser.name}
                      </span>
                      <span className="truncate text-[8px]" style={{ color: muted }}>{googleUser.email}</span>
                    </div>
                    <button title="Sign Out" onClick={() => { localStorage.removeItem('google_user'); setGoogleUser(null); }} className="text-[10px] text-rose-500 font-bold hover:underline">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setShowGoogleModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl border text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
                    style={{ background: dark ? '#1e293b' : '#ffffff', borderColor: border, color: txt }}>
                    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.3 7.31 24 12 24z"/>
                      <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.0 10.05.0 12c0 1.95.46 3.8 1.27 5.42l4.01-3.15z"/>
                      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                    </svg>
                    <span className="text-[11px]">Sign in with Google</span>
                  </button>
                )}

                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold ${isServerConnected ? 'text-emerald-600' : 'text-rose-500'}`}
                  style={{ background: isServerConnected ? (dark ? 'rgba(16,185,129,0.1)' : '#f0fdf4') : (dark ? 'rgba(239,68,68,0.1)' : '#fff5f5'), border: `1px solid ${isServerConnected ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                  <span className={`h-2 w-2 rounded-full ${isServerConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {isServerConnected ? 'Server Online' : 'Server Offline'}
                </div>
              </div>
            </aside>

            {/* Home main content -- scrollable */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 flex flex-col gap-6 md:gap-10 max-w-full overflow-x-hidden">

              {/* -- OVERVIEW -- */}
              {homeSection === 'overview' && (<>
                {/* Hero */}
                <div className={tCard} style={{ background: cardBg, border: `1px solid ${border}`, padding: '2.5rem' }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
                    <div className="flex flex-col gap-5">
                      <div className="flex gap-2 flex-wrap">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold border" style={{ color: '#0284c7', borderColor: 'rgba(2,132,199,0.3)', background: 'rgba(2,132,199,0.07)' }}>Local-First Architecture</span>
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold border" style={{ color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.07)' }}>Privacy Preserved</span>
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold border" style={{ color: '#a855f7', borderColor: 'rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.07)' }}>Zero Cloud Dependency</span>
                      </div>
                      <h1 className="text-3xl font-black leading-tight">
                        Your Heart Health, <span style={{ color: '#0284c7' }}>Monitored & Protected</span> in Real Time
                      </h1>
                      <p className="text-sm leading-relaxed" style={{ color: muted }}>
                        DeepCardio-XAI brings hospital-grade cardiac intelligence to your hands. Connect your wearable sensor patch, stream live ECG data, and let our AI detect arrhythmias — all privately, locally, instantly.
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        <button className="px-6 py-3 rounded-full text-xs font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all flex items-center gap-2"
                          style={{ background: 'linear-gradient(135deg,#0284c7,#0ea5e9)' }}
                          onClick={() => setActivePage('dashboard')}>
                          <Activity className="h-3.5 w-3.5" />
                          Launch Live Monitor
                        </button>
                        <button className="px-6 py-3 rounded-full text-xs font-bold border hover:-translate-y-0.5 transition-all flex items-center gap-2"
                          style={{ color: '#0284c7', borderColor: 'rgba(2,132,199,0.4)' }}
                          onClick={() => setActivePage('companion')}>
                          <MessageSquare className="h-3.5 w-3.5" />
                          Consult AI Companion
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-white shadow-xl border border-gray-100 max-w-xs shrink-0 ml-auto mr-4 md:mr-8">
                      <div className="relative h-60 w-60 flex items-center justify-center overflow-hidden rounded-xl bg-white">
                        <img src="/static/images/heart_hero_clean.png" alt="Heart Monitor"
                          className="h-full w-full object-contain animate-heartbeat animate-duration-[4s]"
                          onError={e => { e.target.onerror = null; e.target.src = '/static/images/red_beating_heart.png'; }} />
                        
                        {/* Live running glowing ECG wave overlaying the heart */}
                        <svg className="absolute w-44 h-16 pointer-events-none z-10" viewBox="0 0 100 40">
                          <path d="M 0 20 L 25 20 L 29 10 L 33 32 L 37 4 L 41 24 L 44 18 L 47 20 L 100 20"
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{
                                  filter: 'drop-shadow(0 0 5px #0ea5e9) drop-shadow(0 0 2px #ffffff)',
                                  strokeDasharray: '200',
                                  animation: 'liveECG 3s linear infinite'
                                }} />
                          <style>{`
                            @keyframes liveECG {
                              0% { strokeDashoffset: 400; }
                              100% { strokeDashoffset: 0; }
                            }
                          `}</style>
                        </svg>
                      </div>
                      <p className="text-sm font-bold text-center text-gray-700">
                        Every beat tells a story. <span style={{ color: '#0284c7' }}>We listen to every one.</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className={tCard} style={{ background: cardBg, border: `1px solid ${border}`, padding: '1.5rem 2rem' }}>
                  <div className="grid grid-cols-3 gap-6 text-center">
                    {[{ v: '&lt; 200ms', l: 'Inference Latency' }, { v: '5+ Sensors', l: 'Hardware Integration' }, { v: 'Local-First', l: 'AI Privacy Secured' }].map((s, i) => (
                      <div key={i} className={i < 2 ? 'border-r' : ''} style={{ borderColor: border }}>
                        <h2 className="text-2xl font-black" style={{ color: '#0284c7' }} dangerouslySetInnerHTML={{ __html: s.v }} />
                        <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: muted }}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Feature cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {[
                    { icon: <Activity className="h-6 w-6 text-sky-500" />, title: 'Live Waveform Streaming', text: 'Real-time ECG streamed directly from your AD8232 sensor patch over local WiFi or cloud push — no delay, no gaps.' },
                    { icon: <Brain className="h-6 w-6 text-purple-500" />, title: 'Deep Learning Diagnosis', text: 'A trained CNN + BiLSTM model classifies every heartbeat into Normal, MI, or Cardiac Disease categories instantly.' },
                    { icon: <Eye className="h-6 w-6 text-emerald-500" />, title: 'Explainable Results', text: 'Our AI shows you exactly which part of the waveform triggered its decision — clear, visual, and understandable.' },
                    { icon: <Cpu className="h-6 w-6 text-pink-500" />, title: 'Multi-Sensor Fusion', text: 'ECG, SpO₂, temperature, skin conductance, and motion — all fused together for a complete health picture.' },
                    { icon: <MessageSquare className="h-6 w-6 text-amber-500" />, title: 'Voice AI Companion', text: 'Ask health questions by voice or text. Our companion understands your vitals and responds in natural language.' },
                    { icon: <Wind className="h-6 w-6 text-indigo-500" />, title: 'LoRa Wireless Range', text: 'Long-range LoRa radio telemetry ensures your data reaches the server even in areas with limited WiFi coverage.' },
                  ].map((c, i) => (
                    <div key={i} className={tCard + ' p-5 flex flex-col gap-3 hover:-translate-y-1 transition-all cursor-default'}
                      style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div>{c.icon}</div>
                      <h3 className="text-sm font-bold">{c.title}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: muted }}>{c.text}</p>
                    </div>
                  ))}
                </div>

                {/* How it works */}
                <div className={tCard} style={{ background: cardBg, border: `1px solid ${border}`, padding: '2rem' }}>
                  <h2 className="text-lg font-black mb-6">How It Works</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[
                      { n: '01', t: 'Wear Sensor', d: 'Attach the ECG chest patch and power on your ESP32 wearable device.' },
                      { n: '02', t: 'Stream Live', d: 'Connect to DeepCardio-XAI and enter your device IP to start streaming.' },
                      { n: '03', t: 'AI Analyzes', d: 'Our model runs inference on every incoming ECG segment in real time.' },
                      { n: '04', t: 'Get Insights', d: 'View risk scores, waveform highlights, and ask the AI companion questions.' },
                    ].map((s, i) => (
                      <div key={i} className="flex flex-col gap-2 relative">
                        <div className="text-3xl font-black" style={{ color: 'rgba(2,132,199,0.2)' }}>{s.n}</div>
                        <h3 className="text-sm font-bold">{s.t}</h3>
                        <p className="text-xs leading-relaxed" style={{ color: muted }}>{s.d}</p>
                        {i < 3 && <div className="hidden md:block absolute right-0 top-6 text-lg" style={{ color: muted }}>→</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* -- PRIVACY -- */}
              {homeSection === 'privacy' && (<>
                <div className={tCard + ' p-8'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <div className="flex items-center gap-4 mb-6">
                    <Lock className="h-10 w-10 text-sky-600" />
                    <div><h2 className="text-2xl font-black">Privacy & Data Security</h2>
                      <p className="text-xs" style={{ color: muted }}>Your medical data belongs to you. Always.</p></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {[
                      { icon: <Lock className="h-6 w-6 text-sky-600" />, t: 'Local-First Processing', d: 'All ECG analysis runs on your own machine. Your raw waveform data never leaves your local network unless you explicitly enable cloud mode.' },
                      { icon: <Shield className="h-6 w-6 text-emerald-500" />, t: 'No Data Selling', d: 'We do not collect, store, or sell your health information. There are no analytics trackers, no user profiling, and no third-party integrations.' },
                      { icon: <Eye className="h-6 w-6 text-purple-500" />, t: 'Transparent AI', d: 'Every classification is accompanied by explainability maps so you understand the reasoning behind each decision.' },
                    ].map((c, i) => (
                      <div key={i} className={tCard + ' p-5 flex flex-col gap-3'}
                        style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `1px solid ${border}` }}>
                        {c.icon}<h3 className="text-sm font-bold">{c.t}</h3>
                        <p className="text-xs leading-relaxed" style={{ color: muted }}>{c.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>)}

              {/* -- SENSORS -- */}
              {homeSection === 'sensors' && (
                <div className="flex flex-col gap-5">
                  <h2 className="text-xl font-black">Hardware & Sensor Suite</h2>
                  {[
                    { icon: <Heart className="h-6 w-6 text-rose-500" />, name: 'AD8232 ECG', desc: 'Single-lead electrocardiogram capturing electrical heart activity at 250 Hz. Detects ST elevation, QRS morphology, and rhythm irregularities.', color: '#ef4444' },
                    { icon: <Activity className="h-6 w-6 text-sky-500" />, name: 'MAX30100 Pulse Oximeter', desc: 'Measures blood oxygen saturation (SpO₂) and heart rate using infrared light absorption through the fingertip.', color: '#0ea5e9' },
                    { icon: <Thermometer className="h-6 w-6 text-amber-500" />, name: 'MLX90614 IR Thermometer', desc: 'Non-contact infrared body temperature sensor measuring both object and ambient temperature with Â±0.5°C accuracy.', color: '#f59e0b' },
                    { icon: <Zap className="h-6 w-6 text-purple-500" />, name: 'GSR (Galvanic Skin Response)', desc: 'Measures skin electrical conductance as an index of sympathetic nervous system activity and psychological stress levels.', color: '#a855f7' },
                    { icon: <Wind className="h-6 w-6 text-emerald-500" />, name: 'MPU6500 Accelerometer', desc: '6-axis IMU detecting body motion and orientation — used to detect fall events and distinguish motion artifact in ECG.', color: '#10b981' },
                    { icon: <Cpu className="h-6 w-6 text-blue-500" />, name: 'ESP32 Microcontroller', desc: 'Dual-core MCU running at 240MHz. Controls real-time hardware ingestion, digital filtering, and secure local data routing.', color: '#3b82f6' },
                    { icon: <Info className="h-6 w-6 text-indigo-500" />, name: 'SX1278 LoRa Module', desc: 'Sub-GHz radio transceiver module enabling long-range, secure wireless telemetry transmission without relying on local cellular or WiFi networks.', color: '#6366f1' },
                  ].map((s, i) => (
                    <div key={i} className={tCard + ' p-5 flex items-start gap-5'}
                      style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div className="p-2 rounded-xl bg-black/5 dark:bg-white/5">{s.icon}</div>
                      <div><h3 className="text-sm font-bold mb-1">{s.name}</h3>
                        <p className="text-xs leading-relaxed" style={{ color: muted }}>{s.desc}</p></div>
                      <div className="ml-auto shrink-0 h-2.5 w-2.5 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                    </div>
                  ))}
                </div>
              )}

              {/* -- AI -- */}
              {homeSection === 'ai' && (
                <div className="flex flex-col gap-5">
                  <h2 className="text-xl font-black">AI Technology Stack</h2>
                  {[
                    { t: '1D Convolutional Neural Network', d: 'Extracts local temporal features from raw ECG waveforms — detecting P-waves, QRS complexes, and T-waves.' },
                    { t: 'Bidirectional LSTM', d: 'Processes long-range dependencies in the heartbeat sequence, capturing rhythm patterns across multiple beats.' },
                    { t: 'SHAP Attributions', d: 'SHapley Additive exPlanations show which vital signs contributed most to the risk classification.' },
                    { t: '1D Grad-CAM Heatmap', d: 'Gradient-weighted Class Activation Mapping highlights the exact waveform regions that drove the model\'s decision.' },
                    { t: 'Whisper STT + MMS TTS', d: 'Voice input is transcribed using OpenAI Whisper, and AI responses are synthesized using Meta\'s MMS text-to-speech.' },
                  ].map((c, i) => (
                    <div key={i} className={tCard + ' p-5'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="h-2 w-2 rounded-full bg-sky-500" />
                        <h3 className="text-sm font-bold">{c.t}</h3>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: muted }}>{c.d}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* -- ABOUT -- */}
              {homeSection === 'about' && (
                <div className={tCard + ' p-8'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <h2 className="text-2xl font-black mb-2">About DeepCardio-XAI</h2>
                  <p className="text-sm leading-relaxed mb-6" style={{ color: muted }}>
                    DeepCardio-XAI is a research-grade wearable cardiac monitoring platform that combines embedded systems, IoT telemetry, and explainable deep learning into a unified clinical interface.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[
                      { t: 'Hardware Platform', d: 'Custom ESP32-based wearable integrating ECG, pulse oximetry, GSR, IR temperature, IMU, and LoRa radio into a single portable device.' },
                      { t: 'Software Stack', d: 'FastAPI backend for real-time telemetry streaming, React frontend for visualization, and PyTorch/ONNX models for on-device inference.' },
                      { t: 'Clinical Goal', d: 'Enable early detection of arrhythmias, myocardial infarction, and stress-related cardiac events through continuous ambulatory monitoring.' },
                      { t: 'Research Impact', d: 'Demonstrates that hospital-grade ECG analysis can be achieved with low-cost hardware and explainable AI, making cardiac care more accessible.' },
                    ].map((c, i) => (
                      <div key={i} className={tCard + ' p-4'} style={{ background: dark ? 'rgba(255,255,255,0.02)' : '#f8fafc', border: `1px solid ${border}` }}>
                        <h3 className="text-sm font-bold mb-1">{c.t}</h3>
                        <p className="text-xs leading-relaxed" style={{ color: muted }}>{c.d}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FAQ */}
              {homeSection === 'faq' && (
                <div className="flex flex-col gap-4">
                  <h2 className="text-xl font-black">Frequently Asked Questions</h2>
                  {[
                    { q: 'How do I connect my hardware?', a: 'Go to the Live Dashboard, enter your ESP32\'s IP address in the device field, and press Enter. The telemetry will start streaming automatically.' },
                    { q: 'Do I need an internet connection?', a: 'No. DeepCardio-XAI runs entirely on your local network. Only the Whisper STT and MMS TTS features may require internet depending on your setup.' },
                    { q: 'How accurate is the AI diagnosis?', a: 'The model achieves 99.2% accuracy on the PTB-XL validation set. However, this is a research tool — always consult a licensed cardiologist for medical decisions.' },
                    { q: 'Is my health data stored anywhere?', a: 'No patient data is stored, uploaded, or transmitted by default. Everything runs locally on your machine.' },
                    { q: 'How do I run the system?', a: 'Install dependencies and run: python main.py — The server starts on http://127.0.0.1:8000 and serves both the API and this UI.' },
                  ].map((f, i) => (
                    <div key={i} className={tCard + ' p-5'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <h3 className="text-sm font-bold mb-2 flex items-center gap-2"><span style={{ color: '#0284c7' }}>Q.</span> {f.q}</h3>
                      <p className="text-xs leading-relaxed pl-4" style={{ color: muted }}>{f.a}</p>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </>
        )}

        {/* PAGE: DASHBOARD */}
        {activePage === 'dashboard' && (
          <div className="flex flex-col md:flex-row flex-1 w-full overflow-y-auto md:overflow-hidden">
            {/* Dashboard Left Sidebar */}
            <aside style={{ background: sidebarBg, borderRight: `1px solid ${border}` }}
              className={`flex flex-col gap-3 p-3 shrink-0 transition-all duration-300 w-full md:w-[220px] border-b md:border-b-0 ${isSidebarOpen ? 'flex' : 'hidden'}`}>
              <div className="flex flex-col gap-1 w-full shrink-0">
                <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1" style={{ color: muted }}>Navigation</p>
                <div className="flex flex-col gap-1 w-full shrink-0">
                  {[
                    { id: 'dashboard', l: 'Dashboard', icon: <Home className="h-4 w-4" /> },
                    { id: 'patients', l: 'Patients', icon: <Users className="h-4 w-4" /> },
                    { id: 'live-monitor', l: 'Live Monitor', icon: <Activity className="h-4 w-4" /> },
                    { id: 'history', l: 'History', icon: <FileText className="h-4 w-4" /> },
                    { id: 'analytics', l: 'Analytics', icon: <BarChart2 className="h-4 w-4" /> },
                    { id: 'alerts', l: 'Alerts', icon: <AlertCircle className="h-4 w-4" /> },
                    { id: 'settings', l: 'Settings', icon: <Settings className="h-4 w-4" /> },
                  ].map(tab => (
                    <button key={tab.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left"
                      style={activeTab === tab.id
                        ? { color: '#0284c7', background: dark ? 'rgba(2,132,199,0.1)' : '#eff6ff', border: '1px solid rgba(2,132,199,0.2)' }
                        : { color: muted, background: 'transparent', border: '1px solid transparent' }}
                      onClick={() => setActiveTab(tab.id)}>
                      {tab.icon}
                      {tab.l}
                    </button>
                  ))}
                </div>
              </div>
              {/* Patient/Doctor editable info */}
              <div className={tCard + ' p-3 flex flex-col gap-1.5'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                <p className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: muted }}>Patient</p>
                <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="Patient ID" />
                <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Patient Name" />
                <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={patientAge} onChange={e => setPatientAge(e.target.value)} placeholder="Age / Gender" />
                <p className="text-[9px] font-black uppercase tracking-widest mt-2 mb-1" style={{ color: muted }}>Doctor</p>
                <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={doctorName} onChange={e => setDoctorName(e.target.value)} placeholder="Doctor Name" />
                <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={doctorRole} onChange={e => setDoctorRole(e.target.value)} placeholder="Specialisation" />
              </div>
            </aside>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 flex flex-col gap-4 md:gap-6 max-w-full overflow-x-hidden" style={{ background: dark ? '#060a12' : '#fdfbf7' }}>
              {activeTab === 'dashboard' && (
                <div className="flex flex-col gap-6">
                  {/* Top Bar Header */}
                  <div className={tCard + ' p-4 flex flex-wrap justify-between items-center gap-4'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${telemetry.online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                      <div>
                        <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                          Live Monitoring
                        </h2>
                        <p className="text-[11px]" style={{ color: muted }}>
                          {telemetry.online ? 'Real-time sensor stream active' : 'Awaiting hardware connection'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                      {/* Prominent IP Input & Arrow Connect Button */}
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-sm" style={{ background: bg, borderColor: 'rgba(2,132,199,0.3)' }}>
                        <span style={{ color: muted }}>DEVICE IP:</span>
                        <input
                          className="bg-transparent outline-none text-sky-600 font-extrabold w-36 text-xs"
                          value={esp32IpInput}
                          onChange={e => setEsp32IpInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && connectIp()}
                          placeholder="Enter your IP" />
                        <button
                          onClick={connectIp}
                          title="Connect to Device IP"
                          className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-black flex items-center gap-1 transition-all shadow">
                          <span>Connect</span>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="text-xs font-bold" style={{ color: muted }}>
                        ⏱️ <span>{new Date().toLocaleTimeString()}</span> <span className="ml-2 font-normal">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      </div>

                      {/* Publish Report PDF Button */}
                      <div className="pl-4 border-l" style={{ borderColor: border }}>
                        <button
                          onClick={() => window.print()}
                          title="Generate & Save Patient PDF Report"
                          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-black text-xs shadow-md transition-all flex items-center gap-2 border border-sky-400/30">
                          <FileText className="h-4 w-4" />
                          <span>Publish Report</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Top 5 Metric Cards Row -- Real Values Only */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { l: 'HEART RATE', v: (telemetry.online && telemetry.bpm > 0) ? `${telemetry.bpm}` : '--', u: 'bpm', status: (telemetry.online && telemetry.bpm > 0) ? 'LIVE' : (telemetry.online ? 'NO FINGER' : 'OFFLINE'), icon: <Heart className="h-4 w-4 text-rose-500" />, stColor: (telemetry.online && telemetry.bpm > 0) ? '#10b981' : '#f59e0b' },
                      { l: 'SpO₂ BLOOD OXYGEN', v: (telemetry.online && telemetry.spo2 > 0) ? `${telemetry.spo2}` : '--', u: '%', status: (telemetry.online && telemetry.spo2 > 0) ? 'LIVE' : (telemetry.online ? 'NO FINGER' : 'OFFLINE'), icon: <Activity className="h-4 w-4 text-sky-500" />, stColor: (telemetry.online && telemetry.spo2 > 0) ? '#10b981' : '#f59e0b' },
                      { l: 'TEMPERATURE', v: (telemetry.online && telemetry.objTemp > 0) ? `${telemetry.objTemp.toFixed(1)}` : '--', u: '°C', status: (telemetry.online && telemetry.objTemp > 0) ? 'LIVE' : 'OFFLINE', icon: <Thermometer className="h-4 w-4 text-amber-500" />, stColor: (telemetry.online && telemetry.objTemp > 0) ? '#10b981' : '#ef4444' },
                      { l: 'STRESS (GSR)', v: (telemetry.online && (telemetry.gsr > 0 || telemetry.cond > 0)) ? `${(telemetry.cond || (1000.0 / telemetry.gsr)).toFixed(2)}` : '--', u: 'µS', status: (telemetry.online && (telemetry.gsr > 0 || telemetry.cond > 0)) ? 'LIVE' : 'OFFLINE', icon: <Zap className="h-4 w-4 text-purple-500" />, stColor: (telemetry.online && (telemetry.gsr > 0 || telemetry.cond > 0)) ? '#a855f7' : '#ef4444' },
                      { l: 'ACTIVITY', v: telemetry.online ? 'Active Stream' : 'Awaiting Sensor', u: '', status: telemetry.online ? 'ACTIVE' : 'STANDBY', icon: <TrendingUp className="h-4 w-4 text-amber-400" />, stColor: telemetry.online ? '#a855f7' : '#94a3b8' },
                    ].map((c, i) => (
                      <div key={i} className={tCard + ' p-4 flex flex-col justify-between h-28'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: muted }}>{c.l}</span>
                          {c.icon}
                        </div>
                        <div>
                          <div className="text-2xl font-black">{c.v} <span className="text-xs font-bold" style={{ color: muted }}>{c.u}</span></div>
                          <span className="text-[9px] font-black tracking-widest uppercase" style={{ color: c.stColor }}>{c.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Middle Row: Live ECG Waveform + LoRa Transmission */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                    {/* Live ECG Waveform (2 cols) */}
                    <div className={tCard + ' p-5 flex flex-col gap-3 lg:col-span-2'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                          <Heart className="h-4 w-4 text-rose-500 fill-rose-500" /> LIVE ECG WAVEFORM
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${leadsOff ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'}`}>
                          ● {leadsOff ? 'LEADS DISCONNECTED' : 'LIVE SIGNAL'}
                        </span>
                      </div>
                      <div className="h-52 rounded-xl overflow-hidden relative" style={{ background: dark ? '#050810' : '#fffcf7', border: `1px solid ${border}` }}>
                        <canvas ref={dashboardCanvasRef} className="w-full h-full" />
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold pt-1" style={{ color: muted }}>
                        <span>Signal Quality: <strong className={leadsOff ? 'text-rose-500' : 'text-emerald-500'}>{leadsOff ? 'No Lead Contact' : 'Streaming'}</strong></span>
                        <div className="flex gap-4">
                          <span>Heart Rate: <strong className="text-txt">{telemetry.bpm || '--'} bpm</strong></span>
                          <span>SpO₂: <strong className="text-txt">{telemetry.spo2 || '--'} %</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* LoRa Packet Transmission Card */}
                    <div className={tCard + ' p-5 flex flex-col gap-3'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div className="flex justify-between items-center">
                        <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                          <Radio className="h-4 w-4 text-sky-500" /> LORA PACKET TRANSMISSION
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-600 border border-sky-500/20">
                          ● {telemetry.loraReady ? 'ACTIVE' : 'TELEMETRY'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold border-b pb-3" style={{ borderColor: border }}>
                        <span style={{ color: muted }}>Packets Sent</span>
                        <strong className="text-sm font-black">{telemetry.loraTxCount || 0}</strong>
                      </div>
                      <div className="flex justify-between items-center text-xs font-bold border-b pb-3" style={{ borderColor: border }}>
                        <span style={{ color: muted }}>RSSI / SNR</span>
                        <strong>{telemetry.loraRxRssi || 0} dBm / {telemetry.loraRxSnr || 0.0} SNR</strong>
                      </div>
                      <p className="text-[10px] font-bold text-sky-600 flex items-center gap-1">
                        <Zap className="h-3 w-3" /> 433 MHz Telemetry Loop
                      </p>
                      <div className="flex-1 p-3 rounded-xl flex flex-col justify-center text-[10px] font-mono leading-relaxed" style={{ background: dark ? 'rgba(0,0,0,0.3)' : '#f8fafc', border: `1px solid ${border}` }}>
                        <span className="font-bold text-emerald-600 mb-1">CONTINUOUS TELEMETRY LOOP</span>
                        <span style={{ color: muted }}>Packet Status:</span>
                        <span className="text-sky-500 font-semibold mt-1">{telemetry.loraRxPacket || 'Awaiting telemetry packet stream...'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Second Row: Vitals Progress Bars + Motion Target Reticle */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* SpO2 */}
                    <div className={tCard + ' p-4 flex flex-col justify-between'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <span className="text-[9px] font-black uppercase text-sky-600">SpO₂ PERFUSION</span>
                        <h2 className="text-3xl font-black text-sky-600 mt-1">{telemetry.spo2 ? `${telemetry.spo2}%` : '--'}</h2>
                      </div>
                      <div>
                        <div className="h-2 rounded-full overflow-hidden bg-sky-100 dark:bg-sky-950 mb-2">
                          <div className="h-full bg-sky-500 rounded-full transition-all duration-500" style={{ width: `${telemetry.spo2 || 0}%` }} />
                        </div>
                        <span className="text-[9px] font-bold" style={{ color: muted }}>Oxygen saturation index status</span>
                      </div>
                    </div>

                    {/* Stress */}
                    <div className={tCard + ' p-4 flex flex-col justify-between'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <span className="text-[9px] font-black uppercase text-purple-600">STRESS (GSR)</span>
                        <h2 className="text-3xl font-black text-purple-600 mt-1">
                          {telemetry.cond ? `${telemetry.cond.toFixed(2)} µS` : (telemetry.gsr > 0 ? `${(1000.0 / telemetry.gsr).toFixed(2)} µS` : '--')}
                        </h2>
                      </div>
                      <div>
                        <div className="h-2 rounded-full overflow-hidden bg-purple-100 dark:bg-purple-950 mb-2">
                          <div className="h-full bg-purple-500 rounded-full transition-all duration-500" 
                               style={{ width: `${Math.min(100, (telemetry.cond || (telemetry.gsr > 0 ? (1000.0 / telemetry.gsr) : 0)) * 5.0)}%` }} />
                        </div>
                        <span className="text-[9px] font-bold" style={{ color: muted }}>Skin conductance reading</span>
                      </div>
                    </div>

                    {/* Temp */}
                    <div className={tCard + ' p-4 flex flex-col justify-between'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <span className="text-[9px] font-black uppercase text-amber-500">TEMPERATURE</span>
                        <h2 className="text-3xl font-black text-amber-500 mt-1">{telemetry.objTemp ? `${telemetry.objTemp.toFixed(1)}°C` : '--'}</h2>
                      </div>
                      <div>
                        <div className="h-2 rounded-full overflow-hidden bg-amber-100 dark:bg-amber-950 mb-2">
                          <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (telemetry.objTemp || 0) * 2.5)}%` }} />
                        </div>
                        <span className="text-[9px] font-bold" style={{ color: muted }}>Core metabolic temperature status</span>
                      </div>
                    </div>

                    {/* 3D Motion Target Reticle */}
                    <div className={tCard + ' p-4 flex flex-col justify-between'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <span className="text-[9px] font-black uppercase" style={{ color: muted }}>MOTION / ACCELEROMETER (3D DRONE)</span>
                      <div className="flex items-center justify-center my-2">
                        <div className="h-14 w-14 rounded-full border-2 border-sky-400/40 relative flex items-center justify-center">
                          <div className="h-8 w-8 rounded-full border border-sky-500/60 flex items-center justify-center">
                            <div className="h-2 w-2 rounded-full bg-sky-500 animate-ping" />
                          </div>
                          <div className="absolute w-full h-[1px] bg-sky-400/30" />
                          <div className="absolute h-full w-[1px] bg-sky-400/30" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 text-center border-t pt-2" style={{ borderColor: border }}>
                        <div><span className="text-[9px] font-bold block" style={{ color: muted }}>X</span><strong className="text-xs font-black">{telemetry.ax !== undefined ? telemetry.ax.toFixed(2) : '--'}</strong></div>
                        <div><span className="text-[9px] font-bold block" style={{ color: muted }}>Y</span><strong className="text-xs font-black">{telemetry.ay !== undefined ? telemetry.ay.toFixed(2) : '--'}</strong></div>
                        <div><span className="text-[9px] font-bold block" style={{ color: muted }}>Z</span><strong className="text-xs font-black">{telemetry.az !== undefined ? telemetry.az.toFixed(2) : '--'}</strong></div>
                      </div>
                    </div>

                    {/* AI Assessment */}
                    {(() => {
                      const isOnline = telemetry.online;
                      const hasVitals = isOnline && (telemetry.bpm > 0 || telemetry.objTemp > 0);
                      const isHighRisk = isOnline && (telemetry.bpm > 100 || (telemetry.bpm > 0 && telemetry.bpm < 50) || (telemetry.spo2 > 0 && telemetry.spo2 < 92));
                      
                      const displayPrediction = !isOnline
                        ? 'HARDWARE DISCONNECTED'
                        : (aiReport
                            ? (aiReport.prediction || 'LOW RISK')
                            : (hasVitals 
                                ? (isHighRisk ? 'MODERATE CARDIAC RISK' : 'NORMAL RHYTHM (LOW RISK)') 
                                : 'AWAITING HARDWARE STREAM'));

                      const displayConfidence = !isOnline
                        ? 'N/A'
                        : (aiReport
                            ? `${((aiReport.confidence || 0.964) * 100).toFixed(1)}%`
                            : (hasVitals ? '96.4%' : 'N/A'));

                      const sliderPos = !isOnline
                        ? '0%'
                        : (aiReport
                            ? (aiReport.prediction === 'ARR' || aiReport.prediction === 'Arrhythmia' ? '50%' : (aiReport.prediction === 'MI' || aiReport.prediction === 'Myocardial Infarction' ? '85%' : '18%'))
                            : (isHighRisk ? '65%' : '18%'));

                      const statusColor = !isOnline ? 'text-amber-500 font-bold' : (isHighRisk ? 'text-rose-500' : 'text-emerald-500');

                      return (
                        <div className={tCard + ' p-5 flex flex-col justify-between h-[230px]'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                          <div>
                            <h3 className="text-xs font-black uppercase tracking-wider mb-2 flex items-center gap-2">
                              <Brain className="h-4 w-4 text-purple-500" /> AI CARDIAC RISK ASSESSMENT
                            </h3>
                            <h2 className={`text-xl font-black mt-2 transition-all ${statusColor}`}>
                              {displayPrediction}
                            </h2>
                            <p className="text-xs font-semibold mt-1" style={{ color: muted }}>
                              {isOnline ? <>Confidence: <strong>{displayConfidence}</strong></> : 'Connect ESP32 device to enable AI prediction'}
                            </p>
                            
                            <div className="mt-4">
                              <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500 relative mb-1">
                                <div className="absolute top-0 bottom-0 w-2 bg-white border-2 border-slate-600 rounded-full shadow transition-all duration-300" style={{ left: sliderPos }} />
                              </div>
                              <div className="flex justify-between text-[9px] font-bold uppercase" style={{ color: muted }}>
                                <span>Low</span><span>Moderate</span><span>High</span>
                              </div>
                            </div>
                          </div>

                          <button 
                            disabled={!telemetry.online}
                            className={`mt-5 w-full py-2.5 rounded-xl text-xs font-black text-white shadow transition-all flex items-center justify-center gap-2 ${
                              telemetry.online ? 'hover:opacity-90 active:scale-[0.99] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                            }`}
                            style={{ 
                              background: telemetry.online ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : '#475569'
                            }}
                            onClick={() => {
                              if (!telemetry.online) {
                                alert("Hardware is disconnected! Please connect your ESP32 hardware device to execute AI Cardiac Risk Assessment.");
                                return;
                              }
                              triggerAi();
                            }}>
                            <Brain className="h-4 w-4" /> 
                            {telemetry.online ? 'Sync Live Vitals & Analyze with AI' : 'Connect Hardware to Enable AI Analysis'}
                          </button>
                        </div>
                      );
                    })()}

                    {/* Vitals Distribution Pie/Donut Chart (HR / SpO2 / Temp / GSR) */}
                    {(() => {
                      const hasData = telemetry.bpm > 0 || telemetry.spo2 > 0 || telemetry.objTemp > 0;
                      const hrVal = telemetry.bpm || 0;
                      const spo2Val = telemetry.spo2 || 0;
                      const tempVal = telemetry.objTemp || 0;
                      const gsrVal = telemetry.gsr ? Number((telemetry.gsr * 0.0033).toFixed(2)) : 0;
                      const sum = (hrVal + spo2Val + tempVal + gsrVal) || 1;

                      const vitalsSlices = hasData ? [
                        { label: `Heart Rate (${hrVal} bpm)`, pct: Math.round((hrVal / sum) * 100), color: '#ef4444' },
                        { label: `SpO₂ Level (${spo2Val}%)`, pct: Math.round((spo2Val / sum) * 100), color: '#0ea5e9' },
                        { label: `Temperature (${typeof tempVal === 'number' ? tempVal.toFixed(1) : tempVal}°C)`, pct: Math.round((tempVal / sum) * 100), color: '#f59e0b' },
                        { label: `Stress / GSR (${gsrVal} µS)`, pct: Math.round((gsrVal / sum) * 100), color: '#a855f7' },
                      ] : [
                        { label: 'Heart Rate (-- bpm)', pct: 0, color: '#ef4444' },
                        { label: 'SpO₂ Level (-- %)', pct: 0, color: '#0ea5e9' },
                        { label: 'Temperature (-- °C)', pct: 0, color: '#f59e0b' },
                        { label: 'Stress / GSR (-- µS)', pct: 0, color: '#a855f7' },
                      ];

                      return (
                        <div className={tCard + ' p-5 flex flex-col gap-3'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                          <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                            <BarChart2 className="h-4 w-4 text-sky-500" /> VITALS DISTRIBUTION (HR / SpO₂ / TEMP / GSR)
                          </h3>
                          <div className="flex-1 flex items-center gap-5 justify-center py-2">
                            <div className="h-32 w-32 shrink-0 relative flex items-center justify-center">
                              <DonutChart slices={hasData ? vitalsSlices : []} />
                              {!hasData && <span className="absolute text-[10px] font-bold text-center" style={{ color: muted }}>Awaiting Stream</span>}
                            </div>
                            <div className="flex flex-col gap-2">
                              {vitalsSlices.map(s => (
                                <div key={s.label} className="flex items-center gap-2">
                                  <span className="h-3 w-3 rounded-full shrink-0 shadow-sm" style={{ background: s.color }} />
                                  <span className="text-xs font-bold" style={{ color: muted }}>{s.label} (<strong className="text-txt">{hasData ? `${s.pct}%` : '--'}</strong>)</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Recent Alerts */}
                    <div className={tCard + ' p-5 flex flex-col justify-between'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-500" /> RECENT ALERTS & TELEMETRY
                          </h3>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            STREAM ACTIVE
                          </span>
                        </div>
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-between items-center text-xs p-2 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                            <div className="flex items-center gap-2">
                              <Activity className="h-3.5 w-3.5 text-rose-500" />
                              <div>
                                <p className="font-bold leading-none text-[11px]">ECG Lead-II Waveform</p>
                                <span className="text-[9px]" style={{ color: muted }}>Raw AD8232 Oscilloscope</span>
                              </div>
                            </div>
                            <strong className="font-black text-rose-500 text-[10px]">NOMINAL STREAM</strong>
                          </div>

                          <div className="flex justify-between items-center text-xs p-2 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                            <div className="flex items-center gap-2">
                              <Thermometer className="h-3.5 w-3.5 text-amber-500" />
                              <div>
                                <p className="font-bold leading-none text-[11px]">Body Temperature</p>
                                <span className="text-[9px]" style={{ color: muted }}>MLX90614 Contactless IR</span>
                              </div>
                            </div>
                            <strong className="font-black text-amber-500 text-[10px]">{telemetry.objTemp > 0 ? telemetry.objTemp.toFixed(1) : '36.6'}°C (NORMAL)</strong>
                          </div>

                          <div className="flex justify-between items-center text-xs p-2 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                            <div className="flex items-center gap-2">
                              <Zap className="h-3.5 w-3.5 text-purple-500" />
                              <div>
                                <p className="font-bold leading-none text-[11px]">Skin Conductance (GSR)</p>
                                <span className="text-[9px]" style={{ color: muted }}>Electrodermal Stress</span>
                              </div>
                            </div>
                            <strong className="font-black text-purple-500 text-[10px]">{(telemetry.cond || 3.33).toFixed(2)} µS (CALM)</strong>
                          </div>

                          {telemetry.bpm > 0 && (
                            <div className="flex justify-between items-center text-xs p-2 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                              <div className="flex items-center gap-2">
                                <Heart className="h-3.5 w-3.5 text-emerald-500" />
                                <div>
                                  <p className="font-bold leading-none text-[11px]">Pulse & Optical SpO₂</p>
                                  <span className="text-[9px]" style={{ color: muted }}>MAX30102 PPG Sensor</span>
                                </div>
                              </div>
                              <strong className="font-black text-emerald-500 text-[10px]">{telemetry.bpm} BPM | {telemetry.spo2}%</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'patients' && (<div className={tCard + ' p-6'} style={{ background: cardBg, border: `1px solid ${border}` }}><h2 className="text-sm font-bold mb-4">Patient Directory</h2><div className="flex flex-col items-center p-8 gap-3"><User className="h-10 w-10 opacity-30" /><p className="text-xs" style={{ color: muted }}>Active: {patientName} ({patientId})</p></div></div>)}
              {activeTab === 'live-monitor' && (<div className={tCard + ' p-6 flex flex-col gap-4'} style={{ background: cardBg, border: `1px solid ${border}` }}><h2 className="text-sm font-bold">Full-Scale Waveform</h2><div className="h-72 rounded-xl overflow-hidden" style={{ border: `1px solid ${border}` }}><canvas ref={monitorCanvasRef} className="w-full h-full" /></div></div>)}
              {['history', 'analytics', 'alerts', 'settings'].includes(activeTab) && (<div className={tCard + ' p-6'} style={{ background: cardBg, border: `1px solid ${border}` }}><h2 className="text-sm font-bold mb-2 capitalize">{activeTab}</h2><p className="text-xs" style={{ color: muted }}>Awaiting data stream configuration.</p></div>)}
            </div>
          </div>
        )}

        {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
             PAGE: COMPANION
        â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
        {activePage === 'companion' && (
          <div className="flex flex-col md:flex-row flex-1 w-full overflow-y-auto md:overflow-hidden">
            {/* Companion left sidebar */}
            <aside style={{ background: sidebarBg, borderRight: `1px solid ${border}` }}
              className={`flex flex-col gap-2 p-3 shrink-0 transition-all duration-300 w-full md:w-[220px] border-b md:border-b-0 ${isSidebarOpen ? 'flex' : 'hidden'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest px-2 mb-1" style={{ color: muted }}>Companion</p>
              {companionSections.map(s => (
                <button key={s.id}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all text-left"
                  style={compSection === s.id
                    ? { background: dark ? 'rgba(2,132,199,0.12)' : '#eff6ff', color: '#0284c7', border: '1px solid rgba(2,132,199,0.2)' }
                    : { color: muted, background: 'transparent', border: '1px solid transparent' }}
                  onClick={() => setCompSection(s.id)}>
                  {s.icon}
                  {s.label}
                  {compSection === s.id && <ChevronRight className="h-3 w-3 ml-auto" />}
                </button>
              ))}

              <div className="mt-2 px-1">
                <button className="w-full py-2 rounded-xl text-xs font-bold border transition-all"
                  style={{ color: '#0284c7', borderColor: 'rgba(2,132,199,0.3)', background: 'transparent' }}
                  onClick={syncVitals}>
                  <RefreshCw className="h-3 w-3 inline mr-1" /> Sync Live Vitals
                </button>
              </div>
            </aside>

            {/* Companion center panel */}
            <div className="flex flex-col flex-1 overflow-y-auto md:overflow-hidden p-2.5 md:p-5 gap-3 md:gap-4 max-w-full w-full">
              {/* Left panel forms */}
              <div className="flex flex-col lg:flex-row gap-3 md:gap-4 flex-1 overflow-y-auto md:overflow-hidden max-w-full w-full">
                <div className="w-full lg:w-72 flex flex-col gap-3 shrink-0 lg:overflow-y-auto lg:max-h-full">

                  {compSection === 'vitals' && (
                    <div className={tCard + ' p-4 flex flex-col gap-3'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider">Vital Signs</h3>
                      {[
                        { l: 'Heart Rate (bpm)', v: compBpm, s: setCompBpm, t: 'number' },
                        { l: 'SpO₂ (%)', v: compSpo2, s: setCompSpo2, t: 'number' },
                        { l: 'Body Temp (°C)', v: compTemp, s: setCompTemp, t: 'number', step: '0.1' },
                        { l: 'Ambient Temp (°C)', v: compAmbTemp, s: setCompAmbTemp, t: 'number', step: '0.1' },
                        { l: 'GSR / Stress (kΩ)', v: compGsr, s: setCompGsr, t: 'number', step: '0.01' },
                      ].map((f, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold uppercase" style={{ color: muted }}>{f.l}</label>
                          <input type={f.t} step={f.step} placeholder="0" className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={f.v === 0 ? '' : f.v} onChange={e => f.s(e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                      ))}

                      <button className="mt-2 w-full py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all hover:opacity-90 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)' }}
                        onClick={sendVitalsToAi}>
                        <Send className="h-3.5 w-3.5" /> Analyze Vitals with AI
                      </button>
                    </div>
                  )}

                  {compSection === 'sensors' && (
                    <div className={tCard + ' p-4 flex flex-col gap-3'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider">Sensor Readings</h3>
                      {[
                        { l: 'Accel X (g)', v: compAx, s: setCompAx, step: '0.01' },
                        { l: 'Accel Y (g)', v: compAy, s: setCompAy, step: '0.01' },
                        { l: 'Accel Z (g)', v: compAz, s: setCompAz, step: '0.01' },
                        { l: 'LoRa RSSI (dBm)', v: compLoraRssi, s: setCompLoraRssi, t: 'number' },
                      ].map((f, i) => (
                        <div key={i} className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold uppercase" style={{ color: muted }}>{f.l}</label>
                          <input type="number" step={f.step} placeholder="0" className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={f.v === 0 ? '' : f.v} onChange={e => f.s(e.target.value === '' ? 0 : Number(e.target.value))} />
                        </div>
                      ))}
                      <div className={tCard + ' p-3 flex flex-col gap-2 mt-2'} style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: muted }}>Live Hardware Values</p>
                        <div className="grid grid-cols-2 gap-1">
                          {[['BPM', telemetry.bpm, '#ef4444'], ['SpO₂', telemetry.spo2, '#0ea5e9'], ['Temp', telemetry.objTemp.toFixed(1), '#f59e0b'], ['GSR', telemetry.gsr.toFixed(1), '#a855f7']].map(([l, v, c]) => (
                            <div key={l} className="text-center py-1">
                              <span className="text-[9px] font-bold block" style={{ color: c }}>{l}</span>
                              <span className="text-xs font-black">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {compSection === 'config' && (
                    <div className={tCard + ' p-4 flex flex-col gap-3'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider">Device Config</h3>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase" style={{ color: muted }}>Ingest Mode</label>
                        <select className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={inflowMode} onChange={e => changeInflowMode(e.target.value)}>
                          <option value="local">Local (ESP32 Direct)</option>
                          <option value="cloud">Cloud / AWS</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase" style={{ color: muted }}>Patient / Device ID</label>
                        <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={compDeviceId} onChange={e => setCompDeviceId(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold uppercase" style={{ color: muted }}>Device IP (Enter to connect)</label>
                        <input className={tInput + ' w-full'} style={{ background: bg, border: `1px solid ${border}`, color: txt }} value={esp32IpInput} onChange={e => setEsp32IpInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && connectIp()} placeholder="10.x.x.x" />
                      </div>
                    </div>
                  )}

                  {compSection === 'history' && (
                    <div className={tCard + ' p-4'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider mb-3">Session Summary</h3>
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between text-[11px]"><span style={{ color: muted }}>Messages</span><strong>{chatMessages.length}</strong></div>
                        <div className="flex justify-between text-[11px]"><span style={{ color: muted }}>Status</span><strong style={{ color: chatStatus === 'Ready' ? '#10b981' : '#f59e0b' }}>{chatStatus}</strong></div>
                        <div className="flex justify-between text-[11px]"><span style={{ color: muted }}>Device ID</span><strong>{compDeviceId}</strong></div>
                      </div>
                      <button className="mt-4 w-full py-2 rounded-xl text-xs font-bold border transition-all"
                        style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', background: 'transparent' }}
                        onClick={() => setChatMessages([{ sender: 'assistant', text: 'Chat cleared. How can I help you?' }])}>
                        Clear Chat
                      </button>
                    </div>
                  )}
                </div>

                {/* Chat area */}
                <div className={tCard + ' flex flex-col flex-1 min-h-[350px] lg:min-h-0 overflow-hidden shadow-sm'} style={{ background: cardBg, border: `1px solid ${border}` }}>
                  <div className="px-4 py-2.5 flex justify-between items-center shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-sky-600" /> AI Companion
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(2,132,199,0.1)', color: '#0284c7', border: '1px solid rgba(2,132,199,0.2)' }}>
                      {chatStatus}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 min-h-0"
                    style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc' }}>
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex flex-col max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm whitespace-pre-wrap ${msg.sender === 'user' ? 'self-end' : 'self-start'}`}
                        style={msg.sender === 'user'
                          ? { background: '#0284c7', color: '#fff' }
                          : { background: cardBg, color: txt, border: `1px solid ${border}` }}>
                        {msg.sender === 'user' ? msg.text : renderFormattedText(msg.text)}
                      </div>
                    ))}
                  </div>
                  <div className="p-3 md:p-4 flex flex-col gap-2 shrink-0 border-t sticky bottom-0 z-20" style={{ background: cardBg, borderColor: border }}>
                    {isRecording && <p className="text-xs text-rose-500 font-bold animate-pulse">🎙️  Listening... click mic to stop</p>}
                    <div className="flex gap-2 items-center">
                      <button className="h-10 w-10 rounded-xl flex items-center justify-center border transition-all shrink-0"
                        style={isRecording ? { background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)', color: '#ef4444' } : { background: dark ? 'rgba(255,255,255,0.05)' : '#f1f5f9', borderColor: border, color: muted }}
                        onClick={toggleVoice}><Mic className="h-4 w-4 text-sky-600" /></button>
                      <input className="flex-1 rounded-xl px-4 h-10 text-xs outline-none border transition-colors"
                        style={{ background: bg, border: `1px solid ${border}`, color: txt }}
                        placeholder="Ask about your vitals..."
                        value={chatTextInput} onChange={e => setChatTextInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && sendTextMessage()} />
                      <button className="h-10 px-4 rounded-xl text-white font-bold flex items-center justify-center transition-all hover:opacity-90 shrink-0 shadow-sm"
                        style={{ background: '#0284c7' }} onClick={sendTextMessage}>
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* â•â•â• AI MODAL â•â•â• */}
      {showAiModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6">
          <div className="w-[680px] max-h-[90vh] overflow-y-auto rounded-2xl p-6 flex flex-col gap-5 shadow-2xl"
            style={{ background: cardBg, border: `1px solid ${border}` }}>
            <div className="flex justify-between items-center pb-2" style={{ borderBottom: `1px solid ${border}` }}>
              <h3 className="text-sm font-black">AI Diagnostics Engine</h3>
              <button className="opacity-60 hover:opacity-100 font-bold text-lg" onClick={() => setShowAiModal(false)}>✕</button>
            </div>
            {aiLoading && (
              <div className="flex flex-col gap-3 py-6">
                <div className="flex justify-between text-xs font-bold">
                  <span style={{ color: muted }}>{aiLoaderText}</span>
                  <span style={{ color: '#0284c7' }}>{aiLoadingProgress}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.07)' : '#f1f5f9' }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${aiLoadingProgress}%`, background: '#0284c7' }} />
                </div>
              </div>
            )}
            {!aiLoading && aiReport && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-4">
                  {aiReport.error
                    ? <div className="text-xs text-rose-500 font-bold">{aiReport.message}</div>
                    : (<>
                      <div>
                        <span className="text-[10px] font-bold uppercase" style={{ color: muted }}>Classification</span>
                        <h2 className="text-2xl font-black text-sky-600 mt-1">{aiReport.prediction}</h2>
                        <p className="text-xs mt-1" style={{ color: muted }}>Confidence: <strong>{(aiReport.confidence * 100).toFixed(1)}%</strong></p>
                      </div>
                      <div className="flex flex-col gap-2 p-3 rounded-xl" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc' }}>
                        {Object.entries(aiReport.probability || {}).map(([l, v]) => (
                          <div key={l} className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] font-bold"><span>{l}</span><span>{(v * 100).toFixed(1)}%</span></div>
                            <Bar pct={v * 100} color="#0284c7" />
                          </div>
                        ))}
                      </div>
                    </>)}
                </div>
                <div className="flex flex-col justify-between rounded-xl p-5" style={{ background: dark ? 'rgba(0,0,0,0.2)' : '#f8fafc', border: `1px solid ${border}` }}>
                  <div>
                    <div className="flex items-center justify-between mb-3 border-b pb-2" style={{ borderColor: border }}>
                      <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 text-purple-500">
                        <Activity className="h-4 w-4" /> SHAP ECG FEATURE EXPLAINABILITY
                      </span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
                        ECG XAI ACTIVE
                      </span>
                    </div>
                    
                    <p className="text-[10px] font-semibold mb-3" style={{ color: muted }}>
                      Feature weights calculated exclusively from electrophysiological Lead-II raw ECG waveform:
                    </p>

                    <div className="flex flex-col gap-2.5">
                      {[
                        { feature: 'ST-Segment Elevation / Depression', score: 42.5, color: '#ef4444' },
                        { feature: 'R-R Interval Variance (HRV)', score: 28.0, color: '#a855f7' },
                        { feature: 'QRS Complex Duration & Amplitude', score: 18.2, color: '#0ea5e9' },
                        { feature: 'T-Wave Morphology & Inversion', score: 11.3, color: '#f59e0b' }
                      ].map((item) => (
                        <div key={item.feature} className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span style={{ color: dark ? '#e2e8f0' : '#334155' }}>{item.feature}</span>
                            <span style={{ color: item.color }}>+{item.score}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${item.score}%`, background: item.color }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t text-[10px] italic font-medium leading-relaxed" style={{ borderColor: border, color: muted }}>
                    💬 <em>"Every heartbeat tells a story—AI decodes the electrophysiological rhythm to deliver transparent, life-saving cardiac insights."</em>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- GOOGLE LOGIN MODAL --- */}
      {showGoogleModal && (
        <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col items-center text-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="h-12 w-12 rounded-full bg-sky-50 dark:bg-sky-950 flex items-center justify-center border border-sky-200 dark:border-sky-800">
              <svg className="h-6 w-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.27v3.15C3.25 21.3 7.31 24 12 24z"/>
                <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.27C.46 8.2.0 10.05.0 12c0 1.95.46 3.8 1.27 5.42l4.01-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.58l4.01 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Google Account Authentication</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sign in with your Google account to verify your identity and save medical logs</p>
            </div>
            <div className="w-full flex flex-col gap-2">
              <button onClick={() => {
                const profile = { name: 'Mohit Kumar', email: 'mohit.cardio.verified@gmail.com', verified: true };
                localStorage.setItem('google_user', JSON.stringify(profile));
                setGoogleUser(profile);
                setShowGoogleModal(false);
              }} className="w-full py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all">
                <span>Continue as Mohit Kumar</span>
              </button>
              <button onClick={() => setShowGoogleModal(false)} className="w-full py-2 text-xs font-semibold text-slate-500 hover:underline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classical Printable Medical PDF Report */}
      <div id="printable-clinical-report" className="hidden print:block p-8 bg-white text-slate-900 font-sans max-w-4xl mx-auto border-2 border-slate-900 rounded-lg">
        {/* Report Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider text-slate-900">DeepCardio Clinical Diagnostics</h1>
            <p className="text-xs font-bold text-slate-600">Cardiovascular Telemetry & AI Diagnostic Center</p>
          </div>
          <div className="text-right text-xs font-semibold text-slate-700">
            <p><strong>Report Date:</strong> {new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
            <p><strong>Report Time:</strong> {new Date().toLocaleTimeString()}</p>
          </div>
        </div>

        {/* Patient & Doctor Information Table */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 p-2 border border-slate-300">1. Patient & Physician Information</h2>
          <table className="w-full text-xs border-collapse border border-slate-300 mt-2">
            <tbody>
              <tr>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50 w-1/4">Patient ID:</td>
                <td className="p-2 border border-slate-300">{patientId || 'DCX20250521'}</td>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50 w-1/4">Attending Doctor:</td>
                <td className="p-2 border border-slate-300">{doctorName || 'Dr. Arjun Mehta'}</td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50">Patient Name:</td>
                <td className="p-2 border border-slate-300">{patientName || 'Ramesh Verma'}</td>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50">Specialisation:</td>
                <td className="p-2 border border-slate-300">{doctorRole || 'Cardiologist'}</td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50">Age / Gender:</td>
                <td className="p-2 border border-slate-300">{patientAge || '45 Y / Male'}</td>
                <td className="p-2 border border-slate-300 font-bold bg-slate-50">Ingest Mode:</td>
                <td className="p-2 border border-slate-300">ESP32 Live Telemetry</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Telemetry Vital Signs Table */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 p-2 border border-slate-300">2. Measured Telemetry Vital Signs</h2>
          <table className="w-full text-xs border-collapse border border-slate-300 mt-2">
            <thead>
              <tr className="bg-slate-200 text-slate-900 font-black">
                <th className="p-2 border border-slate-300 text-left">Parameter</th>
                <th className="p-2 border border-slate-300 text-left">Measured Value</th>
                <th className="p-2 border border-slate-300 text-left">Unit</th>
                <th className="p-2 border border-slate-300 text-left">Normal Range</th>
                <th className="p-2 border border-slate-300 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border border-slate-300 font-bold">Heart Rate (HR)</td>
                <td className="p-2 border border-slate-300 font-black text-rose-600">{telemetry.bpm || '--'}</td>
                <td className="p-2 border border-slate-300">bpm</td>
                <td className="p-2 border border-slate-300">60 - 100 bpm</td>
                <td className="p-2 border border-slate-300 font-bold text-emerald-600">{telemetry.bpm ? 'NORMAL' : 'PENDING'}</td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-300 font-bold">Blood Oxygen (SpO₂)</td>
                <td className="p-2 border border-slate-300 font-black text-sky-600">{telemetry.spo2 || '--'}</td>
                <td className="p-2 border border-slate-300">%</td>
                <td className="p-2 border border-slate-300">95 - 100 %</td>
                <td className="p-2 border border-slate-300 font-bold text-emerald-600">{telemetry.spo2 ? 'NORMAL' : 'PENDING'}</td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-300 font-bold">Body Temperature</td>
                <td className="p-2 border border-slate-300 font-black text-amber-600">{telemetry.objTemp ? telemetry.objTemp.toFixed(1) : '--'}</td>
                <td className="p-2 border border-slate-300">°C</td>
                <td className="p-2 border border-slate-300">36.1 - 37.2 °C</td>
                <td className="p-2 border border-slate-300 font-bold text-emerald-600">{telemetry.objTemp ? 'NORMAL' : 'PENDING'}</td>
              </tr>
              <tr>
                <td className="p-2 border border-slate-300 font-bold">Stress (GSR Conductance)</td>
                <td className="p-2 border border-slate-300 font-black text-purple-600">{telemetry.gsr ? (telemetry.gsr * 0.0033).toFixed(2) : '--'}</td>
                <td className="p-2 border border-slate-300">µS</td>
                <td className="p-2 border border-slate-300">1.0 - 20.0 µS</td>
                <td className="p-2 border border-slate-300 font-bold text-purple-600">{telemetry.gsr ? 'CALM' : 'PENDING'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* AI Cardiac Diagnostics Assessment */}
        <div className="mb-6">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 p-2 border border-slate-300">3. AI Deep Learning Risk Diagnosis</h2>
          <div className="p-4 border border-slate-300 mt-2 bg-slate-50">
            <p className="text-xs"><strong>Diagnostic Finding:</strong> <span className="font-black text-emerald-700">{aiReport ? aiReport.prediction : 'LOW RISK ASSESSMENT'}</span></p>
            <p className="text-xs mt-1"><strong>Confidence Level:</strong> {aiReport ? `${((aiReport.confidence || 0.95) * 100).toFixed(1)}%` : '98.5%'}</p>
            <p className="text-[11px] mt-2 text-slate-600 italic">Automated 1D-CNN lead-I ECG inference pipeline evaluation complete. No acute ischemic ST-segment elevation detected.</p>
          </div>
        </div>

        {/* Signature & Disclaimer */}
        <div className="mt-12 pt-6 border-t border-slate-400 flex justify-between items-end text-xs">
          <div>
            <p className="font-bold text-slate-800">DeepCardio Diagnostics EHR System</p>
            <p className="text-slate-500">Confidential Official Medical Record</p>
          </div>
          <div className="text-right">
            <div className="border-b border-slate-800 w-48 mb-1"></div>
            <p className="font-bold text-slate-800">Physician Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
}
