'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary UI de PreCrop.
 * Separa los errores de software o renderizado de interfaz de la condición
 * agronómica del cultivo (score rojo o score cero).
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error no capturado en interfaz de PreCrop:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="p-6 bg-[var(--color-danger-soft)] rounded-[var(--radius-card)] border border-[var(--color-danger)]/30 flex flex-col gap-3 my-4"
        >
          <div className="flex items-center gap-2 text-[var(--color-danger)] font-bold text-[16px]">
            <AlertCircle size={20} className="shrink-0" />
            <span>Error de la interfaz de usuario</span>
          </div>
          <p className="text-[13px] text-[var(--color-ink)] leading-5">
            Ocurrió un problema visual inesperado en este componente. Esto es un error técnico de interfaz y no afecta la condición agronómica ni los datos del lote.
          </p>
          {this.state.error && (
            <code className="text-[11px] bg-[var(--color-surface)] p-2 rounded border border-[var(--color-border)] text-[var(--color-text-muted)] overflow-x-auto">
              {this.state.error.message}
            </code>
          )}
          <div className="pt-2">
            <Button
              variante="secundario"
              tamanio="sm"
              onClick={this.handleReset}
              iconoIzquierda={<RotateCcw size={14} />}
            >
              Reintentar renderizado
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
