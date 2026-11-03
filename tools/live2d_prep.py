#!/usr/bin/env python3
"""
为 Cubism Editor 建模准备角色素材（纯 Python 标准库，不改动原图）。

    python3 tools/live2d_prep.py                 处理 static/avatars/ 下所有有立绘的角色
    python3 tools/live2d_prep.py deepseek kimi   只处理指定角色
    python3 tools/live2d_prep.py --check FILE.psd  检查一个 PSD 的结构

每个角色输出到 live2d/prep/<id>/：
    <id>_clean.png          清理后的全身立绘：去掉几乎透明的杂点，裁到人物外框并留边
    expressions/NN_名称.png  从表情图切出的 10 张表情（嘴形、眼睛、眉毛的绘制参考）
    <id>_rig_template.psd   分层模板：原图作参考层 + 按 Cubism 建模习惯命名的空白部件层 + 隐藏的表情参考层
    report.json             透明度、杂边统计

说明：一张 PNG 里的人物是画在一起的，头发后面、眼皮下面、嘴里这些被挡住的部分在图里根本不存在，
程序无法可靠地把它们拆开和补全。真正的部件拆分和遮挡补画需要美术在 PSD 里完成，
之后在 Cubism Editor 里做网格、变形器、参数和物理，再导出 .moc3。这个脚本只把能自动化的部分做好。
"""
import json
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AVATARS = ROOT / "static" / "avatars"
OUT = ROOT / "live2d" / "prep"

EXPRESSIONS = ["平常", "开心", "思考", "惊讶", "生气", "委屈", "大笑", "得意", "害羞", "兴奋"]

# 从下到上的部件层（Cubism 官方建模教程里常见的拆分方式）
PART_LAYERS = [
    "后发", "后发_飘动", "身体", "手臂L", "手臂R", "手L", "手R", "脖子", "服装_下摆", "服装_上衣", "服装_饰品",
    "耳朵L", "耳朵R", "脸", "脸_阴影", "腮红",
    "眼白L", "眼白R", "瞳孔L", "瞳孔R", "高光L", "高光R", "上眼睑L", "上眼睑R", "下眼睑L", "下眼睑R", "睫毛L", "睫毛R",
    "眉毛L", "眉毛R", "鼻子", "口腔", "牙齿", "舌头", "上唇", "下唇",
    "侧发L", "侧发R", "前发", "呆毛", "头饰",
]


# ---------------- PNG ----------------
def read_png(path):
    data = Path(path).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path} 不是 PNG")
    pos, idat, w = 8, [], 0
    h = depth = ctype = interlace = 0
    while pos < len(data):
        n, typ = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        if typ == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat.append(body)
        elif typ == b"IEND":
            break
        pos += 12 + n
    if depth != 8 or ctype not in (2, 6) or interlace:
        raise ValueError(f"{path}：只支持 8 位 RGB/RGBA、非隔行 PNG（当前 depth={depth} type={ctype} interlace={interlace}）")
    bpp = 4 if ctype == 6 else 3
    raw = zlib.decompress(b"".join(idat))
    stride = w * bpp
    out = bytearray(h * w * 4)
    prev = bytearray(stride)
    p = 0
    for y in range(h):
        f = raw[p]
        line = bytearray(raw[p + 1:p + 1 + stride])
        p += 1 + stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            line = bytearray((a + b) & 255 for a, b in zip(line, prev))
        elif f == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        prev = line
        if bpp == 4:
            out[y * w * 4:(y + 1) * w * 4] = line
        else:
            row = out[y * w * 4:(y + 1) * w * 4]
            row[0::4], row[1::4], row[2::4] = line[0::3], line[1::3], line[2::3]
            row[3::4] = b"\xff" * w
            out[y * w * 4:(y + 1) * w * 4] = row
    return w, h, out


def write_png(path, w, h, rgba):
    rows = b"".join(b"\x00" + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(t, b):
        return struct.pack(">I", len(b)) + t + b + struct.pack(">I", zlib.crc32(t + b) & 0xFFFFFFFF)

    Path(path).write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                           + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))


def crop(w, h, rgba, x0, y0, x1, y1):
    cw, ch = x1 - x0, y1 - y0
    out = bytearray(cw * ch * 4)
    for y in range(ch):
        s = ((y0 + y) * w + x0) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = rgba[s:s + cw * 4]
    return cw, ch, out


def alpha_bbox(w, h, rgba, thr=8):
    a = rgba[3::4]
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = a[y * w:(y + 1) * w]
        m = re.search(rb"[^\x00-" + bytes([thr]) + rb"]", row)
        if not m:
            continue
        last = len(row) - re.search(rb"[^\x00-" + bytes([thr]) + rb"]", bytes(reversed(row))).start() - 1
        x0, x1 = min(x0, m.start()), max(x1, last)
        y0, y1 = min(y0, y), y
    return (x0, y0, x1 + 1, y1 + 1) if x1 >= 0 else None


def clean(w, h, rgba):
    """去掉几乎透明的杂点（alpha < 10），统计半透明边缘里偏白的像素（白边）"""
    stats = {"pixels": w * h, "transparent": 0, "semi": 0, "semi_white": 0, "specks_removed": 0}
    for i in range(3, len(rgba), 4):
        a = rgba[i]
        if a == 0:
            stats["transparent"] += 1
        elif a < 10:
            rgba[i] = 0
            rgba[i - 3] = rgba[i - 2] = rgba[i - 1] = 0
            stats["specks_removed"] += 1
            stats["transparent"] += 1
        elif a < 250:
            stats["semi"] += 1
            if rgba[i - 3] > 235 and rgba[i - 2] > 235 and rgba[i - 1] > 235:
                stats["semi_white"] += 1
    stats["transparent_ratio"] = round(stats["transparent"] / stats["pixels"], 4)
    stats["has_alpha_background"] = stats["transparent_ratio"] > 0.2
    return stats


# ---------------- PSD ----------------
def packbits(row):
    out = bytearray()
    i, n = 0, len(row)
    lit = bytearray()

    def flush():
        nonlocal lit
        while lit:
            chunk_ = lit[:128]
            out.append(len(chunk_) - 1)
            out.extend(chunk_)
            lit = lit[128:]

    for m in re.finditer(rb"(.)\1{2,}", row, re.S):
        lit.extend(row[i:m.start()])
        flush()
        run = m.end() - m.start()
        b = row[m.start()]
        while run > 0:
            k = min(run, 128)
            if k < 3:
                lit.extend(bytes([b]) * k)
            else:
                out.append(257 - k)
                out.append(b)
            run -= k
        flush()
        i = m.end()
    lit.extend(row[i:n])
    flush()
    return bytes(out)


def rle_channel(plane, w, h):
    counts, rows = [], []
    for y in range(h):
        r = packbits(bytes(plane[y * w:(y + 1) * w]))
        counts.append(len(r))
        rows.append(r)
    return struct.pack(f">{h}H", *counts) + b"".join(rows)


def pascal(name):
    b = name.encode("ascii", "replace")[:255]
    s = bytes([len(b)]) + b
    return s + b"\x00" * ((4 - len(s) % 4) % 4)


def luni(name):
    u = name.encode("utf-16-be")
    body = struct.pack(">I", len(name)) + u
    body += b"\x00" * ((4 - len(body) % 4) % 4)
    return b"8BIM" + b"luni" + struct.pack(">I", len(body)) + body


def write_psd(path, W, H, layers, merged):
    """layers: [{name, x, y, w, h, rgba|None, hidden}]（从下到上）；merged: 合成图 RGBA"""
    records, chan_data = bytearray(), bytearray()
    for L in layers:
        w, h = (L["w"], L["h"]) if L.get("rgba") is not None else (0, 0)
        top, left = (L["y"], L["x"]) if w else (0, 0)
        chans = []
        for cid, off in ((-1, 3), (0, 0), (1, 1), (2, 2)):
            if w and h:
                plane = L["rgba"][off::4]
                chans.append((cid, struct.pack(">H", 1) + rle_channel(plane, w, h)))
            else:
                chans.append((cid, struct.pack(">H", 0)))
        rec = struct.pack(">iiiiH", top, left, top + h, left + w, 4)
        for cid, d in chans:
            rec += struct.pack(">hI", cid, len(d))
        flags = 0x02 if L.get("hidden") else 0x00
        extra = struct.pack(">I", 0) + struct.pack(">I", 0) + pascal(L["name"]) + luni(L["name"])
        rec += b"8BIMnorm" + struct.pack(">BBBB", 255, 0, flags, 0) + struct.pack(">I", len(extra)) + extra
        records += rec
        for _, d in chans:
            chan_data += d
    layer_info = struct.pack(">h", -len(layers)) + records + chan_data
    if len(layer_info) % 4:
        layer_info += b"\x00" * (4 - len(layer_info) % 4)
    lmi = struct.pack(">I", len(layer_info)) + layer_info + struct.pack(">I", 0)
    header = b"8BPS" + struct.pack(">H6xHIIHH", 1, 4, H, W, 8, 3)
    img = bytearray(struct.pack(">H", 1))
    counts, rows = [], []
    for off in (0, 1, 2, 3):
        plane = merged[off::4]
        for y in range(H):
            r = packbits(bytes(plane[y * W:(y + 1) * W]))
            counts.append(len(r))
            rows.append(r)
    img += struct.pack(f">{len(counts)}H", *counts) + b"".join(rows)
    Path(path).write_bytes(header + struct.pack(">I", 0) + struct.pack(">I", 0)
                           + struct.pack(">I", len(lmi)) + lmi + img)


def check_psd(path):
    """读回 PSD，校验结构并列出图层（不依赖第三方库）"""
    d = Path(path).read_bytes()
    assert d[:4] == b"8BPS", "不是 PSD"
    ver, ch, H, W, depth, mode = struct.unpack(">H6xHIIHH", d[4:26])
    p = 26
    for _ in range(2):
        n, = struct.unpack(">I", d[p:p + 4]); p += 4 + n
    lmi_len, = struct.unpack(">I", d[p:p + 4]); lmi_end = p + 4 + lmi_len; p += 4
    li_len, = struct.unpack(">I", d[p:p + 4]); p += 4
    count, = struct.unpack(">h", d[p:p + 2]); p += 2
    layers = []
    for _ in range(abs(count)):
        t, l, b, r, nc = struct.unpack(">iiiiH", d[p:p + 18]); p += 18
        lens = []
        for _ in range(nc):
            cid, ln = struct.unpack(">hI", d[p:p + 6]); p += 6; lens.append(ln)
        sig, key, op, clip, flags, _, ex = struct.unpack(">4s4sBBBBI", d[p:p + 16]); p += 16
        assert sig == b"8BIM", "图层记录损坏"
        ex_end = p + ex
        m, = struct.unpack(">I", d[p:p + 4]); p += 4 + m
        br, = struct.unpack(">I", d[p:p + 4]); p += 4 + br
        nl = d[p]; name = d[p + 1:p + 1 + nl].decode("latin1"); p += 1 + nl; p += (4 - (1 + nl) % 4) % 4
        while p < ex_end:
            s2, k2, ln2 = struct.unpack(">4s4sI", d[p:p + 12])
            if k2 == b"luni":
                cnt, = struct.unpack(">I", d[p + 12:p + 16]); name = d[p + 16:p + 16 + cnt * 2].decode("utf-16-be")
            p += 12 + ln2
        p = ex_end
        layers.append({"name": name, "rect": [l, t, r - l, b - t], "hidden": bool(flags & 2), "chan_bytes": sum(lens)})
    data_needed = sum(L["chan_bytes"] for L in layers)
    assert p + data_needed <= lmi_end, "通道数据长度不符"
    comp, = struct.unpack(">H", d[lmi_end:lmi_end + 2])
    return {"width": W, "height": H, "channels": ch, "depth": depth, "mode": mode, "layers": layers, "merged_compression": comp}


# ---------------- 主流程 ----------------
def prep(cid):
    full_p = AVATARS / f"{cid}.png"
    faces_p = AVATARS / f"{cid}-faces.png"
    if not full_p.is_file():
        print(f"[跳过] {cid}：没有 static/avatars/{cid}.png")
        return None
    out = OUT / cid
    (out / "expressions").mkdir(parents=True, exist_ok=True)
    w, h, rgba = read_png(full_p)
    stats = clean(w, h, rgba)
    box = alpha_bbox(w, h, rgba)
    if not box:
        print(f"[跳过] {cid}：立绘全透明")
        return None
    pad = max(8, int(max(w, h) * 0.02))
    x0, y0 = max(0, box[0] - pad), max(0, box[1] - pad)
    x1, y1 = min(w, box[2] + pad), min(h, box[3] + pad)
    cw, ch, crgba = crop(w, h, rgba, x0, y0, x1, y1)
    write_png(out / f"{cid}_clean.png", cw, ch, crgba)

    layers = [{"name": "参考_原图（锁定，不要导出）", "x": 0, "y": 0, "w": cw, "h": ch, "rgba": crgba}]
    for n in PART_LAYERS:
        layers.append({"name": n, "rgba": None})
    expr_files = []
    if faces_p.is_file():
        fw, fh, frgba = read_png(faces_p)
        cw5, ch2 = fw // 5, fh // 2
        for k, name in enumerate(EXPRESSIONS):
            ex, ey = (k % 5) * cw5, (k // 5) * ch2
            ew, eh, e = crop(fw, fh, frgba, ex, ey, ex + cw5, ey + ch2)
            fn = f"{k:02d}_{name}.png"
            write_png(out / "expressions" / fn, ew, eh, e)
            expr_files.append(fn)
            if ew <= cw and eh <= ch:
                layers.append({"name": f"表情参考_{k:02d}_{name}", "x": 0, "y": 0, "w": ew, "h": eh, "rgba": e, "hidden": True})
    psd = out / f"{cid}_rig_template.psd"
    write_psd(psd, cw, ch, layers, crgba)
    info = check_psd(psd)
    report = {
        "id": cid,
        "source": str(full_p.relative_to(ROOT)),
        "source_size": [w, h],
        "figure_box": [x0, y0, x1 - x0, y1 - y0],
        "alpha": stats,
        "expressions": expr_files,
        "psd": {"file": psd.name, "size": [info["width"], info["height"]], "layers": len(info["layers"])},
        "automatic": ["去杂点", "裁边", "表情切图", "分层模板"],
        "manual_required": ["按部件拆图并补画被遮挡区域", "Cubism Editor：网格、变形器、参数、物理、导出 moc3"],
    }
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[完成] {cid}：{cw}×{ch}，白边像素 {stats['semi_white']}，PSD {len(info['layers'])} 层 → {out.relative_to(ROOT)}")
    return report


def main(argv):
    if argv[:1] == ["--check"]:
        print(json.dumps(check_psd(argv[1]), ensure_ascii=False, indent=1))
        return
    ids = argv or sorted(p.stem for p in AVATARS.glob("*.png") if not p.stem.endswith("-faces") and not p.stem.startswith("微信"))
    for cid in ids:
        try:
            prep(cid)
        except Exception as e:  # 单个角色失败不影响其他角色
            print(f"[失败] {cid}：{e}")


if __name__ == "__main__":
    main(sys.argv[1:])
