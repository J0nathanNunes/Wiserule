'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { AuthContext, AuthUser } from '@/contexts/AuthContext';

type User = AuthUser;
type UserRow = Omit<User, 'status'> & { status: 'ativo' | 'pendente' | 'recusado'; criado_em: string };
type Props = { children: ReactNode };

const API_BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api` : '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init?.headers || {}), ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const responseText = await response.text();
  let data: { error?: string } = {};
  try {
    data = responseText ? JSON.parse(responseText) as { error?: string } : {};
  } catch {
    data.error = responseText.slice(0, 240);
  }
  if (!response.ok) throw new Error(data.error || `Falha na solicitação (HTTP ${response.status}).`);
  return data as T;
}

function Marca() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M2.5 4h7l11.5 16h-7L2.5 4Z" fill="currentColor" /><path d="M14.2 4h7.3l-6.1 8.8-3.8-5.3L14.2 4Z" fill="currentColor" opacity=".78" /></svg>
    </span>
  );
}

export default function AuthShell({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<'login' | 'cadastro' | 'bootstrap'>('login');
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [adminOpen, setAdminOpen] = useState(false);
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const checkSession = useCallback(async () => {
    try {
      const data = await request<{ usuario: User | null }>('/auth/sessao')
      setApiAvailable(true);
      setUser(data.usuario);
    } catch {
      setApiAvailable(false);
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void checkSession();
    void request<{ inicializacaoDisponivel: boolean }>('/auth/configuracao')
      .then((data) => { setApiAvailable(true); setBootstrapAvailable(data.inicializacaoDisponivel); })
      .catch(() => { setApiAvailable(false); setBootstrapAvailable(false); });
  }, [checkSession]);

  const carregarUsuarios = async () => {
    setLoadingUsers(true);
    setError('');
    try {
      const data = await request<{ usuarios: UserRow[] }>('/usuarios');
      setRows(data.usuarios);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar usuários.');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (adminOpen) void carregarUsuarios();
    // A atualização acontece sempre que o painel abre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminOpen]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      if (mode === 'cadastro') {
        await request('/auth/cadastro', { method: 'POST', body: JSON.stringify(payload) });
        setNotice('Cadastro recebido. O acesso ficará disponível assim que um administrador aprovar sua solicitação.');
        setMode('login');
      } else if (mode === 'bootstrap') {
        const data = await request<{ usuario: User }>('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) });
        setUser(data.usuario);
        setBootstrapAvailable(false);
        setNotice('Conta administrativa criada.');
      } else {
        const data = await request<{ usuario: User }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
        setUser(data.usuario);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a solicitação.');
    } finally {
      setBusy(false);
    }
  };

  const atualizarUsuario = async (usuario: UserRow, status: 'ativo' | 'recusado', papel = usuario.papel) => {
    setError('');
    try {
      await request(`/usuarios/${encodeURIComponent(usuario.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, papel }),
      });
      await carregarUsuarios();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o usuário.');
    }
  };

  const sair = async () => {
    try { await request('/auth/sair', { method: 'POST', body: '{}' }); } catch { /* A sessão local será encerrada mesmo se a rede falhar. */ }
    setUser(null);
    setAdminOpen(false);
    setMode('login');
  };

  return (
    <AuthContext.Provider value={{
      user,
      signOut: sair,
      openUserManagement: () => { setError(''); setAdminOpen(true); },
    }}>
      <>
      <div className="auth-app" inert={!user}>
        {children}
      </div>
      {(checking || !user) && (
        <div className="auth-screen" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
          <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
          <section className="auth-card">
            <div className="auth-card-glow" aria-hidden="true" />
            <div className="auth-card-content">
              <div className="auth-brand"><Marca /><div><strong>Wiserule</strong><span>Regra clara. Decisão segura.</span></div></div>
              {checking ? (
                <div className="auth-checking"><span className="auth-spinner" /> Verificando seu acesso...</div>
              ) : (
                <>
                  <div className="auth-heading">
                    <span className="auth-eyebrow">ACESSO À PLATAFORMA</span>
                    <h1 id="auth-title">{mode === 'cadastro' ? 'Solicite seu acesso.' : mode === 'bootstrap' ? 'Configure o administrador.' : 'Bem-vindo de volta.'}</h1>
                    <p>{mode === 'cadastro' ? 'Crie seu cadastro. Um administrador precisará aprová-lo antes do primeiro acesso.' : mode === 'bootstrap' ? 'Crie a primeira conta administrativa com a chave de configuração fornecida pelo responsável técnico.' : 'Entre com seu e-mail e senha para continuar.'}</p>
                  </div>
                    {!apiAvailable && <div className="auth-alert auth-alert-error" role="alert">Não foi possível acessar a API de autenticação neste endereço. A atualização do site ainda não foi publicada no Cloudflare Pages; atualize a implantação para que /api alcance o Worker.</div>}
                  <form className="auth-form" onSubmit={handleSubmit}>
                    {mode !== 'login' && <label>Nome completo<input name="nome" autoComplete="name" minLength={2} maxLength={100} placeholder="Como podemos chamar você?" required /></label>}
                    {mode === 'bootstrap' && <label>Chave de inicialização<input name="segredo" type="password" autoComplete="off" placeholder="Chave privada do administrador" required /></label>}
                    <label>E-mail<input name="email" type="email" autoComplete="email" maxLength={254} placeholder="voce@empresa.com.br" required /></label>
                    <label>Senha<input name="senha" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo de 12 caracteres'} required /></label>
                    {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
                    {notice && <div className="auth-alert auth-alert-success" role="status">{notice}</div>}
                    <button className="auth-submit" type="submit" disabled={busy}>{busy ? <><span className="auth-spinner" /> Aguarde...</> : mode === 'cadastro' ? 'Solicitar acesso' : mode === 'bootstrap' ? 'Criar administrador' : 'Entrar com segurança'}<span aria-hidden="true">↗</span></button>
                  </form>
                  {mode === 'login' ? (
                    <p className="auth-switch">Ainda não tem acesso? <button type="button" onClick={() => { setError(''); setNotice(''); setMode('cadastro'); }}>Criar cadastro</button></p>
                  ) : (
                    <p className="auth-switch">Já tem cadastro? <button type="button" onClick={() => { setError(''); setNotice(''); setMode('login'); }}>Voltar ao login</button></p>
                  )}
                  {bootstrapAvailable && mode === 'login' && <button type="button" className="auth-bootstrap-link" onClick={() => { setError(''); setMode('bootstrap'); }}>Configurar primeira conta administrativa</button>}
                  <div className="auth-security"><span aria-hidden="true">◆</span> Senhas protegidas. Acesso liberado mediante aprovação.</div>
                </>
              )}
            </div>
          </section>
        </div>
      )}
      {adminOpen && user?.papel === 'admin' && (
        <div className="auth-admin-overlay" role="dialog" aria-modal="true" aria-labelledby="users-title">
          <section className="auth-admin-panel">
            <header className="auth-admin-header"><div><span className="auth-eyebrow">CONTROLE DE ACESSO</span><h2 id="users-title">Gerenciamento de usuários</h2><p>Aprove cadastros e defina quem pode administrar a plataforma.</p></div><button type="button" className="auth-close" onClick={() => setAdminOpen(false)} aria-label="Fechar">×</button></header>
            {error && <div className="auth-alert auth-alert-error" role="alert">{error}</div>}
            {loadingUsers ? <div className="auth-checking"><span className="auth-spinner" /> Carregando usuários...</div> : rows.length === 0 ? <div className="auth-empty">Nenhum cadastro encontrado.</div> : (
              <div className="auth-user-list">{rows.map((row) => (
                <article className="auth-user-item" key={row.id}>
                  <div className="auth-user-details"><strong>{row.nome}</strong><span>{row.email}</span><small>{new Date(`${row.criado_em.replace(' ', 'T')}Z`).toLocaleDateString('pt-BR')} · {row.papel === 'admin' ? 'Administrador' : 'Usuário'} · <b className={`auth-status auth-status-${row.status}`}>{row.status === 'ativo' ? 'Ativo' : row.status === 'pendente' ? 'Aguardando aprovação' : 'Recusado'}</b></small></div>
                  <div className="auth-user-actions">{row.status !== 'ativo' && <button type="button" className="auth-approve" onClick={() => void atualizarUsuario(row, 'ativo')}>Aprovar</button>}{row.status !== 'recusado' && row.id !== user.id && <button type="button" className="auth-reject" onClick={() => void atualizarUsuario(row, 'recusado')}>Recusar</button>}{row.status === 'ativo' && row.id !== user.id && <button type="button" className="auth-role" onClick={() => void atualizarUsuario(row, 'ativo', row.papel === 'admin' ? 'usuario' : 'admin')}>{row.papel === 'admin' ? 'Remover admin' : 'Tornar admin'}</button>}</div>
                </article>
              ))}</div>
            )}
            <footer className="auth-admin-footer"><span>Somente administradores podem aprovar ou alterar acessos.</span><button type="button" onClick={() => void carregarUsuarios()}>Atualizar lista</button></footer>
          </section>
        </div>
      )}
      </>
    </AuthContext.Provider>
  );
}
