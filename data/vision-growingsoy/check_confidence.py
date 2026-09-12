"""Comprobacion minima del nivel de confianza. Sin red ni API."""
from confidence import CALIBRACION, PISO, TECHO, K, UMBRAL_ALTA, area_pct, confianza

def cuadrado(w, h):
    return [[0, 0], [w, 0], [w, h], [0, h]]

# El area sale bien de coordenadas 0-1000.
assert abs(area_pct(cuadrado(1000, 1000)) - 100.0) < 1e-9
assert abs(area_pct(cuadrado(1000, 500)) - 50.0) < 1e-9
assert abs(area_pct(cuadrado(100, 100)) - 1.0) < 1e-9
# Orden de vertices invertido: misma area, no negativa.
assert abs(area_pct(cuadrado(1000, 500)[::-1]) - 50.0) < 1e-9

# Sin deteccion no hay numero calibrado.
assert confianza([]) == (0.0, "sin_calibrar")

# Monotona y acotada. Ni el poligono mas grande posible supera el techo medido.
previo = -1.0
for pct in range(1, 10001):
    lado = (pct / 10000 * 1e6) ** 0.5
    v, banda = confianza([cuadrado(lado, lado)])
    assert 0.0 <= v <= TECHO, (pct, v)
    assert v >= previo - 1e-9, ("no monotona", pct)
    previo = v
assert confianza([cuadrado(1000, 1000)])[0] < TECHO

# La banda parte el conjunto medido igual que la medicion: 3 altas, 6 bajas.
altas = {i for i, top, _ in CALIBRACION if top >= UMBRAL_ALTA}
assert altas == {"GW01", "GW02", "GW03"}, altas
assert len(CALIBRACION) == 9

# El ajuste no se degrada. 0.17 es el RMSE reportado en VISION-IA.md.
err = []
for ident, top, iou in CALIBRACION:
    v = PISO + (TECHO - PISO) * top / (top + K)
    err.append((v - iou) ** 2)
rmse = (sum(err) / len(err)) ** 0.5
assert rmse <= 0.17, rmse

# El punto ciego declarado sigue siendo punto ciego: hay al menos una foto con
# IoU 0 que la curva no baja de 0.2. Si algun dia se arregla, sera con fotos
# nuevas y esta linea tiene que revisarse junto con el ponytail de confidence.py.
ciegas = [i for i, top, iou in CALIBRACION
          if iou == 0.0 and PISO + (TECHO - PISO) * top / (top + K) > 0.2]
assert "GW04" in ciegas, ciegas

print(f"confianza ok | rmse={rmse:.4f} | altas={sorted(altas)} | ciegas={ciegas}")
