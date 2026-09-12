'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * DemoDisclaimer — aviso persistente al pie de la pantalla.
 *
 * El branding §3 exige identificación persistente de la demo
 * junto a las acciones financieras. Este componente cumple
 * la función a nivel de pantalla completa.
 *
 * No incluye afirmaciones de auditoría, alianzas ni seguros.
 */
export function DemoDisclaimer() {
  return (
    <footer
      role="contentinfo"
      aria-label="Aviso legal de la demo"
      className="mt-12 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <AlertCircle
            size={16}
            className="text-[var(--color-warning)] shrink-0 mt-0.5 sm:mt-0"
            aria-hidden="true"
          />
          <p className="text-[12px] text-[var(--color-text-muted)] leading-[18px]">
            <strong className="text-[var(--color-ink)]">
              DEMO · Fondos de prueba · MOCK.
            </strong>{' '}
            PreCrop MVP de hackathon. Todos los datos son simulados y no representan
            una operación financiera real. El score de condición del cultivo no es un
            score crediticio ni una probabilidad de cobro. Los fondos mostrados son
            de prueba y no tienen valor real.{' '}
            <em>
              No constituye asesoramiento financiero, agronómico ni de inversión.
            </em>
          </p>
        </div>
      </div>
    </footer>
  );
}
