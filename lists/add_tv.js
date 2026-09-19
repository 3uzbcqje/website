#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Titles vary in case, punctuation and accents between entries ("Dr. Stone"
// vs "Dr. STONE"), so compare them loosely. Parentheticals are deliberately
// kept: "Mortal Kombat (1995)" and "Mortal Kombat (2021)" are different films.
function normalize(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const args = process.argv.slice(2);
const usage = `
Usage: node add_tv.js [options]

Options:
  --title <title>     TV show title (required)
  --rating <rating>   Rating 0-5 (optional)
  --review <review>   Review: 👍 or 👎 (optional)
  --notes <notes>     Notes text (optional)
  --force             Add even if the title is already in tv.json
  -h, --help         Show this help message

Example:
  node add_tv.js --title "Show Name" --rating 4 --review "👍" --notes "Recommended by John"
`;

if (args.includes('-h') || args.includes('--help')) {
  console.log(usage);
  process.exit(0);
}

const titleIndex = args.indexOf('--title');
if (titleIndex === -1) {
  console.error('Error: --title is required');
  console.log(usage);
  process.exit(1);
}

const title = args[titleIndex + 1];
if (!title) {
  console.error('Error: --title requires a value');
  process.exit(1);
}

const newShow = { title };

const ratingIndex = args.indexOf('--rating');
if (ratingIndex !== -1 && args[ratingIndex + 1]) {
  const rating = parseInt(args[ratingIndex + 1]);
  if (!isNaN(rating) && rating >= 0 && rating <= 5) {
    newShow.rating = rating.toString();
  }
}

const reviewIndex = args.indexOf('--review');
if (reviewIndex !== -1 && args[reviewIndex + 1]) {
  newShow.review = args[reviewIndex + 1];
}

const notesIndex = args.indexOf('--notes');
if (notesIndex !== -1 && args[notesIndex + 1]) {
  newShow.notes = args[notesIndex + 1];
}

const force = args.includes('--force');

const tvPath = path.join(__dirname, 'tv.json');

let shows = [];
try {
  const data = fs.readFileSync(tvPath, 'utf8');
  shows = JSON.parse(data);
} catch (err) {
  console.error('Error reading tv.json:', err.message);
  process.exit(1);
}

const duplicate = shows.find(s => normalize(s.title) === normalize(title));
if (duplicate && !force) {
  console.error(`Error: "${duplicate.title}" is already in tv.json. `
    + 'Use --force to add it anyway.');
  process.exit(1);
}

shows.push(newShow);

try {
  fs.writeFileSync(tvPath, JSON.stringify(shows, null, 2) + '\n');
  console.log('TV show added successfully!');
  console.log(JSON.stringify(newShow, null, 2));
} catch (err) {
  console.error('Error writing tv.json:', err.message);
  process.exit(1);
}
