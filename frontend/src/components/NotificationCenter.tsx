'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type Notice = { id: number; tipo: 'acesso' | 'erro' | 'sistema'; titulo: string; mensagem: string; lida: boolean; criado_em: string };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : '/api';

function formatarData(valor: string): string {
  return new Date(`${valor.replace(' ', 'T')}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function IconeTipo({ tipo }: { tipo: Notice['tipo'] }) {
  return <span className={`notification-icon notification-icon-${tipo}`} aria-hidden="true">{tipo === 'acesso' ? '＋' : tipo === 'erro' ? '!' : 'i'}</span>;
}

export default function NotificationCenter() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const areaRef = useRef<HTMLDivElement>(null);

  // Fecha o painel ao clicar ou focar fora da área do sino.
  useEffect(() => {
    if (!open) return;
    const fechar = (evento: MouseEvent | FocusEvent) => {
      if (areaRef.current && evento.target instanceof Node && !areaRef.current.contains(evento.target)) {
        setOpen(false);
      }
    };
    const fecharTeclado = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', fechar);
    document.addEventListener('focusin', fechar);
    document.addEventListener('keydown', fecharTeclado);
    return () => {
      document.removeEventListener('mousedown', fechar);
      document.removeEventListener('focusin', fechar);
      document.removeEventListener('keydown', fecharTeclado);
    };
  }, [open]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/notificacoes`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar notificações.');
      setItems(data.notificacoes || []);
      setUnread(data.nao_lidas || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar notificações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load, user]);

  const togglePanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) await load();
  };

  const marcarLida = async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/notificacoes/${id}`, { method: 'PATCH', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível atualizar a notificação.');
      // No painel de pendentes a notificação sai; no histórico passa a "lida".
      setItems((previous) => historyOpen
        ? previous.map((item) => item.id === id ? { ...item, lida: true } : item)
        : previous.filter((item) => item.id !== id));
      setUnread((count) => Math.max(0, count - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.');
    }
  };

  const marcarTodasLidas = async () => {
    try {
      const response = await fetch(`${API_BASE}/notificacoes/lidas`, { method: 'PATCH', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível atualizar as notificações.');
      setItems((previous) => historyOpen ? previous.map((item) => ({ ...item, lida: true })) : []);
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.');
    }
  };

  const excluir = async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/notificacoes/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível excluir a notificação.');
      setItems((previous) => previous.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao excluir.');
    }
  };

  if (!user) return null;
  const naoLidas = items.filter((item) => !item.lida);
  return <div className="notification-center" ref={areaRef}>
    <button type="button" className="notification-trigger" onClick={() => void togglePanel()} aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`} aria-expanded={open}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
      {unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Notificações não lidas">
      <header className="notification-header"><div><strong>Notificações</strong><span>{unread ? `${unread} não lidas` : 'Tudo em dia'}</span></div><button type="button" onClick={() => void load()} aria-label="Atualizar notificações">↻</button></header>
      {naoLidas.length > 0 && <button type="button" className="notification-mark-all" onClick={() => void marcarTodasLidas()}>Marcar todas como lidas</button>}
      <div className="notification-list">
        {loading && items.length === 0 ? <div className="notification-empty">Carregando notificações...</div> : error ? <div className="notification-error">{error}</div> : naoLidas.length === 0 ? <div className="notification-empty">Nenhuma notificação pendente.</div> : naoLidas.map((item) => <article className="notification-item is-unread" key={item.id}>
          <IconeTipo tipo={item.tipo} />
          <div className="notification-content"><strong>{item.titulo}</strong><p>{item.mensagem}</p><time dateTime={item.criado_em}>{formatarData(item.criado_em)}</time></div>
          <button type="button" className="notification-read" onClick={() => void marcarLida(item.id)} aria-label="Marcar como lida" title="Marcar como lida">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
          </button>
        </article>)}
      </div>
      <footer className="notification-footer">
        <button type="button" onClick={() => { setOpen(false); setHistoryOpen(true); void load(); }}>Ver histórico completo</button>
      </footer>
    </section>}
    {historyOpen && <div className="notification-history-overlay" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={(evento) => { if (evento.target === evento.currentTarget) setHistoryOpen(false); }}>
      <section className="notification-history-panel">
        <header className="notification-history-header">
          <div><span className="auth-eyebrow">CENTRAL DE NOTIFICAÇÕES</span><h2 id="history-title">Histórico de notificações</h2><p>Registro completo de acessos, erros e avisos do sistema.</p></div>
          <button type="button" className="auth-close" onClick={() => setHistoryOpen(false)} aria-label="Fechar histórico">×</button>
        </header>
        {loading ? <div className="auth-checking"><span className="auth-spinner" /> Carregando histórico...</div> : error ? <div className="notification-error">{error}</div> : items.length === 0 ? <div className="notification-empty">Nenhuma notificação registrada até o momento.</div> : <div className="notification-history-list">
          {items.map((item) => <article className={`notification-item ${item.lida ? 'is-read' : 'is-unread'}`} key={item.id}>
            <IconeTipo tipo={item.tipo} />
            <div className="notification-content"><strong>{item.titulo}</strong><p>{item.mensagem}</p><time dateTime={item.criado_em}>{formatarData(item.criado_em)}</time></div>
            {!item.lida && <button type="button" className="notification-read" onClick={() => void marcarLida(item.id)} aria-label="Marcar como lida" title="Marcar como lida">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
            </button>}
            <button type="button" className="notification-delete" onClick={() => void excluir(item.id)} aria-label="Excluir notificação" title="Excluir notificação">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v6M14 11v6" /></svg>
            </button>
          </article>)}
        </div>}
        <footer className="notification-history-footer">
          <span>Notificações marcadas como lidas permanecem registradas aqui.</span>
          <button type="button" onClick={() => void load()}>Atualizar</button>
        </footer>
      </section>
    </div>}
  </div>;
}
