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
    // Desabilita worker (não disponível em Cloudflare Workers).
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBytes,
      isEvalSupported: false,
      useSystemFonts: false,
    });

    const pdf = await loadingTask.promise;
    const textos: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      const itens = conteudo.items
        .filter((item: any) => 'str' in item && item.str.trim())
        .map((item: any) => ({
          texto: item.str.trim(),
          x: Number(item.transform?.[4] || 0),
          y: Number(item.transform?.[5] || 0),
          largura: Number(item.width || 0),
        }))
        .sort((a: any, b: any) => b.y - a.y || a.x - b.x);

      // PDF.js retorna fragmentos posicionados; agrupá-los por linha conserva
      // rótulos e valores lado a lado (ex.: "CNPJ: 00..."), em vez de achatar a página.
      const linhas: Array<{ y: number; itens: typeof itens }> = [];
      for (const item of itens) {
        let linha = linhas.find((candidata) => Math.abs(candidata.y - item.y) <= 2.5);
        if (!linha) {
          linha = { y: item.y, itens: [] };
          linhas.push(linha);
        }
        linha.itens.push(item);
      }

      const textoPagina = linhas
        .sort((a, b) => b.y - a.y)
        .map((linha) => {
          const ordenados = linha.itens.sort((a, b) => a.x - b.x);
          let resultado = '';
          let finalAnterior = Number.NEGATIVE_INFINITY;
          for (const item of ordenados) {
            const espaco = resultado && item.x - finalAnterior > 3 ? ' ' : '';
            resultado += espaco + item.texto;
            finalAnterior = item.x + item.largura;
          }
          return resultado;
        })
        .join('\n');
      textos.push(textoPagina);
    }
    return textos.join('\n\n');
  } catch (e) {
    console.error('[PDF] Erro ao extrair texto:', e);
    return '';
  }
}

