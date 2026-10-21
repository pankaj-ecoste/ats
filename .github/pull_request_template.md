## What and why

<!-- One or two sentences. Link the plan item (e.g. P1.3) if there is one. -->

## Checklist

- [ ] `npm run check` passes locally (lint, unit tests, build)
- [ ] Browser tests pass (`npm run test:e2e:all`) if a screen or a service changed
- [ ] Data changes go through a service in `src/services/` (no `S.…` writes or `save()` in screens)
- [ ] New or changed rules have unit tests
- [ ] New script files are added to `index.html` in the right layer order
- [ ] `.claude/plan.md` updated (tick items, add a line to the change log)
- [ ] No secrets, keys or real candidate data in the diff
