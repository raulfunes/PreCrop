'use client';

import React from 'react';
import type { VarianteBoton, TamanioBoton } from '@/types';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamanio?: TamanioBoton;
  cargando?: boolean;
  textoCargando?: string;
  /** Icono lucide a la izquierda del texto */
  iconoIzquierda?: React.ReactNode;
  /** Icono lucide a la derecha del texto */
  iconoDerecha?: React.ReactNode;
  children: React.ReactNode;
}

const estilosBase =
  'inline-flex items-center justify-center gap-2 font-semibold rounded-[12px] transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--color-brand-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none select-none';

const estilosPorVariante: Record<VarianteBoton, string> = {
  primario:
    'bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-brand-hover)] active:bg-[var(--color-brand-pressed)] disabled:opacity-50',
  secundario:
    'bg-[var(--color-surface)] text-[var(--color-brand-primary)] border border-[var(--color-border)] hover:bg-[var(--color-border)] hover:text-[var(--color-brand-primary)] active:bg-[var(--color-border)] disabled:opacity-50',
  terciario:
    'bg-transparent text-[var(--color-brand-primary)] hover:bg-[var(--color-brand-soft)] active:bg-[var(--color-brand-soft)] disabled:opacity-50',
};

const estilosPorTamanio: Record<TamanioBoton, string> = {
  sm: 'h-9 px-3 text-[14px] leading-[20px]',
  md: 'h-11 px-4 text-[14px] leading-[20px]',   // mínimo 44px de altura
  lg: 'h-12 px-5 text-[16px] leading-[24px]',
};

/**
 * Botón de PreCrop con variantes primario, secundario y terciario.
 * Altura mínima de 44 px en md (accesibilidad táctil).
 * Durante la carga conserva el ancho y muestra un verbo de progreso.
 */
export function Button({
  variante = 'primario',
  tamanio = 'md',
  cargando = false,
  textoCargando,
  iconoIzquierda,
  iconoDerecha,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const deshabilitado = disabled || cargando;

  return (
    <button
      disabled={deshabilitado}
      aria-busy={cargando}
      className={[
        estilosBase,
        estilosPorVariante[variante],
        estilosPorTamanio[tamanio],
        className,
      ].join(' ')}
      {...props}
    >
      {cargando ? (
        <>
          <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
          <span>{textoCargando ?? 'Actualizando…'}</span>
        </>
      ) : (
        <>
          {iconoIzquierda && (
            <span className="shrink-0" aria-hidden="true">
              {iconoIzquierda}
            </span>
          )}
          {children}
          {iconoDerecha && (
            <span className="shrink-0" aria-hidden="true">
              {iconoDerecha}
            </span>
          )}
        </>
      )}
    </button>
  );
}
