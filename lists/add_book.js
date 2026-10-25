#!/usr/bin/env node

// Adds a book to goodreads_library_export.csv, looking up the metadata
// (ISBNs, publisher, binding, page count, years, average rating) from the
// Open Library API, falling back to Google Books for anything still missing.

const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, 'goodreads_library_export.csv');
const USER_AGENT = 'add_book.js (https://github.com/3uzbcqje/website)';
const TIMEOUT_MS = 15000;

const HEADER = [
  'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'ISBN',
  'ISBN13', 'My Rating', 'Average Rating', 'Publisher', 'Binding',
  'Number of Pages', 'Year Published', 'Original Publication Year',
  'Date Read', 'Date Added', 'Bookshelves', 'Bookshelves with positions',
  'Exclusive Shelf', 'My Review', 'Spoiler', 'Private Notes', 'Read Count',
  'Owned Copies',
];

const usage = `
Usage: node add_book.js --title <title> --author <author> [options]

Required:
  --title <title>       Book title
  --author <author>     Author name ("First Last")

Options:
  --rating <0-5>        Your rating; implies --shelf read
  --review <text>       Your review
  --notes <text>        Private notes
  --shelf <shelf>       read | to-read | currently-reading | forgot | unfinished
                        (default: read with --rating, otherwise to-read)
                        forgot and unfinished also put the book on read
  --date-read <date>    YYYY/MM/DD, only used for books on read
                        (default: today, or blank for forgot)
  --isbn <isbn>         Look the book up by ISBN instead of title/author
  --as-typed            Keep your author spelling even if the catalog differs
  --no-lookup           Skip the metadata lookup, write only what you passed
  --dry-run             Print the row that would be added, don't write it
  --force               Add even if the title/author is already in the CSV
  -h, --help            Show this help message

Examples:
  node add_book.js --title "Project Hail Mary" --author "Andy Weir" --rating 5
  node add_book.js --title Erasure --author "Percival Everett" --shelf to-read
`;

// ---------------------------------------------------------------- arguments

const BOOL_FLAGS = new Set(['no-lookup', 'dry-run', 'force', 'help', 'as-typed']);
const VALUE_FLAGS = new Set([
  'title', 'author', 'rating', 'review', 'notes', 'shelf', 'date-read', 'isbn',
]);

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h') {
      opts.help = true;
      continue;
    }
    if (!arg.startsWith('--')) die(`unexpected argument: ${arg}`);

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);

    if (BOOL_FLAGS.has(name)) {
      if (eq !== -1) die(`--${name} does not take a value`);
      opts[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined) die(`--${name} requires a value`);
      opts[name] = value;
    } else {
      die(`unknown option: --${name}`);
    }
  }
  return opts;
}

// --------------------------------------------------------------------- csv

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ------------------------------------------------------------------ helpers

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')      // drop series parentheticals
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Goodreads builds "Author l-f" by moving the last whitespace-separated token
// to the front, suffixes and particles included ("Ursula K. Le Guin" ->
// "Guin, Ursula K. Le"). Match that rather than trying to be clever.
function lastFirst(author) {
  const parts = author.trim().split(/\s+/);
  if (parts.length < 2) return author.trim();
  const last = parts.pop();
  return `${last}, ${parts.join(' ')}`;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = row;
  }
  return prev[b.length];
}

function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

// How close a search hit has to be before we believe it is the same book.
const MATCH_THRESHOLD = 0.75;

// Pick the search result closest to what was typed, tolerating a typo or two
// on either side but refusing anything that is merely in the neighborhood.
function bestMatch(docs, title, author) {
  let best = null;
  let bestScore = 0;
  for (const doc of docs) {
    const titleScore = similarity(doc.title, title);
    const authorScore = (doc.author_name || [])
      .reduce((max, name) => Math.max(max, similarity(name, author)), 0);
    if (titleScore < MATCH_THRESHOLD || authorScore < MATCH_THRESHOLD) continue;
    // Popularity only breaks ties between equally good name matches.
    const score = titleScore + authorScore
      + Math.min(doc.edition_count || 0, 100) / 100000;
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }
  return best;
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function yearFrom(value) {
  const match = String(value || '').match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match ? match[1] : '';
}

function titleCase(s) {
  return String(s).replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// Goodreads uses a fixed vocabulary for Binding; map the free-form Open
// Library physical_format onto it where it lines up.
function binding(format) {
  if (!format) return '';
  const f = String(format).toLowerCase().trim();
  if (/audio|audible|cd|cassette|mp3/.test(f)) return 'Audiobook';
  if (/e-?book|kindle|epub|digital/.test(f)) return 'ebook';
  if (/mass market/.test(f)) return 'Mass Market Paperback';
  if (/^(pbk|paperback|trade paperback|perfect paperback|softcover|broche)/.test(f)) {
    return 'Paperback';
  }
  if (/hard ?(cover|back)|gebunden|relie/.test(f)) return 'Hardcover';
  return titleCase(f);
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.json();
}

// ------------------------------------------------------------- open library

const OL_WORK_FIELDS = [
  'key', 'title', 'author_name', 'first_publish_year', 'ratings_average',
  'ratings_count', 'edition_count',
].join(',');

async function searchWorks(params) {
  const query = new URLSearchParams({ fields: OL_WORK_FIELDS, ...params });
  const data = await fetchJson(`https://openlibrary.org/search.json?${query}`);
  return data.docs || [];
}

// Open Library's title=/author= filters want a near-exact name, so one typo
// ("Palaniuk") returns nothing at all. Widen the search a rung at a time and
// let the fuzzy matcher decide, instead of giving up on the strict query.
async function openLibraryWork({ title, author, isbn }) {
  if (isbn) {
    const docs = await searchWorks({ q: `isbn:${isbn}`, limit: '5' });
    return docs[0] || null;
  }

  const strict = await searchWorks({ title, author, limit: '5' });
  if (strict.length) return bestMatch(strict, title, author) || strict[0];

  const widened = [
    { title, limit: '20' },
    { author, limit: '20' },
    { q: `${title} ${author}`, limit: '20' },
  ];
  for (const params of widened) {
    const match = bestMatch(await searchWorks(params), title, author);
    if (match) return match;
  }
  return null;
}

// Editions vary wildly in completeness and language; score them so the one we
// describe looks like the edition Goodreads would have picked.
function scoreEdition(edition) {
  const languages = (edition.languages || []).map((l) => l.key);
  const format = String(edition.physical_format || '').toLowerCase();
  let score = 0;
  if (languages.includes('/languages/eng')) score += 6;
  else if (languages.length) score -= 6;
  if ((edition.publishers || []).length) score += 3;
  if (edition.number_of_pages) score += 3;
  if ((edition.isbn_13 || []).length) score += 2;
  if ((edition.isbn_10 || []).length) score += 1;
  if (format) score += 1;
  if (/audio|audible|cd|mp3/.test(format)) score -= 10;
  if (/e-?book|kindle|epub/.test(format)) score -= 2;
  return score;
}

async function openLibraryEdition(workKey, firstPublishYear) {
  const data = await fetchJson(
    `https://openlibrary.org${workKey}/editions.json?limit=50`);
  const editions = data.entries || [];
  if (!editions.length) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const edition of editions) {
    let score = scoreEdition(edition);
    // Prefer an edition from the year the work first appeared.
    if (firstPublishYear && yearFrom(edition.publish_date) === String(firstPublishYear)) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = edition;
    }
  }
  return best;
}

async function lookupOpenLibrary({ title, author, isbn }) {
  const work = await openLibraryWork({ title, author, isbn });
  if (!work) return null;

  const found = {
    matchedTitle: work.title,
    matchedAuthor: (work.author_name || [])[0] || '',
    originalYear: work.first_publish_year ? String(work.first_publish_year) : '',
    averageRating: typeof work.ratings_average === 'number'
      ? work.ratings_average.toFixed(2)
      : '',
  };

  const edition = work.key ? await openLibraryEdition(work.key, work.first_publish_year) : null;
  if (edition) {
    found.isbn10 = (edition.isbn_10 || [])[0] || '';
    found.isbn13 = (edition.isbn_13 || [])[0] || '';
    found.publisher = (edition.publishers || [])[0] || '';
    found.binding = binding(edition.physical_format);
    found.pages = edition.number_of_pages ? String(edition.number_of_pages) : '';
    found.yearPublished = yearFrom(edition.publish_date);
  }
  return found;
}

// ------------------------------------------------------------- google books

async function lookupGoogleBooks({ title, author, isbn }) {
  const q = isbn
    ? `isbn:${isbn}`
    : `intitle:"${title}" inauthor:"${author}"`;
  const params = new URLSearchParams({ q, maxResults: '5' });
  const data = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?${params}`);
  const items = data.items || [];
  if (!items.length) return null;

  const docs = items.map((i) => ({
    title: (i.volumeInfo || {}).title,
    author_name: (i.volumeInfo || {}).authors || [],
    volumeInfo: i.volumeInfo || {},
  }));
  const match = bestMatch(docs, title, author) || (isbn ? docs[0] : null);
  if (!match) return null;
  const info = match.volumeInfo;
  const ids = info.industryIdentifiers || [];
  const idOfType = (type) => (ids.find((i) => i.type === type) || {}).identifier || '';

  return {
    matchedTitle: info.title || '',
    matchedAuthor: (info.authors || [])[0] || '',
    isbn10: idOfType('ISBN_10'),
    isbn13: idOfType('ISBN_13'),
    publisher: info.publisher || '',
    pages: info.pageCount ? String(info.pageCount) : '',
    yearPublished: yearFrom(info.publishedDate),
    averageRating: typeof info.averageRating === 'number'
      ? info.averageRating.toFixed(2)
      : '',
  };
}

const LOOKUP_FIELDS = [
  'isbn10', 'isbn13', 'publisher', 'binding', 'pages', 'yearPublished',
  'originalYear', 'averageRating',
];

const SOURCES = [
  { name: 'Open Library', lookup: lookupOpenLibrary },
  { name: 'Google Books', lookup: lookupGoogleBooks },
];

// Ask each source in turn, keeping the first value found for every field, and
// stop early once nothing is left to fill in.
async function lookup(query) {
  const found = { sources: [] };

  for (const source of SOURCES) {
    if (LOOKUP_FIELDS.every((f) => found[f])) break;
    let result = null;
    try {
      result = await source.lookup(query);
    } catch (err) {
      console.error(`Warning: ${source.name} lookup failed: ${err.message}`);
      continue;
    }
    if (!result) continue;

    found.sources.push(source.name);
    if (!found.matchedTitle) {
      found.matchedTitle = result.matchedTitle;
      found.matchedAuthor = result.matchedAuthor;
    }
    for (const field of LOOKUP_FIELDS) {
      if (!found[field] && result[field]) found[field] = result[field];
    }
  }

  if (!found.sources.length) return null;
  return found;
}

// -------------------------------------------------------------------- main

// Every book sits on exactly one exclusive shelf. The custom shelves in the
// export are only ever used alongside read.
const EXCLUSIVE_SHELVES = ['read', 'to-read', 'currently-reading'];
const READ_SUBSHELVES = ['forgot', 'unfinished'];

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(usage);
    return;
  }
  if (!opts.title) die('--title is required\n' + usage);
  if (!opts.author) die('--author is required\n' + usage);

  const title = opts.title.trim();
  const author = opts.author.trim();

  let rating = '0';
  if (opts.rating !== undefined) {
    const parsed = Number.parseInt(opts.rating, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 5) {
      die('--rating must be a whole number from 0 to 5');
    }
    rating = String(parsed);
  }

  const shelf = opts.shelf || (opts.rating !== undefined ? 'read' : 'to-read');
  if (![...EXCLUSIVE_SHELVES, ...READ_SUBSHELVES].includes(shelf)) {
    die(`--shelf must be one of ${[...EXCLUSIVE_SHELVES, ...READ_SUBSHELVES].join(', ')}`
      + ` (got "${shelf}")`);
  }
  // forgot and unfinished are custom shelves layered on top of read.
  const exclusive = READ_SUBSHELVES.includes(shelf) ? 'read' : shelf;
  const isRead = exclusive === 'read';
  if (opts['date-read'] && !/^\d{4}\/\d{2}\/\d{2}$/.test(opts['date-read'])) {
    die('--date-read must look like YYYY/MM/DD');
  }

  let text;
  try {
    text = fs.readFileSync(CSV_PATH, 'utf8');
  } catch (err) {
    die(`reading ${path.basename(CSV_PATH)}: ${err.message}`);
  }
  const rows = parseCsv(text);
  const body = rows.slice(1).filter((r) => r.length === HEADER.length);

  const duplicate = body.find((r) =>
    normalize(r[1]) === normalize(title) && normalize(r[2]) === normalize(author));
  if (duplicate && !opts.force) {
    die(`"${duplicate[1]}" by ${duplicate[2]} is already on the ${duplicate[18]} shelf. `
      + 'Use --force to add it anyway.');
  }

  let found = null;
  if (!opts['no-lookup']) {
    found = await lookup({ title, author, isbn: opts.isbn });
    if (found) {
      console.log(`Matched "${found.matchedTitle}" by ${found.matchedAuthor} `
        + `(${found.sources.join(' + ')})`);
    } else {
      console.error('Warning: no metadata found; adding the book with just what you passed.');
    }
  }
  const meta = found || {};

  // A typo is what usually breaks the lookup, so prefer the catalog's spelling
  // of the author over what was typed unless asked to keep it verbatim.
  let authorForRow = author;
  if (found && found.matchedAuthor && !opts['as-typed']
      && normalize(found.matchedAuthor) !== normalize(author)) {
    authorForRow = found.matchedAuthor;
    console.log(`Using the catalog spelling "${found.matchedAuthor}" `
      + `(you typed "${author}"); pass --as-typed to keep yours.`);
  }
  if (opts.isbn && !meta.isbn13 && !meta.isbn10) {
    const digits = opts.isbn.replace(/[^0-9Xx]/g, '');
    if (digits.length === 13) meta.isbn13 = digits;
    else if (digits.length === 10) meta.isbn10 = digits;
  }

  // Shelf positions run oldest (#1) to newest; take the next one.
  let position = 0;
  if (shelf !== 'read') {
    for (const r of body) {
      const match = r[17].match(new RegExp(`${shelf} \\(#(\\d+)\\)`));
      if (match) position = Math.max(position, Number.parseInt(match[1], 10));
    }
    position += 1;
  }

  const row = [
    '',                                                   // Book Id
    title,
    authorForRow,
    lastFirst(authorForRow),
    '',                                                   // Additional Authors
    `="${meta.isbn10 || ''}"`,
    `="${meta.isbn13 || ''}"`,
    rating,
    meta.averageRating || '',
    meta.publisher || '',
    meta.binding || '',
    meta.pages || '',
    meta.yearPublished || '',
    meta.originalYear || '',
    isRead ? (opts['date-read'] || (shelf === 'forgot' ? '' : today())) : '',
    today(),                                              // Date Added
    shelf === 'read' ? '' : shelf,
    shelf === 'read' ? '' : `${shelf} (#${position})`,
    exclusive,                                            // Exclusive Shelf
    opts.review || '',
    '',                                                   // Spoiler
    opts.notes || '',
    isRead ? '1' : '0',                                   // Read Count
    '0',                                                  // Owned Copies
  ];

  const line = row.map(csvEscape).join(',');

  console.log('');
  HEADER.forEach((name, i) => {
    if (row[i] !== '' && row[i] !== '=""') {
      console.log(`  ${name.padEnd(28)}${row[i]}`);
    }
  });
  console.log('');

  if (opts['dry-run']) {
    console.log(`Dry run, ${path.basename(CSV_PATH)} not modified:`);
    console.log(line);
    return;
  }

  try {
    fs.appendFileSync(CSV_PATH, (text.endsWith('\n') ? '' : '\n') + line + '\n');
  } catch (err) {
    die(`writing ${path.basename(CSV_PATH)}: ${err.message}`);
  }
  console.log(`Added to ${path.basename(CSV_PATH)} (${body.length + 1} books).`);
}

main().catch((err) => die(err.message));
