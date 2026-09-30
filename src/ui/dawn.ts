/** The page goes back to paper: theme.js painted it dark before the first frame on a lamp day. */
export function dawn() {
  document.documentElement.classList.remove('will-ritual');
  document.querySelectorAll<HTMLMetaElement>('meta[name=theme-color][data-was]').forEach((m) => { m.content = m.dataset.was!; m.removeAttribute('data-was'); });
}
