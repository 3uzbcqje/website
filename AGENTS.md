# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this repo is

Evans Tucker's personal website content: blog posts, cheatsheets, curated lists, and drafts.
It is a content repository, not an application. There is no package manager, no test suite,
no linter config, and no build step checked in.

It used to be a Hugo site built by GitLab CI and published to IPFS (that pipeline is still
described in `about.md`, which is stale). Hugo, its themes, `config.yaml`, `package.json`,
and the Hugo CI job were all deleted in commit `1d7b589` ("Fuck Hugo", Jan 2026). Nothing
replaced them — the files are currently consumed as plain Markdown/JSON/HTML. Do not assume
a generator exists or reintroduce Hugo scaffolding unless asked.

## Layout

- `posts/` — dated blog posts, `YYYY-MM-DD-slug.md` (or bare `YYYY-MM-DD.md` for journal entries).
- `cheatsheets/` — one file per tool, `.md` or `.txt`. A few tools have both (`git.md`/`git.txt`,
  `curl.md`/`curl.txt`, `mongo.md`/`mongodb.md`) — check for a sibling before adding content.
- `lists/` — data lists. Some are JSON with a matching viewer and an add script (see below);
  others are plain `.txt`/`.md`/`.csv`.
- `unprocessed/` — drafts and scratch material not ready to publish, plus `unprocessed/tools/`
  shell helpers. Treat as a staging area; files here are unpolished by design.
- `static/`, `pay/`, `about.md`, `ai.txt` — one-off pages and notes.

## Lists: JSON + viewer + add script

Two lists follow the same triplet pattern — `<name>.json` (data), `<name>.html` (standalone
viewer), `add_<name>.js` (Node CLI appender):

```
node lists/add_movie.js --title "Movie Name" --rating 4 --review "Great movie!"
node lists/add_tv.js    --title "Show Name"  --rating 4 --review "👍" --notes "..."
```

`links` used to be a third — `links.json`/`links.html`/`add_link.js` were merged into
`lists/bookmarks.html` and deleted (Aug 2026). Bookmarks now live only in that file.

Schema gotchas, easy to get wrong:

- `movies.json` keys its title as **`_title`**; `tv.json` uses **`title`**. The viewers and
  scripts depend on this — don't normalize one to the other.
- `rating` is a **string** (`"4"`), not a number, in both movies and tv.
- Other keys appear in the data but not in the add scripts: movies also has `comments`, `link`,
  `notes`; tv also has `imdb`.
- Both scripts reject a duplicate title (compared case/punctuation/accent-insensitively) with
  an error; pass `--force` to add anyway.
- Both rewrite the whole file as `JSON.stringify(data, null, 2) + '\n'`. Match that
  formatting for hand edits so diffs stay small.
- `lists/comedians.json` is *not* JSON — it's a bare list of URLs despite the extension.

The `.html` viewers `fetch()` their JSON from the same directory, so `file://` won't work.
Serve the directory to view one:

```
python3 -m http.server -d lists 8000   # then open http://localhost:8000/movies.html
```

Ad-hoc queries are done with `jq`:

```
jq -r '.[] | select(.review == null) | select(.rating == null) | ._title' lists/movies.json
bash lists/what_movie_should_we_watch.sh   # same query; must be run from lists/
```

## Markdown front matter is mangled — leave it alone unless asked

All 22 files in `posts/` (plus `pay/index.md` and some cheatsheets) begin with a line of
underscores followed by a `## title: "..." date: ... draft: false` heading. That is leftover
Hugo YAML front matter that `mdformat` rewrote: the `---` delimiters became a setext horizontal
rule and the keys collapsed into a heading. It is not hand-authored and it is not valid front
matter for anything. Don't "fix" one file in isolation; it's a repo-wide artifact.

The `pre-commit` config lives in the user's dotfiles **outside this repo** (see
`cheatsheets/pre-commit.md`; it was removed from `.gitignore` in `0602a49`). Markdown you write
may get reformatted by hooks you can't see from here.

## CI

`.github/workflows/` holds two Claude Code Action workflows; both are deliberately tuned and
the inline comments explain why. Preserve those constraints when editing:

- `claude.yml` — tag mode, fires on `@claude` in issues/PR comments/reviews. `contents: write`
  lets it push a branch; the Bash tool stays disabled, so a human opens the PR.
- `claude-code-review.yml` — agent mode, fires on every PR. In agent mode the allowed-tools list
  comes **only** from `claude_args`, and the inline-comment MCP server is registered only if the
  allowlist contains an `mcp__github_inline_comment__` entry — removing it makes the job review
  the code and post nothing. The `/code-review` plugin is intentionally not used here because its
  `ReportFindings` output goes nowhere in this action.
- Both pin `--model claude-opus-5 --effort xhigh` and pin actions to full SHAs.

`.gitlab-ci.yml` is *not* a site build — it is a separate Claude job for GitLab MR/web triggers,
left over from when the repo lived at `gitlab.com/evanstucker/hugo-site`. The GitHub remote
(`3uzbcqje/website`) is the live one.

## Conventions

- Content is CC0 (`LICENSE`).
- `public/` and `.gitsigners` are gitignored.
- Commits are GPG-signed; many historical commit messages are literally `...`.
