// A page that does not exist: the 404 view, plus the noindex that tells a search engine so (the server answers every
// address with the app, status 200). Loaded only when it is needed.
import { notFoundView } from './about';
import { noindex } from '../content/seo-pages';

export function missingView() {
  notFoundView();
  noindex();
}
