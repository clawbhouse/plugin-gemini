import type { TtsProvider } from "@clawbhouse/plugin-core";
import { textToSpeechStream, type GeminiVoiceConfig } from "./gemini-voice.js";

export class GeminiTtsProvider implements TtsProvider {
  private config: GeminiVoiceConfig;

  constructor(config: GeminiVoiceConfig) {
    this.config = config;
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    await textToSpeechStream(text, this.config, onAudio);
  }
}
