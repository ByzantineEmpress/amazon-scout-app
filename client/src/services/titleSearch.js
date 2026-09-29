import axios from 'axios';
import { pickBestIsbn } from './isbn';

const OPENLIBRARY_SEARCH = 'https://openlibrary.org/search.json';

/**
 * Find candidate books by title (and optionally author), for books that predate ISBN and so
 * have no number to read.
 *
 * OpenLibrary is the right source here: it is keyless, and its coverage of older and
 * out-of-print titles is far better than the retail catalogues the scanner normally uses.
 * Each result carries an ISBN, which is what makes this fit the existing pipeline - once a
 * result is chosen, the app looks the book up exactly as if the ISBN had been scanned.
 */
export async function searchBooksByTitle({ title, author, limit = 8 } = {}) {
  if (!title) return [];

  const params = {
    title,
    limit,
    fields: 'key,title,author_name,first_publish_year,isbn'
  };
  if (author) params.author = author;

  const res = await axios.get(OPENLIBRARY_SEARCH, {
    params,
    timeout: 6000,
    headers: { 'User-Agent': 'AmazonScoutApp/1.0 (contact@amazonscout.app)' }
  });

  const docs = Array.isArray(res.data?.docs) ? res.data.docs : [];

  const results = [];
  for (const doc of docs) {
    const isbn = pickBestIsbn(doc.isbn);
    if (!isbn) continue; // Without an ISBN we cannot reuse the normal lookup, so skip it.
    results.push({
      key: doc.key || isbn,
      title: doc.title || '(untitled)',
      author: Array.isArray(doc.author_name) ? doc.author_name[0] : '',
      year: doc.first_publish_year || '',
      isbn
    });
  }
  return results;
}
