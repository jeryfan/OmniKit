# OmniKit

A desktop LLM API gateway that translates between any provider's API format. Built with Tauri, Rust, and React.

## Features

- **Any-to-Any Format Conversion** — Translate requests/responses between OpenAI, Anthropic, Gemini, Moonshot and more
- **Real-time Streaming** — Zero-buffer chunk-by-chunk format conversion for SSE streams
- **Channel Management** — Configure multiple providers with priority, weight-based load balancing, and circuit breaking
- **Model Mapping** — Map public model names to actual upstream models across providers
- **Token Management** — Generate API keys with quota limits for external access
- **Request Logging** — Full request/response inspection for debugging
- **Usage Analytics** — Token usage, request counts, and cost estimation dashboards
- **Desktop App** — Powered by Tauri, runs locally with zero deployment overhead

## Supported Providers

| Provider | Formats |
|----------|---------|
| OpenAI | Chat Completions, Responses API |
| Anthropic | Messages API |
| Google Gemini | Gemini API |
| Moonshot (Kimi) | Moonshot API |

## Install

### Homebrew (macOS)

```bash
brew tap jeryfan/omnikit
brew install omnikit
```

### Download

Download the latest release from [GitHub Releases](https://github.com/jeryfan/omnikit/releases).

## Development

### Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/)

### Setup

```bash
# Install frontend dependencies
pnpm install

# Run in development mode
pnpm tauri dev
```

### Build

```bash
pnpm tauri build
```

## Architecture

OmniKit uses a **modality-driven architecture** with an Intermediate Representation (IR) at its core:

```
Input (any format) → Decoder → IR → Encoder → Output (any format)
```

Each modality (chat, image, tts, etc.) has its own IR and codec implementations. Adding a new provider means implementing a `Decoder` and `Encoder` trait for the target modality.

See [Design Document](docs/plans/2025-02-11-omnikit-design.md) for full details.

## License

[Apache License 2.0](LICENSE)
