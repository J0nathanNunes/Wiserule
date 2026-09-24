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

type RevisaoOcr = {
  arquivo: File;
  urlOriginal: string;
  texto: string;
  confirmouConferencia: boolean;
  cidadeUfManual: boolean;
  camposPerguntar: Array<'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf'>;
  cnpj: string;
  servico: string;
  servico_descricao: string;
  cnpj_tomador: string;
  codigo_servico_nfse: string;
  item_lista_lc116: string;
  valor: string;
  valor_liquido: string;
  iss_retencao: string;
  numero_nfse: string;
  data_emissao: string;
  simples_nacional_nfse: string;
  mei_nfse: boolean;
  cidade: string;
  uf: string;
  candidatos: Record<string, string[]>;
  divergencias: string[];
  confiança: number;
  erros: string[];
  metodoOcr: string;
};

const CAMPOS_REVISAO: Array<{ chave: 'cnpj' | 'servico' | 'valor' | 'cidade' | 'uf'; rotulo: string }> = [
  { chave: 'cnpj', rotulo: 'CNPJ do prestador' },
  { chave: 'servico', rotulo: 'descrição do serviço' },
  { chave: 'valor', rotulo: 'valor total da nota (em reais)' },
  { chave: 'cidade', rotulo: 'município da prestação' },
  { chave: 'uf', rotulo: 'UF do município da prestação' },
];

// Decodifica o relatório de Base64 (o backend o codifica para protegê-lo do Durable Object)
function decodificarRelatorio(texto: string): string {
  if (!texto) return texto;
  // Se não parece Base64 (contem caracteres não-Base64), devolva o texto original
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
      content: [
        '# Olá. Vamos à regra certa.',
        '',
        'Uma leitura cuidadosa da NFS-e faz diferença. Envie o documento para conferir os dados, consultar o cadastro do prestador pelo CNPJ e organizar a análise de ISS e retenções.',
        '',
        '**Comece por aqui:** anexe uma nota em PDF ou imagem, ou informe CNPJ, serviço, valor e município. Você revisará os dados extraídos antes de iniciar a análise.',
      ].join('\n'),
      timestamp: new Date(),
    },
  ]);

  const [isLoading, setIsLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [chatSuggestion, setChatSuggestion] = useState<{ text: string; key: number } | null>(null);
  const [revisaoOcr, setRevisaoOcr] = useState<RevisaoOcr | null>(null);
  const [revisaoCampoIndex, setRevisaoCampoIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const suggestionKeyRef = useRef(0);

  const selectChatSuggestion = (text: string) => {
    suggestionKeyRef.current += 1;
    setChatSuggestion({ text, key: suggestionKeyRef.current });
  };

  // Rola para o final quando novas mensagens chegam
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Em produção usa a URL do Worker; em dev usa o proxy local
  const API_BASE = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

  // Polling: acompanha o progresso da tarefa e mostra os passos no chat
  const pollTask = async (taskId: string, assistantMsgId: string) => {
    const maxAttempts = 60; // 60 * 2s = 120s timeout
    let attempts = 0;
    let ultimaEtapa = '';
    let inicioEm: number | null = null;

    const formatearTempo = (ms: number) => {
      if (ms < 1000) return `${Math.round(ms)}ms`;
      return `${(ms / 1000).toFixed(1)}s`;
    };

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/analisar/status/${taskId}`, { credentials: 'include' });
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

        // Registra o início para calcular o tempo decorrido
        if (data.inicio_em && !inicioEm) {
          inicioEm = new Date(data.inicio_em).getTime();
        }

        // Atualiza status
        setStatusMsg(data.etapa_actual || `Analisando... (${data.progresso || 0}%)`);

        // Mostra cada etapa como uma mensagem de progresso no chat
        const etapa = data.etapa_actual || '';
        if (etapa && etapa !== ultimaEtapa && data.status !== 'concluido') {
          ultimaEtapa = etapa;
          const tempo = inicioEm ? formatearTempo(Date.now() - inicioEm) : '';
          addMessage('assistant', `⏳ **${etapa}**${tempo ? ` · ${tempo}` : ''}`);
        }

        if (data.status === 'concluido' && data.relatorio_completo) {
          // Decodifica Base64 (o backend codifica o relatório para protegê-lo do Durable Object)
          const relatorio = decodificarRelatorio(data.relatorio_completo);
          const tempoTotal = inicioEm ? formatearTempo(Date.now() - inicioEm) : '';
          // Adiciona o relatório como nova mensagem no final, após as mensagens
          // de progresso (ex.: "Gerando relatório completo..."), preservando a ordem.
          addMessage('assistant', `✅ **Análise concluída**${tempoTotal ? ` em ${tempoTotal}` : ''}.\n\n${relatorio}`);
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
    setMessages((prev) => [
      ...(role === 'user' ? prev.filter((message) => !message.id.startsWith('welcome')) : prev),
      newMsg,
    ]);
    return newMsg;
  };

  const enviarParaAnalise = async (formData: FormData, arquivo?: File | null) => {
    setMessages((prev) => prev.filter((message) => !message.id.startsWith('welcome')));
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
        credentials: 'include',
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
    const t0 = Date.now();
    addMessage('assistant', '⏳ **Lendo documento...**');
    const payload = new FormData();
    payload.append('archivo', arquivo);
    try {
      const response = await fetch(`${API_BASE}/analisar`, { method: 'POST', credentials: 'include', body: payload });
      const data = await response.json();
      const t1 = Date.now();
      addMessage('assistant', `⏳ **Extraendo informações...** · ${((t1 - t0) / 1000).toFixed(1)}s`);
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

  const abrirRevisaoOcr = async (arquivo: File, texto: string, dadosIniciais: FormData | undefined, data: any) => {
    const extraidos = data.dados_extraidos || {};
    const dadosRevisao = {
      arquivo,
      urlOriginal: URL.createObjectURL(arquivo),
      texto: String(data.texto_ocr || texto || ''),
      confirmouConferencia: false,
      cidadeUfManual: Boolean(dadosIniciais?.cidade || dadosIniciais?.uf),
      camposPerguntar: [] as RevisaoOcr['camposPerguntar'],
      cnpj: dadosIniciais?.cnpj || String(extraidos.cnpj || ''),
      servico: dadosIniciais?.servico || String(extraidos.servico || ''),
      servico_descricao: String(extraidos.servico_descricao || ''),
      cnpj_tomador: String(extraidos.cnpj_tomador || ''),
      codigo_servico_nfse: String(extraidos.codigo_servico_nfse || ''),
      item_lista_lc116: String(extraidos.item_lista_lc116 || ''),
      valor: dadosIniciais?.valor || (extraidos.valor ? String(extraidos.valor).replace('.', ',') : ''),
      valor_liquido: typeof extraidos.valor_liquido === 'number' ? String(extraidos.valor_liquido).replace('.', ',') : '',
      iss_retencao: String(extraidos.iss_retencao || ''),
      numero_nfse: String(extraidos.numero_nfse || ''),
      data_emissao: String(extraidos.data_emissao || ''),
      simples_nacional_nfse: String(extraidos.simples_nacional_nfse || ''),
      mei_nfse: extraidos.mei_nfse === true,
      cidade: dadosIniciais?.cidade || String(extraidos.cidade || ''),
      uf: dadosIniciais?.uf || String(extraidos.uf || ''),
      candidatos: data.candidatos_ocr || data.candidatos || {},
      divergencias: data.campos_divergentes || [],
      confiança: Number(data['confiança_ocr'] ?? data.confianza_ocr ?? 0),
      erros: data.erros_ocr || [],
      metodoOcr: String(data.metodo_ocr || 'extração multimodal'),
    };
    const divergencias = new Set<string>(data.campos_divergentes || []);
    const camposPerguntar = CAMPOS_REVISAO
      .filter(({ chave }) => {
        const valor = dadosRevisao[chave];
        const preenchidoManualmente = Boolean(dadosIniciais?.[chave]);
        if (preenchidoManualmente) return false;
        const candidatosCampo = (data.candidatos_ocr || data.candidatos)?.[chave] || [];
        const candidatoUnicoValido = candidatosCampo.length === 1 && validarRespostaCampo(chave, candidatosCampo[0]);
        // Preenche o campo com o candidato único válido, mas mantém o campo na
        // lista de conferência para que o usuário confirme no modal.
        if (candidatoUnicoValido && !divergencias.has(chave)) {
          dadosRevisao[chave] = candidatosCampo[0];
        }
        return !validarRespostaCampo(chave, valor) || candidatosCampo.length > 1;
      })
      .map(({ chave }) => chave);
    const revisao = { ...dadosRevisao, camposPerguntar };
    setRevisaoOcr(revisao);
    // Verifica coerência entre "Serviço Prestado" (código, para tributação) e
    // "Descrição do Serviço" (informativo). Se há discrepancia grande, avisa.
    const servicoPrestado = revisao.servico.trim();
    const descricaoServicio = revisao.servico_descricao.trim();
    let avisoDiscrepancia = '';
    if (servicoPrestado && descricaoServicio) {
      const palavrasServicio = new Set(servicoPrestado.toLowerCase().split(/\W+/).filter((p) => p.length > 3));
      const palavrasDescricao = new Set(descricaoServicio.toLowerCase().split(/\W+/).filter((p) => p.length > 3));
      const coincidencias = Array.from(palavrasServicio).filter((p) => palavrasDescricao.has(p)).length;
      const total = Math.max(palavrasServicio.size, 1);
      const similitud = coincidencias / total;
      if (similitud < 0.3) {
        avisoDiscrepancia = `\n\n⚠️ **Verifique o serviço:** o "Serviço Prestado" declarado ("${servicoPrestado.slice(0, 120)}...") não parece coincidir com a "Descrição do Serviço" ("${descricaoServicio.slice(0, 120)}..."). Para a análise fiscal se usará o código do "Serviço Prestado", que é o único válido a fins tributários. Confirme que o documento é correto.`;
      }
    }
    // O modal deve aparecer sempre, mesmo quando todos os campos parecem
    // inequívocos. A análise só pode começar pela confirmação explícita nele.
    setRevisaoCampoIndex(null);
    addMessage('assistant', `Extração concluída. Revise e, se necessário, corrija todos os campos no modal antes de confirmar a análise fiscal.${avisoDiscrepancia}`);
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
    const candidatoAtual = revisaoOcr.candidatos[campo.chave] || [];
    const sugestaoConfirmavel = candidatoAtual.length === 1 ? candidatoAtual[0] : valorAtual;
    if (confirmaSugestao && (!sugestaoConfirmavel || !validarRespostaCampo(campo.chave, sugestaoConfirmavel))) {
      addMessage('assistant', `Não há uma sugestão válida para **${campo.rotulo}**. Consulte o documento e digite o valor correto; não posso completar ou aceitar este dado por suposição.`);
      return;
    }

    const valorConfirmado = confirmaSugestao ? sugestaoConfirmavel : texto;
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

  // Grau de confiabilidade conforme a quantidade de dados extraídos com sucesso.
  const nivelConfiabilidade = (revisao: RevisaoOcr): { rotulo: string; cor: string } => {
    const camposPreenchidos = CAMPOS_REVISAO.filter(({ chave }) => validarRespostaCampo(chave, revisao[chave])).length;
    const total = CAMPOS_REVISAO.length;
    const proporcao = camposPreenchidos / total;
    if (proporcao >= 0.9) return { rotulo: 'Muito alta', cor: 'text-emerald-400' };
    if (proporcao >= 0.7) return { rotulo: 'Alta', cor: 'text-green-400' };
    if (proporcao >= 0.4) return { rotulo: 'Média', cor: 'text-amber-400' };
    return { rotulo: 'Baixa', cor: 'text-red-400' };
  };

  const enviarDatosConferidos = async (revisao: RevisaoOcr) => {
    setIsLoading(true);
    setStatusMsg('Enviando dados conferidos...');
    const payload = new FormData();
    payload.append('archivo', revisao.arquivo);
    payload.append('cnpj', revisao.cnpj);
    if (revisao.cnpj_tomador.trim()) payload.append('cnpj_tomador', revisao.cnpj_tomador.trim());
    payload.append('servico', revisao.servico);
    if (revisao.servico_descricao.trim()) payload.append('servico_descricao', revisao.servico_descricao.trim());
    if (revisao.codigo_servico_nfse.trim()) payload.append('codigo_servico_nfse', revisao.codigo_servico_nfse.trim());
    if (revisao.item_lista_lc116.trim()) payload.append('item_lista_lc116', revisao.item_lista_lc116.trim());
    payload.append('valor', revisao.valor);
    if (revisao.valor_liquido.trim()) payload.append('valor_liquido', revisao.valor_liquido.trim());
    if (revisao.iss_retencao.trim()) payload.append('iss_retencao', revisao.iss_retencao.trim());
    if (revisao.numero_nfse.trim()) payload.append('numero_nfse', revisao.numero_nfse.trim());
    if (revisao.data_emissao.trim()) payload.append('data_emissao', revisao.data_emissao.trim());
    if (revisao.simples_nacional_nfse.trim()) payload.append('simples_nacional_nfse', revisao.simples_nacional_nfse.trim());
    payload.append('mei_nfse', String(revisao.mei_nfse));
    payload.append('cidade', revisao.cidade);
    payload.append('uf', revisao.uf);
    if (revisao.texto.trim()) payload.append('mensaje', revisao.texto.trim());
    payload.append('confirmar_dados', 'true');
    try {
      const response = await fetch(`${API_BASE}/analisar`, { method: 'POST', credentials: 'include', body: payload });
      const data = await response.json();
      if (!response.ok || data.status !== 'procesando' || !data.dados_extraidos?.task_id) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      const mensagem = addMessage('assistant', '⏳ **Gerando análise com os dados conferidos...**');
      URL.revokeObjectURL(revisao.urlOriginal);
      setRevisaoOcr(null);
      pollTask(data.dados_extraidos.task_id, mensagem.id);
    } catch (error) {
      addMessage('assistant', `❌ **Não foi possível iniciar a análise:** ${error instanceof Error ? error.message : 'erro desconhecido'}`);
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const confirmarRevisaoOcr = async () => {
    if (!revisaoOcr) return;
    // Fecha o modal imediatamente antes de iniciar a análise.
    const revisao = revisaoOcr;
    URL.revokeObjectURL(revisao.urlOriginal);
    setRevisaoOcr(null);
    setRevisaoCampoIndex(null);
    await enviarDatosConferidos(revisao);
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
    setStatusMsg('Consultando o assistente fiscal...');

    const historico = messages
      .filter((mensagem) =>
        !mensagem.id.startsWith('welcome') &&
        !mensagem.content.startsWith('⏳') &&
        !mensagem.content.startsWith('✅ **Análise concluída')
      )
      .slice(-8)
      .map(({ role, content }) => ({ role, content: content.slice(-1500) }));
    historico.push({ role: 'user', content: texto.slice(0, 4000) });

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagens: historico }),
      });

      const data = await response.json();
      if (!response.ok || data.status !== 'sucesso' || !data.resposta) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      addMessage('assistant', data.resposta);
    } catch (error) {
      addMessage('assistant', `❌ **Não foi possível obter uma resposta:** ${error instanceof Error ? error.message : 'erro de conexão'}`);
    } finally {
      setIsLoading(false);
      setStatusMsg('');
    }
  };

  const handleNovaAnalise = () => {
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        role: 'assistant',
        content: [
          '# Nova análise',
          '',
          'Envie uma NFS-e ou informe os dados da operação para começar.',
          '',
          '**Comece por aqui:** anexe uma nota em PDF ou imagem, ou informe CNPJ, serviço, valor e município.',
        ].join('\n'),
        timestamp: new Date(),
      },
    ]);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#f3f4ef]">
      {/* Sidebar */}
      <Sidebar
        onSubmit={enviarParaAnalise}
        isLoading={isLoading}
        onNovaAnalise={handleNovaAnalise}
      />

      {/* Main Chat Area */}
      <div className="chat-main-area flex-1 flex flex-col min-w-0">
        {/* Messages */}
        <div className="chat-scroll flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {messages.map((msg) => msg.id.startsWith('welcome') ? (
            <div key={msg.id} className="welcome-stage">
              <section className="welcome-card w-full px-6 py-7 sm:px-9 sm:py-8" aria-labelledby="welcome-title">
                <div className="welcome-content">
                  <div className="welcome-kicker mb-4 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.2em]">
                    <span className="welcome-rule" />
                    Análise fiscal de NFS-e
                  </div>
                  <h2 id="welcome-title" className="welcome-title max-w-3xl text-3xl sm:text-4xl leading-[1.12]">ISS e retenções, com clareza desde o início.</h2>
                  <p className="welcome-description mt-3 max-w-2xl text-sm leading-6">Envie uma nota para revisar os dados extraídos ou escolha uma pergunta para começar.</p>

                  <div className="welcome-prompts mt-6" aria-label="Sugestões para começar">
                    {[
                      'Quais dados preciso para analisar uma NFS-e?',
                      'Como funciona a retenção de ISS?',
                      'O que é conferido na nota fiscal?',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => selectChatSuggestion(suggestion)}
                        disabled={isLoading}
                        className="welcome-prompt"
                      >
                        {suggestion}
                        <span aria-hidden="true">↗</span>
                      </button>
                    ))}
                  </div>

                  <div className="welcome-steps mt-7 grid gap-3 border-t pt-5 sm:grid-cols-3">
                    {[
                      ['01', 'Envie a nota'],
                      ['02', 'Confira os dados'],
                      ['03', 'Veja a análise'],
                    ].map(([numero, titulo]) => (
                      <div key={numero} className="welcome-feature flex items-center gap-3">
                        <span className="welcome-step-number">{numero}</span>
                        <span className="text-xs font-medium">{titulo}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          ) : <ChatMessage key={msg.id} message={msg} />)}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="mt-1 h-5 w-[3px] bg-[#397b78] flex-shrink-0" aria-hidden="true" />
              <div className="loading-card bg-[#e3eeea] rounded-[3px] px-5 py-3 border border-[#d6e4df] max-w-md text-[#293736]">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[#397b78] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#397b78] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-[#397b78] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-[#637471] ml-2">Analisando...</span>
                </div>
                {statusMsg && (
                  <div className="text-xs text-[#758582] mt-1 border-t border-[#cfddd8] pt-1">
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
          suggestion={chatSuggestion}
        />
      </div>

      {revisaoOcr && revisaoCampoIndex === null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section className="review-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-sm border border-[#ccd9d4] bg-[#fbfcf8] p-6 text-[#293536] shadow-[0_18px_60px_rgba(24,44,42,.2)]" aria-labelledby="ocr-review-title">
            <h2 id="ocr-review-title" className="font-serif text-xl font-medium">Conferir dados da NFSe</h2>
            <p className="mt-2 text-sm text-[#85672f]">A leitura automática pode errar. Compare cada campo com o PDF/imagem original; a análise só começa após sua confirmação.</p>
            <a href={revisaoOcr.urlOriginal} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-sm text-[#397b78] underline">Abrir arquivo original: {revisaoOcr.arquivo.name}</a>
            <p className="mt-1 text-xs text-[#758182]">Confiabilidade da extração: <span className={`font-semibold ${nivelConfiabilidade(revisaoOcr).cor}`}>{nivelConfiabilidade(revisaoOcr).rotulo}</span></p>
            {revisaoOcr.erros.length > 0 && <p className="mt-2 text-xs text-[#85672f]">Observações: {revisaoOcr.erros.join('; ')}</p>}
            {revisaoOcr.texto.trim() && <details className="mt-3 rounded-sm border border-[#dce3df] bg-[#f2f5f1] p-3">
              <summary className="cursor-pointer text-sm text-[#397b78]">Ver texto reconhecido pelo OCR</summary>
              <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-[#53615e]">{revisaoOcr.texto}</pre>
            </details>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([
                ['cnpj', 'CNPJ do prestador'],
                ['servico', 'Descrição do serviço'],
                ['valor', 'Valor total (R$)'],
                ['cidade', revisaoOcr.cidadeUfManual ? 'Município da prestação (manual)' : 'Município da prestação'],
                ['uf', revisaoOcr.cidadeUfManual ? 'UF (manual)' : 'UF'],
              ] as const).map(([campo, rotulo]) => (
                <label key={campo} className="text-sm text-[#53615e]">
                  {rotulo}{revisaoOcr.divergencias.includes(campo) && <span className="ml-2 text-[#a36e27]">— divergência</span>}
                  <input
                    value={revisaoOcr[campo]}
                    onChange={(event) => setRevisaoOcr((prev) => prev ? { ...prev, [campo]: event.target.value, confirmouConferencia: false } : prev)}
                    className="mt-1 w-full rounded-sm border border-[#cbd8d3] bg-white px-3 py-2 text-[#273234] focus:border-[#397b78] focus:outline-none"
                  />
                </label>
              ))}
              {revisaoOcr.cidadeUfManual && <p className="sm:col-span-2 text-xs text-[#758182]">Município e UF vieram preenchidos manualmente no formulário; confira-os no documento, pois determinam regras tributárias locais.</p>}
            </div>
            <div className="mt-6 border-t border-[#dce3df] pt-5">
              <h3 className="text-sm font-semibold text-[#293536]">Outros dados fiscais extraídos</h3>
              <p className="mt-1 text-xs text-[#758182]">São declarações/transcrições da nota, não confirmação cadastral. Revise e corrija conforme o original; campos vazios não foram identificados.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {([
                  ['cnpj_tomador', 'CNPJ do tomador'],
                  ['servico_descricao', 'Descrição detalhada do serviço'],
                  ['codigo_servico_nfse', 'Código do serviço na NFSe'],
                  ['item_lista_lc116', 'Item da lista LC 116'],
                  ['valor_liquido', 'Valor líquido (R$)'],
                  ['iss_retencao', 'Retenção do ISS declarada'],
                  ['numero_nfse', 'Número da NFSe'],
                  ['data_emissao', 'Data de emissão'],
                  ['simples_nacional_nfse', 'Simples Nacional declarado na nota'],
                ] as const).map(([campo, rotulo]) => (
                  <label key={campo} className="text-sm text-[#53615e]">
                    {rotulo}
                    <input
                      value={revisaoOcr[campo]}
                      onChange={(event) => setRevisaoOcr((prev) => prev ? { ...prev, [campo]: event.target.value, confirmouConferencia: false } : prev)}
                      className="mt-1 w-full rounded-sm border border-[#cbd8d3] bg-white px-3 py-2 text-[#273234] focus:border-[#397b78] focus:outline-none"
                    />
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm text-[#53615e]">
                  <input type="checkbox" checked={revisaoOcr.mei_nfse} onChange={(event) => setRevisaoOcr((prev) => prev ? { ...prev, mei_nfse: event.target.checked, confirmouConferencia: false } : prev)} className="accent-[#397b78]" />
                  NFSe declara prestador como MEI
                </label>
              </div>
              {revisaoOcr.camposPerguntar.length > 0 && <p className="mt-3 text-xs text-[#85672f]">Campos que a extração marcou para conferência: {revisaoOcr.camposPerguntar.join(', ')}. Compare-os com atenção antes da confirmação.</p>}
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button onClick={() => { URL.revokeObjectURL(revisaoOcr.urlOriginal); setRevisaoOcr(null); setRevisaoCampoIndex(null); }} disabled={isLoading} className="rounded-sm border border-[#cbd8d3] px-4 py-2 text-[#53615e] hover:bg-[#f0f4f1]">Cancelar</button>
              <button onClick={confirmarRevisaoOcr} disabled={isLoading} className="rounded-sm bg-[#397b78] px-4 py-2 font-medium text-white hover:bg-[#2d6865] disabled:opacity-50">Confirmar e iniciar análise</button>
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
            className="rounded-sm border border-[#bdcbc6] bg-[#fbfcf8] px-3 py-2 text-sm text-[#53615e] shadow-lg hover:bg-[#e9efeb]"
          >
            Cancelar revisão da NFSe
          </button>
        </div>
      )}
    </div>
  );
}