# 🧠 DSA Dopamine Engine

> A Chrome Extension + FastAPI backend that gives you **real-world context, AI insights, and dopamine hits** every time you solve a LeetCode problem — powered by **NVIDIA NIM** (Llama 3.3 + Nemotron 70B).

---

## 🗂️ Project Structure

```
DsaBittle/
├── extension/                  ← Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── content.js              ← Injected into LeetCode DOM
│   ├── background.js           ← Service worker brain
│   ├── popup.html / popup.js   ← Mini dashboard
│   ├── styles.css              ← All UI styles
│   ├── icons/                  ← 16 / 48 / 128px icons
│   └── utils/
│       ├── storage.js          ← Chrome storage helpers
│       └── analytics.js        ← Weakness detection logic
└── backend/                    ← Python FastAPI server
    ├── main.py                 ← FastAPI app + routes
    ├── ai_engine.py            ← NVIDIA NIM prompt logic
    ├── models.py               ← Pydantic schemas
    ├── requirements.txt
    ├── .env                    ← API keys (never commit)
    └── start.ps1               ← One-click startup script
```

---

## ⚡ Phase 1 Quick Start

### Step 1 — Get your NVIDIA NIM API Key

1. Go to **[build.nvidia.com](https://build.nvidia.com/)**
2. Sign in (free account)
3. Click any model → **"Get API Key"**
4. Copy the key (starts with `nvapi-...`)

### Step 2 — Configure the backend

```powershell
# Open the .env file and paste your key
cd E:\GENAI\DsaBittle\backend
notepad .env
```

Replace `nvapi-your-key-here` with your actual key.

### Step 3 — Start the backend

```powershell
cd E:\GENAI\DsaBittle\backend
.\start.ps1
```

You should see:
```
🚀 Starting FastAPI on http://localhost:8000
   API Docs: http://localhost:8000/docs
```

Verify it's working: open **http://localhost:8000/health** in your browser.

### Step 4 — Load the Chrome Extension

1. Open Chrome → go to `chrome://extensions/`
2. Enable **"Developer mode"** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `E:\GENAI\DsaBittle\extension` folder
5. The 🧠 icon appears in your toolbar

### Step 5 — Test it

1. Go to any LeetCode problem (e.g. `leetcode.com/problems/two-sum/`)
2. The floating panel appears on the right → AI insights load within ~2 seconds
3. Solve the problem → click **✅ Mark Solved**
4. Click the 🧠 icon in Chrome toolbar → see your stats popup

---

## 🤖 AI Models (NVIDIA NIM)

| Use Case | Model | Why |
|---|---|---|
| Per-problem analysis | `meta/llama-3.3-70b-instruct` | Fast, cheap, handles JSON reliably |
| Deep dive + coaching | `nvidia/llama-3.1-nemotron-70b-instruct` | Most powerful reasoning on NIM |

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Check if backend is running |
| POST | `/analyze-problem` | Get AI insights for a problem |
| POST | `/deeper-explanation` | Deep dive: complexity, edge cases, system design |
| POST | `/daily-report` | Personalized AI coaching report |

Interactive docs: **http://localhost:8000/docs**

---

## 📊 Data Stored Locally

All data lives in `chrome.storage.local` — completely offline, no account needed.

| Key | Contents |
|---|---|
| `stats` | Total solved, streak, XP, level, per-tag analytics, daily heatmap |
| `history` | Last 500 problems solved (title, difficulty, time, tags, pattern) |
| `activeProblem` | Currently open problem (for time tracking) |

---

## 🚀 Build Phases

| Phase | What You Build | Status |
|---|---|---|
| Phase 1 | Core extension + FastAPI backend | ✅ **Done** |
| Phase 2 | Full popup dashboard + tag analytics | 🔜 Next |
| Phase 3 | Firebase sync + Google Auth | 🔜 |
| Phase 4 | React dashboard with radar chart + heatmap | 🔜 |

---

## 🛠️ Development Notes

- **Backend uses venv** — always run via `start.ps1` or activate venv first
- **Extension reloading** — after editing JS files, go to `chrome://extensions/` → click the refresh icon next to DSA Dopamine Engine
- **CORS** — backend already allows `chrome-extension://*` via CORSMiddleware
- **Offline fallback** — if backend is offline, `background.js` returns pattern-matched fallback insights so the panel never breaks

---

## 🔐 Environment Variables

| Variable | Where to Get |
|---|---|
| `NVIDIA_NIM_API_KEY` | [build.nvidia.com](https://build.nvidia.com/) |

---

*Built with FastAPI + NVIDIA NIM + Chrome Manifest V3*
