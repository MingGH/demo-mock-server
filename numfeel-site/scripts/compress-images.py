#!/usr/bin/env python3
"""批量压缩图片：缩放 + 转 WebP。

用法:
  python3 scripts/compress-images.py <目录> [--max-size 512] [--quality 80] [--delete-original]

对指定目录下所有 jpg/jpeg/png 生成同名 .webp（缩放至 max-size 内），
并在 --delete-original 时删除原图。SVG/GIF/ICO 不处理。
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow: pip install Pillow")

EXTS = ('.jpg', '.jpeg', '.png')


def compress(path, max_size, quality, delete_original):
    im = Image.open(path)
    rgb = im.convert('RGB') if im.mode not in ('RGB', 'L') else im
    img = rgb
    if max_size and max(rgb.size) > max_size:
        ratio = max_size / max(rgb.size)
        new_size = (max(1, round(rgb.size[0] * ratio)), max(1, round(rgb.size[1] * ratio)))
        img = rgb.resize(new_size, Image.LANCZOS)
    out = os.path.splitext(path)[0] + '.webp'
    img.save(out, 'WEBP', quality=quality, method=6)
    old = os.path.getsize(path)
    new = os.path.getsize(out)
    if delete_original:
        os.remove(path)
    return old, new


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('target')
    parser.add_argument('--max-size', type=int, default=512,
                        help='最长边像素，超过则等比缩放（0=不缩放）')
    parser.add_argument('--quality', type=int, default=80)
    parser.add_argument('--delete-original', action='store_true',
                        help='生成 webp 后删除原图')
    args = parser.parse_args()

    total_old = total_new = 0
    count = 0
    for root, _dirs, files in os.walk(args.target):
        for f in sorted(files):
            if not f.lower().endswith(EXTS):
                continue
            path = os.path.join(root, f)
            try:
                old, new = compress(path, args.max_size, args.quality, args.delete_original)
            except Exception as e:
                print(f'  ✗ {f}: {e}')
                continue
            total_old += old
            total_new += new
            count += 1
            pct = 100 * (1 - new / old) if old else 0
            print(f'  {f}: {old/1024:.0f}KB -> {new/1024:.0f}KB  (-{pct:.0f}%)')

    if count:
        total_old_mb = total_old / 1024 / 1024
        total_new_mb = total_new / 1024 / 1024
        print(f'\n共 {count} 张: {total_old_mb:.2f}MB -> {total_new_mb:.2f}MB '
              f'(-{100*(1-total_new/total_old):.0f}%)')


if __name__ == '__main__':
    main()