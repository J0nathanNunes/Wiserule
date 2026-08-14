'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

type FormData = {
  cnpj: string;
  servico: string;
  valor: string;
  cidade: string;
  uf: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: `# 🤖 Bem-vindo ao Wiserule!

Sou um assistente especializado em análise de Notas Fiscais de Serviço. Posso ajudar você a:

- 📋 **Analisar retenções fiscais** (ISS, IRRF, CSLL, COFINS, PIS)
- 🏢 **Consultar dados da empresa** via CNPJ
- ⚖️ **Verificar legislação aplicável** (LC 116/2003, leis municipais)
- 📄 **Extrair dados de NFSe** de imagens ou PDFs
- 💬 **Opiniões e discussões** da comunidade técnica

**Como usar:**
1. Preencha os dados no formulário ao lado (CNPJ, serviço, valor, cidade)
2. Ou simplesmente digite em linguagem natural
3. Ou anexe uma imagem/PDF da NFSe

👉 Vamos começar?`,
      timestamp: new Date(),
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rola para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const API_BASE = '/api';

  // Polling: acompanha o progresso da tarefa
  const pollTask = async (taskId: string, assistantMsgId: string) => {
    const maxAttempts = 60; // 60 * 2s = 120s timeout
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/analisar/status/${taskId}`);
        const data = await res.json();

        if (data.status === 'erro' || data.erro) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: `❌ **Erro na análise:** ${data.erro || 'Erro desconhecido'}` } : m
            )
          );
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        // Atualiza status
        setStatusMsg(data.etapa_atual || `Analisando... (${data.progresso || 0}%)`);

        if (data.status === 'concluido' && data.relatorio_completo) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: data.relatorio_completo } : m
            )
          );
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: '⏱️ **Tempo limite excedido.** Tente novamente.' } : m
            )
          );
          setIsLoading(false);
          setStatusMsg('');
        }
      } catch {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 2000);
        } else {
          setIsLoading(false);
          setStatusMsg('');
        }
      }
    };

    poll();
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    const newMsg: Message = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  };

  const enviarParaAnalise = async (formData: FormData, arquivo?: File | null) => {
    setIsLoading(true);
    setStatusMsg('Iniciando análise...');

    const formPayload = new FormData();
    formPayload.append('cnpj', formData.cnpj.replace(/\D/g, ''));
    formPayload.append('servico', formData.servico);
    formPayload.append('valor', formData.valor.replace(',', '.'));
    formPayload.append('cidade', formData.cidade);
    formPayload.append('uf', formData.uf);

    if (arquivo) {
      formPayload.append('arquivo', arquivo);
    }

    try {
      const response = await fetch(`${API_BASE}/analisar`, {
        method: 'POST',
        body: formPayload,
      });

      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

      const data = await response.json();

      if (data.status === 'erro') {
        addMessage('assistant', `❌ **Erro na análise:** ${data.erro}`);
        setIsLoading(false);
        setStatusMsg('');
        return;
      }

      // Cria mensagem placeholder do assistente
      const assistantMsg = addMessage('assistant', '⏳ **Analisando...**');

      // Inicia polling se tiver task_id
      if (data.dados_extraidos?.task_id) {
        pollTask(data.dados_extraidos.task_id, assistantMsg.id);
      } else {
        addMessage('assistant', data.resumo || '✅ Análise concluída.');
        setIsLoading(false);
        setStatusMsg('');
      }
    } catch (error: any) {
      addMessage('assistant', `❌ **Erro de conexão:** ${error.message}`);
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const enviarMensagem = async (texto: string, arquivo?: File | null) => {
    // Se tem arquivo mas não tem texto, envia só o arquivo
    if (arquivo && !texto.trim()) {
      addMessage('user', `📎 **Arquivo anexado:** \`${arquivo.name}\``);
      setIsLoading(true);
      setStatusMsg('Extraindo dados do arquivo...');

      const formPayload = new FormData();
      formPayload.append('arquivo', arquivo);

      try {
        const response = await fetch(`${API_BASE}/analisar`, {
          method: 'POST',
          body: formPayload,
        });

        if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

        const data = await response.json();

        if (data.status === 'erro') {
          addMessage('assistant', `❌ **Erro na análise:** ${data.erro}`);
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        const assistantMsg = addMessage('assistant', '⏳ **Analisando...**');

        if (data.dados_extraidos?.task_id) {
          pollTask(data.dados_extraidos.task_id, assistantMsg.id);
        } else {
          addMessage('assistant', data.resumo || '✅ Análise concluída.');
          setIsLoading(false);
          setStatusMsg('');
        }
      } catch (error: any) {
        addMessage('assistant', `❌ **Erro de conexão:** ${error.message}`);
        setIsLoading(false);
        setStatusMsg('');
      }
      return;
    }

    // Adiciona mensagem do usuário
    let mensagemUsuario = texto;

    if (arquivo) {
      mensagemUsuario += `\n\n📎 **Arquivo anexado:** \`${arquivo.name}\``;
    }

    addMessage('user', mensagemUsuario);
    setIsLoading(true);
    setStatusMsg('Analisando...');

    const formPayload = new FormData();
    formPayload.append('mensagem', texto);

    if (arquivo) {
      formPayload.append('arquivo', arquivo);
    }

    try {
      const response = await fetch(`${API_BASE}/analisar`, {
        method: 'POST',
        body: formPayload,
      });

      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);

      const data = await response.json();

      if (data.status === 'erro') {
        addMessage('assistant', `❌ **Erro na análise:** ${data.erro}`);
        setIsLoading(false);
        setStatusMsg('');
        return;
      }

      const assistantMsg = addMessage('assistant', '⏳ **Analisando...**');

      if (data.dados_extraidos?.task_id) {
        pollTask(data.dados_extraidos.task_id, assistantMsg.id);
      } else {
        addMessage('assistant', data.resumo || '✅ Análise concluída.');
        setIsLoading(false);
        setStatusMsg('');
      }
    } catch (error: any) {
      addMessage('assistant', `❌ **Erro de conexão:** ${error.message}`);
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const handleNovaAnalise = () => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: `# 🤖 Pronto para uma nova análise!

Envie os dados da NFSe que desejo ajudar.`,
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="flex h-screen bg-slate-900">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onSubmit={enviarParaAnalise}
        isLoading={isLoading}
        onNovaAnalise={handleNovaAnalise}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-4 border-b border-slate-700 bg-slate-800/50 backdrop-blur-sm">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white transition-colors"
            title="Toggle sidebar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <h1 className="text-lg font-semibold text-white">Wiserule</h1>
          </div>
          <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full ml-2">
            Análise Fiscal Inteligente
          </span>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm flex-shrink-0">
                🤖
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-5 py-3 border border-slate-700 max-w-md">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-slate-400 ml-2">Analisando...</span>
                </div>
                {statusMsg && (
                  <div className="text-xs text-slate-500 mt-1 border-t border-slate-700 pt-1">
                    {statusMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <ChatInput
          onSend={enviarMensagem}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}