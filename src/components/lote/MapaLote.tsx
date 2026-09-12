'use client';

import dynamic from 'next/dynamic';
import type { LeafletMapProps } from './LeafletMap';

// Dynamically import LeafletMap with SSR disabled
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[420px] bg-[var(--color-neutral-soft)] animate-pulse" />,
});

export function MapaLote(props: LeafletMapProps) {
  return (
    <div className="w-full h-full min-h-[420px]">
      <LeafletMap {...props} />
    </div>
  );
}
