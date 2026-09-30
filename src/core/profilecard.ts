// "My philosophy": a share image drawn only from what this reader really did (nothing invented).
// Lamps lit, thinkers met, lines kept, words written, the school they keep returning to, the thinker
// they keep most, and the last line they kept. Post 4:5 or story 9:16, lamplit and editorial.
import { store } from './store';
import { loadAllQuotes, loadAuthors, type Author, type Quote } from './data';
import { SCHOOL, L, type SchoolId } from '../content/schools';
import { CARD_TONE, authorName, quoteLines } from '../ui/card';
import { mark } from '../ui/icons';
import { wrap, svgImage, fontsReady, arch, portraitCredit, drawFace, type Format } from './sharecard';
import { t, isEn } from './i18n';
import { fmt } from './dom';
import { fillAt } from './canvastext';

export interface Profile {
  lit: number; streak: number; best: number;
  met: number; total: number; kept: number; written: number; pulls: number;
  lean: SchoolId | null; leanShare: number;
  favorite: Author | null; line: Quote | null; lineAuthor: Author | null;
}

export async function buildProfile(): Promise<Profile> {
  const s = store.s;
  const [quotes, authors] = await Promise.all([loadAllQuotes(), loadAuthors()]);
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const score: Partial<Record<SchoolId, number>> = {};
  for (const [id, n] of Object.entries(s.seen)) { const q = byId.get(id); if (q) score[q.school] = (score[q.school] || 0) + n; }
  const notes = Object.values(s.notes);
  for (const n of notes) score[n.school] = (score[n.school] || 0) + 2;
  const ranked = (Object.entries(score) as [SchoolId, number][]).sort((a, b) => b[1] - a[1]);
  const sum = ranked.reduce((a, [, v]) => a + v, 0);
  const perAuthor = new Map<string, number>();
  for (const n of notes) perAuthor.set(n.author, (perAuthor.get(n.author) || 0) + 1);
  const favId = [...perAuthor].sort((a, b) => b[1] - a[1])[0]?.[0];
  const last = notes.sort((a, b) => b.savedAt - a.savedAt)[0];
  const line = last ? byId.get(last.quoteId) || null : null;
  return {
    lit: s.lit, streak: s.streak, best: s.best,
    met: Object.keys(s.authors).length, total: Object.keys(authors).length,
    kept: notes.length, written: notes.reduce((a, n) => a + n.text.trim().length, 0), pulls: s.pulls,
    lean: ranked[0]?.[0] || null, leanShare: sum ? ranked[0][1] / sum : 0,
    favorite: favId ? authors[favId] || null : null,
    line, lineAuthor: line ? authors[line.author] || null : null,
  };
}

const SIZE: Record<Format, [number, number]> = { post: [1080, 1350], story: [1080, 1920] };

export async function renderProfileCard(p: Profile, format: Format = 'post') {
  await fontsReady();
  const [W, H] = SIZE[format];
  const story = format === 'story';
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const school = p.lean ? SCHOOL[p.lean] : null;
  const accent = school ? school.palette.accent : '#FF8A2A';
  const pad = 88;
  const ink = '#F4EBDD', soft = 'rgba(244,235,221,.62)';

  // lamplit dark paper
  ctx.fillStyle = '#15110E';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -H * 0.05, 0, W / 2, -H * 0.05, H * 0.75);
  glow.addColorStop(0, 'rgba(255,150,70,.34)');
  glow.addColorStop(0.45, 'rgba(160,70,30,.12)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 3200; i++) { ctx.fillStyle = `rgba(255,240,220,${Math.random() * 0.03})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  ctx.strokeStyle = 'rgba(255,200,140,.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, W - 72, H - 72);

  // header: the mark and the date
  const m = await svgImage(mark({ size: 64, top: '#FF6A2A', bottom: ink }), ink).catch(() => null);
  if (m) ctx.drawImage(m, pad, 84, 46, 46);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink;
  ctx.font = '900 34px Fraunces, serif';
  ctx.fillText('philosophew', pad + 60, 120);
  ctx.font = '500 26px "Bricolage Grotesque", Anuphan, sans-serif';
  ctx.fillStyle = soft;
  fillAt(ctx, new Date().toLocaleDateString(isEn() ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'long', year: 'numeric' }), W - pad, 118, 'right');

  // the lean
  let y = story ? 290 : 232;
  ctx.fillStyle = '#FFB36B';
  ctx.font = '700 28px Anuphan, "Bricolage Grotesque", sans-serif';
  ctx.fillText(t('ปรัชญาของฉัน', 'My philosophy'), pad, y);
  y += story ? 110 : 96;
  ctx.fillStyle = ink;
  ctx.font = `800 ${story ? 50 : 44}px "Noto Serif Thai", Fraunces, serif`;
  ctx.fillText(school ? t('ใจฉันเอนไปทาง', 'My mind leans toward') : t('เพิ่งเริ่มออกเดิน', 'Just setting out'), pad, y);
  if (school) {
    y += story ? 150 : 130;
    let size = story ? 150 : 128;
    const name = L(school.name);
    ctx.font = `900 ${size}px "Noto Serif Thai", Fraunces, serif`;
    while (ctx.measureText(name).width > W - pad * 2 && size > 60) { size -= 6; ctx.font = `900 ${size}px "Noto Serif Thai", Fraunces, serif`; }
    ctx.fillStyle = accent;
    ctx.fillText(name, pad, y);
    y += story ? 64 : 56;
    ctx.fillStyle = soft;
    ctx.font = '500 28px Anuphan, "Bricolage Grotesque", sans-serif';
    ctx.fillText(L(school.machine.name), pad, y);
  }

  // four honest numbers
  y += story ? 110 : 84;
  const cells: [string, string][] = [
    [fmt(p.lit), t('ตะเกียงที่จุด', 'lamps lit')],
    [`${p.met}/${p.total}`, t('นักปรัชญาที่เจอ', 'thinkers met')],
    [fmt(p.kept), t('ประโยคในสมุด', 'lines kept')],
    [fmt(p.written), t('ตัวอักษรที่เขียนเอง', 'letters written')],
  ];
  const cw = (W - pad * 2 - 24) / 2, ch = story ? 190 : 132;
  cells.forEach(([num, label], i) => {
    const x = pad + (i % 2) * (cw + 24), yy = y + Math.floor(i / 2) * (ch + 22);
    ctx.fillStyle = 'rgba(255,240,220,.05)';
    ctx.strokeStyle = 'rgba(255,220,180,.14)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x, yy, cw, ch, 26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = ink;
    ctx.font = `900 ${story ? 84 : 62}px Fraunces, serif`;
    ctx.fillText(num, x + 30, yy + (story ? 104 : 74));
    ctx.fillStyle = soft;
    ctx.font = '600 26px Anuphan, "Bricolage Grotesque", sans-serif';
    ctx.fillText(label, x + 32, yy + ch - 28);
  });
  y += ch * 2 + 22 + (story ? 90 : 56);

  // the last line kept, with its thinker in a small arch
  if (p.line) {
    const q = p.line, a = p.lineAuthor || undefined, ql = quoteLines(q);
    const pw = story ? 150 : 118, ph = story ? 186 : 146;
    ctx.save();
    arch(ctx, pad, y, pw, ph);
    ctx.clip();
    ctx.fillStyle = '#0B0A0D';
    ctx.fillRect(pad, y, pw, ph);
    // the photo, or the wheel or the mark when there is none or it is not on this device (offline): never an empty arch
    const photo = await drawFace(ctx, a, { x: pad, y, w: pw, h: ph }, { paper: CARD_TONE[q.school].dark ? '#F0E8DA' : '#F2DFC6', top: '#FF8A2A', size: 0.64, dy: 0 });
    ctx.restore();
    const credit = photo ? portraitCredit(a) : ''; // the photo's credit under it, as on the share card
    if (credit) {
      ctx.font = '500 15px "Bricolage Grotesque", Anuphan, sans-serif';
      ctx.fillStyle = 'rgba(242,223,198,.5)';
      fillAt(ctx, credit, pad, y + ph + 26, 'left');
    }
    const tx = pad + pw + 34, tw = W - pad - tx;
    ctx.fillStyle = '#FFB36B';
    ctx.font = '700 24px Anuphan, "Bricolage Grotesque", sans-serif';
    ctx.fillText(t('ประโยคล่าสุดที่ฉันเก็บไว้', 'The last line I kept'), tx, y + 28);
    let size = story ? 42 : 36, lines: string[] = [];
    const room = (story ? H - 300 : H - 190) - (y + 60);
    for (; size >= 24; size -= 2) {
      ctx.font = `500 ${size}px Fraunces, Trirong, serif`;
      lines = wrap(ctx, `“${ql.main}”`, tw, ql.mainLang);
      if (lines.length * size * 1.5 <= room - 60) break;
    }
    ctx.fillStyle = ink;
    let ly = y + 60 + size;
    for (const l of lines.slice(0, 7)) { ctx.fillText(l, tx, ly); ly += size * 1.5; }
    ctx.fillStyle = soft;
    ctx.font = '600 26px Anuphan, "Bricolage Grotesque", sans-serif';
    ctx.fillText(authorName(a, q.author), tx, ly + 8);
  } else {
    ctx.fillStyle = soft;
    ctx.font = '500 34px Trirong, Fraunces, serif';
    ctx.fillText(t('สมุดยังว่าง ประโยคแรกกำลังรออยู่ในตู้', 'The notebook is empty. The first line is waiting in a machine.'), pad, y + 40);
  }

  // footer
  const fy = H - (story ? 120 : 84);
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = '900 30px Fraunces, serif';
  fillAt(ctx, 'philosophew.lol', W / 2, fy);
  ctx.fillStyle = soft;
  ctx.font = '500 24px Anuphan, sans-serif';
  fillAt(ctx, t('สุ่มคำคมปรัชญา แล้วหายใจออก', 'Pull a quote. Breathe out.'), W / 2, fy + 38);
  return c;
}
