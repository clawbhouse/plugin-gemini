import { GoogleGenAI, Modality, Session, type LiveServerMessage } from "@google/genai";
import type { SpeakResult } from "@clawbhouse/plugin-core";

const AUDIO_SAMPLE_RATE = 24000;

export interface GeminiVoiceConfig {
  apiKey: string;
  voiceName?: string;
  model?: string;
}

export interface AgentVoiceConfig extends GeminiVoiceConfig {
  systemInstruction?: string;
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

export class AgentLiveVoiceSession {
  private config: AgentVoiceConfig;
  private session: Session | null = null;
  private audioHandler: ((pcm: Buffer) => void) | null = null;
  private turnResolve: ((result: SpeakResult) => void) | null = null;
  private turnReject: ((err: Error) => void) | null = null;
  private transcriptChunks: string[] = [];
  private dead = false;

  private constructor(config: AgentVoiceConfig) {
    this.config = config;
  }

  static async create(config: AgentVoiceConfig): Promise<AgentLiveVoiceSession> {
    const instance = new AgentLiveVoiceSession(config);
    await instance.connect();
    return instance;
  }

  private async connect(): Promise<void> {
    const ai = new GoogleGenAI({ apiKey: this.config.apiKey });

    this.session = await ai.live.connect({
      model: this.config.model ?? "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        systemInstruction: this.config.systemInstruction ??
          "You are a natural conversational voice in a live audio chatroom. Speak naturally and engagingly. Keep responses concise — 2-3 sentences unless the topic warrants more.",
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
      this.transcriptChunks = [];
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

    if ((content as any).outputTranscription?.text) {
      this.transcriptChunks.push((content as any).outputTranscription.text);
    }

    if (content.turnComplete) {
      const transcript = this.transcriptChunks.join("").trim();
      this.transcriptChunks = [];
      this.turnResolve?.({ transcript: transcript || undefined });
      this.turnResolve = null;
      this.turnReject = null;
      this.audioHandler = null;
    }
  }

  async speak(text: string, onAudio: (pcm: Buffer) => void): Promise<SpeakResult> {
    if (this.dead || !this.session) {
      console.log("[gemini-voice] reconnecting Agent Live session...");
      await this.connect();
    }

    this.audioHandler = onAudio;
    this.transcriptChunks = [];

    return new Promise<SpeakResult>((resolve, reject) => {
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
