"""Render the BandIt turntable and favicon. Run with Python 3 and NumPy."""
from pathlib import Path
import struct
import zlib

import numpy as np


PUBLIC = Path(__file__).resolve().parents[1] / "public"
SIZE = 96
FRAMES = 96
# Bottom to top: indigo, blue, turquoise, green, gold, coral, pink.
PALETTE = np.array([
    [109, 49, 222], [44, 95, 230], [0, 172, 202], [68, 193, 118],
    [255, 195, 54], [251, 103, 62], [231, 50, 139],
]) / 255


def note_parts():
    """Ellipsoid head, round stem and a tapered flag curling toward the viewer."""
    yield (-0.29, -0.65, 0), (0.51, 0.35, 0.38), -0.34
    for y in np.linspace(-0.61, 0.84, 120):
        yield (0.04, y, 0), (0.14, 0.14, 0.14), 0
    for t in np.linspace(0, 1, 140):
        x = 0.04 + 0.54 * np.sin(t * np.pi * 0.75) ** 1.5
        y = 0.84 - 0.8 * t
        z = 0.21 * np.sin(np.pi * t)
        radius = 0.14 + 0.06 * np.sin(np.pi * t) - 0.108 * t ** 3
        yield (x, y, z), (radius,) * 3, 0


def render(angle):
    # Intersect orthographic camera rays with the solids; keep the nearest surface.
    c, s = np.cos(angle), np.sin(angle)
    tilt = -0.12
    ct, st = np.cos(tilt), np.sin(tilt)
    camera = np.array([[c, 0, s], [st*s, ct, -st*c], [-ct*s, st, ct*c]])
    pixels = ((np.arange(SIZE) + 0.5) / SIZE - 0.5) * 2.24
    x, y = np.meshgrid(pixels, -pixels)
    origin = np.stack((x, y, np.zeros_like(x)), axis=-1) @ camera
    ray = camera[2]
    depth = np.full(x.shape, -np.inf)
    normal = np.zeros_like(origin)
    for center, radii, roll in note_parts():
        a, b = np.cos(roll), np.sin(roll)
        axes = np.array([[a, -b, 0], [b, a, 0], [0, 0, 1]])
        metric = (axes / np.square(radii)) @ axes.T
        delta = origin - center
        direction = metric @ ray
        slope = delta @ direction
        curvature = ray @ direction
        discriminant = slope**2 - curvature * ((delta * (delta @ metric)).sum(axis=2) - 1)
        hit = (np.sqrt(np.maximum(0, discriminant)) - slope) / curvature
        visible = (discriminant >= 0) & (hit > depth)
        depth[visible] = hit[visible]
        normal[visible] = (delta[visible] + hit[visible, None] * ray) @ metric

    mask = np.isfinite(depth)
    n = normal[mask] @ camera.T
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    height = origin[mask, 1] + depth[mask] * ray[1]
    band = np.clip((height + 1) / 1.99, 0, 1) * (len(PALETTE) - 1)
    color = np.stack([np.interp(band, np.arange(len(PALETTE)), channel)
                      for channel in PALETTE.T], axis=1)
    light = np.maximum(0, n @ [-0.45, 0.67, 0.59])
    gloss = np.maximum(0, n @ [-0.24, 0.39, 0.888]) ** 23
    shaded = color * (0.60 + 0.44 * light[:, None]) + 0.55 * gloss[:, None]
    image = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    image[mask, :3] = np.clip(shaded * 255, 0, 255).astype(np.uint8)
    image[mask, 3] = 255
    return image


def write_png(name, image):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    height, width, _ = image.shape
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    # PNG Sub filter keeps smooth color gradients compact.
    filtered = image.copy()
    filtered[:, 1:] -= image[:, :-1]
    scanlines = b"".join(b"\x01" + row.tobytes() for row in filtered)
    (PUBLIC / name).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                                + chunk(b"IDAT", zlib.compress(scanlines, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    frames = [render(angle - 0.27) for angle in np.arange(FRAMES) * 2 * np.pi / FRAMES]
    write_png("bandit-note.png", frames[0])
    write_png("bandit-turntable.png", np.concatenate(frames, axis=1))
