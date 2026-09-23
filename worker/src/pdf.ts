/**
 * Extração de texto de PDFs usando pdfjs-dist.
 * Funciona no Cloudflare Workers com nodejs_compat.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

/**
 * Extrai texto de um PDF a partir de bytes brutos.
 * Retorna o texto concatenado de todas as páginas.
 */
export async function extrairTextoPdf(pdfBytes: Uint8Array): Promise<string> {
  try {
    // Desabilita worker (não disponível em Cloudflare Workers)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: false,
    });

    const pdf = await loadingTask.promise;
    const numPaginas = pdf.numPages;
    const textos: string[] = [];

    for (let i = 1; i <= numPaginas; i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      const textoPagina = conteudo.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ');
      textos.push(textoPagina);
    }

    return textos.join('\n\n');
  } catch (e) {
    console.error('[PDF] Erro ao extrair texto:', e);
    return '';
  }
}

/**
 * Converte primeira página de PDF para imagem PNG (base64).
 * Útil quando o PDF é escaneado (sem camada de texto).
 */
export async function pdfParaImagem(
  pdfBytes: Uint8Array,
): Promise<string | null> {
  try {
    // Nota: pdfjs-dist não renderiza para imagem diretamente.
    // Para isso, seria necessário pdf2pic ou similar.
    // Por enquanto, retornamos null e usamos o PDF como imagem para o LLM.
    return null;
  } catch {
    return null;
  }
}