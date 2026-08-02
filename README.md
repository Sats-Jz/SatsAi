# SatsAi - Desktop AI Assistant

An Electron-based Windows desktop assistant with bilingual voice interaction, voiceprint verification, and natural language computer control.

## Features

- **Voice Wake** - Custom wake word, always listening
- **Voiceprint Security** - Local speaker verification, responds only to you
- **Desktop Control** - Voice-controlled apps, input, system settings
- **AI Dialogue** - Natural language understanding via Claude/GPT
- **MCP Extension** - Expandable via Model Context Protocol
- **Animated Companion** - Cute floating desktop mascot UI

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 28 |
| Frontend | React 18 + TypeScript + Zustand |
| Wake Word | Porcupine (Picovoice) |
| VAD | Silero VAD |
| Speaker ID | Speaker Embedding |
| STT | Whisper API |
| LLM | Claude API / OpenAI API |
| TTS | Microsoft Edge TTS |
| Storage | better-sqlite3 (encrypted) |
| Extensions | MCP (Model Context Protocol) |

## Development

### Prerequisites

- Node.js 18+
- Windows 10/11
- Picovoice Access Key
- Claude or OpenAI API Key

### Setup

```bash
git clone <repo-url>
cd sats-ai
npm install
```

### Environment Variables

```bash
export SATSAI_STT_API_KEY="your-openai-key"
export SATSAI_LLM_API_KEY="your-claude-or-openai-key"
export SATSAI_LLM_PROVIDER="claude"
export SATSAI_PICOVOICE_KEY="your-picovoice-key"
```

### Run in Development

```bash
npm run electron:dev
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
│   ├── components/    # UI components
│   ├── hooks/         # Custom hooks
│   └── stores/        # Zustand state
├── engine/            # Core engine
│   ├── hotword/       # Wake word detection
│   ├── speaker/       # Voiceprint
│   ├── vad/           # Voice activity detection
│   ├── stt/           # Speech-to-text
│   ├── llm/           # Large language model
│   ├── tts/           # Text-to-speech
│   ├── actions/       # Desktop control
│   ├── mcp/           # MCP extensions
│   └── dialog/        # State machine
└── resources/         # Models and assets
```

## License

MIT
