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

function normalizarMarkdown(texto: string): string {
  const limpo = texto.replace(/\r\n?/g, '\n').trim();
  // Alguns modelos envolvem o relatório inteiro em um bloco de código; nesse
  // caso o Markdown é exibido como texto cru em vez de ser renderizado.
  const bloco = limpo.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  return (bloco ? bloco[1] : limpo).trim();
}

export default function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const conteudo = isUser ? message.content : normalizarMarkdown(message.content);
  const isReport = !isUser && /##\s*(?:📋\s*)?Dados da Empresa/i.test(conteudo);

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
          <p className="chat-bubble-text">{conteudo}</p>
        ) : (
          <div className={`markdown-body ${isReport ? 'report-body' : 'chat-bubble-text'}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {conteudo}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}