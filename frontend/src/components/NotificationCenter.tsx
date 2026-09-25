'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

type Notice = { id: number; tipo: 'acesso' | 'erro' | 'sistema'; titulo: string; mensagem: string; lida: boolean; criado_em: string };
const API_BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : '/api';

export default function NotificationCenter() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    void load();
    const timer = window.setInterval(() => { void load(); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const togglePanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) await load();
  };

  const markRead = async (id: number) => {
    try {
      const response = await fetch(`${API_BASE}/notificacoes/${id}`, { method: 'PATCH', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível atualizar a notificação.');
      setItems((previous) => previous.map((item) => item.id === id ? { ...item, lida: true } : item));
      setUnread((count) => Math.max(0, count - 1));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.');
    }
  };

  const markAllRead = async () => {
    try {
      const response = await fetch(`${API_BASE}/notificacoes/lidas`, { method: 'PATCH', credentials: 'include' });
      if (!response.ok) throw new Error('Não foi possível atualizar as notificações.');
      setItems((previous) => previous.map((item) => ({ ...item, lida: true })));
      setUnread(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.');
    }
  };

  if (!user) return null;
  return <div className="notification-center">
    <button type="button" className="notification-trigger" onClick={() => void togglePanel()} aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`} aria-expanded={open}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
      {unread > 0 && <span className="notification-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Histórico de notificações">
      <header className="notification-header"><div><strong>Notificações</strong><span>{unread ? `${unread} não lidas` : 'Tudo em dia'}</span></div><button type="button" onClick={() => void load()} aria-label="Atualizar notificações">↻</button></header>
      {unread > 0 && <button type="button" className="notification-mark-all" onClick={() => void markAllRead()}>Marcar todas como lidas</button>}
      <div className="notification-list">
        {loading && items.length === 0 ? <div className="notification-empty">Carregando histórico...</div> : error ? <div className="notification-error">{error}</div> : items.length === 0 ? <div className="notification-empty">Nenhuma notificação no histórico.</div> : items.map((item) => <article className={`notification-item ${item.lida ? 'is-read' : 'is-unread'}`} key={item.id}>
          <span className={`notification-icon notification-icon-${item.tipo}`} aria-hidden="true">{item.tipo === 'acesso' ? '＋' : item.tipo === 'erro' ? '!' : 'i'}</span>
          <div className="notification-content"><strong>{item.titulo}</strong><p>{item.mensagem}</p><time dateTime={item.criado_em}>{new Date(`${item.criado_em.replace(' ', 'T')}Z`).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</time></div>
          {!item.lida && <button type="button" className="notification-read" onClick={() => void markRead(item.id)} aria-label="Marcar como lida" title="Marcar como lida" />}
        </article>)}
      </div>
    </section>}
  </div>;
}
