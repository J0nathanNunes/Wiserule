'use client';

import { useEffect, useState, useRef } from 'react';

type ChatInputProps = {
  onSend: (text: string, file?: File | null) => void;
  isLoading: boolean;
  onCancel?: () => void;
  suggestion?: { text: string; key: number } | null;
};

export default function ChatInput({ onSend, isLoading, onCancel, suggestion }: ChatInputProps) {
  const [input, setInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!suggestion) return;
    setInput(suggestion.text);
    textareaRef.current?.focus();
  }, [suggestion]);

  const handleSubmit = () => {
    const text = input.trim();
    if (!text && !selectedFile) return;
    if (isLoading) return;

    onSend(text, selectedFile);
    setInput('');
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const validarArquivo = (file: File): boolean => {
    const allowedTypes = ['image/png', 'image/jpeg', 'application/pdf'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(png|jpg|jpeg|pdf)$/i)) {
      alert('Formato não suportado. Use PNG, JPG ou PDF.');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Arquivo muito grande. Máximo 5MB.');
      return false;
    }
    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validarArquivo(file)) {
      setSelectedFile(file);
    }
  };

  // Colar imagem capturada (print) direto no composer via Ctrl+V
  const handlePaste = (e: React.ClipboardEvent) => {
    const itens = Array.from(e.clipboardData?.items || []);
    const itemImagem = itens.find((item) => item.type === 'image/png' || item.type === 'image/jpeg');
    if (!itemImagem) return;
    const arquivo = itemImagem.getAsFile();
    if (!arquivo) return;
    e.preventDefault();
    const nome = arquivo.name && arquivo.name !== 'image.png' ? arquivo.name : `nfse-print-${Date.now()}.${itemImagem.type === 'image/jpeg' ? 'jpg' : 'png'}`;
    const renomeado = new File([arquivo], nome, { type: itemImagem.type });
    if (validarArquivo(renomeado)) {
      setSelectedFile(renomeado);
    }
  };

  return (
    <div className="chat-composer border-t px-4 py-4 sm:px-6 sm:py-5">
      <div className="composer-inner">
        <div className="composer-box">
          {selectedFile && (
            <div className="composer-file">
              <span className="composer-file-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 3.75h7l4.25 4.5v12H7z" /><path d="M14 3.75v4.5h4.25M9.5 13h6M9.5 16h6" /></svg>
              </span>
              <span className="composer-file-text"><strong>{selectedFile.name}</strong><small>{(selectedFile.size / 1024).toFixed(0)} KB · pronto para enviar</small></span>
              <button type="button" onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="composer-remove-file" aria-label="Remover arquivo anexado" title="Remover arquivo">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 7 10 10M17 7 7 17" /></svg>
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Escreva sua dúvida fiscal ou cole um print da NFS-e (Ctrl+V)..."
            aria-label="Mensagem para análise fiscal"
            rows={1}
            disabled={isLoading}
            className="composer-textarea"
            style={{ minHeight: '48px', maxHeight: '160px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 160) + 'px';
            }}
          />

          <div className="composer-toolbar">
            <div className="composer-tools">
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} className="composer-attach" title="Anexar NFSe (PDF, PNG ou JPG)" aria-label="Anexar NFSe">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m8.5 12.5 6.1-6.1a3.25 3.25 0 0 1 4.6 4.6l-7.4 7.4a5 5 0 0 1-7.1-7.1l7.2-7.2" /></svg>
                <span>Anexar nota</span>
              </button>
              <span className="composer-hint">PDF, PNG ou JPG · até 5 MB</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {isLoading && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="composer-send composer-cancel"
                title="Cancelar análise em andamento"
                aria-label="Cancelar análise em andamento"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isLoading || (!input.trim() && !selectedFile)}
                className="composer-send"
                title="Enviar mensagem"
                aria-label="Enviar mensagem"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}