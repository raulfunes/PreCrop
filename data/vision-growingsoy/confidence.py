"""Nivel de confianza de una estimacion de malezas.

No es probabilidad de acierto. Es el IoU esperado contra una anotacion humana:
cuanto del area marcada por el modelo cae de verdad sobre maleza. Sale de las 9
fotos de desarrollo medidas con gemini-3.6-flash y prompt v2 (ver VISION-IA.md).

El predictor es el parche mas grande detectado, no el porcentaje total. El modelo
resuelve matas grandes y falla en malezas chicas; el parche mayor mide eso, y el
total no: un total alto puede venir de sumar manchitas, que es justo la forma que
tienen los fallos (GW08, GW09).
"""

# (id, parche mayor % de la imagen, IoU medido). Corridas en runs/v2-weeds-36*.
CALIBRACION = (
    ("GW01", 16.45, 0.7445), ("GW02", 11.73, 0.5762), ("GW03", 7.75, 0.6151),
    ("GW05", 2.73, 0.2716), ("GW06", 2.38, 0.6005), ("GW04", 2.08, 0.0000),
    ("GW08", 1.14, 0.3766), ("GW07", 0.41, 0.2280), ("GW09", 0.17, 0.0000),
)
PISO, TECHO, K = 0.05, 0.65, 2.05
UMBRAL_ALTA = 5.0

# ponytail: techo real de esta calibracion.
#   n=9, un solo modelo, un solo cultivo (soja), un solo dataset publico.
#   TECHO=0.65 es la media medida del grupo alto, no el mejor caso: no prometemos
#   mas de lo que se midio aunque el parche sea enorme.
#   La curva NO detecta el peor fallo. GW04 da 0.35 de confianza con IoU 0 real.
#   Por eso el contrato manda tambien la foto pintada: el numero solo no alcanza.
#   Sin probar: una foto con muchos parches medianos. Ahi el parche mayor y el
#   total se separan por primera vez y no hay medicion que diga cual gana.
#   Siguiente paso: revalidar contra el conjunto final (GW10-GW13 + congeladas).


def area_pct(poligono):
    """Area del poligono como % de la imagen. Coordenadas 0-1000 sobre la imagen
    entera, asi que el area sale sin conocer el tamano en pixeles."""
    s = 0
    for i, (x, y) in enumerate(poligono):
        x2, y2 = poligono[(i + 1) % len(poligono)]
        s += x * y2 - x2 * y
    return abs(s) / 2 / 1e6 * 100


def parche_mayor(poligonos):
    return max((area_pct(p) for p in poligonos), default=0.0)


def confianza(poligonos):
    """Devuelve (valor, banda). Sin deteccion no hay calibracion: el conjunto de
    desarrollo no tiene ninguna foto sin maleza, asi que un 'no hay maleza' no
    esta medido y no recibe numero."""
    t = parche_mayor(poligonos)
    if not poligonos or t <= 0:
        return 0.0, "sin_calibrar"
    v = PISO + (TECHO - PISO) * t / (t + K)
    return round(v, 2), ("alta" if t >= UMBRAL_ALTA else "baja")
