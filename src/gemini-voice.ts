import { GoogleGenAI, Modality } from "@google/genai";

export interface GeminiVoiceConfig {
  apiKey: string;
  voiceName?: string;
  model?: string;
}

export async function textToSpeechStream(
  text: string,
  config: GeminiVoiceConfig,
  onAudio: (pcm: Buffer) => void,
): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const stream = await ai.models.generateContentStream({
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

  let gotAudio = false;
  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        gotAudio = true;
        onAudio(Buffer.from(part.inlineData.data, "base64"));
      }
    }
  }

  if (!gotAudio) {
    throw new Error("No audio data in Gemini streaming response");
  }
}
