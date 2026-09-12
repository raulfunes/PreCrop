"""Vista de revision: foto recibida junto a la misma foto con las malezas detectadas.
Es lo que ve el agronomo en produccion, donde no hay anotacion contra la cual comparar.

  python -B data/vision-growingsoy/overlay.py FOTO MASCARA SALIDA [--pct 17.5] [--titulo GW01]

La mascara es la que la corrida guarda como <ID>.mask.png, la misma que alimenta el
porcentaje: pintar otra cosa mostraria al agronomo algo distinto de lo que se calculo.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FILL, EDGE, BAR = (255, 45, 30), (255, 230, 0), 34


def overlay(photo, mask):
    """Relleno translucido mas borde nitido: la hoja tiene que seguir viendose debajo.

    ponytail: el borde se engorda hasta 2 pixeles hacia afuera de la mascara, asi que la
    region resaltada se ve algo mayor que la medida. El porcentaje sale del relleno, no del
    borde. Si hiciera falta lectura de area a ojo, dibujar el contorno hacia adentro.
    """
    w, h = photo.size
    if mask.size != photo.size:
        raise ValueError("La mascara no coincide con la foto")
    binary = mask.convert("L").point(lambda v: 255 if v > 127 else 0)
    out = photo.convert("RGB").copy()
    out.paste(Image.new("RGB", (w, h), FILL), (0, 0), binary.point(lambda v: 90 if v else 0))
    edge = binary.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(5))
    out.paste(Image.new("RGB", (w, h), EDGE), (0, 0), edge)
    return out


def sheet(photo, mask, pct=None, titulo=""):
    marked = overlay(photo, mask)
    w, h = photo.size
    card = Image.new("RGB", (w * 2 + 12, h + BAR), (250, 250, 250))
    card.paste(photo, (0, BAR))
    card.paste(marked, (w + 12, BAR))
    draw = ImageDraw.Draw(card)
    try:
        big = ImageFont.truetype("segoeui.ttf", 17)
        small = ImageFont.truetype("segoeui.ttf", 14)
    except OSError:
        big = small = ImageFont.load_default()
    draw.text((6, 8), f"{titulo} — foto recibida".strip(" —"), fill=(20, 20, 20), font=big)
    label = "Malezas estimadas: sin resultado" if pct is None else f"Malezas estimadas: {pct:.2f}% de la foto"
    draw.text((w + 18, 8), label, fill=(190, 0, 0), font=big)
    draw.text((w + 18 + draw.textlength(label, font=big) + 16, 11),
              "sin calibrar · requiere revisión", fill=(110, 110, 110), font=small)
    return card


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo"), parser.add_argument("mask"), parser.add_argument("out")
    parser.add_argument("--pct", type=float, default=None)
    parser.add_argument("--titulo", default="")
    args = parser.parse_args()
    with Image.open(args.photo) as photo, Image.open(args.mask) as mask:
        sheet(photo.convert("RGB"), mask, args.pct, args.titulo).save(args.out)
    print(Path(args.out).resolve())


if __name__ == "__main__":
    main()
