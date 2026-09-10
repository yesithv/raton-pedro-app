import os
import sys
from PIL import Image

src = sys.argv[1]
out_dir = sys.argv[2]
count = int(sys.argv[3])

im = Image.open(src).convert("RGBA")
im = im.transpose(Image.FLIP_TOP_BOTTOM)
w, h = im.size
pad = int(max(w, h) * 0.06)
canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
canvas.paste(im, (pad, pad), im)

os.makedirs(out_dir, exist_ok=True)
for i in range(count):
    canvas.save(os.path.join(out_dir, f"frame_{i:04d}.png"))

print(canvas.size)
