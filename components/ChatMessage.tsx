
import React from 'react';
import { Message, Role } from '../types';

interface ChatMessageProps {
  message: Message;
  userProfilePic?: string | null;
  isKidMode?: boolean;
  onPlayAudio?: (text: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, userProfilePic, isKidMode, onPlayAudio }) => {
  const isUser = message.role === Role.USER;

  const downloadImage = (data: string, mimeType: string) => {
    const link = document.createElement('a');
    link.href = `data:${mimeType};base64,${data}`;
    link.download = `gemini-pulse-creation-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className={`flex w-full md:max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className={`flex-shrink-0 h-9 w-9 md:h-11 md:w-11 rounded-2xl flex items-center justify-center text-xs font-bold shadow-xl transition-all hover:scale-105 overflow-hidden ${
          isUser 
            ? 'ml-3 md:ml-4 bg-indigo-600 shadow-indigo-600/30 border border-indigo-500/50' 
            : (isKidMode ? 'mr-3 md:mr-4 bg-pink-500 border border-pink-400 shadow-pink-500/20' : 'mr-3 md:mr-4 bg-slate-800 shadow-black/20 border border-slate-700')
        }`}>
          {isUser ? (
            userProfilePic ? (
              <img src={userProfilePic} alt="User" className="w-full h-full object-cover" />
            ) : (
              <i className="fas fa-user text-sm md:text-base"></i>
            )
          ) : (
            <div className={`w-full h-full flex items-center justify-center ${isKidMode ? 'bg-gradient-to-br from-pink-400 to-orange-500' : 'bg-gradient-to-br from-emerald-500 to-teal-700'}`}>
              <i className={`fas ${isKidMode ? 'fa-face-smile-beam' : 'fa-robot'} text-sm md:text-base text-white`}></i>
            </div>
          )}
        </div>

        {/* Bubble */}
        <div className={`flex flex-col min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
          <div className={`px-4 py-3.5 md:px-5 md:py-4 rounded-3xl shadow-2xl backdrop-blur-md relative group/bubble ${
            isUser 
              ? 'bg-indigo-600 text-white rounded-tr-none border border-indigo-400/30' 
              : (isKidMode 
                  ? 'bg-pink-600/90 text-white rounded-tl-none border border-pink-400/40' 
                  : 'bg-slate-800/80 text-slate-100 rounded-tl-none border border-slate-700/50')
          }`}>
            {/* User Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2.5 mb-3.5">
                {message.attachments.map((att, idx) => (
                  <div key={idx} className="relative group overflow-hidden rounded-2xl border border-white/20 shadow-lg">
                    <img 
                      src={`data:${att.mimeType};base64,${att.data}`} 
                      alt="attachment" 
                      className="max-w-[240px] md:max-w-[320px] max-h-[350px] object-cover transition-transform group-hover:scale-105 duration-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* AI Generated Image */}
            {message.generatedImage && (
              <div className="mb-4 relative group/img overflow-hidden rounded-2xl border border-indigo-500/40 bg-black/60 p-1.5 shadow-2xl">
                <div className="absolute top-4 right-4 z-10 opacity-0 group-hover/img:opacity-100 transition-all duration-300 scale-90 group-hover/img:scale-100">
                  <button 
                    onClick={() => downloadImage(message.generatedImage!.data, message.generatedImage!.mimeType)}
                    className="bg-indigo-600/90 hover:bg-indigo-500 backdrop-blur-xl text-white w-10 h-10 flex items-center justify-center rounded-xl shadow-xl border border-indigo-400/50 transition-all active:scale-90"
                    title="Download creation"
                  >
                    <i className="fas fa-download"></i>
                  </button>
                </div>
                <img 
                  src={`data:${message.generatedImage.mimeType};base64,${message.generatedImage.data}`} 
                  alt="AI Creation" 
                  className="w-full h-auto rounded-xl"
                />
                <div className="mt-2.5 px-2 pb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
                    Gemini AI Vision
                  </span>
                </div>
              </div>
            )}

            <div className="prose prose-invert max-w-none">
              <div className={`whitespace-pre-wrap leading-relaxed selection:bg-white/20 ${isKidMode ? 'text-lg md:text-xl font-bold' : 'text-[15px] md:text-base font-medium'}`}>
                {message.content || (message.generatedImage ? '' : '...')}
                {message.isStreaming && (
                  <span className={`inline-block w-2 h-5 ml-1 rounded-full animate-pulse align-middle ${isKidMode ? 'bg-pink-300' : 'bg-indigo-300/60'}`}></span>
                )}
              </div>
            </div>
            
            {!isUser && !message.isStreaming && message.content && (
               <button 
                 onClick={() => onPlayAudio && onPlayAudio(message.content)}
                 className={`mt-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${isKidMode ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
               >
                 <i className="fas fa-volume-up"></i>
                 {isKidMode ? 'Magic Voice' : 'Play'}
               </button>
            )}
          </div>
          <span className="text-[10px] mt-2 text-slate-500 font-black uppercase tracking-widest px-1 opacity-80">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
