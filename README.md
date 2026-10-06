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
  data/
    seed.js                      demo dataset
  domain/                      Business rules, no DOM
    match.js                     resume-to-opening scoring
    resume-parser.js             plain-text resume parser
    salary.js                    CTC breakup
  app/                         Application frame
    router.js                    route state R, NAV, go()
    shell.js                     sidebar, top bar, search, notifications
    ui.js                        modal, toast, confirm
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

**Adding a feature.** Create `src/features/<name>/<name>.js` (and `.css` if needed), register the view with `VIEWS.<name>=[viewFn, bindFn]`, add a `NAV` entry, then list the files in `index.html` after the features they depend on and before `src/app/main.js`.

**Load order matters.** Files are classic scripts sharing one global scope, so a file can only use, at load time, what earlier files defined. The order in `index.html` is `core -> data -> domain -> app -> features -> app/main.js`. The build and the unit-test loader both read that list, so `index.html` is the only place to maintain it.

**Editing the Google Form script.** Edit `integrations/google-form/setup.template.gs`, then run `npm run gen`.

**Publishing as a Claude artifact.** Run `npm run build` and publish `dist/Ecoste_Recruit_Tracker.html`.
