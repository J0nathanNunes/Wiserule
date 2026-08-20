'use client';

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

const API_ICONS: Record<string, string> = {
  backend:      '🧠',
  openrouter:   '🤖',
  minhareceita: '📋',
  supabase:     '🗄️',
  tavily:       '🔍',
  geranet:      '📄',
  railway:      '🚂',
};

export default function StatusModal({ isOpen, onClose, data, loading, isDiagnostico }: StatusModalProps) {
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

  const LatencyBar = ({ ms }: { ms?: number | null }) => {
    if (ms === null || ms === undefined) return <div className="h-1 w-full rounded-full bg-slate-700/50" />;
    const max = 3000;
    const pct = Math.min((ms / max) * 100, 100);
    const color = ms < 200 ? '#22c55e' : ms < 800 ? '#eab308' : '#ef4444';
    return (
      <div className="h-1 w-full rounded-full bg-slate-700/50 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    );
  };

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
        <div
          className="relative w-full max-w-lg mx-4 overflow-hidden rounded-2xl border"
          style={{ borderColor: 'rgba(30,41,59,0.8)', backgroundColor: '#0f172a' }}
        >
          {!loading && apis && (
            <div
              className="absolute left-0 right-0 h-px pointer-events-none z-10"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.5), transparent)',
                animation: 'scan-line 3s ease-in-out infinite',
              }}
            />
          )}

          <div className="relative px-5 py-4 border-b" style={{ borderColor: 'rgba(30,41,59,0.8)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-lg">📡</span>
                <div>
                  <h2 className="text-base font-semibold" style={{ color: '#e2e8f0' }}>Monitor de APIs</h2>
                  <p className="text-[10px] tracking-wider uppercase" style={{ color: '#64748b' }}>
                    {isDiagnostico ? '🔍 Diagnóstico completo' : 'Status dos serviços'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg transition-colors hover:bg-slate-700/50"
                style={{ color: '#64748b' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {(statusCounts.online > 0 || statusCounts.offline > 0 || statusCounts.erro > 0 || statusCounts.nao_configurada > 0) && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {[
                  { key: 'online', label: 'Online', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
                  { key: 'offline', label: 'Offline', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                  { key: 'erro', label: 'Erro', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
                  { key: 'nao_configurada', label: 'Não config.', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
                ].map(({ key, label, color, bg }) => {
                  const val = (statusCounts as any)[key] ?? 0;
                  if (val === 0) return null;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium leading-none"
                      style={{ backgroundColor: bg, color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                      {val} {label}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative px-5 py-4 max-h-80 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}>
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="flex gap-1.5">
                  {[0, 150, 300].map((d, i) => (
                    <span
                      key={i}
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor: '#3b82f6',
                        animation: 'pulse-dot 1.2s ease-in-out infinite',
                        animationDelay: `${d}ms`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs tracking-widest uppercase" style={{ color: '#475569' }}>
                  Escaneando serviços...
                </span>
              </div>
            ) : sorted.length > 0 ? (
              <div className="space-y-1.5">
                {sorted.map(([key, value], idx) => {
                  const cfg = STATUS_CONFIG[value.status] || STATUS_CONFIG.nao_configurada;
                  const icon = API_ICONS[key] || '🔌';
                  return (
                    <div
                      key={key}
                      className="group rounded-xl border p-3 transition-all duration-300 hover:border-slate-600"
                      style={{
                        borderColor: 'rgba(30,41,59,0.6)',
                        animation: `fade-slide-up 0.3s ease-out ${idx * 0.04}s both`,
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base flex-shrink-0">{icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate" style={{ color: '#e2e8f0' }}>
                                {value.nome}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium leading-none"
                                style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}
                              >
                                {cfg.label}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          <StatusDot status={value.status} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="text-[11px] font-mono truncate"
                          style={{ color: value.status === 'online' ? '#94a3b8' : '#ef4444' }}
                        >
                          {value.detalhe || '—'}
                        </span>
                        {value.latencia_ms !== null && value.latencia_ms !== undefined && (
                          <span
                            className="text-[10px] font-mono flex-shrink-0 tabular-nums"
                            style={{
                              color: value.latencia_ms < 200 ? '#22c55e' : value.latencia_ms < 800 ? '#eab308' : '#ef4444',
                            }}
                          >
                            {value.latencia_ms}ms
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5">
                        <LatencyBar ms={value.latencia_ms} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <span className="text-3xl">📭</span>
                <p className="text-sm" style={{ color: '#64748b' }}>Nenhum dado disponível.</p>
                <p className="text-[10px]" style={{ color: '#475569' }}>
                  Clique em &quot;📡 Monitor de APIs&quot; para verificar
                </p>
              </div>
            )}
          </div>

          <div
            className="relative px-5 py-3 border-t flex items-center justify-between"
            style={{ borderColor: 'rgba(30,41,59,0.8)', backgroundColor: 'rgba(15,23,42,0.8)' }}
          >
            <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: '#475569' }}>
              {data?.timestamp && (
                <span className="flex items-center gap-1">
                  <span>⏱</span>
                  {new Date(data.timestamp).toLocaleTimeString('pt-BR')}
                </span>
              )}
              {data?.python && <span>🐍 {data.python}</span>}
              {!data?.python && <span>v1.0</span>}
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 hover:brightness-110"
              style={{ backgroundColor: '#1e293b', color: '#94a3b8', border: '1px solid rgba(51,65,85,0.5)' }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}