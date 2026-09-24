# J.A.R.V.I.S. 2.0 — Kali Ops AI Voice Assistant

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdarshanhr429-collab%2FJarvis-2.0)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdarshanhr429-collab%2FJarvis-2.0)

> **J.A.R.V.I.S.** (*Just A Rather Very Intelligent System*) is a multi-modal desktop and web-based AI assistant. Powered by Google Gemini intelligence and styled as a futuristic **Kali Linux Cyber-Ops HUD**, JARVIS integrates voice interaction, terminal telemetry, and zero-G 3D planetary exploration.

---

## 🌟 Features

- 🎙️ **Voice Interaction & Wake-Word**: Hands-free conversation using the wake-word `"JARVIS"` via Web Speech API (in browser) or `sounddevice` + `pyttsx3` (on desktop).
- 🧠 **Dual Neural Uplink**: Direct Google Gemini API integration with conversation memory, system automation, and spoken audio responses.
- 🐉 **Kali Linux Cyber-Ops Terminal**: High-tech HUD featuring Matrix digital rain canvas, interactive audio visualizer, real-time clock, telemetry gauges, and theme switching.
- 🌍 **3D Planetary Orbital Deck**: Built-in interactive 3D Earth planetarium with Keplerian orbits, anti-gravity physics, and scientific telemetry pins.
- ☁️ **Vercel Cloud Ready**: Out-of-the-box cloud deployment support with serverless API routes (`/api/status`, `/api/command`, `/api/config`).

---

## 🚀 Quick Start (Local Run)

### 1. Requirements
Ensure Python 3.9+ is installed. Install the Python dependencies:
```bash
pip install -r requirements.txt
```

### 2. Configure API Key
Add your Google Gemini API key to `config.json` or configure it directly in the web HUD:
```json
{
    "gemini_api_key": "YOUR_GEMINI_API_KEY",
    "wake_word": "jarvis",
    "server_port": 8742,
    "model_name": "gemini-3.6-flash"
}
```

### 3. Launch Desktop Assistant
Run the launcher:
```bash
python jarvis_desktop.py
```
*(Or double-click `jarvis.bat` on Windows)*

---

## ☁️ Deploy to Vercel

1. Import this repository into **[Vercel](https://vercel.com)**.
2. Under **Project Settings > Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key
3. Deploy! Vercel will automatically serve the static web deck and serverless functions under `/api`.

---

## 📂 Project Structure

```
JARVIS 2/
├── api/
│   ├── command.js         # Vercel serverless AI command processor
│   ├── config.js          # Cloud configuration endpoint
│   ├── status.js          # System telemetry & status endpoint
│   ├── open_app.js        # App execution handler
│   └── voice_feed.js      # Voice events feed
├── ai_brain.py            # Python Gemini AI Brain & tool runner
├── voice_engine.py        # Python microphone capture & TTS engine
├── jarvis_desktop.py      # Desktop GUI launcher & HTTP bridge
├── earth_landing_page.html# 3D interactive Earth deck
├── anti_gravity_globe.html# Anti-gravity planetary observation
├── index.html             # Kali Ops Cyber HUD
├── style.css              # Cyber-ops styling & Matrix effects
├── script.js              # HUD frontend controller & speech bridge
├── config.json            # Central configuration file
├── vercel.json            # Vercel deployment configuration
└── package.json           # Node/Vercel manifest
```

---

## 📜 License
MIT License. Created by Darshan H R.
>>>>>>> 16bf52e (Initial commit: JARVIS 2.0 with Vercel deployment configuration)
