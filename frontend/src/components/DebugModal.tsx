'use client';

import { useState } from 'react';

type DebugResult = {
  label: string;
  ok: boolean;
  detalle: string;
  data?: unknown;
};

export default function DebugModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [results, setResults] = useState<DebugResult[]>([]);
  const [running, setRunning] = useState(false);

  if (!isOpen) return null;

  const API_BASE = process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api`
    : '/api';

  const runDebug = async () => {
    setRunning(true);
    setResults([]);
    const out: DebugResult[] = [];

    // ===== 1. TEST /api/health =====
    try {
      const t0 = Date.now();
      const res = await fetch(`${API_BASE}/health`);
      const ms = Date.now() - t0;
      const texto = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(texto); } catch { /* não é JSON */ }
      out.push({
        label: 'GET /api/health',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms\nResposta bruta: ${texto.slice(0, 300)}`,
        data,
      });
    } catch (e) {
      out.push({ label: 'GET /api/health', ok: false, detalle: `Erro de rede: ${e instanceof Error ? e.message : e}` });
    }

    // ===== 2. TEST /api/diagnostico =====
    try {
      const t0 = Date.now();
      const res = await fetch(`${API_BASE}/diagnostico`);
      const ms = Date.now() - t0;
      const texto = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(texto); } catch { /* não é JSON */ }
      out.push({
        label: 'GET /api/diagnostico',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms\nResposta bruta: ${texto.slice(0, 300)}`,
        data,
      });
    } catch (e) {
      out.push({ label: 'GET /api/diagnostico', ok: false, detalle: `Erro de rede: ${e instanceof Error ? e.message : e}` });
    }

    // ===== 3. TEST POST /api/analisar =====
    let taskId: string | null = null;
    try {
      const t0 = Date.now();
      const form = new FormData();
      form.append('cnpj', '12345678901230');
      form.append('servico', 'Desenvolvimento de software');
      form.append('valor', '1000');
      form.append('cidade', 'Campo Grande');
      form.append('uf', 'MS');
      const res = await fetch(`${API_BASE}/analisar`, { method: 'POST', body: form });
      const ms = Date.now() - t0;
      const texto = await res.text();
      let data: unknown = null;
      try { data = JSON.parse(texto); } catch { /* não é JSON */ }
      out.push({
        label: 'POST /api/analisar',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms\nResposta bruta: ${texto.slice(0, 300)}`,
        data,
      });
      taskId = (data as { dados_extraidos?: { task_id?: string } })?.dados_extraidos?.task_id ?? null;
    } catch (e) {
      out.push({ label: 'POST /api/analisar', ok: false, detalle: `Erro de rede: ${e instanceof Error ? e.message : e}` });
    }

    // ===== 4. POLLING STATUS =====
    if (taskId) {
      out.push({ label: 'Polling status', ok: true, detalle: `task_id=${taskId} · esperando resultado...` });
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const sres = await fetch(`${API_BASE}/analisar/status/${taskId}`);
          const stexto = await sres.text();
          let sdata: unknown = null;
          try { sdata = JSON.parse(stexto); } catch { /* não é JSON */ }
          const obj = sdata as { status?: string; relatorio_completo?: string; error?: string; etapa_actual?: string; progreso?: number };

          if (obj.status === 'concluido') {
            const rel = obj.relatorio_completo || '';
            // Detecta mojibake real (sequências como ├í, ├¡, ƒôï)
            const mojibakeReal = /├[í¡ú║éëâÁÉÍÓÚçÇ]|ƒ[ôÅøöÆ]|Ô[£Üå]/.test(rel);
            // Detecta bytes altos (acentos válidos)
            const bytesAltos = /[\u0080-\u00FF]/.test(rel);
            out.push({
              label: 'Status final (concluido)',
              ok: true,
              detalle: `status=${obj.status} · longitud=${rel.length}\n` +
                `mojibake real=${mojibakeReal} · bytes altos=${bytesAltos}\n` +
                `primeros 400 chars:\n${rel.slice(0, 400)}`,
              data: sdata,
            });
            break;
          }
          if (obj.status === 'error') {
            out.push({ label: 'Status final (error)', ok: false, detalle: `status=error · ${JSON.stringify(sdata).slice(0, 400)}`, data: sdata });
            break;
          }
          if (i === 29) {
            out.push({ label: 'Status final', ok: false, detalle: `Tempo limite excedido. Último status: ${JSON.stringify(sdata).slice(0, 300)}`, data: sdata });
          }
        } catch (e) {
          out.push({ label: 'Polling status', ok: false, detalle: `Erro de rede: ${e instanceof Error ? e.message : e}` });
          break;
        }
      }
    } else {
      out.push({ label: 'Polling status', ok: false, detalle: 'Não foi possível obter task_id da resposta de /api/analisar' });
    }

    setResults(out);
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[760px] max-h-[88vh] bg-slate-900 border border-slate-700 rounded-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h2 className="text-base font-semibold text-white">Diagnóstico Wiserule</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-xs text-slate-400">
            Este diagnóstico testa a conexão com o Worker, o encoding das respostas e o fluxo completo de análise.
            Cada teste mostra a resposta bruta para facilitar a identificação de problemas.
          </p>

          <button
            onClick={runDebug}
            disabled={running}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:from-amber-400 hover:to-orange-500 transition-all text-sm font-medium disabled:opacity-50"
          >
            {running ? '⏳ Executando diagnóstico...' : '▶️ Executar diagnóstico completo'}
          </button>

          {results.map((r, i) => (
            <div key={i} className={`rounded-lg border p-3 ${r.ok ? 'border-emerald-600 bg-emerald-950/20' : 'border-red-600 bg-red-950/20'}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.ok ? '✅' : '❌'}</span>
                <span className="text-sm font-semibold text-white">{r.label}</span>
              </div>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap mt-1">{r.detalle}</pre>
            </div>
          ))}

          {running && (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              Executando testes...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}