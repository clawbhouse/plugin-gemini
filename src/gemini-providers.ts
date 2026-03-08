import type { TtsProvider } from "@clawbhouse/plugin-core";
import { splitTextForTTS } from "@clawbhouse/plugin-core";
import { LiveVoiceSession, textToSpeechSafe, type GeminiVoiceConfig } from "./gemini-voice.js";

/** Streaming TTS via Gemini Live API — low latency, real-time audio chunks. */
export class GeminiLiveTtsProvider implements TtsProvider {
  private session: LiveVoiceSession;

  private constructor(session: LiveVoiceSession) {
    this.session = session;
  }

  static async create(config: GeminiVoiceConfig): Promise<GeminiLiveTtsProvider> {
    const session = await LiveVoiceSession.create(config);
    return new GeminiLiveTtsProvider(session);
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    await this.session.speak(text, onAudio);
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
