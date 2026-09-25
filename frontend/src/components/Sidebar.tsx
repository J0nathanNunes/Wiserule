'use client';

import { useState } from 'react';
import StatusModal from './StatusModal';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '@/contexts/AuthContext';

type FormData = {
  cnpj: string;
  servico: string;
  valor: string;
  cidade: string;
  uf: string;
};

type SidebarProps = {
  onSubmit: (data: FormData, arquivo?: File | null) => void;
  isLoading: boolean;
  onNovaAnalise: () => void;
};

export default function Sidebar({ onSubmit, isLoading, onNovaAnalise }: SidebarProps) {
  const { user, signOut, openUserManagement } = useAuth();
  const [formData, setFormData] = useState<FormData>({
    cnpj: '',
    servico: '',
    valor: '',
    cidade: '',
    uf: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusApis, setStatusApis] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData, selectedFile);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type) && !/\.(png|jpe?g|pdf)$/i.test(file.name)) {
        alert('Formato não suportado. Use PNG, JPG ou PDF.');
        e.target.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert('Arquivo muito grande. Máximo 5MB.');
        e.target.value = '';
        return;
      }
      setSelectedFile(file);
    }
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  return (
    <aside className="wiserule-sidebar w-[19rem] shrink-0 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M2.5 4h7l11.5 16h-7L2.5 4Z" fill="currentColor" />
              <path d="M14.2 4h7.3l-6.1 8.8-3.8-5.3L14.2 4Z" fill="currentColor" opacity=".78" />
            </svg>
          </span>
          <div>
            <h2 className="sidebar-brand font-serif text-[1.28rem] leading-none font-medium tracking-tight">Wiserule</h2>
            <p className="sidebar-caption mt-1 text-[9px] uppercase tracking-[.19em]">Regra clara. Decisão segura.</p>
          </div>
        </div>
      </div>

      {/* Nova Análise Button */}
      <div className="p-4">
        <button
          onClick={onNovaAnalise}
          disabled={isLoading}
          className="sidebar-new w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#397b78] text-white rounded-sm hover:bg-[#2d6865] transition-colors text-sm font-medium disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.7} d="M12 5v14M5 12h14" />
          </svg>
          Nova Análise
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 pt-0 space-y-4 flex-1">
        {/* CNPJ */}
        <div>
          <label className="block text-xs font-medium text-[#63716e] mb-1">CNPJ do Prestador</label>
          <input
            type="text"
            value={formatCnpj(formData.cnpj)}
            onChange={(e) => handleChange('cnpj', e.target.value)}
            placeholder="00.000.000/0000-00"
            className="w-full rounded-sm px-3 py-2 text-sm focus:outline-none"
            disabled={isLoading}
          />
        </div>

        {/* Serviço */}
        <div>
          <label className="block text-xs font-medium text-[#63716e] mb-1">Descrição do Serviço</label>
          <input
            type="text"
            value={formData.servico}
            onChange={(e) => handleChange('servico', e.target.value)}
            placeholder="Ex.: Desenvolvimento de software"
            className="w-full rounded-sm px-3 py-2 text-sm focus:outline-none"
            disabled={isLoading}
          />
        </div>

        {/* Valor */}
        <div>
          <label className="block text-xs font-medium text-[#63716e] mb-1">Valor do Serviço (R$)</label>
          <input
            type="text"
            value={formData.valor}
            onChange={(e) => handleChange('valor', e.target.value)}
            placeholder="1.000,00"
            className="w-full rounded-sm px-3 py-2 text-sm focus:outline-none"
            disabled={isLoading}
          />
        </div>

        {/* Cidade / UF */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-[#63716e] mb-1">Cidade</label>
            <input
              type="text"
              value={formData.cidade}
              onChange={(e) => handleChange('cidade', e.target.value)}
              placeholder="Campo Grande"
              className="w-full rounded-sm px-3 py-2 text-sm focus:outline-none"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#63716e] mb-1">UF</label>
            <select
              value={formData.uf}
              onChange={(e) => handleChange('uf', e.target.value)}
              className="w-full rounded-sm px-3 py-2 text-sm focus:outline-none"
              disabled={isLoading}
            >
              <option value="">Detectar pela NFSe</option>
              <option value="MS">MS</option>
              <option value="AC">AC</option>
              <option value="AL">AL</option>
              <option value="AP">AP</option>
              <option value="AM">AM</option>
              <option value="BA">BA</option>
              <option value="CE">CE</option>
              <option value="DF">DF</option>
              <option value="ES">ES</option>
              <option value="GO">GO</option>
              <option value="MA">MA</option>
              <option value="MT">MT</option>
              <option value="MG">MG</option>
              <option value="PA">PA</option>
              <option value="PB">PB</option>
              <option value="PR">PR</option>
              <option value="PE">PE</option>
              <option value="PI">PI</option>
              <option value="RJ">RJ</option>
              <option value="RN">RN</option>
              <option value="RS">RS</option>
              <option value="RO">RO</option>
              <option value="RR">RR</option>
              <option value="SC">SC</option>
              <option value="SP">SP</option>
              <option value="SE">SE</option>
              <option value="TO">TO</option>
            </select>
          </div>
        </div>

        {/* File Upload */}
        <div>
          <label className="block text-xs font-medium text-[#63716e] mb-1">Anexar NFSe (opcional)</label>
          <label className="sidebar-upload flex items-center gap-2 px-3 py-2.5 bg-[#f4f6f2] border border-dashed border-[#bdcbc6] rounded-sm cursor-pointer hover:border-[#397b78] transition-colors">
            <svg className="w-5 h-5 text-[#71817e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-[#697875]">
              {selectedFile ? selectedFile.name : 'Clique para anexar'}
            </span>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.pdf"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isLoading}
            />
          </label>
          {selectedFile && (
            <button
              type="button"
              onClick={() => setSelectedFile(null)}
              className="text-xs text-red-400 hover:text-red-300 mt-1"
            >
              Remover arquivo
            </button>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="sidebar-submit w-full py-2.5 bg-[#263f3e] text-white rounded-sm hover:bg-[#1f3332] transition-colors text-sm font-semibold disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analisando...
            </span>
          ) : (
            'Analisar NFS-e'
          )}
        </button>
      </form>

      <div className="sidebar-account-area">
        <div className="sidebar-account-actions">
          <NotificationCenter />
          <div className="sidebar-profile-wrap">
            <button type="button" className="sidebar-profile-trigger" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}>
              <span className="sidebar-profile-avatar">{user?.nome.trim().charAt(0).toLocaleUpperCase('pt-BR') || 'U'}</span>
              <span className="sidebar-profile-label"><strong>{user?.nome || 'Usuário'}</strong><small>{user?.papel === 'admin' ? 'Administrador' : 'Perfil'}</small></span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </button>
            {profileOpen && <div className="sidebar-profile-menu" role="menu">
              <div className="sidebar-profile-details"><strong>{user?.nome}</strong><span>{user?.email}</span><small>{user?.papel === 'admin' ? 'Administrador' : 'Usuário ativo'}</small></div>
              <div className="sidebar-profile-divider" />
              <button type="button" role="menuitem" onClick={async () => {
                setProfileOpen(false); setStatusModalOpen(true); setStatusLoading(true); setStatusApis(null);
                try {
                  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/diagnostico`, { credentials: 'include' });
                  setStatusApis(await res.json());
                } catch {
                  setStatusApis({ apis: { backend: { nome: 'Backend Wiserule', status: 'offline', detalhe: 'Falha na conexão com o servidor' } }, resumo: { total: 1, online: 0, offline: 1, erro: 0, nao_configurada: 0 }, timestamp: new Date().toISOString() });
                } finally { setStatusLoading(false); }
              }}>Saúde do sistema</button>
              {user?.papel === 'admin' && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); openUserManagement(); }}>Gerenciar usuários</button>}
              <button type="button" role="menuitem" className="sidebar-signout" onClick={() => void signOut()}>Sair da conta</button>
            </div>}
          </div>
        </div>
        <StatusModal isOpen={statusModalOpen} onClose={() => setStatusModalOpen(false)} data={statusApis} loading={statusLoading} isDiagnostico={true} />
      </div>
    </aside>
  );
}