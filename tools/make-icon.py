"""Builds icon.png (512x512, the app icon) and brand.png (the rail mark) out of the
VexonTV logo. No dependencies: zlib and struct.

    python3 tools/make-icon.py /path/to/logo.png

The logo carries the TV glyph with the name written under it. At 48px in the rail the
name cannot be read, so brand.png is the glyph alone: it looks for the band of empty
rows that separates the drawing from the text and cuts there. The blacks in the
background turn transparent so the mark sits on the app gradient.
"""
import struct
# Cuts the glyph out of the logo for icon.png and brand.png.
import sys
import zlib

ICON = 512
BRAND_HEIGHT = 140
BLACK = 26
PAD = 10
GAP_ROWS = 10

def decode_png(path):
    """8-bit, non-interlaced PNG, RGB or RGBA -> (w, h, bytearray rgba)."""
    data = open(path, 'rb').read()
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit('not a PNG: ' + path)

    pos, idat, header = 8, [], None
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if tag == b'IHDR':
            header = struct.unpack('>IIBBBBB', body)
        elif tag == b'IDAT':
            idat.append(body)
        pos += 12 + length

    width, height, depth, color, _, _, interlace = header
    if depth != 8 or interlace != 0 or color not in (2, 6):
        raise SystemExit('expected an 8-bit non-interlaced PNG in RGB or RGBA')

    channels = 3 if color == 2 else 4
    stride = width * channels
    raw = zlib.decompress(b''.join(idat))

    out = bytearray(width * height * 4)
    previous = bytearray(stride)
    pos = 0
    for y in range(height):
        kind = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if kind == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif kind == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif kind == 4:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                up = previous[i]
                upleft = previous[i - channels] if i >= channels else 0
                p = left + up - upleft
                pa, pb, pc = abs(p - left), abs(p - up), abs(p - upleft)
                near = left if (pa <= pb and pa <= pc) else (up if pb <= pc else upleft)
                line[i] = (line[i] + near) & 0xFF
        elif kind != 0:
            raise SystemExit('unknown PNG filter: %d' % kind)

        base = y * width * 4
        if channels == 4:
            out[base:base + stride] = line
        else:
            for x in range(width):
                out[base + x * 4:base + x * 4 + 3] = line[x * 3:x * 3 + 3]
                out[base + x * 4 + 3] = 255
        previous = line
    return width, height, out

def background(rgba, i):
    """Background: either transparent (a logo cut-out carries junk RGB under alpha
    0) or black. Everything else is drawing."""
    if rgba[i + 3] < 64:
        return True
    return rgba[i] < BLACK and rgba[i + 1] < BLACK and rgba[i + 2] < BLACK

def glyph_box(width, height, rgba):
    """Box of the drawing (top), cutting at the gap the text leaves."""
    rows = []
    for y in range(height):
        count = 0
        base = y * width * 4
        for x in range(width):
            if not background(rgba, base + x * 4):
                count += 1
        rows.append(count)

    first = next((y for y, count in enumerate(rows) if count > 4), 0)
    gap, last = 0, height - 1
    for y in range(first, height):
        if rows[y] <= 2:
            gap += 1
            if gap >= GAP_ROWS:
                last = y - gap
                break
        else:
            gap = 0

    left, right = width - 1, 0
    for y in range(first, last + 1):
        base = y * width * 4
        for x in range(width):
            if not background(rgba, base + x * 4):
                left = min(left, x)
                right = max(right, x)
    return first, left, last, right

def crop(width, rgba, box):
    top, left, bottom, right = box
    w = right - left + 1
    h = bottom - top + 1
    out = bytearray(w * h * 4)
    for y in range(h):
        src = ((top + y) * width + left) * 4
        out[y * w * 4:(y + 1) * w * 4] = rgba[src:src + w * 4]
    return w, h, out

def keyed(width, height, rgba):
    """The blacks in the background become transparent: the mark sits on the mesh."""
    out = bytearray(rgba)
    for i in range(0, len(out), 4):
        out[i + 3] = 0 if background(out, i) else 255
    return out

def scale(width, height, rgba, dw, dh):
    """Box average: when scaling down this is what keeps the text from coming out jagged."""
    out = bytearray(dw * dh * 4)
    for y in range(dh):
        y0 = y * height // dh
        y1 = max(y0 + 1, (y + 1) * height // dh)
        for x in range(dw):
            x0 = x * width // dw
            x1 = max(x0 + 1, (x + 1) * width // dw)
            a = r = g = b = 0
            total = (x1 - x0) * (y1 - y0)
            for sy in range(y0, y1):
                base = sy * width * 4
                for sx in range(x0, x1):
                    i = base + sx * 4
                    r += rgba[i]
                    g += rgba[i + 1]
                    b += rgba[i + 2]
                    a += rgba[i + 3]
            o = (y * dw + x) * 4
            out[o:o + 4] = bytes((r // total, g // total, b // total, a // total))
    return out

def encode_png(width, height, rgba):
    rows = bytearray()
    for y in range(height):
        rows.append(0)
        rows.extend(rgba[y * width * 4:(y + 1) * width * 4])

    def chunk(tag, body):
        return (struct.pack('>I', len(body)) + tag + body +
                struct.pack('>I', zlib.crc32(tag + body) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(rows), 9))
            + chunk(b'IEND', b''))

def write(path, width, height, rgba):
    png = encode_png(width, height, rgba)
    open(path, 'wb').write(png)
    print('%s %dx%d, %d KB' % (path, width, height, len(png) / 1024))

def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: python3 tools/make-icon.py /path/to/logo.png')
    path = sys.argv[1]
    width, height, rgba = decode_png(path)

    write('icon.png', ICON, ICON, scale(width, height, rgba, ICON, ICON))

    box = glyph_box(width, height, rgba)
    top, left, bottom, right = box
    print('glyph found: x %d..%d, y %d..%d' % (left, right, top, bottom))
    top = max(0, top - PAD)
    left = max(0, left - PAD)
    bottom = min(height - 1, bottom + PAD)
    right = min(width - 1, right + PAD)

    cw, ch, cimg = crop(width, rgba, (top, left, bottom, right))
    brand = scale(cw, ch, keyed(cw, ch, cimg), max(1, round(cw * BRAND_HEIGHT / ch)), BRAND_HEIGHT)
    write('brand.png', max(1, round(cw * BRAND_HEIGHT / ch)), BRAND_HEIGHT, brand)

if __name__ == '__main__':
    main()
