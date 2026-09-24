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
  const isReport = !isUser && /^#\s*Relatório|^##\s*📋/.test(message.content.trim());

  return (
    <div className={`chat-row ${isUser ? 'chat-row-user' : 'chat-row-assistant'}`}>
      {!isUser && (
        <div className="chat-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 6v4h16M4 10v4h16M4 14v4h16" /></svg>
        </div>
      )}
      <div className={`chat-bubble ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'} ${isReport ? 'chat-report' : ''}`}>
        <div className={`chat-bubble-head ${isUser ? 'chat-bubble-head-user' : 'chat-bubble-head-assistant'}`}>
          <span>{isUser ? 'Você' : 'Wiserule'}</span>
          <span className="chat-bubble-time">{message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {isUser ? (
          <p className="chat-bubble-text">{message.content}</p>
        ) : (
          <div className={`markdown-body ${isReport ? 'report-body' : 'chat-bubble-text'}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}