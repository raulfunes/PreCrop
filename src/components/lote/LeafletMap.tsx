'use client';

import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** Drawing mode: each click adds a vertex; double click (or the close button) finishes the lot. */
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

/** Planar shoelace on an equirectangular projection: good enough for a live readout. */
export function approxHa(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const lat0 = (ring.reduce((s, p) => s + p[0], 0) / ring.length) * Math.PI / 180;
  const xy = ring.map(([lat, lon]) => [lon * 111320 * Math.cos(lat0), lat * 110540]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2 / 10000;
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

const DRAW_STYLE = { color: '#8a5300', fillColor: '#fff3d6', fillOpacity: 0.25, weight: 2 };

/** Free polygon: click adds a vertex; double click, the first vertex or the close button finish it (min. 3). */
function DrawLayer({ active, onComplete, onCancel }: { active: boolean; onComplete: (ring: LatLng[]) => void; onCancel: () => void }) {
  const verticesRef = useRef<LatLng[]>([]);
  const [vertices, setVertices] = useState<LatLng[]>([]);
  const [hover, setHover] = useState<LatLng | null>(null);
  const map = useMap();

  const reset = () => { verticesRef.current = []; setVertices([]); setHover(null); };

  useEffect(() => {
    if (!active) { verticesRef.current = []; setVertices([]); setHover(null); }
    const container = map.getContainer();
    container.style.cursor = active ? 'crosshair' : '';
    if (active) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    return () => { container.style.cursor = ''; map.doubleClickZoom.enable(); };
  }, [active, map]);

  const closeTo = (a: LatLng, b: LatLng) => map.latLngToContainerPoint(a).distanceTo(map.latLngToContainerPoint(b)) < 10;

  const finish = () => {
    let list = verticesRef.current;
    // A double click also fired two single clicks: drop the duplicated last vertex.
    if (list.length >= 2 && closeTo(list[list.length - 1], list[list.length - 2])) list = list.slice(0, -1);
    if (list.length < 3) { verticesRef.current = list; setVertices(list); return; }
    reset();
    onComplete(list);
  };

  const undo = () => {
    verticesRef.current = verticesRef.current.slice(0, -1);
    setVertices(verticesRef.current);
  };

  useMapEvents({
    click(e) {
      if (!active) return;
      verticesRef.current = [...verticesRef.current, [e.latlng.lat, e.latlng.lng]];
      setVertices(verticesRef.current);
    },
    dblclick(e) {
      if (!active) return;
      L.DomEvent.stop(e.originalEvent);
      finish();
    },
    mousemove(e) {
      if (active && verticesRef.current.length) setHover([e.latlng.lat, e.latlng.lng]);
    },
  });

  if (!active) return null;
  const preview: LatLng[] = hover ? [...vertices, hover] : vertices;
  const ha = approxHa(preview);
  const hint = vertices.length === 0
    ? 'Clic en el mapa para marcar el primer vértice'
    : vertices.length < 3
      ? `Vértice ${vertices.length}: seguí marcando el contorno (mínimo 3)`
      : `${vertices.length} vértices: doble clic, o tocá el primer vértice, para cerrar`;
  return (
    <>
      {preview.length >= 3 && <Polygon positions={preview} pathOptions={{ ...DRAW_STYLE, dashArray: '6 4' }} interactive={false} />}
      {preview.length === 2 && <Polyline positions={preview} pathOptions={{ ...DRAW_STYLE, dashArray: '6 4' }} interactive={false} />}
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={i === 0 ? 8 : 5}
          pathOptions={{ color: '#8a5300', fillColor: i === 0 ? '#8a5300' : '#fff3d6', fillOpacity: 1, weight: 2, bubblingMouseEvents: false }}
          interactive={i === 0}
          eventHandlers={i === 0 ? { click: () => finish() } : undefined}
        />
      ))}
      <div className="leaflet-top leaflet-left mt-14 ml-2 z-[1000] absolute">
        <div className="bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-semibold shadow flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[440px]">
          <span>{hint}{preview.length >= 3 && ha > 0 ? ` (aprox. ${ha.toFixed(1)} ha)` : ''}</span>
          <span className="flex items-center gap-2">
            {vertices.length > 0 && <button type="button" onClick={undo} className="underline">Deshacer</button>}
            {vertices.length >= 3 && (
              <button type="button" onClick={finish} className="bg-[var(--color-warning)] text-white rounded-[var(--radius-control)] px-2 py-1">Cerrar lote</button>
            )}
            <button type="button" onClick={() => { reset(); onCancel(); }} className="underline">Cancelar</button>
          </span>
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
        <Polygon pathOptions={{ color: '#175e36', fillColor: '#175e36', fillOpacity: drawing ? 0.05 : 0.18, weight: 2 }} positions={ring} interactive={!drawing} />

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
                <div className="text-xs mt-1">{p.lat.toFixed(5)}, {p.lon.toFixed(5)}</div>
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
