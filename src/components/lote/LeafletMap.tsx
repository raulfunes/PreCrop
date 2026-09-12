'use client';

import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import photoPoints from '../../../data/photo-point-presets.json';

export interface PointData {
  point_id: string;
  lat: number;
  lon: number;
  label: string;
}

export type LatLng = [number, number];

interface GeoJSONFeature {
  bbox: [number, number, number, number];
  geometry?: { type: string; coordinates: number[][][] };
}

export interface LeafletMapProps {
  onPointSelect?: (pointId: string) => void;
  /** Ring of the lot as [lat, lon]; when omitted the committed demo lot is fetched. */
  polygon?: LatLng[] | null;
  points?: PointData[] | null;
  /** Drawing mode: four clicks define a new quadrilateral lot. */
  drawing?: boolean;
  onPolygonComplete?: (ring: LatLng[]) => void;
  onCancelDraw?: () => void;
  selectedPointId?: string | null;
}

function boundsOf(ring: LatLng[]): L.LatLngBoundsExpression {
  const lats = ring.map((p) => p[0]), lons = ring.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

function RecenterControl({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);

  return (
    <div className="leaflet-top leaflet-right mt-2 mr-2 z-[1000] absolute">
      <button
        type="button"
        onClick={() => map.fitBounds(bounds, { padding: [24, 24] })}
        className="bg-[var(--color-surface)] hover:bg-[var(--color-brand-soft)] text-[var(--color-ink)] font-semibold py-1.5 px-3 border border-[var(--color-border)] rounded-[var(--radius-control)] shadow text-xs"
        aria-label="Recentrar mapa"
      >
        Recentrar
      </button>
    </div>
  );
}

/** Two clicks on the map (a corner and the opposite one) -> a uniform rectangular lot. */
function DrawLayer({ active, onComplete, onCancel }: { active: boolean; onComplete: (ring: LatLng[]) => void; onCancel: () => void }) {
  const [first, setFirst] = useState<LatLng | null>(null);
  const [hover, setHover] = useState<LatLng | null>(null);
  const map = useMap();

  useEffect(() => {
    if (!active) { setFirst(null); setHover(null); }
    const container = map.getContainer();
    container.style.cursor = active ? 'crosshair' : '';
    return () => { container.style.cursor = ''; };
  }, [active, map]);

  const rect = (a: LatLng, b: LatLng): LatLng[] => [
    [a[0], a[1]],
    [a[0], b[1]],
    [b[0], b[1]],
    [b[0], a[1]],
  ];

  useMapEvents({
    click(e) {
      if (!active) return;
      const p: LatLng = [e.latlng.lat, e.latlng.lng];
      if (!first) { setFirst(p); return; }
      const ring = rect(first, p);
      setFirst(null); setHover(null);
      onComplete(ring);
    },
    mousemove(e) {
      if (active && first) setHover([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!active) return null;
  const preview = first && hover ? rect(first, hover) : null;
  return (
    <>
      {preview && <Polygon positions={preview} pathOptions={{ color: '#8a5300', fillColor: '#fff3d6', fillOpacity: 0.25, weight: 2, dashArray: '6 4' }} />}
      {first && <CircleMarker center={first} radius={6} pathOptions={{ color: '#8a5300', fillColor: '#fff3d6', fillOpacity: 1 }} />}
      <div className="leaflet-top leaflet-left mt-14 ml-2 z-[1000] absolute">
        <div className="bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-semibold shadow flex items-center gap-3">
          <span>{first ? 'Clic 2 de 2: la esquina opuesta' : 'Clic 1 de 2: una esquina del lote'}</span>
          <button type="button" onClick={() => { setFirst(null); setHover(null); onCancel(); }} className="underline">Cancelar</button>
        </div>
      </div>
    </>
  );
}

export default function LeafletMap({ onPointSelect, polygon, points, drawing = false, onPolygonComplete, onCancelDraw, selectedPointId }: LeafletMapProps) {
  const [demoPolygon, setDemoPolygon] = useState<LatLng[] | null>(null);

  useEffect(() => {
    if (polygon) return;
    fetch('/api/geojson').then((r) => r.json()).then((feature: GeoJSONFeature) => {
      if (feature.geometry && feature.geometry.type === 'Polygon') {
        setDemoPolygon(feature.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]] as LatLng));
      } else {
        const b = feature.bbox;
        setDemoPolygon([[b[1], b[0]], [b[1], b[2]], [b[3], b[2]], [b[3], b[0]]]);
      }
    }).catch(console.error);
  }, [polygon]);

  const ring = polygon ?? demoPolygon;
  const shownPoints = (points ?? (photoPoints.points as PointData[]));
  const bounds = useMemo(() => (ring ? boundsOf(ring) : null), [ring]);

  if (!bounds || !ring) {
    return <div className="w-full h-full min-h-[420px] flex items-center justify-center bg-[var(--color-neutral-soft)] text-sm text-[var(--color-text-muted)]">Cargando mapa…</div>;
  }

  return (
    <div className="w-full h-full min-h-[420px] relative overflow-hidden">
      <MapContainer bounds={bounds} zoom={14} scrollWheelZoom={false} className="w-full h-full min-h-[420px]">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polygon pathOptions={{ color: '#175e36', fillColor: '#175e36', fillOpacity: drawing ? 0.05 : 0.18, weight: 2 }} positions={ring} />

        {!drawing && shownPoints.map((p) => {
          const selected = p.point_id === selectedPointId;
          return (
            <CircleMarker
              key={p.point_id}
              center={[p.lat, p.lon]}
              radius={selected ? 10 : 8}
              pathOptions={{ color: selected ? '#8a5300' : '#18392b', fillColor: selected ? '#fff3d6' : '#18392b', fillOpacity: 0.9, weight: 2 }}
              eventHandlers={{ click: () => onPointSelect && onPointSelect(p.point_id) }}
            >
              <Popup>
                <div className="font-medium text-sm">{p.label} ({p.point_id})</div>
                <button type="button" onClick={() => onPointSelect && onPointSelect(p.point_id)} className="mt-2 text-xs text-[var(--color-brand-primary)] underline">
                  Subir/Ver foto
                </button>
              </Popup>
            </CircleMarker>
          );
        })}

        <DrawLayer active={drawing} onComplete={(r) => onPolygonComplete && onPolygonComplete(r)} onCancel={() => onCancelDraw && onCancelDraw()} />
        <RecenterControl bounds={bounds} />
      </MapContainer>
    </div>
  );
}
