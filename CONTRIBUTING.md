# Contributing

How to change this project without breaking it. The plan and history are in `.claude/plan.md`; how the code works is in `docs/ARCHITECTURE.md`.

## Set up (once)

```bash
git clone git@github.com:pankaj-ecoste/ats.git      # use your own SSH host alias if you have several keys
cd ats
npm install                  # also turns on the pre-commit hook
cp .env.example .env         # fill in only if you work on the database; never commit .env
npm run dev                  # http://localhost:5173
```

Needs Node 20 or newer. For the browser tests run `npx playwright install chromium` once (or set `CHROME_PATH` to an installed Chrome).

## Everyday commands

| Command | What it does | When |
|---|---|---|
| `npm run dev` | Local server, no build step | while working |
| `npm run lint` | ESLint over the whole project | before every commit (the hook does it) |
| `npm test` | Unit tests (about 70), a few seconds | before every commit (the hook does it) |
| `npm run build` | Writes `dist/Ecoste_Recruit_Tracker.html`, one self-contained file | before a pull request |
| `npm run check` | lint + unit tests + build | before a pull request |
| `npm run test:e2e:all` | Browser tests: every page, extension points, real user flows | when a screen or service changed |
| `npm run test:e2e:dist` | The same browser tests against the built file (run `npm run build` first) | before a release |

CI runs all of the above on every pull request. A red CI blocks the merge.

## Branches, commits, pull requests

- `main` is always deployable. Never commit to it directly.
- Branch from `main`: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`, `docs/<short-name>`.
- Commit messages: `type(area): what changed`, for example `feat(offers): add approval step` or `fix(pipeline): stop double-counting dropped candidates`. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Open a pull request into `main`. One reviewer. Squash merge.
- Keep a pull request to one concern. A big refactor is several small pull requests.

## The rules of the code

The load order is `core → data → domain → services → app → features → app/main.js`. A file may only use layers to its left. `index.html` is the only list of files and their order.

1. **Screens never write data.** A handler reads the form, calls a **service** from `src/services/`, then shows the toast and re-renders. No `S.something.push(...)`, no `save()` in `app/` or `features/`.
2. **Services never touch the screen.** No `toast`, `modal`, `render`, `go`, `document`, `window`. They return what happened.
3. **Services change data only through `repo`** (`insert`, `update`, `remove`, `root`, `trim`, `reset`). That one place is where the database plugs in during Phase 2.
4. **No inline handlers.** A button says `data-act="name" data-a1="arg"`; the action is registered once in `src/app/ui-actions.js`. Never write `onclick="..."`.
5. **Extend another screen with `src/core/hooks.js`:** `fillSlot` / `slotHTML`, `onBind`, `decorateView`, `onEvent` / `emitEvent`, `addNav`. Never patch another feature's HTML and never reassign its functions.
6. **Business rules go in `domain/` or a service and get a unit test.** If you can't test it without a browser, it is in the wrong place.
7. **No two files may declare the same top-level name** (lint catches this).
8. **Generated files are never edited by hand** (`src/generated/`). Edit the source and run `npm run gen`.
9. **No secrets, keys or real candidate data in git.** Keys live in `.env` (ignored). `.env.example` shows the names only.

`tests/unit/architecture.test.mjs` enforces rules 1 and 2; lint enforces rule 7. A short list of known exceptions sits at the top of that file; do not add to it without a reason in the pull request.

## Database changes

Schema changes are new numbered files in `supabase/migrations/`, never edits to an applied one. Every new table gets row level security and policies in the same file, and a case in `tests/db/rls.test.mjs`. Full steps in `docs/DATABASE.md`. Never run `db:reset` against a database that holds real data.

## Adding things

**A new action (for example "archive an opening"):**
1. Add the function to the right file in `src/services/` (or a new file, then list it in `index.html` under the other services). Use `repo.*` for every change and call `log()` / `notify()` where the user would expect an entry.
2. Add unit tests in `tests/unit/services-*.test.mjs`. Load with `loadApp({ until: 'services', expose: [...] })`.
3. Call it from the handler in the feature. Add a check to `tests/e2e/flows.mjs` that clicks it.

**A new screen:**
1. `src/features/<name>/<name>.js` (and `.css` next to it if needed).
2. Register `VIEWS.<name>=[viewFn, bindFn]` and add `addNav([...], 'afterKey')`.
3. List the files in `index.html` after what they depend on and before `src/app/main.js`.
4. The smoke test visits every `NAV` page automatically.

**A change to the Google Form script:** edit `integrations/google-form/setup.template.gs`, run `npm run gen`.

## Before you open the pull request

- [ ] `npm run check` passes
- [ ] `npm run test:e2e:all` passes if you touched a screen or a service
- [ ] `.claude/plan.md`: tick what you finished, add a dated line to the change log, fix §5 if you fixed or found a known issue
- [ ] No unrelated formatting changes in the diff

## If something goes wrong

- **Lint says `'x' is not defined`:** the name does not exist in any file, or the file defining it is listed after yours in `index.html`.
- **Lint says `already defined as a built-in global`:** two files declare the same name. Rename one.
- **A browser test times out on a pop-up:** check the page printed an error; a service probably threw. Run the unit test for that service first.
- **Pre-commit blocks you:** fix the error it prints. `git commit --no-verify` skips the hook for an emergency; CI still runs everything.
