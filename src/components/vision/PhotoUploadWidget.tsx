import { useState, useRef, useEffect } from 'react';
import type { VisionPointState } from '@/types';
import { submitPhoto } from '@/lib/visionClient';
import { Button } from '@/components/ui/Button';

interface PhotoUploadWidgetProps {
  pointId: string;
  scenario: string;
  state: VisionPointState;
  onAction: (action: import('@/types').AccionDemo) => void;
}

export function PhotoUploadWidget({ pointId, scenario, state, onAction }: PhotoUploadWidgetProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    if (selectedFile) {
      const objectUrl = URL.createObjectURL(selectedFile);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (active) setPreviewUrl(objectUrl);
      return () => {
        active = false;
        URL.revokeObjectURL(objectUrl);
      };
    } else {
      setPreviewUrl(null);
    }
  }, [selectedFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!validMimes.includes(file.type)) {
        alert('Formato inválido. Solo se aceptan JPEG, PNG o WebP.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSelectedFile(null);
        return;
      }
      if (file.size === 0 || file.size > 12 * 1024 * 1024) {
        alert('El archivo debe ser mayor a 0 y menor a 12 MB.');
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
    } else {
      setSelectedFile(null);
    }
  };

  const handleSimulate = async () => {
    if (!selectedFile) return;
    onAction({ tipo: 'INICIAR_ANALISIS', payload: { pointId } });
    try {
      const res = await submitPhoto(selectedFile, pointId, scenario);
      onAction({ tipo: 'PHOTO_UPLOADED', payload: res });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al analizar la imagen';
      onAction({ tipo: 'ERROR_ANALISIS', payload: { pointId, error: msg } });
    }
  };

  const { status, result, error } = state;
  const isAnalyzing = status === 'analyzing';

  return (
    <div className="p-4 border rounded-md bg-[var(--color-surface)] shadow-sm mt-4">
      <h3 className="font-semibold text-lg mb-2">Punto {pointId}</h3>

      {(!result || error) && !isAnalyzing && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Seleccioná una foto para este punto.</p>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="text-sm"
          />
          {previewUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Preview" className="rounded-md max-w-[200px]" />
            </div>
          )}
          <Button onClick={handleSimulate} variante="secundario" disabled={!selectedFile}>
            Enviar Foto al Modelo
          </Button>
        </div>
      )}

      {isAnalyzing && (
        <div className="flex items-center space-x-2 text-sm text-[var(--color-primary)]">
          <div className="animate-spin h-4 w-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
          <span>Analizando imagen...</span>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 mb-2 mt-2">
          {error}
        </div>
      )}

      {status === 'completed' && result && (
        <div className="space-y-2 mt-2">
          {result.status === 'assessed' ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Malezas detectadas:</span>
                <span className="font-medium">{result.weedsPct}%</span>
              </div>
              {result.soyPct !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cultivo (Soja):</span>
                  <span className="font-medium text-right">
                    {result.soyPct}%
                    {result.soyCalibrated === false && (
                      <span className="block text-[10px] text-[var(--color-warning)]">Estimación de cultivo no calibrada</span>
                    )}
                  </span>
                </div>
              )}
              {result.confidence !== null && (
                <div className="flex flex-col gap-1 text-sm mb-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IoU esperado (Confianza):</span>
                    <span className="font-medium">{(result.confidence * 100).toFixed(1)}% {result.confidenceBand && `· ${result.confidenceBand}`}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    Estimación de superposición con una anotación humana. No es probabilidad de acierto y aplica solamente a malezas.
                  </p>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fuente:</span>
                <span className="font-medium">
                  {result.source === 'preset' ? 'Resultado simulado' : 'Modelo IA'}
                  {result.source === 'model' && result.model && ` (${result.model})`}
                </span>
              </div>
              {result.source === 'model' && result.gps && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">GPS (Metadato):</span>
                  <span className="font-medium text-[12px]">{result.gps.lat.toFixed(5)}, {result.gps.lon.toFixed(5)}</span>
                </div>
              )}
              {result.source === 'model' && result.reason && (
                <div className="text-sm bg-blue-50 p-2 rounded-md text-blue-900 border border-blue-100 mt-2">
                  <span className="font-medium text-xs block mb-1">Razón:</span>
                  {result.reason}
                </div>
              )}
              {result.source === 'model' && result.limitations && result.limitations.length > 0 && (
                <div className="text-sm bg-amber-50 p-2 rounded-md text-amber-900 border border-amber-100 mt-2">
                  <span className="font-medium text-xs block mb-1">Limitaciones:</span>
                  <ul className="list-disc pl-4 text-xs space-y-1">
                    {result.limitations.map((lim: string, i: number) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : result.status === 'not_assessable' ? (
            <div className="text-sm bg-red-50 p-2 rounded-md text-red-900 border border-red-100 mt-2">
              <span className="font-medium block mb-1">Imagen no evaluable (Error 422):</span>
              <p>{result.reason}</p>
              {result.limitations && result.limitations.length > 0 && (
                <ul className="list-disc pl-4 text-xs mt-1">
                  {result.limitations.map((lim, i) => <li key={i}>{lim}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <div className="text-sm bg-red-50 p-2 rounded-md text-red-900 border border-red-100 mt-2">
              <span className="font-medium block mb-1">Error del proveedor (Error 502):</span>
              <p>{result.error}</p>
              <p className="text-xs mt-1">{result.detail}</p>
            </div>
          )}

          {result.status === 'assessed' && result.reviewUrl ? (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.reviewUrl} alt={`Análisis para ${pointId}`} className="rounded-md w-full max-w-sm" />
            </div>
          ) : previewUrl ? (
            <div className="mt-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={`Original ${pointId}`} className="rounded-md w-full max-w-sm opacity-80" />
            </div>
          ) : (
            <div className="mt-4 p-4 bg-muted rounded-md flex items-center justify-center text-muted-foreground text-sm border border-dashed">
              Sin previsualización original
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
             <input
               type="file"
               accept="image/jpeg,image/png,image/webp"
               ref={fileInputRef}
               onChange={handleFileChange}
               className="text-sm"
             />
             <Button onClick={handleSimulate} variante="terciario" tamanio="sm" disabled={!selectedFile}>
               Reemplazar y Reintentar
             </Button>
          </div>
        </div>
      )}
    </div>
  );
}
