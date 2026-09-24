import type { Metadata } from 'next';
import './globals.css';
import AuthShell from '@/components/AuthShell';

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
      <body><AuthShell>{children}</AuthShell></body>
    </html>
  );
}