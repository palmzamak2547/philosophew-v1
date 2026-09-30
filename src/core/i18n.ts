// Two languages, written side by side where they are used: t('ไทย', 'English').
// ponytail: no key catalogue; the pair lives next to the UI it describes.
import { store } from './store';

export type Lang = 'th' | 'en';

export const lang = (): Lang => store.s.settings.lang;
export const isEn = () => lang() === 'en';
export const t = (th: string, en: string) => (lang() === 'en' ? en : th);

export function setLang(l: Lang) {
  store.update((s) => { s.settings.lang = l; });
  document.documentElement.lang = l;
}
