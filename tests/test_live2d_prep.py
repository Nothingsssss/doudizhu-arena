"""python3 -m unittest tests/test_live2d_prep.py —— 素材准备工具：PNG 读写、去杂点、PackBits、PSD 结构"""
import random
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
import live2d_prep as lp  # noqa: E402


def unpackbits(data, n):
    out, i = bytearray(), 0
    while len(out) < n:
        h = data[i]; i += 1
        if h < 128:
            out += data[i:i + h + 1]; i += h + 1
        elif h > 128:
            out += bytes([data[i]]) * (257 - h); i += 1
    return bytes(out)


def sample(w=37, h=23):
    rng = random.Random(4)
    px = bytearray()
    for y in range(h):
        for x in range(w):
            inside = 5 <= x < 30 and 4 <= y < 20
            px += bytes([rng.randrange(256), 200, x * 6 % 256, 255 if inside else (5 if (x + y) % 7 == 0 else 0)])
    return w, h, px


class PrepTest(unittest.TestCase):
    def test_png_roundtrip(self):
        w, h, px = sample()
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.png"
            lp.write_png(p, w, h, px)
            self.assertEqual(lp.read_png(p), (w, h, px))

    def test_clean_and_bbox(self):
        w, h, px = sample()
        st = lp.clean(w, h, px)
        self.assertGreater(st["specks_removed"], 0)
        self.assertEqual(lp.alpha_bbox(w, h, px), (5, 4, 30, 20))

    def test_packbits(self):
        rng = random.Random(1)
        for _ in range(200):
            row = bytes(rng.choice([0, 0, 0, 255, rng.randrange(256)]) for _ in range(rng.randrange(1, 700)))
            self.assertEqual(unpackbits(lp.packbits(row), len(row)), row)

    def test_psd(self):
        w, h, px = sample()
        layers = [{"name": "参考_原图", "x": 0, "y": 0, "w": w, "h": h, "rgba": px},
                  {"name": "前发", "rgba": None},
                  {"name": "表情参考", "x": 2, "y": 3, "w": w, "h": h, "rgba": px, "hidden": True}]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.psd"
            lp.write_psd(p, w, h, layers, px)
            info = lp.check_psd(p)
            self.assertEqual((info["width"], info["height"], info["channels"], info["mode"]), (w, h, 4, 3))
            self.assertEqual([L["name"] for L in info["layers"]], ["参考_原图", "前发", "表情参考"])
            self.assertEqual([L["hidden"] for L in info["layers"]], [False, False, True])
            self.assertEqual(info["layers"][1]["rect"], [0, 0, 0, 0])
            self.assertEqual(info["layers"][2]["rect"], [2, 3, w, h])
            # 合成图第一个通道（R）解码后和原图一致
            d_ = p.read_bytes()
            pos = 26
            for _ in range(2):
                n, = struct.unpack(">I", d_[pos:pos + 4]); pos += 4 + n
            n, = struct.unpack(">I", d_[pos:pos + 4]); pos += 4 + n
            self.assertEqual(struct.unpack(">H", d_[pos:pos + 2])[0], 1)
            counts = struct.unpack(f">{h * 4}H", d_[pos + 2:pos + 2 + h * 8])
            data = d_[pos + 2 + h * 8:]
            r, off = bytearray(), 0
            for y in range(h):
                r += unpackbits(data[off:off + counts[y]], w); off += counts[y]
            self.assertEqual(bytes(r), bytes(px[0::4]))


if __name__ == "__main__":
    unittest.main()
