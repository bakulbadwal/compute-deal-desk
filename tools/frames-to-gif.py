#!/usr/bin/env python3
"""Pad recorded frames to one canvas (page paper color) and encode a palette-optimized GIF with ffmpeg.

    /usr/bin/python3 tools/frames-to-gif.py <framesDir> docs/step1.gif [fps]
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
fps = sys.argv[3] if len(sys.argv) > 3 else "7"
frames = sorted(glob.glob(os.path.join(src, "f*.png")))
ims = [Image.open(f).convert("RGB") for f in frames]
W, H = max(i.width for i in ims), max(i.height for i in ims)
tmp = tempfile.mkdtemp(prefix="cdd-gif-")
for k, im in enumerate(ims):
    canvas = Image.new("RGB", (W, H), (245, 240, 228))  # --paper
    canvas.paste(im, ((W - im.width) // 2, 0))
    canvas.save(os.path.join(tmp, f"p{k:04d}.png"))
vf = "scale=820:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=200:stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle"
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", fps, "-i", os.path.join(tmp, "p%04d.png"), "-vf", vf, "-loop", "0", out], check=True)
print(f"{out}: {len(ims)} frames, {W}x{H} → 820 wide, {os.path.getsize(out) / 1e6:.2f} MB")
