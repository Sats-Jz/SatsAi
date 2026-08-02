# SatsAi - Desktop AI Assistant

An Electron-based Windows desktop assistant with bilingual voice interaction, voiceprint verification, and natural language computer control.

## Features

- **Voice Wake** — Free & open-source (OpenWakeWord + ONNX), no API key needed
- **Voiceprint Security** — Local speaker verification, responds only to you
- **Desktop Control** — Voice-controlled apps, input, system settings
- **AI Dialogue** — DeepSeek V4 (or Qwen/OpenAI/Claude)
- **MCP Extension** — Expandable via Model Context Protocol
- **Animated Companion** — Cute floating desktop mascot UI

## Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Desktop | Electron 28 | Free |
| Frontend | React 18 + TypeScript + Zustand | Free |
| Wake Word | OpenWakeWord (ONNX Runtime Web) | **Free** |
| VAD | Silero VAD (RMS-based) | Free |
| Speaker ID | Speaker Embedding (local ONNX) | Free |
| STT | Qwen Paraformer / OpenAI Whisper | API key |
| LLM | DeepSeek V4 / Qwen / OpenAI / Claude | API key |
| TTS | Microsoft Edge TTS | **Free** |
| Storage | better-sqlite3 (encrypted) | Free |
| Extensions | MCP (Model Context Protocol) | Free |

## Development

### Prerequisites

- Node.js 18+
- Windows 10/11
- DeepSeek API Key (or Qwen/OpenAI/Claude)
- Qwen DashScope API Key (or OpenAI for STT)

### Setup

```bash
git clone https://github.com/Sats-Jz/SatsAi
cd sats-ai
npm install
```

### Environment Variables

Create a `.env` file:

```bash
# LLM: DeepSeek (recommended, cheapest)
SATSAI_LLM_PROVIDER=deepseek
SATSAI_LLM_API_KEY=sk-your-deepseek-key

# STT: Qwen DashScope
SATSAI_STT_PROVIDER=qwen
SATSAI_STT_API_KEY=sk-your-qwen-key
```

### Run in Development

```bash
npm run electron:dev
```

On first run, OpenWakeWord will auto-download ONNX model files (~10 MB) from CDN. Subsequent runs use cached models.

### Run Tests

```bash
npm test
```

### Build

```bash
npm run electron:build
```

## Project Structure

```
sats-ai/
├── electron/          # Electron main process
├── src/               # React renderer
│   ├── components/    # UI components (FloatingBall, DialogBubble, Settings, Enrollment)
│   ├── hooks/         # Custom hooks (useDrag, useWakeWord)
│   └── stores/        # Zustand state
├── engine/            # Core engine (Node.js)
│   ├── dialog/        # State machine
│   ├── speaker/       # Voiceprint enrollment & verification
│   ├── vad/           # Voice activity detection
│   ├── stt/           # Speech-to-text (Qwen/Whisper)
│   ├── llm/           # LLM client (DeepSeek/Qwen/OpenAI/Claude)
│   ├── tts/           # Text-to-speech (Edge TTS)
│   ├── actions/       # Desktop control (app/input/system/web)
│   ├── mcp/           # MCP extensions
│   └── store.ts       # Encrypted local storage
└── resources/         # Static assets
```

## Wake Word

Uses **OpenWakeWord** (free, open-source). Default wake word: **"Hey Jarvis"**.

To change the wake word, edit `src/components/FloatingBall.tsx`:
```ts
useWakeWord({
  keywords: ['hey_jarvis'],  // Change to any built-in keyword
  // ...
})
```

Built-in keywords: `hey_jarvis`, `alexa`, `hey_mycroft`, `timer`, `weather`, `hey_rhasspy`, `ok_nabu`.

Custom wake word training requires the Python `openwakeword` library.

## License

MIT
