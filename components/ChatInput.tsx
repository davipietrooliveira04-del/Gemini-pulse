
import React, { useState, useRef, useEffect } from 'react';
import { Attachment, Language } from '../types';
import { translations } from '../translations';

interface ChatInputProps {
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  onToggleVoice: () => void;
  isLive: boolean;
  isLoading: boolean;
  language: Language;
}

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, onToggleVoice, isLive, isLoading, language }) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = translations[language];

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if ((text.trim() || attachments.length > 0) && !isLoading) {
      onSendMessage(text, attachments);
      setText('');
      setAttachments([]);
      // Reset height
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      
      const promise = new Promise<void>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          newAttachments.push({
            mimeType: file.type,
            data: base64,
            url: reader.result as string
          });
          resolve();
        };
      });
      
      reader.readAsDataURL(file);
      await promise;
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 md:p-6 bg-gradient-to-t from-[#0b0e14] via-[#0b0e14] to-transparent border-t border-slate-800/40 relative z-20">
      <div className="max-w-4xl mx-auto">
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4 animate-in slide-in-from-bottom-2 duration-300">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group/att shadow-xl">
                <img src={att.url} alt="preview" className="h-20 w-20 object-cover rounded-2xl border border-slate-700 shadow-lg" />
                <button 
                  onClick={() => removeAttachment(idx)}
                  className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-400 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs shadow-lg transition-all scale-100 group-hover/att:scale-110"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="relative flex items-end gap-2 md:gap-3 bg-slate-900/60 backdrop-blur-2xl rounded-[28px] border border-slate-800 focus-within:border-indigo-500/60 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all p-2 md:p-3 shadow-2xl">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-11 h-11 md:w-12 md:h-12 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-2xl transition-all active:scale-90"
            title="Attach image"
          >
            <i className="fas fa-paperclip text-xl"></i>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*" 
            multiple
          />
          
          <textarea
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLive ? t.liveMode : t.placeholder}
            disabled={isLive}
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-100 placeholder:text-slate-600 resize-none py-3 text-[15px] md:text-base max-h-[180px] custom-scrollbar disabled:opacity-30 transition-all"
          />

          <div className="flex items-center gap-1.5 md:gap-2 pr-1">
            <button
              onClick={onToggleVoice}
              className={`w-11 h-11 md:w-12 md:h-12 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${
                isLive 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse' 
                  : 'bg-slate-800 text-slate-400 hover:text-indigo-400 hover:bg-slate-700'
              }`}
              title={isLive ? t.stopVoice : t.startVoice}
            >
              <i className={`fas ${isLive ? 'fa-microphone-slash' : 'fa-microphone'} text-lg`}></i>
            </button>
            
            <button
              onClick={handleSend}
              disabled={(!text.trim() && attachments.length === 0) || isLoading || isLive}
              className={`w-11 h-11 md:w-12 md:h-12 flex items-center justify-center rounded-2xl transition-all active:scale-90 ${
                (text.trim() || attachments.length > 0) && !isLoading && !isLive
                  ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 hover:bg-indigo-500'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <i className="fas fa-paper-plane text-lg"></i>
              )}
            </button>
          </div>
        </div>
        <p className="text-[10px] md:text-[11px] text-center text-slate-600 mt-4 font-medium uppercase tracking-[0.1em] px-4">
          <i className="fas fa-info-circle mr-1.5 opacity-50"></i>
          {t.disclaimer}
        </p>
      </div>
    </div>
  );
};

export default ChatInput;
