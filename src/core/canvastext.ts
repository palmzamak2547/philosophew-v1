// iPad Safari (CoreText) places a centred or right-aligned canvas line wrongly as soon as the line needs a second
// face of a split (unicode-range) web font, as every Thai line here does: it drew them from the centre onwards and
// off the card (Palm's iPad, 2026-09-29). Its measureText is right (the wrapping was), so aligned lines are placed
// by hand from it, the same in every engine.
export function fillAt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: 'left' | 'center' | 'right' = 'center', stroke = false) {
  const w = align === 'left' ? 0 : ctx.measureText(text).width;
  const was = ctx.textAlign;
  ctx.textAlign = 'left';
  const at = align === 'center' ? x - w / 2 : x - w;
  if (stroke) ctx.strokeText(text, at, y);
  else ctx.fillText(text, at, y);
  ctx.textAlign = was;
}
