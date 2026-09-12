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

export function AppDialog({ isOpen, onClose, title, children, className = '', id }: AppDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
      document.body.style.overflow = 'hidden';
    } else {
      if (dialog.open) {
        dialog.close();
      }
      document.body.style.overflow = '';
    }

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

  if (!mounted) return null;

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
        p-0 m-auto backdrop:bg-black/40 backdrop:backdrop-blur-sm
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
          {children}
        </div>
      </div>
    </dialog>
  );
}
