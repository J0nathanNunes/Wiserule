'use client';

import { useState } from 'react';

type DebugResult = {
  label: string;
  ok: boolean;
  detalle: string;
  data?: unknown;
};

export default function DebugModal({ isOpen, onClose, embedded = false }: { isOpen: boolean; onClose: () => void; embedded?: boolean }) {
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
      const res = await fetch(`${API_BASE}/health`, { credentials: 'include' });
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
      const res = await fetch(`${API_BASE}/diagnostico`, { credentials: 'include' });
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
      const res = await fetch(`${API_BASE}/analisar`, { method: 'POST', credentials: 'include', body: form });
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
          const sres = await fetch(`${API_BASE}/analisar/status/${taskId}`, { credentials: 'include' });
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

  const content = (
      <div className={`debug-modal-panel ${embedded ? 'w-full' : 'w-[760px]'} max-h-[88vh] bg-[#fbfcf8] text-[#293536] border border-[#ccd9d4] rounded-sm flex flex-col overflow-hidden shadow-[0_18px_60px_rgba(24,44,42,.2)]`}>
        {!embedded && <div className="px-4 py-3 border-b border-[#dce3df] bg-[#f2f5f1] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-5 w-[3px] bg-[#397b78]" aria-hidden="true" />
            <h2 className="font-serif text-base font-medium">Diagnóstico Wiserule</h2>
          </div>
          <button onClick={onClose} className="text-[#758582] hover:text-[#293536] text-xl leading-none">×</button>
        </div>}

        {/* Corpo */}
        <div className="debug-modal-body flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {!embedded && <p className="text-xs text-[#687875]">
            Este diagnóstico testa a conexão com o Worker, o encoding das respostas e o fluxo completo de análise.
            Cada teste mostra a resposta bruta para facilitar a identificação de problemas.
          </p>}

          <button
            onClick={runDebug}
            disabled={running}
            className="w-full py-2.5 bg-[#397b78] text-white rounded-sm hover:bg-[#2d6865] transition-colors text-sm font-medium disabled:opacity-50"
          >
            {running ? 'Executando diagnóstico...' : 'Executar diagnóstico completo'}
          </button>

          {results.map((r, i) => (
            <div key={i} className={`rounded-sm border p-3 ${r.ok ? 'border-[#b9d5c8] bg-[#eef5ef]' : 'border-[#e1c6bf] bg-[#fbf0ec]'}`}>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${r.ok ? 'bg-[#397b60]' : 'bg-[#a34e48]'}`} aria-hidden="true" />
                <span className="text-sm font-semibold text-[#293536]">{r.label}</span>
              </div>
              <pre className="text-[11px] text-[#53615e] whitespace-pre-wrap mt-1">{r.detalle}</pre>
            </div>
          ))}

          {running && (
            <div className="flex items-center gap-2 text-[#687875] text-sm">
              <span className="w-2 h-2 bg-[#397b78] rounded-full animate-pulse" />
              Executando testes...
            </div>
          )}
        </div>
      </div>
  );

  return embedded ? content : (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      {content}
    </div>
  );
}