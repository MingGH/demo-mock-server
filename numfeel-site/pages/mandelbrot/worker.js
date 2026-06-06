// ========== Mandelbrot 渲染 Web Worker ==========
// 在独立线程中计算，不阻塞 UI

function mandelbrotEscape(cx, cy, maxIter) {
  let zx = 0, zy = 0;
  let zx2 = 0, zy2 = 0;
  let iter = 0;

  while (zx2 + zy2 <= 4 && iter < maxIter) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
    iter++;
  }

  if (iter === maxIter) return maxIter;
  const modulus = Math.sqrt(zx2 + zy2);
  return iter + 1 - Math.log(Math.log(modulus)) / Math.log(2);
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function getColor(iter, maxIter, scheme) {
  if (iter >= maxIter) return [0, 0, 0];

  const t = Math.log(iter + 1) / Math.log(maxIter + 1);

  switch (scheme) {
    case 'fire': {
      const r = Math.min(255, Math.floor(510 * t));
      const g = Math.min(255, Math.floor(Math.max(0, 510 * (t - 0.35))));
      const b = Math.min(255, Math.floor(Math.max(0, 510 * (t - 0.65))));
      return [r, g, b];
    }
    case 'ice': {
      const r = Math.min(255, Math.floor(9 * (1 - t) * t * t * t * 255));
      const g = Math.min(255, Math.floor(15 * (1 - t) * (1 - t) * t * t * 255));
      const b = Math.min(255, Math.max(0, Math.floor(8.5 * (1 - t) * (1 - t) * (1 - t) * t * 255 + 200 * t)));
      return [r, g, b];
    }
    case 'rainbow': {
      const hue = (iter * 7) % 360;
      return hslToRgb(hue / 360, 0.9, 0.5);
    }
    default: {
      const hue = 220 + 140 * t;
      const sat = 0.75 + 0.25 * Math.sin(t * Math.PI);
      const light = 0.05 + 0.55 * t;
      return hslToRgb(hue / 360, sat, light);
    }
  }
}

// 接收渲染任务
self.onmessage = function(e) {
  const { id, width, height, centerX, centerY, zoom, maxIter, colorScheme, startRow, endRow } = e.data;

  const scale = 4.0 / (width * zoom);
  const rowCount = endRow - startRow;
  const buffer = new Uint8ClampedArray(width * rowCount * 4);

  let inSet = 0;
  let boundary = 0;

  for (let py = startRow; py < endRow; py++) {
    const cy = centerY + (py - height / 2) * scale;
    const rowOffset = (py - startRow) * width * 4;

    for (let px = 0; px < width; px++) {
      const cx = centerX + (px - width / 2) * scale;
      const iter = mandelbrotEscape(cx, cy, maxIter);
      const idx = rowOffset + px * 4;

      if (iter >= maxIter) {
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 255;
        inSet++;
      } else {
        const color = getColor(iter, maxIter, colorScheme);
        buffer[idx] = color[0];
        buffer[idx + 1] = color[1];
        buffer[idx + 2] = color[2];
        buffer[idx + 3] = 255;
        if (iter > maxIter * 0.1) boundary++;
      }
    }
  }

  self.postMessage({ id, buffer, startRow, endRow, inSet, boundary }, [buffer.buffer]);
};
