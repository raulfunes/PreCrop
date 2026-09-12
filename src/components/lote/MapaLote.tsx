'use client';

import dynamic from 'next/dynamic';

// Dynamically import LeafletMap with SSR disabled
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[300px] rounded-lg bg-gray-200 animate-pulse" />
});

interface MapaLoteProps {
  onPointSelect?: (pointId: string) => void;
}

export function MapaLote({ onPointSelect }: MapaLoteProps) {
  return (
    <div className="w-full h-full min-h-[300px]">
      <LeafletMap onPointSelect={onPointSelect} />
    </div>
  );
}
