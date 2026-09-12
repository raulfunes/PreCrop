'use client';

import React, { useRef, useState } from 'react';
import type { AccionDemo, VisionPointState } from '@/types';
import type { LotPoint } from '@/lib/workflowClient';
import { submitPhoto } from '@/lib/visionClient';
import { assignPhotos, type PhotoGps } from '@/lib/photoGps';

interface RowInfo { fileName: string; previewUrl: string; gps: PhotoGps; distanceM: number | null }

interface PhotoBatchUploadProps {
  lotId: string;
  points: LotPoint[];
  scenario: string;
  visionResults: Record<string, VisionPointState>;
  selectedPointId: string | null;
  minPhotos: number;
  onAction: (action: AccionDemo) => void;
  onAssign: (pointId: string, gps: PhotoGps) => void;
  onSelectPoint: (pointId: string) => void;
}

/**
 * One drop zone for the whole round: every photo is placed on a sampling point by its
 * GPS metadata (EXIF, or mocked with the point coordinates for AI-generated photos),
 * then all of them go to the vision model in parallel.
 */
export function PhotoBatchUpload({ lotId, points, scenario, visionResults, selectedPointId, minPhotos, onAction, onAssign, onSelectPoint }: PhotoBatchUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, RowInfo>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [placing, setPlacing] = useState(false);

  // A cleared round (empty results) hides the previews of the previous one.
  const resultCount = Object.keys(visionResults).length;
  const shownRows: Record<string, RowInfo> = resultCount === 0 ? {} : rows;

  const handleFiles = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setErrors([]);
    setPlacing(true);
    const taken = new Set(Object.entries(visionResults).filter(([, s]) => s.status === 'completed' || s.status === 'analyzing').map(([id]) => id));
    let assignments;
    try {
      assignments = await assignPhotos(files, lotId, points, taken);
    } finally {
      setPlacing(false);
    }

    const newErrors: string[] = [];
    const jobs: Promise<void>[] = [];
    const nextRows: Record<string, RowInfo> = {};
    for (const a of assignments) {
      if (!a.pointId || !a.gps || a.error) { newErrors.push(`${a.file.name}: ${a.error ?? 'sin punto'}`); continue; }
      nextRows[a.pointId] = { fileName: a.file.name, previewUrl: URL.createObjectURL(a.file), gps: a.gps, distanceM: a.distanceM };
      onAssign(a.pointId, a.gps);
      const pointId = a.pointId;
      onAction({ tipo: 'INICIAR_ANALISIS', payload: { pointId } });
      jobs.push(
        submitPhoto(a.file, pointId, scenario)
          .then((res) => onAction({ tipo: 'PHOTO_UPLOADED', payload: res }))
          .catch((err: unknown) => onAction({ tipo: 'ERROR_ANALISIS', payload: { pointId, error: err instanceof Error ? err.message : 'Error al analizar la foto' } })),
      );
    }
    setRows((prev) => (resultCount === 0 ? nextRows : { ...prev, ...nextRows }));
    setErrors(newErrors);
    if (inputRef.current) inputRef.current.value = '';
    await Promise.all(jobs);
  };

  const done = points.filter((p) => visionResults[p.point_id]?.status === 'completed' && visionResults[p.point_id]?.result?.status === 'assessed').length;
  const analyzing = points.filter((p) => visionResults[p.point_id]?.status === 'analyzing').length;

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="photo-batch-input"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors ${dragOver ? 'border-[var(--color-brand-primary)] bg-[var(--color-brand-soft)]' : 'border-[var(--color-control-border)] bg-[var(--color-neutral-soft)] hover:border-[var(--color-brand-primary)]'}`}
      >
        <span className="text-[15px] font-semibold text-[var(--color-ink)]">
          {placing ? 'Leyendo la ubicación de las fotos…' : analyzing > 0 ? `Analizando ${analyzing} foto${analyzing === 1 ? '' : 's'}…` : `Subí las fotos de la recorrida (mínimo ${minPhotos})`}
        </span>
        <span className="text-[12px] text-[var(--color-text-muted)]">Arrastrá todas juntas o tocá para elegir. Cada foto va a su punto por el GPS de la imagen.</span>
        <input
          id="photo-batch-input"
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      {errors.length > 0 && (
        <ul className="text-[12px] text-[var(--color-danger)] leading-5" role="alert">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2" aria-label="Fotos por punto de muestreo">
        {points.map((p) => {
          const st = visionResults[p.point_id];
          const row = shownRows[p.point_id];
          const r = st?.result;
          const selected = p.point_id === selectedPointId;
          let status: React.ReactNode = <span className="text-[var(--color-text-muted)]">Sin foto</span>;
          let tone = 'border-[var(--color-border)]';
          if (st?.status === 'analyzing') {
            status = <span className="inline-flex items-center gap-2 text-[var(--color-brand-primary)]"><span className="animate-spin h-3 w-3 border-2 border-[var(--color-brand-primary)] border-t-transparent rounded-full" />Analizando…</span>;
          } else if (st?.status === 'error') {
            status = <span className="text-[var(--color-danger)]">{st.error ?? 'Error'}</span>;
            tone = 'border-[var(--color-danger)]';
          } else if (st?.status === 'completed' && r) {
            if (r.status === 'assessed') {
              const high = r.weedsPct >= 45;
              status = (
                <span className={high ? 'text-[var(--color-danger)]' : 'text-[var(--color-positive)]'}>
                  <strong className="tabular-nums">{r.weedsPct} %</strong> malezas · {r.source === 'model' ? `modelo${r.model ? ` ${r.model}` : ''}` : 'estimación sobre la foto'}
                </span>
              );
              tone = high ? 'border-[var(--color-danger)]' : 'border-[var(--color-positive)]';
            } else if (r.status === 'not_assessable') {
              status = <span className="text-[var(--color-warning)]">No evaluable: {r.reason}</span>;
              tone = 'border-[var(--color-warning)]';
            } else {
              status = <span className="text-[var(--color-danger)]">Proveedor sin respuesta</span>;
              tone = 'border-[var(--color-danger)]';
            }
          }
          return (
            <li key={p.point_id}>
              <button
                type="button"
                onClick={() => onSelectPoint(p.point_id)}
                className={`w-full flex items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2 text-left ${tone} ${selected ? 'bg-[var(--color-brand-soft)]' : 'bg-[var(--color-surface)]'}`}
              >
                <span className="h-12 w-12 shrink-0 rounded overflow-hidden bg-[var(--color-neutral-soft)] flex items-center justify-center text-[11px] font-bold text-[var(--color-text-muted)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {row ? <img src={row.previewUrl} alt={`Foto ${p.point_id}`} className="h-full w-full object-cover" /> : p.point_id}
                </span>
                <span className="min-w-0 flex flex-col gap-0.5 text-[12px] leading-4">
                  <span className="font-semibold text-[var(--color-ink)]">{p.point_id} · {p.label}</span>
                  <span>{status}</span>
                  {row && (
                    <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                      {row.gps.source === 'exif' ? `GPS EXIF · a ${Math.round(row.distanceM ?? 0)} m del punto` : 'GPS del punto asignado'} · {row.fileName}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px] text-[var(--color-text-muted)] leading-4">
        {done} de {points.length} puntos con foto{done >= minPhotos ? ': ya se puede pedir el desembolso.' : `; hacen falta ${minPhotos}.`}
      </p>
    </div>
  );
}
