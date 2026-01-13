
import { GoogleGenAI, GenerateContentResponse, Part, Modality } from "@google/genai";
import { Message, Role, Language } from "../types";
import { translations } from "../translations";

export const generateStreamingResponse = async (
  messages: Message[],
  language: Language,
  isKidMode: boolean,
  onChunk: (chunk: string) => void,
  onImageGenerated?: (data: string, mimeType: string) => void
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const hasImages = messages.some(m => m.attachments && m.attachments.length > 0);
  const modelName = hasImages ? 'gemini-2.5-flash-image' : 'gemini-3-flash-preview';
  
  const contents = messages
    .filter(m => m.role !== Role.SYSTEM)
    .map(m => {
      const parts: Part[] = [{ text: m.content }];
      
      if (m.attachments) {
        m.attachments.forEach(attachment => {
          parts.push({
            inlineData: {
              mimeType: attachment.mimeType,
              data: attachment.data
            }
          });
        });
      }
      
      return {
        role: m.role === Role.USER ? 'user' : 'model',
        parts
      };
    });

  const baseInstruction = isKidMode ? translations[language].kidInstruction : translations[language].systemInstruction;
  const systemInstruction = baseInstruction + 
    (hasImages ? " You can also generate or edit images if requested. If you generate an image, it will be sent as part of your response." : "");

  try {
    if (hasImages) {
      const result = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.9,
        }
      });

      const candidate = result.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            onChunk(part.text);
          }
          if (part.inlineData && onImageGenerated) {
            onImageGenerated(part.inlineData.data, part.inlineData.mimeType);
          }
        }
      }
      return "";
    } else {
      const stream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.9,
          thinkingConfig: { thinkingBudget: 0 }
        }
      });

      let fullText = "";
      for await (const chunk of stream) {
        const text = (chunk as GenerateContentResponse).text;
        if (text) {
          fullText += text;
          onChunk(text);
        }
      }
      return fullText;
    }
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};

export const generateTTS = async (text: string, language: Language) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  // Mapping voices to languages for better naturalness and accent accuracy.
  const voiceMap: Record<Language, string> = {
    en: 'Zephyr',
    pt: 'Kore',
    es: 'Charon',
    fr: 'Puck',
    de: 'Fenrir',
    it: 'Kore'
  };

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Respond in the language ${language} with a very friendly and cheerful voice: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceMap[language] || 'Zephyr' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
