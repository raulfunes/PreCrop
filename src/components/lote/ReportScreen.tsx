'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RefreshCw, AlertCircle, Printer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ApiError } from '@/types';

interface ReportScreenProps {
  markdown: string | null;
  isLoading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  scenario: 'bueno' | 'mixto' | 'malo';
}

export function ReportScreen({ markdown, isLoading, error, onRetry, scenario }: ReportScreenProps) {
  if (isLoading && !markdown) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-text-muted)]">
        <RefreshCw className="animate-spin" size={24} />
        <p className="text-[14px] font-medium">Generando informe para comité...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertCircle size={32} className="text-[var(--color-danger)]" />
        <div>
          <p className="text-[14px] font-semibold text-[var(--color-danger)]">Error al generar informe</p>
          <p className="text-[13px] text-[var(--color-danger)]/80 mt-1 max-w-[300px] mx-auto">{error.message}</p>
        </div>
        <Button onClick={onRetry} variante="secundario" tamanio="sm">Reintentar</Button>
      </div>
    );
  }

  if (!markdown) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--color-ink)]">Informe para comité</h2>
          <p className="text-[13px] text-[var(--color-text-muted)]">
            Escenario: <strong>{scenario}</strong> · Generado en tiempo real
          </p>
        </div>
        <Button onClick={handlePrint} variante="secundario" tamanio="sm" iconoDerecha={<Printer size={14} />}>
          Imprimir informe
        </Button>
      </div>

      {/* Demo banner */}
      <div className="p-3 bg-[var(--color-warning-soft)] rounded-[var(--radius-badge)] border border-[var(--color-warning)]/20 text-center report-demo-banner">
        <span className="text-[12px] font-semibold text-[var(--color-warning)]">
          DEMO · MOCK financiero · Solana devnet
        </span>
      </div>

      {/* Markdown content */}
      <article
        id="report-content"
        className="bg-[var(--color-surface)] rounded-[var(--radius-card)] border border-[var(--color-border)] shadow-[var(--shadow-card)] p-6 md:p-8 prose prose-sm max-w-none
          prose-headings:text-[var(--color-ink)] prose-headings:font-bold
          prose-h1:text-[20px] prose-h1:border-b prose-h1:border-[var(--color-border)] prose-h1:pb-3
          prose-h2:text-[16px] prose-h2:mt-6
          prose-p:text-[var(--color-ink)] prose-p:text-[14px] prose-p:leading-6
          prose-strong:text-[var(--color-ink)]
          prose-em:text-[var(--color-text-muted)]
          prose-table:text-[13px]
          prose-th:bg-[var(--color-neutral-soft)] prose-th:text-[var(--color-ink)] prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-th:text-left
          prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-[var(--color-border)]
          prose-code:text-[12px] prose-code:bg-[var(--color-neutral-soft)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
          prose-li:text-[14px] prose-li:text-[var(--color-ink)]
          prose-a:text-[var(--color-brand-primary)] prose-a:underline"
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ children, href, ...props }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                {...props}
              >
                {children}
              </a>
            ),
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>
    </div>
  );
}
