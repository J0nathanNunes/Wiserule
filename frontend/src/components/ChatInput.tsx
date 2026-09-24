'use client';

import { useState, useRef } from 'react';

type ChatInputProps = {
  onSend: (text: string, file?: File | null) => void;
  isLoading: boolean;
};

export default function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text && !selectedFile) return;
    if (isLoading) return;

    onSend(text, selectedFile);
    setInput('');
    setSelectedFile(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Valida tipo
      const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
      if (!allowedTypes.includes(file.type) && !file.name.match(/\.(png|jpg|jpeg|pdf)$/i)) {
        alert('Formato não suportado. Use PNG, JPG ou PDF.');
        return;
      }
      // Valida tamanho (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Arquivo muito grande. Máximo 5MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  return (
    <div className="chat-composer border-t px-4 py-4">
      {/* File preview */}
      {selectedFile && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-white border border-[#dce3df] rounded-sm max-w-fit">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#397b78]">Arquivo</span>
          <span className="text-sm text-[#3c4848] truncate max-w-[200px]">
            {selectedFile.name}
          </span>
          <span className="text-xs text-slate-500">
            ({(selectedFile.size / 1024).toFixed(1)} KB)
          </span>
          <button
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="text-[#758182] hover:text-red-700 ml-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2 max-w-4xl mx-auto border border-[#bfcfca] bg-[#fbfcf8] p-2 shadow-[0_3px_12px_rgba(31,52,50,.04)] focus-within:border-[#588c85]">
        {/* File upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="p-2 text-[#71817e] hover:text-[#285f5c] hover:bg-[#e9f0ed] rounded-sm transition-colors disabled:opacity-50"
          title="Anexar NFSe (imagem ou PDF)"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite os dados da NFSe ou faça uma pergunta..."
            rows={1}
            disabled={isLoading}
            className="w-full bg-transparent text-[#273234] placeholder-[#8b9794] px-3 py-2.5 resize-none focus:outline-none disabled:opacity-50"
            style={{ minHeight: '44px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || (!input.trim() && !selectedFile)}
          className="min-w-20 px-4 py-2.5 bg-[#397b78] text-white rounded-sm hover:bg-[#2d6865] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          title="Enviar"
        >
          {isLoading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <span className="text-sm tracking-wide">Enviar</span>
          )}
        </button>
      </div>

      {/* Footer disclaimer */}
      <p className="text-[10px] text-[#899491] text-center mt-3 max-w-4xl mx-auto">
        As informações geradas são de caráter analítico e não constituem aconselhamento jurídico oficial.
        Consulte um profissional habilitado para tomada de decisão.
      </p>
    </div>
  );
}