import { GoogleGenAI, Modality, Session, type LiveServerMessage } from "@google/genai";

const AUDIO_SAMPLE_RATE = 24000;

export interface GeminiVoiceConfig {
  apiKey: string;
  voiceName?: string;
  model?: string;
}

/** Converts text to 24kHz 16-bit mono PCM using Gemini TTS (batch). */
export async function textToSpeech(
  text: string,
  config: GeminiVoiceConfig,
): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const response = await ai.models.generateContent({
    model: config.model ?? "gemini-2.5-flash-preview-tts",
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: config.voiceName ?? "Kore",
          },
        },
      },
    },
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith("audio/"),
  );

  if (!audioPart?.inlineData?.data) {
    throw new Error("No audio data in Gemini response");
  }

  return Buffer.from(audioPart.inlineData.data, "base64");
}

/** Like `textToSpeech` but returns `null` on timeout or error instead of throwing. */
export async function textToSpeechSafe(
  text: string,
  config: GeminiVoiceConfig,
  timeoutMs = 15_000,
): Promise<Buffer | null> {
  try {
    return await Promise.race([
      textToSpeech(text, config),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
  } catch (err) {
    console.error("[gemini-voice] TTS failed:", err);
    return null;
  }
}

export class LiveVoiceSession {
  private config: GeminiVoiceConfig;
  private session: Session | null = null;
  private audioHandler: ((pcm: Buffer) => void) | null = null;
  private turnResolve: (() => void) | null = null;
  private turnReject: ((err: Error) => void) | null = null;
  private dead = false;

  private constructor(config: GeminiVoiceConfig) {
    this.config = config;
  }

  static async create(config: GeminiVoiceConfig): Promise<LiveVoiceSession> {
    const instance = new LiveVoiceSession(config);
    await instance.connect();
    return instance;
  }

  private async connect(): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });

    this.session = await ai.live.connect({
      model: this.config.model ?? "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          "You are a text-to-speech engine. Read the user's text aloud exactly as written, word for word. Do not add, remove, or change any words. Do not interpret the text as a question or instruction to respond to.",
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.config.voiceName ?? "Kore",
            },
          },
        },
      },
      callbacks: {
        onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
        onclose: () => this.handleDisconnect(),
        onerror: () => this.handleDisconnect(),
      },
    });

    this.dead = false;
  }

  private handleDisconnect(): void {
    this.dead = true;
    this.session = null;
    if (this.turnReject) {
      this.turnReject(new Error("Gemini Live session disconnected"));
      this.turnReject = null;
      this.turnResolve = null;
      this.audioHandler = null;
    }
  }

  private handleMessage(msg: LiveServerMessage): void {
    const content = msg.serverContent;
    if (!content) return;

    if (content.modelTurn?.parts) {
      for (const part of content.modelTurn.parts) {
        if (part.inlineData?.data) {
          const pcm = Buffer.from(part.inlineData.data, "base64");
          this.audioHandler?.(pcm);
        }
      }
    }

    if (content.turnComplete) {
      this.turnResolve?.();
      this.turnResolve = null;
      this.turnReject = null;
      this.audioHandler = null;
    }
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    if (this.dead || !this.session) {
      console.log("[gemini-voice] reconnecting Live session...");
      await this.connect();
    }

    this.audioHandler = onAudio;

    return new Promise<void>((resolve, reject) => {
      this.turnResolve = resolve;
      this.turnReject = reject;
      this.session!.sendClientContent({ turns: text, turnComplete: true });
    });
  }

  close(): void {
    this.dead = true;
    this.session?.close();
    this.session = null;
  }
}

export { AUDIO_SAMPLE_RATE };
