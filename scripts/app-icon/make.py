"""Builds the familychatui icon SVGs from Be Vietnam Pro Bold's lowercase f."""
import json, sys
sys.path.insert(0, sys.argv[1])  # fontTools, installed into a temporary folder by build.sh
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

font = TTFont(sys.argv[2])
gs = font.getGlyphSet()
name = font.getBestCmap()[ord("f")]
bp = BoundsPen(gs); gs[name].draw(bp)
x0, y0, x1, y1 = bp.bounds
INK, ACCENT, S = "#1a1a1f", "#ff5500", 1024

def glyph_path(height_ratio, dy=0.0):
    """The f scaled so its height is height_ratio of the canvas, centred (dy nudges it, as a share of S)."""
    k = S * height_ratio / (y1 - y0)
    w, h = (x1 - x0) * k, (y1 - y0) * k
    tx, ty = (S - w) / 2 - x0 * k, (S + h) / 2 + y0 * k + dy * S  # y flips: font units grow up
    pen = SVGPathPen(gs, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    gs[name].draw(TransformPen(pen, (k, 0, 0, -k, tx, ty)))
    return pen.getCommands()

def svg(path, rounded):
    corner = ' rx="232"' if rounded else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">'
            f'<rect width="{S}" height="{S}"{corner} fill="{INK}"/><path fill="{ACCENT}" d="{path}"/></svg>\n')

out = sys.argv[3]
variants = {
    "icon": (glyph_path(0.66), True),       # favicon and "any" PNGs: rounded tile, big letter for 16 px tabs
    "apple": (glyph_path(0.58), False),     # iOS rounds the square itself
    "maskable": (glyph_path(0.48), False),  # Android crops to a circle: stay inside the 80% safe zone
}
for key, (path, rounded) in variants.items():
    open(f"{out}/{key}.svg", "w").write(svg(path, rounded))
json.dump({"path": variants["icon"][0], "bounds": [x0, y0, x1, y1]}, open(f"{out}/logo-path.json", "w"))
print("glyph bounds", (x0, y0, x1, y1), "->", ", ".join(f"{k}.svg" for k in variants))
