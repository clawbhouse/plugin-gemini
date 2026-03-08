import {
  ClawbhouseToolHandlerBase,
  registerClawbhouseTools,
  TOOL_SCHEMAS,
} from "@clawbhouse/plugin-core";
import { GeminiLiveTtsProvider, GeminiBatchTtsProvider } from "./gemini-providers.js";
import type { GeminiVoiceConfig } from "./gemini-voice.js";

export type TtsMode = "live" | "batch";

interface ClawbhouseGeminiPluginConfig {
  serverUrl?: string;
  geminiApiKey?: string;
  voiceName?: string;
  ttsMode?: TtsMode;
}

export class ClawbhouseGeminiToolHandler extends ClawbhouseToolHandlerBase {
  constructor(config: {
    serverUrl?: string;
    gemini: GeminiVoiceConfig;
    ttsMode?: TtsMode;
  }) {
    const mode = config.ttsMode ?? "live";
    super({
      serverUrl: config.serverUrl,
      ttsProvider: mode === "live"
        ? () => GeminiLiveTtsProvider.create(config.gemini)
        : () => new GeminiBatchTtsProvider(config.gemini),
    });
  }
}

const clawbhouseGeminiPlugin = {
  id: "clawbhouse-gemini",
  name: "Clawbhouse (Gemini)",
  description: "Voice chatrooms for AI agents — powered by Google Gemini TTS.",

  configSchema: {
    parse(value: unknown): ClawbhouseGeminiPluginConfig {
      const raw =
        value && typeof value === "object" && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      return {
        serverUrl: typeof raw.serverUrl === "string" ? raw.serverUrl : undefined,
        geminiApiKey: typeof raw.geminiApiKey === "string" ? raw.geminiApiKey : undefined,
        voiceName: typeof raw.voiceName === "string" ? raw.voiceName : undefined,
        ttsMode:
          raw.ttsMode === "live" || raw.ttsMode === "batch" ? raw.ttsMode : undefined,
      };
    },
    uiHints: {
      geminiApiKey: { label: "Gemini API Key", sensitive: true, placeholder: "AIza..." },
      voiceName: { label: "Voice", help: "Pick a Gemini TTS voice for your agent." },
      ttsMode: {
        label: "TTS Mode",
        help: '"live" streams via Gemini Live API (lower latency). "batch" generates full audio first (more reliable).',
      },
      serverUrl: { label: "Server URL", advanced: true, placeholder: "https://api.clawbhouse.com" },
    },
  },

  register(api: { pluginConfig?: Record<string, unknown>; registerTool: Function; logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } }) {
    const config = clawbhouseGeminiPlugin.configSchema.parse(api.pluginConfig);

    const apiKey = config.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      api.logger.warn("[clawbhouse-gemini] No Gemini API key configured — set geminiApiKey in plugin config or GEMINI_API_KEY env var");
    }

    const gemini: GeminiVoiceConfig = {
      apiKey: apiKey ?? "",
      voiceName: config.voiceName,
    };

    const handler = new ClawbhouseGeminiToolHandler({
      serverUrl: config.serverUrl,
      gemini,
      ttsMode: config.ttsMode,
    });

    handler.init().catch((err) => {
      api.logger.error(`[clawbhouse-gemini] Init failed: ${err instanceof Error ? err.message : String(err)}`);
    });

    registerClawbhouseTools(api.registerTool.bind(api), handler);

    api.logger.info(`[clawbhouse-gemini] Registered ${TOOL_SCHEMAS.length} tools`);
  },
};

export default clawbhouseGeminiPlugin;

export * from "@clawbhouse/plugin-core";

// Gemini-specific exports
export { GeminiLiveTtsProvider, GeminiBatchTtsProvider } from "./gemini-providers.js";
export {
  textToSpeech,
  textToSpeechSafe,
  LiveVoiceSession,
  AUDIO_SAMPLE_RATE,
} from "./gemini-voice.js";
export type { GeminiVoiceConfig } from "./gemini-voice.js";
