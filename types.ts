
export enum Role {
  USER = 'user',
  MODEL = 'model',
  SYSTEM = 'system'
}

export type Language = 'en' | 'pt' | 'es' | 'fr' | 'de' | 'it';

export interface Attachment {
  mimeType: string;
  data: string; // base64
  url?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  attachments?: Attachment[];
  generatedImage?: {
    data: string;
    mimeType: string;
  };
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  isKidMode?: boolean;
}
