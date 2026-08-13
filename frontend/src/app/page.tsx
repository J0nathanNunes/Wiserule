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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rola para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const API_BASE = '/api';

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

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'erro') {
        addMessage('assistant', `❌ **Erro na análise:** ${data.erro}`);
      } else {
        addMessage('assistant', data.resumo);
      }
    } catch (error: any) {
      addMessage(
        'assistant',
        `❌ **Erro de conexão:** Não foi possível conectar ao servidor.\n\n${error.message}\n\nVerifique se o backend está rodando em \`http://localhost:8000\`.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const enviarMensagem = async (texto: string, arquivo?: File | null) => {
    // Se tem arquivo mas não tem texto, envia só o arquivo
    if (arquivo && !texto.trim()) {
      addMessage('user', `📎 **Arquivo anexado:** \`${arquivo.name}\``);
      setIsLoading(true);

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
        } else {
          addMessage('assistant', data.resumo);
        }
      } catch (error: any) {
        addMessage(
          'assistant',
          `❌ **Erro de conexão:** Não foi possível conectar ao servidor.\n\n${error.message}`
        );
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Adiciona mensagem do usuário
    let mensagemUsuario = texto;

    if (arquivo) {
      mensagemUsuario += `\n\n📎 **Arquivo anexado:** \`${arquivo.name}\``;
    }

    addMessage('user', mensagemUsuario);

    // Tenta extrair dados do texto via API /analisar com mensagem
    setIsLoading(true);

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

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'erro') {
        addMessage('assistant', `❌ **Erro na análise:** ${data.erro}`);
      } else {
        addMessage('assistant', data.resumo);
      }
    } catch (error: any) {
      addMessage(
        'assistant',
        `❌ **Erro de conexão:** Não foi possível conectar ao servidor.\n\n${error.message}\n\nVerifique se o backend está rodando em \`http://localhost:8000\`.`
      );
    } finally {
      setIsLoading(false);
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
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-5 py-3 border border-slate-700">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-slate-400 ml-2">Analisando...</span>
                </div>
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