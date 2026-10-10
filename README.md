# Ecoste Recruit Tracker

Recruitment workspace: openings, job posting, applications, screening, interviews, offers, onboarding, pipeline control and management reporting.

This repository is the original single-file prototype split into a maintainable project. Behaviour is unchanged: the split was verified against the prototype view by view (see "How the split was verified" in `docs/ARCHITECTURE.md`). It is still a browser-only demo. `docs/PRODUCTION_ROADMAP.md` lists what stands between this and production.

## Run it

```bash
npm run dev        # http://localhost:5173  (or just open index.html; no build step is needed)
npm test           # unit tests, no dependencies
npm run build      # dist/Ecoste_Recruit_Tracker.html, one self-contained file
npm install && npx playwright install chromium
npm run test:e2e   # browser smoke test of every page (add `-- dist` to test the build)
npm run test:e2e:hooks   # browser check of the extension points
npm run test:e2e:flows   # browser check that user actions reach the data through the services
npm run lint       # ESLint; `npm run check` = lint + unit tests + build
```

Requires Node 20+. Nothing needs installing for `dev`, `test` or `build`.

## Layout

```
index.html                     App shell and the ordered list of stylesheets and scripts (the manifest)
assets/img/                    Static images (logo)

src/
  styles/                      Shared CSS, in cascade order
    tokens.css                   colours, radii, shadows, light and dark themes
    base.css                     element resets, app grid
    layout.css                   sidebar, top bar, content area
    components.css               buttons, panels, KPIs, tables, pills, forms, tabs
    widgets.css                  funnel, journey, kanban, modal, calendar, offer letter, chat
    utilities.css  responsive.css  print.css
  core/                        Foundations with no knowledge of any screen
    assets.js                    asset paths
    utils.js                     DOM, date, money, string helpers
    icons.js                     SVG icon set
    constants.js                 stages, statuses, criteria, templates
    store.js                     global state S, defaults, load/save
    selectors.js                 lookups over S
    repo.js                      the only code that inserts, updates or removes records in S
    hooks.js                     extension points: slots, bind hooks, events, addNav, button actions
  data/
    seed.js                      demo dataset
  domain/                      Business rules, no DOM
    match.js                     resume-to-opening scoring
    resume-parser.js             plain-text resume parser
    salary.js                    CTC breakup
    sheet-values.js              reading loose spreadsheet values (salary, notice, hash)
  services/                    Use cases that change data (moveStage, addTask, log ...). No DOM.
    activity  tasks  stages  openings  candidates  applications  interviews  offers  onboarding  posting  settings  report  sheets
  app/                         Application frame
    router.js                    route state R, NAV, go()
    shell.js                     sidebar, top bar, search, notifications
    ui.js                        modal, toast, confirm
    ui-actions.js                button actions (data-act) and the one click listener
    actions.js                   stage changes, activity log, next action
    render.js                    view registry VIEWS, render()
    main.js                      bootstrap (always loaded last)
  features/                    One folder per screen or capability; CSS sits next to its JS
    dashboard/  openings/  applications/  candidates/  screening/  interviews/
    offers/  onboarding/  tasks/  reports/  assistant/  settings/
    pipeline/                    pipeline control centre and SLA rules
    posting/                     job boards and social posts
    sheets/                      workbook export/import (sheets-io.js), Google Sheet auto-import
    management-report/           events, metrics, charts, report view
  generated/
    form-script.js               built from integrations/, do not edit

integrations/google-form/      Apps Script that creates the application form (source of truth)
scripts/                       serve.mjs, build-single.mjs, gen-form-script.mjs
tests/unit/                    node:test suites for domain logic and sheet parsing
tests/e2e/                     Playwright smoke test
docs/                          ARCHITECTURE.md, PRODUCTION_ROADMAP.md
```

## Working in this codebase

See `CONTRIBUTING.md` for the full rules, branches and checklists. A pre-commit hook (installed by `npm install`) runs lint and unit tests; CI runs everything.

**Extending another screen.** Never edit another feature's HTML with `String.replace` or reassign its functions. Use `fillSlot`, `onBind`, `onEvent` or `addNav` from `src/core/hooks.js`; if the host view has no slot where you need one, add `${slotHTML('<view>.<place>')}` to it.

**Buttons.** Do not write `onclick="fn()"` in markup. Write `data-act="name" data-a1="arg"` and register `name` in `src/app/ui-actions.js`.

**Changing data.** A handler never writes to `S`. It calls a service from `src/services/` (`addTask`, `moveStage`, ...), which changes records only through `repo.insert/update/remove/root` and returns the result; the handler then shows the toast and re-renders. Services are DOM-free, so they are unit-tested in Node, and `tests/unit/architecture.test.mjs` fails the build if app or feature code writes to `S` or calls `save()` directly, or if a service touches the UI. This is the seam where Supabase plugs in (Phase 2).

**Adding a feature.** Create `src/features/<name>/<name>.js` (and `.css` if needed), register the view with `VIEWS.<name>=[viewFn, bindFn]`, add a `NAV` entry, then list the files in `index.html` after the features they depend on and before `src/app/main.js`.

**Load order matters.** Files are classic scripts sharing one global scope, so a file can only use, at load time, what earlier files defined. The order in `index.html` is `core -> data -> domain -> services -> app -> features -> app/main.js`. The build and the unit-test loader both read that list, so `index.html` is the only place to maintain it.

**Editing the Google Form script.** Edit `integrations/google-form/setup.template.gs`, then run `npm run gen`.

**Publishing as a Claude artifact.** Run `npm run build` and publish `dist/Ecoste_Recruit_Tracker.html`.
