import type { SpeakResult, TtsProvider } from "@clawbhouse/plugin-core";
import { splitTextForTTS } from "@clawbhouse/plugin-core";
import { AgentLiveVoiceSession, textToSpeechSafe, type AgentVoiceConfig, type GeminiVoiceConfig } from "./gemini-voice.js";

/** Agent mode — Gemini Live as brain + voice. Generates natural speech from prompts and returns a transcript. */
export class GeminiAgentTtsProvider implements TtsProvider {
  private session: AgentLiveVoiceSession;

  private constructor(session: AgentLiveVoiceSession) {
    this.session = session;
  }

  static async create(config: AgentVoiceConfig): Promise<GeminiAgentTtsProvider> {
    const session = await AgentLiveVoiceSession.create(config);
    return new GeminiAgentTtsProvider(session);
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<SpeakResult> {
    return this.session.speak(text, onAudio);
  }

  destroy(): void {
    this.session.close();
  }
}

/** Batch TTS via Gemini generateContent API — higher latency, full audio per chunk. */
export class GeminiBatchTtsProvider implements TtsProvider {
  private config: GeminiVoiceConfig;

  constructor(config: GeminiVoiceConfig) {
    this.config = config;
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    for (const chunk of splitTextForTTS(text)) {
      const pcm = await textToSpeechSafe(chunk, this.config);
      if (!pcm) throw new Error("Gemini TTS failed");
      onAudio(pcm);
    }
  }
}
