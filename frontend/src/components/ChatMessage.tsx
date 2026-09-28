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
  if (bloco) return bloco[1].trim();
  // O modelo pode envolver APENAS o relatório na cerca, depois do aviso de
  // conclusão (ex.: "✅ Análise concluída...```markdown ... ```"). Nesse caso
  // extrai o conteúdo do primeiro bloco quando o prefácio é curto.
  const prefixo = limpo.match(/^[\s\S]{0,300}?```(?:markdown|md)?\s*\n([\s\S]*?)(?:\n```|```$)/i);
  if (prefixo && prefixo[1] && /##|Dados da Empresa/i.test(prefixo[1])) {
    return prefixo[1].trim();
  }
  // Cerca aberta sem fechamento: remove as marcas e mantém o conteúdo.
  const aberta = limpo.match(/^[\s\S]{0,300}?```(?:markdown|md)?\s*\n([\s\S]+)$/i);
  if (aberta && aberta[1] && /##|Dados da Empresa/i.test(aberta[1])) {
    return aberta[1].replace(/\n```\s*$/, '').trim();
  }
  return limpo;
}

// Substitui emojis decorativos por marcadores tipográficos discretos, sem
// aparência de ícones ilustrativos gerados por IA. O alvo ES5 do projeto não
// aceita a flag "u" com intervalos unicode, então os símbolos são listados
// diretamente por seus pontos de código.
const EMOJIS_REMOVER = ['⏳', '✅', '❌', '📎', '📋', '🏢', '🛠️', '⚖️', '🧮', '📍', '🔢', '🧾', '💬', '⚠️'];

function limparEmojis(texto: string): string {
  let resultado = texto;
  for (const emoji of EMOJIS_REMOVER) {
    resultado = resultado.split(emoji).join('');
  }
  return resultado
    .replace(/Atenção:\s*Atenção:/g, 'Atenção:')
    .replace(/(^|\n)(\s*[-*•]\s*)\s+/g, '$1$2');
}

export default function ChatMessage({ message }: MessageProps) {
  const isUser = message.role === 'user';
  const bruto = isUser ? message.content : normalizarMarkdown(message.content);
  const conteudo = isUser ? bruto : limparEmojis(bruto);
  const isReport = !isUser && /##\s*Dados da Empresa/i.test(conteudo);

  return (
    <div className={`chat-row ${isUser ? 'chat-row-user' : 'chat-row-assistant'}`}>
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