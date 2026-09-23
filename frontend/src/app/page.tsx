'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import Sidebar from '@/components/Sidebar';
import DebugModal from '@/components/DebugModal';

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

type RevisaoOcr = {
  arquivo: File;
  urlOriginal: string;
  texto: string;
  confirmouConferencia: boolean;
  cidadeUfManual: boolean;
  camposPerguntar: Array<'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf'>;
  cnpj: string;
  servico: string;
  valor: string;
  cidade: string;
  uf: string;
  candidatos: Record<string, string[]>;
  divergencias: string[];
  confiança: number;
  erros: string[];
};

const CAMPOS_REVISAO: Array<{ chave: 'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf'; rotulo: string }> = [
  { chave: 'cnpj', rotulo: 'CNPJ do prestador' },
  { chave: 'servico', rotulo: 'descrição do serviço' },
  { chave: 'valor', rotulo: 'valor total da nota (em reais)' },
  { chave: 'cidade', rotulo: 'município da prestação' },
  { chave: 'uf', rotulo: 'UF do município da prestação' },
];

// Decodifica el relatório de Base64 (el backend lo codifica para protegerlo del Durable Object)
function decodificarRelatorio(texto: string): string {
  if (!texto) return texto;
  // Si no parece Base64 (contiene caracteres no-Base64), devuelve el texto original
  if (!/^[A-Za-z0-9+/=\s]+$/.test(texto)) return texto;
  try {
    const binario = atob(texto);
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i++) {
      bytes[i] = binario.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return texto;
  }
}

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
  const [debugOpen, setDebugOpen] = useState(false);
  const [revisaoOcr, setRevisaoOcr] = useState<RevisaoOcr | null>(null);
  const [revisaoCampoIndex, setRevisaoCampoIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rola para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // En producción usa la URL del Worker; en dev usa el proxy local
  const API_BASE = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

  // Polling: acompanha o progresso da tarefa
  const pollTask = async (taskId: string, assistantMsgId: string) => {
    const maxAttempts = 60; // 60 * 2s = 120s timeout
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/analisar/status/${taskId}`);
        const data = await res.json();

        if (data.status === 'erro' || data.status === 'error' || data.erro || data.error) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: `❌ **Erro na análise:** ${data.error || data.erro || 'Erro desconhecido'}` } : m
            )
          );
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        // Atualiza status
        setStatusMsg(data.etapa_atual || `Analisando... (${data.progresso || 0}%)`);

        if (data.status === 'concluido' && data.relatorio_completo) {
          // Decodifica Base64 (el backend codifica el relatório para protegerlo del Durable Object)
          const relatorio = decodificarRelatorio(data.relatorio_completo);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: relatorio } : m
            )
          );
          setIsLoading(false);
          setStatusMsg('');
          return;
        }

        if (data.status === 'concluido' && !data.relatorio_completo) {
          setMessages((prev) => prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: '❌ **A análise terminou sem retornar um relatório.** Tente novamente; se persistir, verifique a geração do relatório no servidor.' } : m
          ));
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
    if (arquivo) {
      await solicitarRevisaoOcr(arquivo, '', formData);
      return;
    }
    setIsLoading(true);
    setStatusMsg('Iniciando análise...');

    const formPayload = new FormData();
    formPayload.append('cnpj', formData.cnpj.replace(/\D/g, ''));
    formPayload.append('servico', formData.servico);
    formPayload.append('valor', formData.valor);
    formPayload.append('cidade', formData.cidade);
    formPayload.append('uf', formData.uf);

    try {
      const response = await fetch(`${API_BASE}/analisar`, {
        method: 'POST',
        body: formPayload,
      });
      const data = await response.json();

      if (!response.ok || data.status === 'erro' || data.status === 'error') {
        addMessage('assistant', `❌ **Erro na análise:** ${data.error || data.erro || `HTTP ${response.status}`}`);
        setIsLoading(false);
        setStatusMsg('');
        return;
      }

      const assistantMsg = addMessage('assistant', '⏳ **Analisando...**');
      if (data.dados_extraidos?.task_id) {
        pollTask(data.dados_extraidos.task_id, assistantMsg.id);
      } else {
        addMessage('assistant', data.resumo || '❌ **A análise não foi iniciada:** o servidor não retornou o identificador da tarefa. Tente novamente.');
        setIsLoading(false);
        setStatusMsg('');
      }
    } catch (error) {
      addMessage('assistant', `❌ **Erro de conexão:** ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const solicitarRevisaoOcr = async (arquivo: File, texto: string, dadosIniciais?: FormData) => {
    setIsLoading(true);
    setStatusMsg('Lendo a NFSe para revisão...');
    const payload = new FormData();
    payload.append('archivo', arquivo);
    try {
      const response = await fetch(`${API_BASE}/analisar`, { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok || data.status !== 'revisao_necessaria') {
        throw new Error(data.error || data.mensagem || `HTTP ${response.status}`);
      }
      abrirRevisaoOcr(arquivo, texto, dadosIniciais, data);
    } catch (error) {
      addMessage('assistant', `❌ **Não foi possível preparar a conferência:** ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    } finally {
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const abrirRevisaoOcr = (arquivo: File, texto: string, dadosIniciais: FormData | undefined, data: any) => {
    const extraidos = data.dados_extraidos || {};
    const dadosRevisao = {
      arquivo,
      urlOriginal: URL.createObjectURL(arquivo),
      texto,
      confirmouConferencia: false,
      cidadeUfManual: Boolean(dadosIniciais?.cidade || dadosIniciais?.uf),
      camposPerguntar: [] as RevisaoOcr['camposPerguntar'],
      cnpj: dadosIniciais?.cnpj || String(extraidos.cnpj || ''),
      servico: dadosIniciais?.servico || String(extraidos.servico || ''),
      valor: dadosIniciais?.valor || (extraidos.valor ? String(extraidos.valor).replace('.', ',') : ''),
      cidade: dadosIniciais?.cidade || String(extraidos.cidade || ''),
      uf: dadosIniciais?.uf || String(extraidos.uf || ''),
      candidatos: data.candidatos_ocr || {},
      divergencias: data.campos_divergentes || [],
      confiança: Number(data['confiança_ocr'] || 0),
      erros: data.erros_ocr || [],
    };
    const divergencias = new Set<string>(data.campos_divergentes || []);
    const camposPerguntar = CAMPOS_REVISAO
      .filter(({ chave }) => {
        const valor = dadosRevisao[chave];
        const preenchidoManualmente = Boolean(dadosIniciais?.[chave]);
        return !preenchidoManualmente && (!validarRespostaCampo(chave, valor) || (data.candidatos_ocr?.[chave] || []).length > 1);
      })
      .map(({ chave }) => chave);
    const revisao = { ...dadosRevisao, camposPerguntar };
    setRevisaoOcr(revisao);
    if (camposPerguntar.length === 0) {
      setRevisaoCampoIndex(null);
      addMessage('assistant', 'A leitura encontrou os campos necessários sem divergências detectadas. Não vou pedir que você os redigite. Confira o resumo no painel e compare com o PDF/imagem antes de confirmar.');
      return;
    }
    setRevisaoCampoIndex(0);
    addMessage('assistant', perguntaCampoRevisao(camposPerguntar[0], revisao, data.candidatos_ocr || {}, data.erros_ocr || []));
    const camposConflitantes = CAMPOS_REVISAO.filter(({ chave }) => (data.candidatos_ocr?.[chave] || []).length > 1);
    if (camposConflitantes.length) {
      addMessage('assistant', `Atenção: encontrei mais de uma leitura para ${camposConflitantes.map(({ rotulo }) => rotulo).join(', ')}. Vou perguntar esses campos no chat e não vou selecionar um automaticamente.`);
    }
    if (camposPerguntar.length < CAMPOS_REVISAO.length) {
      const legiveis = CAMPOS_REVISAO
        .filter(({ chave }) => !camposPerguntar.includes(chave))
        .map(({ chave, rotulo }) => `${rotulo}: ${revisao[chave]}`);
      if (legiveis.length) addMessage('assistant', `Já consegui ler estes campos e não vou pedir que os redigite: ${legiveis.join(' · ')}. Confira-os no original antes da confirmação final.`);
    }
  };

  const perguntaCampoRevisao = (chave: RevisaoOcr['camposPerguntar'][number], dados: Pick<RevisaoOcr, 'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf'>, candidatos: Record<string, string[]>, erros: string[] = []) => {
    const campo = CAMPOS_REVISAO.find(({ chave: chaveCampo }) => chaveCampo === chave)!;
    const atual = dados[campo.chave].trim();
    const alternativas = candidatos[campo.chave] || [];
    if (alternativas.length > 1) {
      return `Os leitores encontraram valores diferentes para **${campo.rotulo}**: ${alternativas.map((valor) => `“${valor}”`).join(', ')}. Confira o campo no arquivo original e digite exatamente o valor que aparece. Se estiver ilegível, responda **não consigo ler**; não vou escolher nem completar por conta própria.`;
    }
    if (alternativas.length === 1 && validarRespostaCampo(chave, alternativas[0])) {
      return `Consegui ler **${campo.rotulo}** diretamente do texto da NFSe, junto ao rótulo do documento: “${alternativas[0]}”. A extração automática não basta para confirmar o dado. Compare com o original e responda **correto** se estiver igual, ou envie o valor exato que aparece na nota.${erros.length ? ` Observação: ${erros.join('; ')}` : ''}`;
    }
    const sugestao = atual ? ` A leitura automática sugere: “${atual}”.` : ' A leitura automática não conseguiu determinar este campo.';
    const divergencia = alternativas.length > 1 ? ` Os modelos deram leituras diferentes: ${alternativas.map((item) => `“${item}”`).join(', ')}.` : '';
    return `Para não presumir nem inventar dados, confira no arquivo original e informe **${campo.rotulo}**.${sugestao}${divergencia} Digite o valor correto; se a sugestão estiver exatamente correta, responda **correto**.`;
  };

  const responderDuvidaOcr = (resposta: string) => {
    if (!revisaoOcr || revisaoCampoIndex === null) return;
    const chaveCampo = revisaoOcr.camposPerguntar[revisaoCampoIndex];
    const campo = CAMPOS_REVISAO.find(({ chave }) => chave === chaveCampo)!;
    const texto = resposta.trim();
    const confirmaSugestao = /^(correto|correta|confirmo|confirmado|confirmada|sim|certo|certa|ok|est[aá] correto|est[aá] correta)[.! ]*$/i.test(texto);
    if (/^(n[aã]o sei|n[aã]o consigo ler|ileg[ií]vel|desconhecido|desconhecida|\?)\W*$/i.test(texto)) {
      addMessage('user', texto);
      addMessage('assistant', `Sem problema. Não vou preencher **${campo.rotulo}** por suposição e a análise ficará bloqueada. Consulte o original ou uma segunda via legível e informe o campo; se não for possível, cancele esta revisão.`);
      return;
    }
    const valorAtual = revisaoOcr[campo.chave].trim();
    addMessage('user', texto);
    if (confirmaSugestao && (revisaoOcr.candidatos[campo.chave] || []).length > 1) {
      addMessage('assistant', `Como há mais de uma leitura para **${campo.rotulo}**, não posso aceitar “correto” sem saber qual delas consta na NFSe. Digite o valor exato do documento.`);
      return;
    }
    if (confirmaSugestao && (!valorAtual || !validarRespostaCampo(campo.chave, valorAtual))) {
      addMessage('assistant', `Não há uma sugestão válida para **${campo.rotulo}**. Consulte o documento e digite o valor correto; não posso completar ou aceitar este dado por suposição.`);
      return;
    }

    const valorConfirmado = confirmaSugestao ? valorAtual : texto;
    if (!confirmaSugestao && !validarRespostaCampo(campo.chave, valorConfirmado)) {
      addMessage('assistant', `Esse valor não passou na validação básica de **${campo.rotulo}**. Confira o documento e envie novamente; não vou avançar nem completar o dado automaticamente.`);
      return;
    }
    const dadosAtualizados = { ...revisaoOcr, [campo.chave]: valorConfirmado, confirmouConferencia: false };
    setRevisaoOcr(dadosAtualizados);
    const proximoIndice = revisaoCampoIndex + 1;
    if (proximoIndice < revisaoOcr.camposPerguntar.length) {
      setRevisaoCampoIndex(proximoIndice);
      addMessage('assistant', perguntaCampoRevisao(revisaoOcr.camposPerguntar[proximoIndice], dadosAtualizados, revisaoOcr.candidatos, revisaoOcr.erros));
      return;
    }

    setRevisaoCampoIndex(null);
    const notaDivergencias = dadosAtualizados.divergencias.length
      ? `\n\nOs modelos divergiram nestes campos: ${dadosAtualizados.divergencias.join(', ')}. Confirme cada um visualmente no arquivo original.`
      : '';
    addMessage('assistant', `Respostas registradas para conferência:\n\n- CNPJ do prestador: ${dadosAtualizados.cnpj}\n- Serviço: ${dadosAtualizados.servico}\n- Valor: ${dadosAtualizados.valor}\n- Município: ${dadosAtualizados.cidade}\n- UF: ${dadosAtualizados.uf}${notaDivergencias}\n\nCompare com o documento original. A análise ainda está bloqueada até você marcar a confirmação final no painel.`);
  };

  const validarRespostaCampo = (campo: 'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf', valor: string): boolean => {
    if (!valor.trim()) return false;
    if (campo === 'cnpj') {
      const digitos = valor.replace(/\D/g, '');
      if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
      const calcularDigito = (base: string, pesos: number[]) => {
        const resto = base.split('').reduce((soma, digito, indice) => soma + Number(digito) * pesos[indice], 0) % 11;
        return resto < 2 ? 0 : 11 - resto;
      };
      const dv1 = calcularDigito(digitos.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      const dv2 = calcularDigito(digitos.slice(0, 12) + dv1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
      return Number(digitos[12]) === dv1 && Number(digitos[13]) === dv2;
    }
    if (campo === 'servico' || campo === 'cidade') return valor.trim().length >= 3;
    if (campo === 'uf') return ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].includes(valor.trim().toUpperCase());
    const limpo = valor.trim().replace(/[^\d,.-]/g, '');
    const normalizado = limpo.includes(',') && limpo.includes('.')
      ? limpo.lastIndexOf(',') > limpo.lastIndexOf('.') ? limpo.replace(/\./g, '').replace(',', '.') : limpo.replace(/,/g, '')
      : limpo.replace(',', '.');
    return Number.isFinite(Number(normalizado)) && Number(normalizado) > 0;
  };

  const confirmarRevisaoOcr = async () => {
    if (!revisaoOcr || !revisaoOcr.confirmouConferencia) return;
    setIsLoading(true);
    setStatusMsg('Enviando dados conferidos...');
    const payload = new FormData();
    payload.append('archivo', revisaoOcr.arquivo);
    payload.append('cnpj', revisaoOcr.cnpj);
    payload.append('servico', revisaoOcr.servico);
    payload.append('valor', revisaoOcr.valor);
    payload.append('cidade', revisaoOcr.cidade);
    payload.append('uf', revisaoOcr.uf);
    if (revisaoOcr.texto.trim()) payload.append('mensaje', revisaoOcr.texto.trim());
    payload.append('confirmar_dados', 'true');
    try {
      const response = await fetch(`${API_BASE}/analisar`, { method: 'POST', body: payload });
      const data = await response.json();
      if (!response.ok || data.status !== 'procesando' || !data.dados_extraidos?.task_id) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const mensagem = addMessage('assistant', '⏳ **Gerando análise com os dados conferidos...**');
      URL.revokeObjectURL(revisaoOcr.urlOriginal);
      setRevisaoOcr(null);
      pollTask(data.dados_extraidos.task_id, mensagem.id);
    } catch (error) {
      addMessage('assistant', `❌ **Não foi possível iniciar a análise:** ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const enviarMensagem = async (texto: string, arquivo?: File | null) => {
    if (revisaoOcr) {
      if (arquivo) {
        addMessage('assistant', 'Conclua ou cancele a revisão atual antes de anexar outro arquivo.');
        return;
      }
      if (revisaoCampoIndex !== null) {
        if (texto.trim()) responderDuvidaOcr(texto);
      } else {
        if (texto.trim()) addMessage('user', texto);
        addMessage('assistant', 'Os campos já foram perguntados. Revise o resumo acima e confirme no painel, ou cancele para reiniciar a leitura. Não vou iniciar análise a partir de uma mensagem durante esta revisão.');
      }
      return;
    }
    // Se tem arquivo mas não tem texto, envia só o arquivo
    if (arquivo && !texto.trim()) {
      addMessage('user', `📎 **Arquivo anexado:** \`${arquivo.name}\``);
      await solicitarRevisaoOcr(arquivo, '');
      return;
    }

    // Adiciona mensagem do usuário
    let mensagemUsuario = texto;

    if (arquivo) {
      mensagemUsuario += `\n\n📎 **Arquivo anexado:** \`${arquivo.name}\``;
    }

    addMessage('user', mensagemUsuario);
    if (arquivo) {
      await solicitarRevisaoOcr(arquivo, texto);
      return;
    }
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

      const data = await response.json();

      const assistantMsg = addMessage('assistant', '⏳ **Analisando...**');

      if (data.dados_extraidos?.task_id) {
        pollTask(data.dados_extraidos.task_id, assistantMsg.id);
      } else {
        addMessage('assistant', data.resumo || '❌ **A análise não foi iniciada:** o servidor não retornou o identificador da tarefa. Tente novamente.');
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

          {/* Debug Button */}
          <button
            onClick={() => setDebugOpen(true)}
            className="ml-auto text-xs text-amber-400 bg-slate-700/50 px-3 py-1.5 rounded-lg hover:bg-slate-700 hover:text-amber-300 transition-all border border-slate-600/50"
            title="Abrir debug"
          >
            🔍 Debug
          </button>
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

      {/* Debug Modal */}
      <DebugModal
        isOpen={debugOpen}
        onClose={() => setDebugOpen(false)}
      />

      {revisaoOcr && revisaoCampoIndex === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-600 bg-slate-900 p-6 shadow-2xl" aria-labelledby="ocr-review-title">
            <h2 id="ocr-review-title" className="text-xl font-semibold text-white">Conferir dados da NFSe</h2>
            <p className="mt-2 text-sm text-amber-300">A leitura automática pode errar. Compare cada campo com o PDF/imagem original; a análise só começa após sua confirmação.</p>
            <a href={revisaoOcr.urlOriginal} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm text-blue-300 underline">Abrir arquivo original: {revisaoOcr.arquivo.name}</a>
            <p className="mt-1 text-xs text-slate-400">Concordância dos modelos: {Math.round(revisaoOcr.confiança * 100)}% — indicador auxiliar, não é garantia de acerto.</p>
            {revisaoOcr.erros.length > 0 && <p className="mt-2 text-xs text-amber-200">Observações: {revisaoOcr.erros.join('; ')}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([
                ['cnpj', 'CNPJ do prestador'],
                ['servico', 'Descrição do serviço'],
                ['valor', 'Valor total (R$)'],
                ['cidade', revisaoOcr.cidadeUfManual ? 'Município da prestação (manual)' : 'Município da prestação'],
                ['uf', revisaoOcr.cidadeUfManual ? 'UF (manual)' : 'UF'],
              ] as const).map(([campo, rotulo]) => (
                <label key={campo} className="text-sm text-slate-300">
                  {rotulo}{revisaoOcr.divergencias.includes(campo) && <span className="ml-2 text-amber-300">— divergência</span>}
                  <input
                    value={revisaoOcr[campo]}
                    onChange={(event) => setRevisaoOcr((prev) => prev ? { ...prev, [campo]: event.target.value, confirmouConferencia: false } : prev)}
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                  />
                  {(revisaoOcr.candidatos[campo] || []).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{revisaoOcr.candidatos[campo].map((candidato, indice) => <button key={`${campo}-${indice}`} type="button" onClick={() => setRevisaoOcr((prev) => prev ? { ...prev, [campo]: candidato, confirmouConferencia: false } : prev)} className="rounded bg-slate-700 px-2 py-1 text-left text-xs text-amber-200 hover:bg-slate-600">Sugestão: {candidato}</button>)}</span>}
                </label>
              ))}
              {revisaoOcr.cidadeUfManual && <p className="sm:col-span-2 text-xs text-slate-400">Município e UF vieram preenchidos manualmente no formulário; confira-os no documento, pois determinam regras tributárias locais.</p>}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button onClick={() => { URL.revokeObjectURL(revisaoOcr.urlOriginal); setRevisaoOcr(null); }} disabled={isLoading} className="rounded-lg border border-slate-600 px-4 py-2 text-slate-200">Cancelar</button>
              <label className="flex w-full items-start gap-2 text-sm text-slate-200">
                <input type="checkbox" checked={revisaoOcr.confirmouConferencia} disabled={!CAMPOS_REVISAO.every(({ chave }) => validarRespostaCampo(chave, revisaoOcr[chave]))} onChange={(event) => setRevisaoOcr((prev) => prev ? { ...prev, confirmouConferencia: event.target.checked } : prev)} className="mt-1 accent-emerald-500" />
                Conferi estes dados diretamente no arquivo original; confirmo que o CNPJ é do prestador e que o valor, serviço e município correspondem à NFSe.
              </label>
              <button onClick={confirmarRevisaoOcr} disabled={isLoading || !revisaoOcr.confirmouConferencia} className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50">Confirmar e iniciar análise</button>
            </div>
          </section>
        </div>
      )}

      {revisaoOcr && revisaoCampoIndex !== null && (
        <div className="fixed bottom-24 right-4 z-40">
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(revisaoOcr.urlOriginal);
              setRevisaoOcr(null);
              setRevisaoCampoIndex(null);
              addMessage('assistant', 'Revisão cancelada. Nenhuma análise foi iniciada.');
            }}
            className="rounded-lg border border-slate-500 bg-slate-800 px-3 py-2 text-sm text-slate-200 shadow-lg hover:bg-slate-700"
          >
            Cancelar revisão da NFSe
          </button>
        </div>
      )}
    </div>
  );
}