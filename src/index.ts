import {
  ClawbhouseToolHandlerBase,
  registerClawbhouseChannel,
  registerClawbhouseTools,
  TOOL_SCHEMAS,
} from "@clawbhouse/plugin-core";
import { GeminiAgentTtsProvider, GeminiBatchTtsProvider } from "./gemini-providers.js";
import type { AgentVoiceConfig, GeminiVoiceConfig } from "./gemini-voice.js";

export type Mode = "tts" | "agent";

interface ClawbhouseGeminiPluginConfig {
  serverUrl?: string;
  geminiApiKey?: string;
  voiceName?: string;
  mode?: Mode;
  systemInstruction?: string;
}

export class ClawbhouseGeminiToolHandler extends ClawbhouseToolHandlerBase {
  constructor(config: {
    serverUrl?: string;
    gemini: GeminiVoiceConfig;
    mode?: Mode;
    systemInstruction?: string;
  }) {
    const mode = config.mode ?? "tts";
    super({
      serverUrl: config.serverUrl,
      ttsProvider: mode === "agent"
        ? () => GeminiAgentTtsProvider.create({
            ...config.gemini,
            systemInstruction: config.systemInstruction,
          } satisfies AgentVoiceConfig)
        : () => new GeminiBatchTtsProvider(config.gemini),
    });
  }
}

let sharedHandler: ClawbhouseGeminiToolHandler | null = null;

const clawbhouseGeminiPlugin = {
  id: "clawbhouse-gemini",
  name: "Clawbhouse (Gemini)",
  description: "Voice chatrooms for AI agents — powered by Google Gemini. Supports TTS mode (verbatim speech) and agent mode (Gemini Live as brain + voice).",

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
        mode:
          raw.mode === "tts" || raw.mode === "agent" ? raw.mode : undefined,
        systemInstruction: typeof raw.systemInstruction === "string" ? raw.systemInstruction : undefined,
      };
    },
    uiHints: {
      geminiApiKey: { label: "Gemini API Key", sensitive: true, placeholder: "AIza..." },
      voiceName: { label: "Voice", help: "Pick a Gemini TTS voice for your agent." },
      mode: {
        label: "Mode",
        help: '"tts" reads text verbatim (default). "agent" uses Gemini Live as brain + voice — generates natural speech from prompts and returns a transcript.',
      },
      systemInstruction: {
        label: "System Instruction",
        help: "System instruction for Gemini Live in agent mode. Defines the voice personality.",
      },
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
        mode: config.mode,
        systemInstruction: config.systemInstruction,
      });

      sharedHandler.init().catch((err) => {
        api.logger.error(`[clawbhouse-gemini] Init failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    registerClawbhouseChannel(api.registerChannel.bind(api), sharedHandler);

    registerClawbhouseTools(api.registerTool.bind(api), sharedHandler);

    api.logger.info(`[clawbhouse-gemini] Registered channel + ${TOOL_SCHEMAS.length} tools (mode: ${config.mode ?? "tts"})`);
  },
};

export default clawbhouseGeminiPlugin;

export * from "@clawbhouse/plugin-core";

// Gemini-specific exports
export { GeminiAgentTtsProvider, GeminiBatchTtsProvider } from "./gemini-providers.js";
export {
  textToSpeech,
  textToSpeechSafe,
  AgentLiveVoiceSession,
  AUDIO_SAMPLE_RATE,
} from "./gemini-voice.js";
export type { GeminiVoiceConfig, AgentVoiceConfig } from "./gemini-voice.js";
