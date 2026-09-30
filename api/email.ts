// The sign-in email: Thai first with an English line under each part, on the site's paper and ink with its ember.
// Tables and inline styles (Gmail, Outlook and Apple Mail each read a different subset of CSS), 600 px wide, fluid
// below that, system fonts only (a web font would be a request to a third party from the reader's inbox). Pictures
// come from philosophew.lol and are never needed to read it: the code is text, big enough to read and copy.
// Dark mode: Apple Mail and Outlook read the media query below; Gmail's apps invert the paper themselves.

export interface Gift { th: string; by: string; work: string | null }

const SITE = 'https://philosophew.lol';
const PAPER = '#F3EDE2', CARD = '#FBF8F2', INK = '#1A1714', INK2 = '#4B443C', INK3 = '#6F665C', EMBER = '#FF5B22', LINE = '#DDD3C3';
const THAI = "'Noto Sans Thai','Sukhumvit Set','Leelawadee UI','Thonburi',Tahoma,Arial,sans-serif";
const SERIF = "'Noto Serif Thai',Georgia,'Times New Roman',serif";
const DIGITS = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letters = new Intl.Segmenter('th', { granularity: 'grapheme' });
/** Thai phrases (the text between spaces) kept whole where they are short: an inbox breaks Thai words less carefully than the app. */
const keep = (s: string) => esc(s).split(' ').map((p) => ([...letters.segment(p)].length <= 20 ? `<span style="white-space:nowrap">${p}</span>` : p)).join(' ');

export function codeEmail(code: string, gift: Gift | null = null) {
  const subject = `${code} คือรหัสเข้า Philosophew`;
  const pre = 'หมดอายุใน 10 นาที ใช้ได้ครั้งเดียว | Expires in 10 minutes.';
  const en = (s: string, extra = '') => `<p class="en" style="margin:4px 0 0;font:italic 14px/1.5 Georgia,'Times New Roman',serif;color:${INK3};${extra}">${s}</p>`;

  const giftRows = gift ? `
          <tr><td class="pad" style="padding:22px 36px 0"><div class="rule" style="height:1px;line-height:1px;font-size:1px;background:${LINE}">&nbsp;</div></td></tr>
          <tr><td class="pad" style="padding:18px 36px 0">
            <p style="margin:0;font:600 12px/1.5 ${THAI};letter-spacing:.06em;color:#A8702F">ของฝากในอีเมลนี้: ประโยคของวันนี้</p>
            ${en("A small gift: today's line", 'font-size:12.5px;margin-top:0')}
            <p class="ink" style="margin:10px 0 0;font:500 17px/1.7 ${SERIF};color:${INK}">“${keep(gift.th)}”</p>
            <p class="mute" style="margin:6px 0 0;font:italic 13px/1.5 Georgia,serif;color:${INK3}">${esc(gift.by)}${gift.work ? `, ${esc(gift.work)}` : ''}</p>
          </td></tr>` : '';

  const html = `<!doctype html>
<html lang="th" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>${esc(subject)}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${EMBER}; }
  /* Apple Mail and Gmail turn six digits into a phone link (blue, underlined): the code stays the code */
  a[x-apple-data-detectors], .code a { color:inherit !important; text-decoration:none !important; font:inherit !important; }
  @media (max-width:620px) {
    .pad { padding-left:22px !important; padding-right:22px !important; }
    .code { font-size:38px !important; letter-spacing:8px !important; }
    .h1 { font-size:22px !important; }
  }
  @media (prefers-color-scheme: dark) {
    .bg { background:#0F0C0A !important; }
    .card { background:#1B1612 !important; }
    .ink, .code, .h1 { color:#F3EDE2 !important; }
    .ink2 { color:#D6CCBE !important; }
    .mute, .en { color:#A99E90 !important; }
    .safe { background:#262019 !important; color:#D6CCBE !important; }
    .rule { background:#3A3128 !important; }
  }
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:${PAPER}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${PAPER}">${esc(pre)}</div>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background:${PAPER}">
  <tr><td align="center" style="padding:28px 12px 36px">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${CARD}" style="width:100%;max-width:600px;background:${CARD};border-radius:20px;overflow:hidden">
      <tr><td bgcolor="#140E0A" style="background:#140E0A;line-height:0;font-size:0">
        <img src="${SITE}/email/lamp.png" width="600" height="170" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0">
      </td></tr>
      <tr><td class="pad" style="padding:30px 36px 0">
        <p style="margin:0;font:700 12px/1.5 ${THAI};letter-spacing:.08em;color:#C63D0C">รหัสเข้าสู่ระบบ</p>
        <h1 class="h1 ink" style="margin:6px 0 0;font:700 24px/1.45 ${SERIF};color:${INK}">รหัสเข้า Philosophew ของคุณ</h1>
        ${en('Your Philosophew sign-in code')}
        <p class="ink2" style="margin:14px 0 0;font:400 15px/1.7 ${THAI};color:${INK2}">${keep('พิมพ์รหัสนี้ในหน้า Philosophew ที่เปิดค้างไว้ แล้วตะเกียงของคุณจะจุดต่อบนเครื่องนั้นทันที')}</p>
        ${en('Type it on the Philosophew page you left open, and your lamp carries on there.', 'font-size:13.5px')}
      </td></tr>
      <tr><td class="pad" align="center" style="padding:26px 36px 0">
        <p class="code" style="margin:0;font:700 46px/1.1 ${DIGITS};letter-spacing:12px;color:${INK};text-shadow:0 0 22px rgba(255,140,40,.35);padding-left:12px">${code}</p>
        <p class="mute" style="margin:12px 0 0;font:500 14px/1.6 ${THAI};color:${INK3}">หมดอายุใน 10 นาที ใช้ได้ครั้งเดียว</p>
        ${en('Expires in 10 minutes. Works once.', 'font-size:13px;margin-top:0')}
      </td></tr>
      ${giftRows}
      <tr><td class="pad" style="padding:24px 36px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="safe" bgcolor="#EAE2D5" style="background:#EAE2D5;border-radius:12px;padding:14px 16px;font:400 13.5px/1.65 ${THAI};color:${INK2}">
          <b style="font-weight:700">ไม่ได้ขอรหัสนี้?</b> ${keep('ไม่ต้องทำอะไร ไม่มีใครเข้าบัญชีของคุณได้ ถ้าไม่มีรหัสนี้ และเราไม่มีวันขอรหัส ทางโทรศัพท์หรือแชต')}
          <br><span class="en" style="font:italic 13px/1.6 Georgia,serif;color:${INK3}">Didn't ask for this? You can ignore it. No one gets in without this code, and we will never ask you for it by phone or chat.</span>
        </td></tr></table>
      </td></tr>
      <tr><td class="pad" style="padding:26px 36px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle" style="width:40px;padding-right:10px"><img src="${SITE}/icons/icon-192.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px"></td>
          <td valign="middle" style="font:900 17px/1 Georgia,'Times New Roman',serif;letter-spacing:-.02em;color:${INK}" class="ink">philoso<i style="color:${EMBER};font-weight:700">phew</i></td>
          <td valign="middle" align="right" style="font:500 12.5px/1.5 ${THAI}"><a href="${SITE}" style="color:${INK3};text-decoration:none" class="mute">philosophew.lol</a></td>
        </tr></table>
        <div class="rule" style="height:1px;line-height:1px;font-size:1px;background:${LINE};margin:16px 0 12px">&nbsp;</div>
        <p class="mute" style="margin:0;font:400 12px/1.65 ${THAI};color:${INK3}">${keep('อีเมลนี้ส่งถึงคุณ เพราะมีคนใส่อีเมลนี้เพื่อเข้าสู่ระบบที่ philosophew.lol')} <a href="${SITE}/privacy" style="color:${INK3}">นโยบายความเป็นส่วนตัว</a> ติดต่อเรา <a href="mailto:philosophew@yahoo.com" style="color:${INK3}">philosophew@yahoo.com</a></p>
        <p class="en" style="margin:4px 0 0;font:italic 12px/1.6 Georgia,serif;color:${INK3}">Sent because this address was entered to sign in at philosophew.lol. <a href="${SITE}/privacy" style="color:${INK3}">Privacy policy</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    'รหัสเข้า Philosophew ของคุณ',
    'Your Philosophew sign-in code',
    '',
    code,
    '',
    'หมดอายุใน 10 นาที ใช้ได้ครั้งเดียว',
    'Expires in 10 minutes. Works once.',
    '',
    'พิมพ์รหัสนี้ในหน้า Philosophew ที่เปิดค้างไว้ แล้วตะเกียงของคุณจะจุดต่อบนเครื่องนั้นทันที',
    'Type it on the Philosophew page you left open, and your lamp carries on there.',
    ...(gift ? ['', 'ของฝาก: ประโยคของวันนี้', `“${gift.th}”`, `${gift.by}${gift.work ? `, ${gift.work}` : ''}`] : []),
    '',
    'ไม่ได้ขอรหัสนี้? ไม่ต้องทำอะไร ไม่มีใครเข้าบัญชีของคุณได้ ถ้าไม่มีรหัสนี้ และเราไม่มีวันขอรหัส ทางโทรศัพท์หรือแชต',
    "Didn't ask for this? You can ignore it. No one gets in without this code, and we will never ask you for it by phone or chat.",
    '',
    'Philosophew  https://philosophew.lol',
    `นโยบายความเป็นส่วนตัว / Privacy: ${SITE}/privacy`,
  ].join('\n');

  return { subject, html, text };
}
