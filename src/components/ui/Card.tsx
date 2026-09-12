'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Título de la tarjeta (opcional) */
  titulo?: string;
  /** Acción en el encabezado (opcional) */
  accion?: React.ReactNode;
  /** ID para accesibilidad */
  id?: string;
}

/**
 * Tarjeta base de PreCrop.
 * Radio 16px, borde cálido, sombra discreta y padding adaptativo.
 */
export function Card({ children, className = '', titulo, accion, id }: CardProps) {
  return (
    <section
      id={id}
      aria-labelledby={titulo ? `${id}-titulo` : undefined}
      className={['card animate-fade-in', className].join(' ')}
    >
      {(titulo || accion) && (
        <div className="flex items-center justify-between mb-4">
          {titulo && (
            <h2
              id={titulo ? `${id}-titulo` : undefined}
              className="text-card-title"
            >
              {titulo}
            </h2>
          )}
          {accion && <div className="shrink-0">{accion}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
