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

    // 1. Test /api/health
    try {
      const t0 = Date.now();
      const res = await fetch(`${API_BASE}/health`);
      const ms = Date.now() - t0;
      const data = await res.json();
      out.push({
        label: 'GET /api/health',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms · ${JSON.stringify(data).slice(0, 200)}`,
        data,
      });
    } catch (e) {
      out.push({ label: 'GET /api/health', ok: false, detalle: `Erro: ${e instanceof Error ? e.message : e}` });
    }

    // 2. Test /api/diagnostico
    try {
      const t0 = Date.now();
      const res = await fetch(`${API_BASE}/diagnostico`);
      const ms = Date.now() - t0;
      const data = await res.json();
      out.push({
        label: 'GET /api/diagnostico',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms · ${JSON.stringify(data).slice(0, 200)}`,
        data,
      });
    } catch (e) {
      out.push({ label: 'GET /api/diagnostico', ok: false, detalle: `Erro: ${e instanceof Error ? e.message : e}` });
    }

    // 3. Test POST /api/analisar (análisis de prueba)
    try {
      const t0 = Date.now();
      const form = new FormData();
      form.append('cnpj', '11222333000144');
      form.append('servico', 'Desenvolvimento de software');
      form.append('valor', '1000');
      form.append('cidade', 'Campo Grande');
      form.append('uf', 'MS');
      const res = await fetch(`${API_BASE}/analisar`, { method: 'POST', body: form });
      const ms = Date.now() - t0;
      const data = await res.json();
      out.push({
        label: 'POST /api/analisar',
        ok: res.ok,
        detalle: `HTTP ${res.status} · ${ms}ms · ${JSON.stringify(data).slice(0, 200)}`,
        data,
      });

      // 4. Poll status si hay task_id
      const taskId = data?.dados_extraidos?.task_id;
      if (taskId) {
        out.push({ label: 'Polling status', ok: true, detalle: `task_id=${taskId} · esperando...` });
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          try {
            const sres = await fetch(`${API_BASE}/analisar/status/${taskId}`);
            const sdata = await sres.json();
            if (sdata.status === 'concluido') {
              const rel = sdata.relatorio_completo || '';
              const mojibake = /[\u0080-\u00FF]/.test(rel);
              out.push({
                label: 'Status final',
                ok: true,
                detalle: `status=${sdata.status} · longitud=${rel.length} · mojibake=${mojibake} · primeros 300 chars:\n${rel.slice(0, 300)}`,
                data: sdata,
              });
              break;
            }
            if (sdata.status === 'error') {
              out.push({ label: 'Status final', ok: false, detalle: `status=error · ${JSON.stringify(sdata).slice(0, 300)}`, data: sdata });
              break;
            }
          } catch (e) {
            out.push({ label: 'Polling status', ok: false, detalle: `Erro: ${e instanceof Error ? e.message : e}` });
            break;
          }
        }
      }
    } catch (e) {
      out.push({ label: 'POST /api/analisar', ok: false, detalle: `Erro: ${e instanceof Error ? e.message : e}` });
    }

    setResults(out);
    setRunning(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[720px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔍</span>
            <h2 className="text-base font-semibold text-white">Debug Wiserule</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-xs text-slate-400">
            Diagnostica la conexión con el Worker, el encoding de las respuestas y el flujo completo de análisis.
          </p>

          <button
            onClick={runDebug}
            disabled={running}
            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg hover:from-amber-400 hover:to-orange-500 transition-all text-sm font-medium disabled:opacity-50"
          >
            {running ? '⏳ Ejecutando diagnóstico...' : '▶️ Ejecutar diagnóstico completo'}
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
              Ejecutando pruebas...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}