'use client';

import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import photoPoints from '../../../data/photo-point-presets.json';

interface LeafletMapProps {
  onPointSelect?: (pointId: string) => void;
}

interface PointData {
  point_id: string;
  lat: number;
  lon: number;
  label: string;
}

interface GeoJSONFeature {
  bbox: [number, number, number, number];
  geometry?: {
    type: string;
    coordinates: number[][][];
  };
}

interface LeafletMapProps {
  onPointSelect?: (pointId: string) => void;
}

function RecenterControl({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [map, bounds]);

  return (
    <div className="leaflet-top leaflet-right mt-2 mr-2 z-[1000] absolute">
      <button
        onClick={() => map.fitBounds(bounds, { padding: [20, 20] })}
        className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-1 px-2 border border-gray-400 rounded shadow text-xs"
        aria-label="Recentrar mapa"
      >
        Recentrar
      </button>
    </div>
  );
}

export default function LeafletMap({ onPointSelect }: LeafletMapProps) {
  const points = photoPoints.points as PointData[];
  const [polygonPositions, setPolygonPositions] = useState<[number, number][]>([]);
  const [bounds, setBounds] = useState<L.LatLngBoundsExpression | null>(null);

  useEffect(() => {
    fetch('/api/geojson').then(r => r.json()).then((feature: GeoJSONFeature) => {
      const polygonCoords = feature.bbox;
      const calculatedBounds: L.LatLngBoundsExpression = [
        [polygonCoords[1], polygonCoords[0]],
        [polygonCoords[3], polygonCoords[2]],
      ];
      setBounds(calculatedBounds);

      if (feature.geometry && feature.geometry.type === 'Polygon') {
        setPolygonPositions(feature.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]]));
      } else {
        setPolygonPositions([
          [polygonCoords[1], polygonCoords[0]],
          [polygonCoords[1], polygonCoords[2]],
          [polygonCoords[3], polygonCoords[2]],
          [polygonCoords[3], polygonCoords[0]],
        ]);
      }
    }).catch(console.error);
  }, []);

  if (!bounds) return <div className="w-full h-full min-h-[300px] flex items-center justify-center bg-gray-100">Cargando mapa...</div>;

  return (
    <div className="w-full h-full min-h-[300px] relative rounded-lg overflow-hidden border border-border">
      <MapContainer
        bounds={bounds}
        zoom={14}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polygon pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.2 }} positions={polygonPositions} />

        {points.map((p) => (
          <CircleMarker
            key={p.point_id}
            center={[p.lat, p.lon]}
            radius={8}
            pathOptions={{ color: 'var(--color-primary, #0f172a)', fillColor: 'var(--color-primary, #0f172a)', fillOpacity: 0.8 }}
            eventHandlers={{
              click: () => {
                if (onPointSelect) onPointSelect(p.point_id);
              },
            }}
          >
            <Popup>
              <div className="font-medium text-sm">{p.label} ({p.point_id})</div>
              <button
                onClick={() => onPointSelect && onPointSelect(p.point_id)}
                className="mt-2 text-xs text-[var(--color-primary,blue)] underline"
              >
                Subir/Ver foto
              </button>
            </Popup>
          </CircleMarker>
        ))}

        {bounds && <RecenterControl bounds={bounds} />}
      </MapContainer>
    </div>
  );
}
