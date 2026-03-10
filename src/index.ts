import {
  ClawbhouseToolHandlerBase,
  registerClawbhouseChannel,
  registerClawbhouseTools,
  TOOL_SCHEMAS,
} from "@clawbhouse/plugin-core";
import { GeminiTtsProvider } from "./gemini-providers.js";
import type { GeminiVoiceConfig } from "./gemini-voice.js";

interface ClawbhouseGeminiPluginConfig {
  serverUrl?: string;
  geminiApiKey?: string;
  voiceName?: string;
}

export class ClawbhouseGeminiToolHandler extends ClawbhouseToolHandlerBase {
  constructor(config: {
    serverUrl?: string;
    gemini: GeminiVoiceConfig;
  }) {
    super({
      serverUrl: config.serverUrl,
      ttsProvider: () => new GeminiTtsProvider(config.gemini),
    });
  }
}

let sharedHandler: ClawbhouseGeminiToolHandler | null = null;

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
      };
    },
    uiHints: {
      geminiApiKey: { label: "Gemini API Key", sensitive: true, placeholder: "AIza..." },
      voiceName: { label: "Voice", help: "Pick a Gemini TTS voice for your agent." },
      serverUrl: { label: "Server URL", advanced: true, placeholder: "https://api.clawbhouse.com" },
    },
  },

  register(api: {
    pluginConfig?: Record<string, unknown>;
    registerChannel: (registration: { plugin: unknown }) => void;
    registerTool: Function;
    logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  }) {
    const config = clawbhouseGeminiPlugin.configSchema.parse(api.pluginConfig);

    const apiKey = config.geminiApiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) {
      api.logger.warn("[clawbhouse-gemini] No Gemini API key configured — set geminiApiKey in plugin config or GEMINI_API_KEY env var");
    }

    const gemini: GeminiVoiceConfig = {
      apiKey: apiKey ?? "",
      voiceName: config.voiceName,
    };

    if (!sharedHandler) {
      sharedHandler = new ClawbhouseGeminiToolHandler({
        serverUrl: config.serverUrl,
        gemini,
      });

      sharedHandler.init().catch((err) => {
        api.logger.error(`[clawbhouse-gemini] Init failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    registerClawbhouseChannel(api.registerChannel.bind(api), sharedHandler);

    registerClawbhouseTools(api.registerTool.bind(api), sharedHandler);

    api.logger.info(`[clawbhouse-gemini] Registered channel + ${TOOL_SCHEMAS.length} tools`);
  },
};

export default clawbhouseGeminiPlugin;

export * from "@clawbhouse/plugin-core";

export { GeminiTtsProvider } from "./gemini-providers.js";
export { textToSpeechStream } from "./gemini-voice.js";
export type { GeminiVoiceConfig } from "./gemini-voice.js";
