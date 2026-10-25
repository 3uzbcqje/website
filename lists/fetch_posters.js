#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Posters come from English Wikipedia's page-image API: no key, no signup, and
// the thumbnail it returns is the infobox poster. Two things are easy to get
// wrong here: pilicense=any is required (posters are non-free, and the default
// "free" filter returns nothing for nearly every movie), and Wikimedia blocks
// generic HTTP clients, so a descriptive User-Agent is not optional -- without
// one the API starts answering 429 after a handful of requests.
const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'evanstucker-website-poster-fetch/1.0 (https://evanstucker.com)';
const SAVE_EVERY = 10;

// movies.json keys its title as _title and tv.json uses title -- see AGENTS.md.
// The search suffix and the disambiguator pattern are what keep a show from
// matching the film of the same name, and vice versa ("Fargo" is both).
const LISTS = {
  movies: {
    file: 'movies.json',
    titleKey: '_title',
    dir: 'posters/movies',
    suffix: 'film',
    tag: /\bfilm\b/,
    noun: 'movie'
  },
  tv: {
    file: 'tv.json',
    titleKey: 'title',
    dir: 'posters/tv',
    suffix: 'TV series',
    tag: /\b(tv series|tv program|miniseries|web series)\b/,
    noun: 'show'
  }
};

const usage = `
Usage: node fetch_posters.js [options]

Downloads a poster image for every entry in movies.json (or tv.json) that
doesn't have one yet. Images are saved to lists/posters/<list>/ and the entry's
"poster" key is set to the path relative to the JSON file, for example
"posters/movies/12-monkeys.jpg".

Safe to re-run: entries whose poster file is already on disk are skipped, and
progress is saved as it goes, so an interrupted run picks up where it left off.

Options:
  --list <movies|tv>  Which list to fetch posters for (default movies)
  --title <title>     Only look up this one title
  --force             Re-fetch posters for entries that already have one
  --limit <n>         Stop after n entries (useful for spot-checking)
  --size <px>         Poster width to download (default 500)
  --delay <ms>        Pause between requests (default 1000)
  --dry-run           Report what would change without writing anything
  -h, --help          Show this help message

Examples:
  node fetch_posters.js --limit 20 --dry-run
  node fetch_posters.js --list tv
`;

const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

function flag(name, fallback) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const listName = flag('--list', 'movies');
const list = LISTS[listName];
if (!list) {
  console.error(`Error: --list must be one of ${Object.keys(LISTS).join(', ')}`);
  process.exit(1);
}

const only = flag('--title', null);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const limit = parseInt(flag('--limit', ''), 10);
const size = parseInt(flag('--size', '500'), 10);
const delay = parseInt(flag('--delay', '1000'), 10);

// Same loose comparison add_movie.js uses, so --title matches the way it does.
function normalize(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(title) {
  return normalize(title).replace(/ /g, '-');
}

// "Heat (1995 film)" -> { base: 'Heat', tag: '1995 film' }
function splitTitle(title) {
  const match = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(title);
  return match ? { base: match[1], tag: match[2].toLowerCase() } : { base: title, tag: '' };
}

// Dice coefficient over character bigrams. This list spells titles the way a
// person types them, so an article title drifts by punctuation and typos --
// "Bill and Teds Excellent Adventure" vs "Bill & Ted's Excellent Adventure" --
// and that has to still count as a match.
function similarity(a, b) {
  const bigrams = s => {
    const counts = new Map();
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2);
      counts.set(gram, (counts.get(gram) || 0) + 1);
    }
    return counts;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  let shared = 0;
  let total = 0;
  for (const [gram, count] of left) {
    shared += Math.min(count, right.get(gram) || 0);
    total += count;
  }
  for (const count of right.values()) total += count;
  return total === 0 ? 0 : (2 * shared) / total;
}

// Wikipedia search ranks "Heat" above "Heat (1995 film)", so rank the candidates
// ourselves: an exact title match and a "(... film)" disambiguator are both much
// stronger signals than search position.
function score(wanted, page) {
  const want = splitTitle(wanted);
  const got = splitTitle(page.title);
  let points = -(page.index || 0);
  if (normalize(got.base) === normalize(want.base)) points += 10;
  else if (normalize(got.base).includes(normalize(want.base))) points += 3;
  if (list.tag.test(got.tag)) points += 4;
  // How close the titles are, so "John Wick 2" prefers "John Wick: Chapter 2"
  // over whichever franchise article search happened to rank first.
  points += similarity(normalize(want.base).replace(/ /g, ''), normalize(got.base).replace(/ /g, '')) * 8;
  // ...and never settles for "John Wick", which is a different film. A
  // candidate that drops the sequel number loses more than the "(film)"
  // disambiguator can win back.
  const sequelNumbers = normalize(want.base).match(/\d+/g) || [];
  if (sequelNumbers.length && !sequelNumbers.some(number => normalize(got.base).includes(number))) points -= 6;
  const wantedYear = (want.tag.match(/\b(?:19|20)\d{2}\b/) || [])[0];
  if (wantedYear && got.tag.includes(wantedYear)) points += 5;
  return points;
}

// Search happily returns something for a title Wikipedia has never heard of --
// "Century of Enslavement" came back as "The Last of the Mohicans (1992 film)".
// No poster is better than a confidently wrong one, so the article title has to
// actually resemble the title we asked for.
function titlesMatch(wanted, articleTitle) {
  const want = normalize(splitTitle(wanted).base).replace(/ /g, '');
  const got = normalize(splitTitle(articleTitle).base).replace(/ /g, '');
  if (!want || !got) return false;
  if (want === got) return true;
  // "Karate Kid" -> "The Karate Kid" is a real match; "Up" -> "Uptown Girls"
  // is not, so a containment match needs something long enough to mean it.
  const shorter = Math.min(want.length, got.length);
  if (shorter >= 5 && (want.includes(got) || got.includes(want))) return true;
  // A sequel number is the entire difference between "John Wick 2" and "John
  // Wick", so an article carrying the same number gets the benefit of the
  // doubt; "Cops? What?" and "Cops" share no such anchor and stay apart.
  const anchored = (want.match(/\d+/g) || []).some(number => got.includes(number));
  return similarity(want, got) + (anchored ? 0.08 : 0) >= 0.65;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, attempt = 0) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT }
  });
  if (response.status === 429 || response.status >= 500) {
    if (attempt >= 4) throw new Error(`Wikipedia returned ${response.status}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    const wait = retryAfter > 0 ? retryAfter * 1000 : 2000 * Math.pow(2, attempt);
    console.error(`    ${response.status} from Wikipedia, waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
    return request(url, attempt + 1);
  }
  if (!response.ok) throw new Error(`Wikipedia returned ${response.status}`);
  return response;
}

// Plenty of series -- Severance, Yellowjackets, Mr. Robot -- have an SVG logo
// in the infobox rather than a poster, and PageImages skips those, so the
// article looks imageless. Read the infobox image out of the wikitext instead
// and let imageinfo rasterise it for us.
async function infoboxImage(article) {
  const parseParams = new URLSearchParams({
    action: 'parse', page: article, prop: 'wikitext', section: '0', format: 'json', redirects: '1'
  });
  const parsed = await (await request(`${API}?${parseParams}`)).json();
  const wikitext = (parsed.parse && parsed.parse.wikitext && parsed.parse.wikitext['*']) || '';
  const match = wikitext.match(/\|\s*image\s*=\s*(?:\[\[)?(?:File:|Image:)?\s*([^|\]\n]+\.(?:jpe?g|png|gif|webp|svg))/i);
  if (!match) return null;

  const infoParams = new URLSearchParams({
    action: 'query', titles: `File:${match[1].trim()}`, prop: 'imageinfo',
    iiprop: 'url', iiurlwidth: String(size), format: 'json'
  });
  const info = await (await request(`${API}?${infoParams}`)).json();
  const page = Object.values((info.query && info.query.pages) || {})[0];
  const image = page && page.imageinfo && page.imageinfo[0];
  // thumburl is a PNG render for SVG sources, which is what we want to store.
  return (image && (image.thumburl || image.url)) || null;
}

async function findPoster(title) {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${title} ${list.suffix}`,
    gsrlimit: '10',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pilicense: 'any',
    pithumbsize: String(size),
    format: 'json'
  });
  const data = await (await request(`${API}?${params}`)).json();
  const candidates = Object.values((data.query && data.query.pages) || {})
    .filter(page => titlesMatch(title, page.title));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => score(title, b) - score(title, a));

  const best = candidates[0];
  // Drop the API's utm_* tracking params so the stored URL stays stable.
  if (best.thumbnail) return { article: best.title, url: best.thumbnail.source.split('?')[0] };

  const fallback = await infoboxImage(best.title);
  return fallback ? { article: best.title, url: fallback.split('?')[0] } : null;
}

async function download(url, title, current) {
  const response = await request(url);
  const type = response.headers.get('content-type') || '';
  if (!type.startsWith('image/')) throw new Error(`expected an image, got ${type || 'nothing'}`);
  const extension = (path.extname(new URL(url).pathname).toLowerCase().match(/^\.(jpe?g|png|gif|webp)$/) || ['.jpg'])[0];

  let file = `${slugify(title)}${extension}`;
  // Two entries can normalize to the same slug ("Mortal Kombat (1995)" doesn't,
  // but "WALL-E" and "Wall E" would); don't let one overwrite the other. The
  // name this entry already holds is its own to reuse.
  const mine = current ? path.basename(current) : null;
  for (let n = 2; taken.has(file) && file !== mine; n++) file = `${slugify(title)}-${n}${extension}`;
  taken.add(file);

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(path.join(__dirname, list.dir, file), buffer);
  return { file: `${list.dir}/${file}`, bytes: buffer.length };
}

const listPath = path.join(__dirname, list.file);

let entries = [];
try {
  entries = JSON.parse(fs.readFileSync(listPath, 'utf8'));
} catch (err) {
  console.error(`Error reading ${list.file}:`, err.message);
  process.exit(1);
}

const titleOf = entry => entry[list.titleKey];

// Filenames already spoken for, so a re-run doesn't clobber another entry's poster.
const taken = new Set(entries
  .filter(entry => entry.poster && !/^https?:/i.test(entry.poster))
  .map(entry => path.basename(entry.poster)));

function needsPoster(entry) {
  // Both lists carry a few entries that are just a pasted URL. Searching for
  // one matches something eventually -- a URL once landed on Wikipedia's own
  // logo -- so leave them alone.
  if (/^https?:\/\//i.test(titleOf(entry) || '')) return false;
  if (force || !entry.poster) return true;
  if (/^https?:/i.test(entry.poster)) return true;  // URL left by an older run
  return !fs.existsSync(path.join(__dirname, entry.poster));
}

function save() {
  if (dryRun) return;
  fs.writeFileSync(listPath, JSON.stringify(entries, null, 2) + '\n');
}

let targets = entries.filter(needsPoster);
if (only) {
  targets = entries.filter(entry => normalize(titleOf(entry)) === normalize(only));
  if (targets.length === 0) {
    console.error(`Error: "${only}" is not in ${list.file}`);
    process.exit(1);
  }
}
if (!isNaN(limit)) targets = targets.slice(0, limit);

const missing = [];
const failed = [];
let found = 0;
let bytes = 0;

// Ctrl-C mid-run keeps whatever has been downloaded so far.
process.on('SIGINT', () => {
  save();
  console.log(`\nInterrupted. Saved ${found} poster(s) to ${list.file}.`);
  process.exit(130);
});

(async () => {
  if (!dryRun) fs.mkdirSync(path.join(__dirname, list.dir), { recursive: true });

  console.log(`Looking up ${targets.length} of ${entries.length} ${list.noun}s...\n`);

  for (let i = 0; i < targets.length; i++) {
    const entry = targets[i];
    const title = titleOf(entry);
    try {
      const hit = await findPoster(title);
      if (!hit) {
        missing.push(title);
        console.log(`  ${title} -- no poster found`);
      } else if (dryRun) {
        found++;
        console.log(`  ${title} -> ${hit.article}`);
      } else {
        const previous = entry.poster;
        const saved = await download(hit.url, title, previous);
        entry.poster = saved.file;
        // A re-fetch can land on a different extension; don't leave the old
        // file orphaned in the posters directory.
        if (previous && previous !== saved.file && !/^https?:/i.test(previous)) {
          fs.rmSync(path.join(__dirname, previous), { force: true });
          taken.delete(path.basename(previous));
        }
        found++;
        bytes += saved.bytes;
        const via = hit.article === title ? '' : ` (via "${hit.article}")`;
        console.log(`  ${title}${via} -> ${saved.file} ${Math.round(saved.bytes / 1024)}K`);
        if (found % SAVE_EVERY === 0) save();
      }
    } catch (err) {
      failed.push(title);
      console.error(`  ${title} -- ${err.message}`);
    }
    if (i < targets.length - 1) await sleep(delay);
  }

  save();

  console.log(`\nPosters found: ${found}${bytes ? ` (${(bytes / 1024 / 1024).toFixed(1)} MB)` : ''}`);
  if (missing.length) console.log(`No match (add "poster" by hand if you want one): ${missing.join(', ')}`);
  if (failed.length) console.log(`Failed, re-run to retry: ${failed.join(', ')}`);
  if (dryRun) console.log('\nDry run: nothing was written.');
})();
