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

/**
 * Corrige encoding corrompido (mojibake).
 * El texto fue UTF-8 pero fue interpretado como Latin-1 (cada byte se volvió un char).
 * Para corregirlo: tomamos cada char como byte Latin-1 y decodificamos como UTF-8.
 */
function normalizarEncoding(texto: string): string {
  if (!texto) return texto;

  // Verifica si hay caracteres que sugieren mojibake (bytes >= 0x80)
  const temBytesAltos = /[\u0080-\u00FF]/.test(texto);
  if (!temBytesAltos) return texto;

  try {
    // Convierte cada char a su byte Latin-1
    const bytes = new Uint8Array(texto.length);
    for (let i = 0; i < texto.length; i++) {
      bytes[i] = texto.charCodeAt(i) & 0xff;
    }

    // Decodifica como UTF-8
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const decodificado = decoder.decode(bytes);

    // Si no hay caracteres de reemplazo (\uFFFD), el decoding fue exitoso
    if (!decodificado.includes('\uFFFD')) {
      return decodificado;
    }
  } catch {
    // Si falla, usa el texto original
  }

  return texto;
}

export default function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === 'user';
  // Normaliza el encoding antes de renderizar
  const contenido = isUser ? message.content : normalizarEncoding(message.content);

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
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{contenido}</p>
        ) : (
          <div className="markdown-body text-sm leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {contenido}
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