"""Comprobacion offline de la vista de revision: python -B data/vision-growingsoy/check_overlay.py"""
from PIL import Image

from overlay import overlay

BG = (12, 120, 40)


def main():
    photo = Image.new("RGB", (40, 40), BG)
    mask = Image.new("L", (40, 40), 0)
    square = {(x, y) for y in range(15, 25) for x in range(15, 25)}
    for xy in square:
        mask.putpixel(xy, 255)
    out = overlay(photo, mask)
    changed = {(x, y) for y in range(40) for x in range(40) if out.getpixel((x, y)) != BG}
    # Toda la mascara queda marcada...
    assert square <= changed, sorted(square - changed)[:5]
    # ...y nada se pinta lejos de ella: el borde no se aleja mas de 2 pixeles.
    far = {(x, y) for (x, y) in changed
           if min(max(abs(x - a), abs(y - b)) for (a, b) in square) > 2}
    assert not far, sorted(far)[:5]
    # Sin deteccion no se pinta nada: nunca se dibuja un cero que el modelo no dijo.
    assert overlay(photo, Image.new("L", (40, 40), 0)).tobytes() == photo.tobytes()
    try:
        overlay(photo, Image.new("L", (4, 4), 0))
    except ValueError:
        pass
    else:
        raise AssertionError("una mascara de otro tamano debe rechazarse")
    print("OK: cubre la mascara, no se aleja mas de 2 pixeles, mascara vacia no pinta, "
          "tamano distinto rechazado. Sin red.")


if __name__ == "__main__":
    main()
