
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Message, Role, ChatSession, Attachment, Language } from './types';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import { generateStreamingResponse, generateTTS } from './services/geminiService';
import { translations } from './translations';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Audio Helpers
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [language, setLanguage] = useState<Language>('en');
  const [isLive, setIsLive] = useState(false);
  const [userProfilePic, setUserProfilePic] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const profileInputRef = useRef<HTMLInputElement>(null);
  
  // Live API Refs
  const liveSessionRef = useRef<any>(null);
  const audioContextsRef = useRef<{ input?: AudioContext; output?: AudioContext }>({});
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptionRef = useRef<{ input: string; output: string }>({ input: '', output: '' });

  const t = translations[language];

  const getVoiceForLanguage = (lang: Language) => {
    const map: Record<Language, string> = {
      en: 'Zephyr',
      pt: 'Kore',
      es: 'Charon',
      fr: 'Puck',
      de: 'Fenrir',
      it: 'Kore'
    };
    return map[lang] || 'Zephyr';
  };

  // Initialize
  useEffect(() => {
    if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    const savedLang = localStorage.getItem('gemini_lang') as Language;
    if (savedLang) setLanguage(savedLang);
    const savedProfilePic = localStorage.getItem('gemini_profile_pic');
    if (savedProfilePic) setUserProfilePic(savedProfilePic);
    const saved = localStorage.getItem('gemini_sessions');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSessions(parsed);
      if (parsed.length > 0) setCurrentSessionId(parsed[0].id);
    } else {
      createNewSession();
    }
  }, []);

  // Update welcome message dynamically when language or mode changes for the first time
  useEffect(() => {
    if (!currentSessionId) return;
    
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId && s.messages.length === 1) {
        // If it's a "standard greeting", translate it
        const content = s.isKidMode ? translations[language].kidWelcome : translations[language].welcome;
        return {
          ...s,
          messages: [{ ...s.messages[0], content }]
        };
      }
      return s;
    }));
    
    localStorage.setItem('gemini_lang', language);
  }, [language, currentSessionId]);

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('gemini_sessions', JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessions, currentSessionId]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const isKidMode = !!currentSession?.isKidMode;

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setUserProfilePic(base64String);
        localStorage.setItem('gemini_profile_pic', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  const playResponseAudio = async (text: string) => {
    try {
      const base64Audio = await generateTTS(text, language);
      if (base64Audio) {
        const ctx = audioContextsRef.current.output || new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        if (!audioContextsRef.current.output) audioContextsRef.current.output = ctx;
        
        const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch (e) {
      console.error("TTS failed", e);
    }
  };

  const stopLiveMode = useCallback(() => {
    if (liveSessionRef.current) {
      liveSessionRef.current.close();
      liveSessionRef.current = null;
    }
    audioSourcesRef.current.forEach(s => s.stop());
    audioSourcesRef.current.clear();
    setIsLive(false);
  }, []);

  const startLiveMode = useCallback(async () => {
    if (isLive) {
      stopLiveMode();
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextsRef.current = { input: inputCtx, output: outputCtx };
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsLive(true);
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceForLanguage(language) } },
          },
          systemInstruction: isKidMode ? translations[language].kidInstruction : translations[language].systemInstruction,
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        },
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) transcriptionRef.current.input += message.serverContent.inputTranscription.text;
            if (message.serverContent?.outputTranscription) transcriptionRef.current.output += message.serverContent.outputTranscription.text;

            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (audioData) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
              const buffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              audioSourcesRef.current.add(source);
              source.onended = () => audioSourcesRef.current.delete(source);
            }

            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => s.stop());
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }

            if (message.serverContent?.turnComplete) {
              const { input, output } = transcriptionRef.current;
              if (input || output) {
                const userMsg: Message = { id: crypto.randomUUID(), role: Role.USER, content: input || '[Audio]', timestamp: Date.now() };
                const modelMsg: Message = { id: crypto.randomUUID(), role: Role.MODEL, content: output || '[Audio Response]', timestamp: Date.now() };
                setSessions(prev => prev.map(s => s.id === currentSessionId ? { ...s, messages: [...s.messages, userMsg, modelMsg], updatedAt: Date.now() } : s));
                transcriptionRef.current = { input: '', output: '' };
              }
            }
          },
          onerror: (e) => console.error('Live Error:', e),
          onclose: () => setIsLive(false)
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err) {
      console.error('Failed Live:', err);
      setIsLive(false);
    }
  }, [isLive, language, currentSessionId, isKidMode]);

  const handleSendMessage = useCallback(async (text: string, attachments: Attachment[]) => {
    if (!currentSessionId) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: Role.USER, content: text, attachments, timestamp: Date.now() };
    const modelMessageId = crypto.randomUUID();
    const initialModelMessage: Message = { id: modelMessageId, role: Role.MODEL, content: '', timestamp: Date.now(), isStreaming: true };

    setSessions(prev => prev.map(s => s.id === currentSessionId ? {
      ...s,
      messages: [...s.messages, userMessage, initialModelMessage],
      title: (s.title === translations[language].newConversation) ? text.slice(0, 30) : s.title,
      updatedAt: Date.now()
    } : s));

    setIsLoading(true);
    try {
      const sessionToUse = sessions.find(s => s.id === currentSessionId);
      const currentMessages = [...(sessionToUse?.messages || []), userMessage];
      let fullResponse = "";
      
      await generateStreamingResponse(currentMessages, language, isKidMode, (chunk) => {
        fullResponse += chunk;
        setSessions(prev => prev.map(s => s.id === currentSessionId ? {
          ...s,
          messages: s.messages.map(m => m.id === modelMessageId ? { ...m, content: fullResponse } : m)
        } : s));
      }, (imageData, mimeType) => {
        setSessions(prev => prev.map(s => s.id === currentSessionId ? {
          ...s,
          messages: s.messages.map(m => m.id === modelMessageId ? { ...m, generatedImage: { data: imageData, mimeType } } : m)
        } : s));
      });

      setSessions(prev => prev.map(s => s.id === currentSessionId ? {
        ...s,
        messages: s.messages.map(m => m.id === modelMessageId ? { ...m, isStreaming: false } : m)
      } : s));

      if (isKidMode) {
        await playResponseAudio(fullResponse);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [currentSessionId, sessions, language, isKidMode]);

  const createNewSession = () => {
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: translations[language].newConversation,
      messages: [{ id: crypto.randomUUID(), role: Role.MODEL, content: translations[language].welcome, timestamp: Date.now() }],
      updatedAt: Date.now(),
      isKidMode: false
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const toggleKidMode = () => {
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        const nextMode = !s.isKidMode;
        // Logic to update greeting immediately
        const messages = s.messages.length === 1 
          ? [{ ...s.messages[0], content: nextMode ? translations[language].kidWelcome : translations[language].welcome }]
          : s.messages;

        return { 
          ...s, 
          isKidMode: nextMode,
          messages
        };
      }
      return s;
    }));
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    if (currentSessionId === id) setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
  };

  const languages: {code: Language, flag: string, name: string}[] = [
    { code: 'en', flag: '🇺🇸', name: 'EN' },
    { code: 'pt', flag: '🇧🇷', name: 'PT' },
    { code: 'es', flag: '🇪🇸', name: 'ES' },
    { code: 'fr', flag: '🇫🇷', name: 'FR' },
    { code: 'de', flag: '🇩🇪', name: 'DE' },
    { code: 'it', flag: '🇮🇹', name: 'IT' },
  ];

  return (
    <div className={`flex h-screen w-full text-slate-200 overflow-hidden relative transition-colors duration-700 ${isKidMode ? 'bg-[#1a1c2c]' : 'bg-[#0b0e14]'}`}>
      {/* Background decorations for Kid Mode */}
      {isKidMode && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-10 left-10 text-pink-500/10 text-9xl animate-spin-slow">
            <i className="fas fa-sun"></i>
          </div>
          <div className="absolute bottom-10 right-10 text-cyan-500/10 text-9xl animate-bounce-slow">
            <i className="fas fa-cloud"></i>
          </div>
        </div>
      )}

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r transition-all duration-500 lg:relative lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${isKidMode ? 'bg-[#212338] border-pink-500/20 shadow-pink-500/5' : 'bg-slate-900 border-slate-800'}`}>
        <div className="flex flex-col h-full p-4">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg transition-all ${isKidMode ? 'bg-pink-500 shadow-pink-500/30' : 'bg-indigo-600 shadow-indigo-600/20'}`}>
                <i className={`fas ${isKidMode ? 'fa-face-laugh-beam text-white animate-bounce' : 'fa-bolt text-white'} text-lg`}></i>
              </div>
              <div className="flex flex-col">
                <h1 className={`text-xl font-bold leading-tight ${isKidMode ? 'text-pink-100' : 'bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent'}`}>
                  {isKidMode ? 'Magic Pulse' : 'Gemini Pulse'}
                </h1>
              </div>
            </div>
          </div>

          <button onClick={createNewSession} className={`flex items-center gap-3 px-4 py-3.5 w-full rounded-2xl transition-all text-sm font-semibold mb-6 shadow-sm active:scale-[0.97] border ${isKidMode ? 'bg-pink-500/10 hover:bg-pink-500/20 border-pink-500/30 text-pink-100' : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'}`}>
            <i className="fas fa-plus"></i>
            {t.newChat}
          </button>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 -mx-2 px-2">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3 px-2 flex items-center gap-2">
              <i className="fas fa-history text-[9px]"></i>
              {t.history}
            </h2>
            {sessions.map(s => (
              <div key={s.id} onClick={() => { setCurrentSessionId(s.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={`group flex items-center justify-between px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 ${currentSessionId === s.id ? (s.isKidMode ? 'bg-pink-500/20 text-white border border-pink-500/30' : 'bg-slate-800 text-white shadow-md') : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  <i className={`fas ${s.isKidMode ? 'fa-face-smile' : 'fa-message'} text-[10px] ${currentSessionId === s.id ? (s.isKidMode ? 'text-pink-400' : 'text-indigo-400') : 'text-slate-600'}`}></i>
                  <span className="truncate text-sm font-medium">{s.title}</span>
                </div>
                <button onClick={(e) => deleteSession(s.id, e)} className="opacity-0 lg:group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"><i className="fas fa-trash-alt text-[11px]"></i></button>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-6 border-t border-slate-800/50 space-y-4">
            <div className="grid grid-cols-3 gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
              {languages.map((l) => (
                <button 
                  key={l.code}
                  onClick={() => setLanguage(l.code)}
                  className={`flex flex-col items-center justify-center py-2 rounded-xl text-[10px] font-bold transition-all ${language === l.code ? (isKidMode ? 'bg-pink-600 text-white' : 'bg-indigo-600 text-white') : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <span className="text-sm mb-0.5">{l.flag}</span>
                  {l.name}
                </button>
              ))}
            </div>

            <button onClick={toggleKidMode} className={`w-full py-3 px-4 rounded-xl flex items-center justify-between transition-all font-bold text-xs uppercase tracking-widest border ${isKidMode ? 'bg-pink-500 text-white shadow-lg border-pink-400' : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'}`}>
               <span className="flex items-center gap-2">
                 <i className={`fas ${isKidMode ? 'fa-toggle-on' : 'fa-toggle-off'} text-lg`}></i>
                 {t.kidMode}
               </span>
               <i className="fas fa-child-reaching text-sm"></i>
            </button>
            <div className="flex items-center gap-3 px-2 group">
               <div onClick={() => profileInputRef.current?.click()} className="w-11 h-11 rounded-2xl bg-slate-800 flex items-center justify-center border border-slate-700 overflow-hidden cursor-pointer hover:border-indigo-500 transition-all relative group/avatar">
                 {userProfilePic ? <img src={userProfilePic} className="w-full h-full object-cover" /> : <i className="fas fa-user text-slate-500"></i>}
               </div>
               <div className="flex flex-col flex-1 min-w-0">
                 <span className="text-sm font-bold leading-none mb-1.5 truncate">{t.userProfile}</span>
                 <button onClick={() => profileInputRef.current?.click()} className="text-[10px] text-indigo-400 text-left hover:text-indigo-300 transition-colors uppercase font-black tracking-widest">{t.changeProfilePic}</button>
               </div>
               <input type="file" ref={profileInputRef} onChange={handleProfilePicChange} className="hidden" accept="image/*" />
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative z-10 overflow-hidden">
        <header className={`h-16 md:h-20 flex items-center justify-between px-4 md:px-8 backdrop-blur-xl border-b sticky top-0 z-30 transition-all ${isKidMode ? 'bg-[#1a1c2c]/90 border-pink-500/20' : 'bg-[#0b0e14]/90 border-slate-800/60'}`}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className={`lg:hidden w-10 h-10 flex items-center justify-center rounded-xl transition-all ${isKidMode ? 'bg-pink-500/10 border-pink-500/30 text-pink-300' : 'bg-slate-800/50 border-slate-700 text-slate-300'}`}>
              <i className="fas fa-bars"></i>
            </button>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h2 className={`font-bold truncate text-sm md:text-base leading-tight ${isKidMode ? 'text-pink-100' : 'text-slate-100'}`}>
                  {isKidMode ? '🧸 ' + currentSession?.title : currentSession?.title}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                  {isLive ? t.liveMode : t.systemOnline}
                </span>
              </div>
            </div>
          </div>
          {isKidMode && (
             <div className="flex items-center gap-4 ml-4">
                <button onClick={startLiveMode} className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest ${isLive ? 'bg-red-500 shadow-red-500/40 animate-pulse' : 'bg-cyan-500 shadow-cyan-500/30 text-white'}`}>
                  <i className="fas fa-microphone"></i>
                  {isLive ? t.stopVoice : t.startVoice}
                </button>
             </div>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-4 md:px-0 scroll-smooth relative">
          <div className="max-w-4xl mx-auto py-6 md:py-10 md:px-8">
            {currentSession?.messages.map((m) => (
              <ChatMessage 
                key={m.id} 
                message={m} 
                userProfilePic={userProfilePic} 
                isKidMode={isKidMode} 
                onPlayAudio={playResponseAudio} 
              />
            ))}
          </div>
        </div>

        <ChatInput onSendMessage={handleSendMessage} onToggleVoice={startLiveMode} isLive={isLive} isLoading={isLoading} language={language} />
      </main>
    </div>
  );
};

export default App;
