import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** Spinner en linea. Decorativo: quien lo usa pone el texto accesible al lado. */
export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={`animate-spin ${className}`} aria-hidden="true" />;
}

/**
 * Bloque gris que ocupa el lugar del valor mientras llega del servidor. Evita el
 * salto de layout y el "—", que se lee como dato vacio en vez de dato en camino.
 */
export function SkeletonValue({ className = 'h-[26px] w-32' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block rounded-[6px] bg-[var(--color-neutral-soft)] animate-pulse ${className}`}
    />
  );
}

/**
 * Barra fina arriba de todo mientras hay peticiones en vuelo. Es la señal de que
 * la app esta hablando con el servidor sin bloquear lo que ya se puede leer.
 */
export function TopProgressBar({ active, label = 'Actualizando datos', delayMs = 150 }: { active: boolean; label?: string; delayMs?: number }) {
  // Una peticion que resuelve en 40 ms no necesita barra: encenderla y apagarla en
  // dos frames se ve como un parpadeo. Solo aparece si la espera se nota.
  const [visible, setVisible] = useState(false);
  if (!active && visible) setVisible(false);

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-[3px] z-[100] pointer-events-none overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={visible ? label : undefined}
    >
      <div
        className={`h-full bg-[var(--color-brand-primary)] transition-opacity duration-200 ${
          visible ? 'opacity-100 animate-[precrop-progress_1.1s_ease-in-out_infinite]' : 'opacity-0'
        }`}
        style={{ width: '40%' }}
      />
    </div>
  );
}
