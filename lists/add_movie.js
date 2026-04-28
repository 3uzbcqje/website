#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const usage = `
Usage: node add_movie.js [options]

Options:
  --title <title>     Movie title (required)
  --rating <rating>   Rating 0-5 (optional)
  --review <review>   Review text (optional)
  -h, --help         Show this help message

Example:
  node add_movie.js --title "Movie Name" --rating 4 --review "Great movie!"
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

const newMovie = { _title: title };

const ratingIndex = args.indexOf('--rating');
if (ratingIndex !== -1 && args[ratingIndex + 1]) {
  const rating = parseInt(args[ratingIndex + 1]);
  if (!isNaN(rating) && rating >= 0 && rating <= 5) {
    newMovie.rating = rating.toString();
  }
}

const reviewIndex = args.indexOf('--review');
if (reviewIndex !== -1 && args[reviewIndex + 1]) {
  newMovie.review = args[reviewIndex + 1];
}

const moviesPath = path.join(__dirname, 'movies.json');

let movies = [];
try {
  const data = fs.readFileSync(moviesPath, 'utf8');
  movies = JSON.parse(data);
} catch (err) {
  console.error('Error reading movies.json:', err.message);
  process.exit(1);
}

const exists = movies.some(m => m._title === title);
if (!exists) {
  movies.push(newMovie);
}

try {
  fs.writeFileSync(moviesPath, JSON.stringify(movies, null, 2) + '\n');
  console.log('Movie added successfully!');
  console.log(JSON.stringify(newMovie, null, 2));
} catch (err) {
  console.error('Error writing movies.json:', err.message);
  process.exit(1);
}
