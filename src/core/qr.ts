// A small QR code encoder (ISO/IEC 18004): byte mode, versions 1 to 10, the error correction level asked for (raised
// when the same version allows), the mask with the lowest penalty. Enough for a link of up to 180 bytes; written after
// Project Nayuki's reference implementation (MIT), cut down to what the device-link sheet draws.
type Ecl = 'L' | 'M' | 'Q' | 'H';
const ECLS: Ecl[] = ['L', 'M', 'Q', 'H'];
const FORMAT: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };
// per version 1 to 10: error correction codewords in each block, and how many blocks
const ECC: Record<Ecl, number[]> = {
  L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS: Record<Ecl, number[]> = {
  L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

const rawModules = (v: number) => {
  let n = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const a = Math.floor(v / 7) + 2;
    n -= (25 * a - 10) * a - 55;
    if (v >= 7) n -= 36;
  }
  return n;
};
const dataCodewords = (v: number, e: Ecl) => Math.floor(rawModules(v) / 8) - ECC[e][v - 1] * BLOCKS[e][v - 1];

// Reed-Solomon over GF(2^8), polynomial 0x11D
function mul(x: number, y: number) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function divisor(degree: number) {
  const r = new Array<number>(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = mul(root, 2);
  }
  return r;
}
function remainder(data: number[], div: number[]) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
}

export interface Qr { size: number; dark: (x: number, y: number) => boolean }

export function qr(text: string, min: Ecl = 'M'): Qr {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  const bitsFor = (ver: number) => 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
  while (v <= 10 && bitsFor(v) > dataCodewords(v, min) * 8) v++;
  if (v > 10) throw new Error('qr: too long');
  let ecl = min;
  for (const e of ECLS.slice(ECLS.indexOf(min) + 1)) if (bitsFor(v) <= dataCodewords(v, e) * 8) ecl = e;

  // the bit stream: byte mode, the count, the bytes, a terminator, then padding
  const bits: number[] = [];
  const put = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4);
  put(bytes.length, v < 10 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(v, ecl) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // blocks, error correction, interleaving
  const nb = BLOCKS[ecl][v - 1], el = ECC[ecl][v - 1], raw = Math.floor(rawModules(v) / 8);
  const short = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = divisor(el);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = data.slice(k, k + shortLen - el + (i < short ? 0 : 1));
    k += d.length;
    const e = remainder(d, div);
    if (i < short) d.push(0);
    blocks.push(d.concat(e));
  }
  const words: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= short) words.push(b[i]); });

  // the symbol
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, d: boolean) => { m[y][x] = d; fixed[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  if (v > 1) {
    const n = Math.floor(v / 7) + 2, step = Math.floor((v * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const pos = [6];
    for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
    for (const y of pos) for (const x of pos) {
      if ((x === 6 && y === 6) || (x === 6 && y === size - 7) || (x === size - 7 && y === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const format = (mask: number) => {
    const d = (FORMAT[ecl] << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0); // reserve the area; drawn for real once the mask is chosen
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fixed[y][x] && i < words.length * 8) { m[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  const flip = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (fixed[y][x]) continue;
      const inv = [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
        ((x * y) % 2) + ((x * y) % 3) === 0, (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0][mask];
      if (inv) m[y][x] = !m[y][x];
    }
  };
  let best = 0, least = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    flip(mask);
    format(mask);
    const p = penalty(m, size);
    if (p < least) { least = p; best = mask; }
    flip(mask); // undo
  }
  flip(best);
  format(best);
  return { size, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && m[y][x] };
}

function penalty(m: boolean[][], size: number) {
  let score = 0;
  const lines = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a++) {
      let color = false, run = 0;
      const hist = [0, 0, 0, 0, 0, 0, 0];
      const add = (len: number) => { if (hist[0] === 0) len += size; hist.pop(); hist.unshift(len); };
      const finders = () => {
        const n = hist[1], core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n;
        return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) + (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0);
      };
      for (let b = 0; b < size; b++) {
        if (get(a, b) === color) {
          run++;
          if (run === 5) score += 3; else if (run > 5) score++;
        } else {
          add(run);
          if (!color) score += finders() * 40;
          color = get(a, b);
          run = 1;
        }
      }
      if (color) { add(run); run = 0; }
      add(run + size);
      score += finders() * 40;
    }
  };
  lines((y, x) => m[y][x]);
  lines((x, y) => m[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (y < size - 1 && x < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  const total = size * size;
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

/** The symbol as one SVG path of unit squares, with a quiet zone of `quiet` modules; `clear` leaves a centred square empty. */
export function qrPath(q: Qr, quiet = 4, clear = 0) {
  const c0 = Math.floor((q.size - clear) / 2), c1 = c0 + clear;
  let d = '';
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) {
    if (!q.dark(x, y) || (clear && x >= c0 && x < c1 && y >= c0 && y < c1)) continue;
    d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
  }
  return { d, view: q.size + quiet * 2 };
}
