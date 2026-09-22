'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MessageProps = {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  };
};

export default function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
          isUser
            ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
            : 'bg-gradient-to-br from-blue-500 to-purple-600'
        }`}
      >
        {isUser ? '👤' : '🤖'}
      </div>

      {/* Message Bubble */}
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-3 ${
          isUser
            ? 'bg-gradient-to-br from-blue-600 to-blue-700 rounded-tr-sm text-white'
            : 'bg-slate-800 rounded-tl-sm border border-slate-700 text-slate-200'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : (
          <div className="markdown-body text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Timestamp */}
        <div className={`mt-2 text-[10px] ${isUser ? 'text-blue-200' : 'text-slate-500'}`}>
          {message.timestamp.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}