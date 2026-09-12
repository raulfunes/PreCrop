import { gps as readExifGps } from 'exifr';
import { workflowClient, type LotPoint } from '@/lib/workflowClient';

export interface PhotoGps { lat: number; lon: number; source: 'exif' | 'exif-mock' }

export interface PhotoAssignment {
  file: File;
  pointId: string | null;
  gps: PhotoGps | null;
  distanceM: number | null;
  error: string | null;
}

const VALID_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 12 * 1024 * 1024;

export function validatePhoto(file: File): string | null {
  if (!VALID_MIMES.includes(file.type)) return 'Formato inválido: solo JPEG, PNG o WebP.';
  if (file.size === 0 || file.size > MAX_BYTES) return 'La foto tiene que pesar entre 1 byte y 12 MB.';
  return null;
}

/** GPS from the EXIF block, or null when the photo has none (AI-generated, screenshots). */
export async function exifGps(file: File): Promise<{ lat: number; lon: number } | null> {
  try {
    const g = await readExifGps(file);
    if (g && Number.isFinite(g.latitude) && Number.isFinite(g.longitude)) return { lat: g.latitude, lon: g.longitude };
  } catch {
    // unreadable metadata: treated as no GPS
  }
  return null;
}

/**
 * Assign each photo to a sampling point.
 * - With EXIF GPS the API resolves the nearest point (within the protocol tolerance).
 * - Without GPS (the demo photos) the photo takes the next point without a photo, in
 *   protocol order, and is stamped with that point's coordinates as mocked metadata.
 */
export async function assignPhotos(files: File[], lotId: string, points: LotPoint[], takenPointIds: Set<string>): Promise<PhotoAssignment[]> {
  const used = new Set(takenPointIds);
  const out: PhotoAssignment[] = [];
  for (const file of files) {
    const invalid = validatePhoto(file);
    if (invalid) { out.push({ file, pointId: null, gps: null, distanceM: null, error: invalid }); continue; }

    const exif = await exifGps(file);
    if (exif) {
      try {
        const r = await workflowClient.locate(lotId, exif.lat, exif.lon);
        if (!r.within_tolerance) {
          out.push({ file, pointId: null, gps: null, distanceM: r.distance_m, error: `GPS a ${Math.round(r.distance_m)} m del punto más cercano (${r.point_id}); tolerancia ${r.tolerance_m} m.` });
          continue;
        }
        used.add(r.point_id);
        out.push({ file, pointId: r.point_id, gps: { ...exif, source: 'exif' }, distanceM: r.distance_m, error: null });
      } catch (e) {
        out.push({ file, pointId: null, gps: null, distanceM: null, error: e instanceof Error ? e.message : 'No se pudo ubicar la foto' });
      }
      continue;
    }

    const free = points.find((p) => !used.has(p.point_id)) ?? points.find((p) => !takenPointIds.has(p.point_id)) ?? null;
    if (!free) { out.push({ file, pointId: null, gps: null, distanceM: null, error: 'Todos los puntos ya tienen foto.' }); continue; }
    used.add(free.point_id);
    out.push({ file, pointId: free.point_id, gps: { lat: free.lat, lon: free.lon, source: 'exif-mock' }, distanceM: 0, error: null });
  }
  return out;
}
