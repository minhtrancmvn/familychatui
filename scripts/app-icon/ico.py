"""Packs PNGs into favicon.ico (PNG-in-ICO, supported by every current browser). Usage: ico.py out.ico a.png b.png ..."""
import struct, sys

out, pngs = sys.argv[1], sys.argv[2:]
images = []
for p in pngs:
    data = open(p, "rb").read()
    w, h = struct.unpack(">II", data[16:24])  # IHDR
    images.append((w, h, data))
header = struct.pack("<HHH", 0, 1, len(images))
offset = 6 + 16 * len(images)
entries, blobs = b"", b""
for w, h, data in images:
    entries += struct.pack("<BBBBHHII", w % 256, h % 256, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
    blobs += data
open(out, "wb").write(header + entries + blobs)
print(f"{out}: {', '.join(f'{w}x{h}' for w, h, _ in images)}")
