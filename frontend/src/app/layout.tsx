import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Wiserule - Análise Fiscal Inteligente',
  description: 'Analise Notas Fiscais de Serviço com inteligência artificial, consultando CNPJ, legislação e retenções fiscais.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}