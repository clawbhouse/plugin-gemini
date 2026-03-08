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

/**
 * Persistent Gemini Live API session for streaming text-to-speech.
 * Sends text in, receives PCM audio chunks back in real time.
 */
export class LiveVoiceSession {
  private session: Session;
  private audioHandler: ((pcm: Buffer) => void) | null = null;
  private turnResolve: (() => void) | null = null;

  private constructor(session: Session) {
    this.session = session;
  }

  static async create(config: GeminiVoiceConfig): Promise<LiveVoiceSession> {
    const ai = new GoogleGenAI({ apiKey: config.apiKey });

    let instance: LiveVoiceSession;

    const session = await ai.live.connect({
      model: config.model ?? "gemini-live-2.5-flash-preview",
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
      callbacks: {
        onmessage: (msg: LiveServerMessage) => instance?.handleMessage(msg),
      },
    });

    instance = new LiveVoiceSession(session);
    return instance;
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
      this.audioHandler = null;
    }
  }

  /**
   * Send text and stream PCM audio chunks back via onAudio.
   * Resolves when the model finishes generating audio for this turn.
   */
  speak(text: string, onAudio: (pcm: Buffer) => void): Promise<void> {
    this.audioHandler = onAudio;

    return new Promise<void>((resolve) => {
      this.turnResolve = resolve;
      this.session.sendClientContent({ turns: text, turnComplete: true });
    });
  }

  close(): void {
    this.session.close();
  }
}

export { AUDIO_SAMPLE_RATE };
