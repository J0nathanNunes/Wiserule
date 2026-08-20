'use client';

type StatusModalProps = {
  isOpen: boolean;
  onClose: () => void;
  apis: any;
  loading: boolean;
};

export default function StatusModal({ isOpen, onClose, apis, loading }: StatusModalProps) {
  if (!isOpen) return null;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return '🟢';
      case 'offline': return '🔴';
      case 'erro': return '🔴';
      case 'nao_configurada': return '⚪';
      default: return '⚪';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'erro': return 'Erro';
      case 'nao_configurada': return 'Não configurada';
      default: return status;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">📡</span>
            <h2 className="text-lg font-semibold text-white">Status das APIs</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-sm text-slate-400 ml-3">Verificando...</span>
            </div>
          ) : apis ? (
            <div className="space-y-3">
              {Object.entries(apis).map(([key, value]: any) => (
                <div key={key} className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{getStatusIcon(value.status)}</span>
                    <span className="text-sm font-medium text-slate-200 capitalize">
                      {key === 'openrouter' ? 'OpenRouter' :
                       key === 'minhareceita' ? 'MinhaReceita' :
                       key === 'supabase' ? 'Supabase' :
                       key === 'tavily' ? 'Tavily' :
                       key === 'geranet' ? 'Geranet' :
                       key === 'backend' ? 'Backend' : key}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      value.status === 'online' ? 'bg-green-900/50 text-green-400' :
                      value.status === 'offline' || value.status === 'erro' ? 'bg-red-900/50 text-red-400' :
                      'bg-slate-600/50 text-slate-400'
                    }`}>
                      {getStatusLabel(value.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-4">Nenhum dado disponível.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50 flex justify-between items-center">
          <span className="text-[10px] text-slate-500">
            {apis?.timestamp ? `Última verificação: ${new Date(apis.timestamp).toLocaleTimeString('pt-BR')}` : ''}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}