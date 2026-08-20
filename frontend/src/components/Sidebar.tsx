'use client';

import { useState } from 'react';
import StatusModal from './StatusModal';

type FormData = {
  cnpj: string;
  servico: string;
  valor: string;
  cidade: string;
  uf: string;
};

type SidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  onSubmit: (data: FormData, arquivo?: File | null) => void;
  isLoading: boolean;
  onNovaAnalise: () => void;
};

export default function Sidebar({ isOpen, onToggle, onSubmit, isLoading, onNovaAnalise }: SidebarProps) {
  const [formData, setFormData] = useState<FormData>({
    cnpj: '',
    servico: '',
    valor: '',
    cidade: 'Campo Grande',
    uf: 'MS',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusApis, setStatusApis] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);

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
      if (file.size > 5 * 1024 * 1024) {
        alert('Arquivo muito grande. Máximo 5MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 bg-slate-800 border-r border-slate-700 flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <h2 className="text-lg font-semibold text-white">Wiserule</h2>
          </div>
          <button
            onClick={onToggle}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-1">Análise Fiscal Inteligente</p>
      </div>

      {/* Nova Análise Button */}
      <div className="p-4">
        <button
          onClick={onNovaAnalise}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-500 hover:to-purple-500 transition-all text-sm font-medium disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Análise
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 pt-0 space-y-4 flex-1">
        {/* CNPJ */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">CNPJ do Prestador</label>
          <input
            type="text"
            value={formatCnpj(formData.cnpj)}
            onChange={(e) => handleChange('cnpj', e.target.value)}
            placeholder="00.000.000/0000-00"
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        {/* Serviço */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Descrição do Serviço</label>
          <input
            type="text"
            value={formData.servico}
            onChange={(e) => handleChange('servico', e.target.value)}
            placeholder="Ex.: Desenvolvimento de software"
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        {/* Valor */}
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Valor do Serviço (R$)</label>
          <input
            type="text"
            value={formData.valor}
            onChange={(e) => handleChange('valor', e.target.value)}
            placeholder="1.000,00"
            className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
        </div>

        {/* Cidade / UF */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">Cidade</label>
            <input
              type="text"
              value={formData.cidade}
              onChange={(e) => handleChange('cidade', e.target.value)}
              placeholder="Campo Grande"
              className="w-full bg-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">UF</label>
            <select
              value={formData.uf}
              onChange={(e) => handleChange('uf', e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 text-sm border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            >
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
          <label className="block text-xs font-medium text-slate-400 mb-1">Anexar NFSe (opcional)</label>
          <label className="flex items-center gap-2 px-3 py-2.5 bg-slate-700 border border-dashed border-slate-500 rounded-lg cursor-pointer hover:border-blue-400 transition-colors">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span className="text-sm text-slate-400">
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
          className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-500 hover:to-emerald-600 transition-all text-sm font-medium disabled:opacity-50 shadow-lg shadow-emerald-500/20"
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
            '🔍 Analisar NFSe'
          )}
        </button>
      </form>

      {/* Status Button */}
      <div className="p-4 border-t border-slate-700">
        <button
          onClick={async () => {
            setStatusModalOpen(true);
            setStatusLoading(true);
            setStatusApis(null);
            try {
              const res = await fetch('/api/health/detalhado');
              const data = await res.json();
              setStatusApis(data);
            } catch (err) {
              setStatusApis({ backend: { status: 'offline', erro: 'Não foi possível conectar ao servidor' } });
            } finally {
              setStatusLoading(false);
            }
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-700/50 text-slate-400 rounded-lg hover:bg-slate-700 hover:text-white transition-all text-xs"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          📡 Status das APIs
        </button>
      </div>

      {/* Status Modal */}
      <StatusModal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        apis={statusApis?.apis}
        loading={statusLoading}
      />
    </div>
  );
}