import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface AppDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Ancho máximo en pixeles u otro valor válido (ej. "max-w-[960px]"). 
   * Por defecto usará una clase para ancho completo en móvil y limitado en desktop.
   */
  className?: string;
  id?: string;
}

/** Ocupa el alto del contenido durante el unico frame que tarda en montarse. */
function DialogSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Cargando contenido">
      <span className="h-5 w-2/5 rounded-[6px] bg-[var(--color-neutral-soft)] animate-pulse" />
      <span className="h-24 w-full rounded-[8px] bg-[var(--color-neutral-soft)] animate-pulse" />
      <span className="h-5 w-3/5 rounded-[6px] bg-[var(--color-neutral-soft)] animate-pulse" />
    </div>
  );
}

export function AppDialog({ isOpen, onClose, title, children, className = '', id }: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // El contenido entra un frame despues de abrir. Montarlo en el mismo frame que
  // showModal() metia el render completo (tablas, markdown, panel de fotos) dentro
  // del frame de apertura y la animacion arrancaba trabada. Con el skeleton, el
  // modal aparece de inmediato y el contenido lo alcanza sin que se note el corte.
  const [contentReady, setContentReady] = useState(false);

  // Ajuste de estado durante el render, el patron que React recomienda para
  // derivar de props: al cerrarse, el proximo open vuelve a empezar por el skeleton.
  if (!isOpen && contentReady) setContentReady(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      document.body.style.overflow = 'hidden';
      const raf = requestAnimationFrame(() => setContentReady(true));
      return () => {
        cancelAnimationFrame(raf);
        document.body.style.overflow = '';
      };
    }

    if (dialog.open) {
      dialog.close();
    }
    document.body.style.overflow = '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Manejar el cierre nativo (ej. tecla Escape)
  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  // Cerrar al hacer click en el backdrop
  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (rect) {
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;

      if (!isInDialog) {
        onClose();
      }
    }
  };

  return (
    <dialog
      id={id}
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-labelledby={`${id}-title`}
      aria-modal="true"
      className={`
        bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl rounded-[var(--radius-card)]
        p-0 m-auto backdrop:bg-black/50
        w-full max-h-[90vh] sm:max-h-[85vh]
        transform transition-transform motion-reduce:transition-none
        open:animate-in open:fade-in open:zoom-in-95
        ${className || 'max-w-4xl'}
      `}
    >
      <div className="flex flex-col h-full max-h-[inherit]">
        <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <h2 id={`${id}-title`} className="text-[18px] font-bold text-[var(--color-ink)] m-0">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-[var(--radius-pill)] text-[var(--color-text-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-neutral-soft)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]"
            aria-label="Cerrar modal"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="overflow-y-auto p-5">
          {isOpen && contentReady ? children : isOpen ? <DialogSkeleton /> : null}
        </div>
      </div>
    </dialog>
  );
}
