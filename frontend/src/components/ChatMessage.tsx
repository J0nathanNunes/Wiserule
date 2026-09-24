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
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[min(82%,48rem)] border px-5 py-3.5 shadow-[0_2px_8px_rgba(31,52,50,0.035)] max-sm:max-w-[94%] ${isUser ? 'chat-bubble-user rounded-[3px_3px_0_3px] border-white bg-white text-[#273234]' : 'chat-bubble-assistant rounded-[3px_3px_3px_0] border-[#d6e4df] bg-[#e3eeea] text-[#293736]'}`}>
        <div className={`mb-2 text-[10px] font-semibold uppercase tracking-[.14em] ${isUser ? 'text-[#8a9694] text-right' : 'text-[#4b7771]'}`}>
          {isUser ? 'Você' : 'Wiserule · análise fiscal'}
        </div>
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
        <div className={`mt-2 text-[10px] tabular-nums ${isUser ? 'text-[#9aa4a2] text-right' : 'text-[#758582]'}`}>
          {message.timestamp.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}