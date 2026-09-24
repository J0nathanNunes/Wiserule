'use client';

import { useState } from 'react';
import DebugModal from './DebugModal';

type ApiEntry = {
  nome: string;
  status: string;
  detalhe: string;
  latencia_ms?: number | null;
};

type StatusModalProps = {
  isOpen: boolean;
  onClose: () => void;
  data: {
    apis: Record<string, ApiEntry>;
    resumo?: { total: number; online: number; offline: number; erro: number; nao_configurada: number };
    timestamp?: string;
    python?: string;
  } | null;
  loading: boolean;
  isDiagnostico?: boolean;
};

const STATUS_CONFIG: Record<string, { color: string; glow: string; label: string }> = {
  online:        { color: '#22c55e', glow: 'rgba(34,197,94,0.3)', label: 'Online' },
  offline:       { color: '#ef4444', glow: 'rgba(239,68,68,0.3)', label: 'Offline' },
  erro:          { color: '#f97316', glow: 'rgba(249,115,22,0.3)', label: 'Erro' },
  nao_configurada: { color: '#64748b', glow: 'rgba(100,116,139,0.2)', label: 'Não configurada' },
};

const API_LABELS: Record<string, string> = {
  backend: 'Backend', openrouter: 'OpenRouter', minhareceita: 'MinhaReceita',
  supabase: 'Supabase', tavily: 'Tavily', geranet: 'Geranet', railway: 'Railway',
};

export default function StatusModal({ isOpen, onClose, data, loading, isDiagnostico }: StatusModalProps) {
  const [activeTab, setActiveTab] = useState<'servicos' | 'diagnostico'>('servicos');
  if (!isOpen) return null;

  const apis = data?.apis ?? null;
  const sorted = apis
    ? Object.entries(apis)
        .sort(([, a], [, b]) => {
          const ordem = { online: 0, offline: 1, erro: 2, nao_configurada: 3 };
          return (ordem[a.status as keyof typeof ordem] ?? 99) - (ordem[b.status as keyof typeof ordem] ?? 99);
        })
    : [];

  const statusCounts = data?.resumo ?? { total: sorted.length, online: 0, offline: 0, erro: 0, nao_configurada: 0 };
  if (!data?.resumo && sorted.length > 0) {
    for (const [, v] of sorted) {
      const s = v.status as keyof typeof STATUS_CONFIG;
      if (s === 'online') statusCounts.online++;
      else if (s === 'offline') statusCounts.offline++;
      else if (s === 'erro') statusCounts.erro++;
      else if (s === 'nao_configurada') statusCounts.nao_configurada++;
    }
  }

  const pulseKeyframes = `
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }
    @keyframes scan-line {
      0% { top: 0; opacity: 0; }
      10% { opacity: 0.6; }
      90% { opacity: 0.6; }
      100% { top: 100%; opacity: 0; }
    }
    @keyframes fade-slide-up {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  const StatusDot = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.nao_configurada;
    return (
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{
          backgroundColor: cfg.color,
          boxShadow: `0 0 6px ${cfg.glow}`,
          animation: status === 'online' ? 'pulse-dot 2s ease-in-out infinite' : 'none',
        }}
      />
    );
  };

  return (
    <>
      <style>{pulseKeyframes}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="status-modal-panel relative w-full max-w-2xl mx-4 overflow-hidden rounded-sm border border-[#303a49] bg-[#0d1420] text-[#e6e9ed] shadow-[0_24px_90px_rgba(0,0,0,.45)]">
          {!loading && apis && (
            <div
              className="absolute left-0 right-0 h-px pointer-events-none z-10"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(57,123,120,0.4), transparent)',
                animation: 'scan-line 3s ease-in-out infinite',
              }}
            />
          )}

          <div className="relative px-6 pt-5 pb-0 border-b border-[#293444]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="h-7 w-[3px] bg-[#d4a45c]" aria-hidden="true" />
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-[#f0f1f3]">Saúde do sistema</h2>
                  <p className="mt-0.5 text-xs text-[#8993a1]">
                    Serviços conectados e ferramentas de diagnóstico
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-sm transition-colors text-[#8993a1] hover:bg-[#1b2432] hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 flex gap-6" role="tablist" aria-label="Ferramentas do sistema">
              {([
                ['servicos', 'Serviços'],
                ['diagnostico', 'Diagnóstico'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  className={`border-b-2 px-0 pb-3 text-sm transition-colors ${activeTab === tab ? 'border-[#d4a45c] text-[#f0d39a]' : 'border-transparent text-[#8791a0] hover:text-[#e3e6eb]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'diagnostico' ? (
          <div className="px-6 py-5 max-h-[68vh] overflow-y-auto">
            <div className="mb-4 flex items-start gap-3 border border-[#303a49] bg-[#111925] p-4">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#d4a45c]" />
              <div>
                <h3 className="text-sm font-semibold text-[#edf0f3]">Diagnóstico técnico</h3>
                <p className="mt-1 text-xs leading-5 text-[#9da7b4]">Testa a conexão, as respostas da API e o fluxo de análise. Use para investigar falhas.</p>
              </div>
            </div>
            <DebugModal isOpen onClose={onClose} embedded />
          </div>
          ) : (
          <div className="relative px-6 py-5 max-h-[68vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#354050 transparent' }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map((d, i) => (
                    <span
                      key={i}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: '#d4a45c',
                        animation: 'pulse-dot 1.2s ease-in-out infinite',
                        animationDelay: `${d}ms`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs tracking-widest uppercase text-[#758582]">
                  Verificando conexões...
                </span>
              </div>
            ) : sorted.length > 0 ? (
              <>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {[
                  { label: 'Operacionais', value: statusCounts.online, color: '#56c59b' },
                  { label: 'Com falha', value: statusCounts.offline + statusCounts.erro, color: '#ef8277' },
                  { label: 'Total', value: statusCounts.total, color: '#d4a45c' },
                ].map((item) => (
                  <div key={item.label} className="rounded-sm border border-[#293444] bg-[#111925] px-3 py-3">
                    <div className="text-2xl font-semibold tabular-nums" style={{ color: item.color }}>{item.value}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[.1em] text-[#8f99a7]">{item.label}</div>
                  </div>
                ))}
              </div>
              <div className="space-y-2">
                {sorted.map(([key, value], idx) => {
                  const cfg = STATUS_CONFIG[value.status] || STATUS_CONFIG.nao_configurada;
                  return (
                    <div
                      key={key}
                      className="group flex items-center gap-3 rounded-sm border border-[#293444] bg-[#111925] px-4 py-3 transition-colors hover:border-[#8d7046]"
                      style={{
                        animation: `fade-slide-up 0.3s ease-out ${idx * 0.04}s both`,
                      }}
                    >
                      <StatusDot status={value.status} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[#e8ebef]">{value.nome || API_LABELS[key] || key}</div>
                        <div className="mt-1 truncate text-[11px] text-[#929cab]">{value.detalhe || 'Sem detalhes adicionais'}</div>
                      </div>
                      <span className="hidden rounded-sm px-2 py-1 text-[10px] font-medium sm:inline-flex" style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                        {cfg.label}
                      </span>
                      <div className="w-16 shrink-0 text-right">
                        {value.latencia_ms !== null && value.latencia_ms !== undefined
                          ? <span className="text-xs font-mono tabular-nums text-[#d5b478]">{value.latencia_ms}<span className="ml-0.5 text-[10px] text-[#8791a0]">ms</span></span>
                          : <span className="text-xs text-[#707a88]">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="h-8 w-[3px] bg-[#bdcbc6]" aria-hidden="true" />
                <p className="text-sm text-[#53615e]">Nenhum dado disponível.</p>
                <p className="text-[10px] text-[#758582]">
                  Use “Monitor de serviços” para verificar
                </p>
              </div>
            )}
          </div>)}

          <div className="relative px-6 py-3 border-t border-[#293444] bg-[#0b111b] flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] font-mono text-[#858f9d]">
              {data?.timestamp && <span>{new Date(data.timestamp).toLocaleTimeString('pt-BR')}</span>}
              {data?.python && <span>Runtime {data.python}</span>}
              {!data?.python && <span>{sorted.length} serviço(s)</span>}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-sm transition-all duration-200 hover:brightness-110"
              style={{ backgroundColor: '#1b2432', color: '#d5d9df', border: '1px solid #384251' }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}