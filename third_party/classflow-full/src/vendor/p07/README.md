# Vendored from Uniplan (P07)

- Source: https://github.com/Sira-pel/Course_Planner
- Commit: `d59cf2798929b85f0a12d2a72eb226904d791769`
- License: Apache-2.0 (see `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`)
- Vendored files:
  - `src/types/schedule.ts`
  - `src/utils/planGenerator.ts`
  - `src/utils/generatorPrefs.ts`
  - `src/utils/courseIdentity.ts`
  - `src/utils/timeUtils.ts`

Only type-only import syntax was adjusted for this project's `verbatimModuleSyntax` setting.
The generator algorithm is otherwise kept as upstream. The adapter that maps the local
`SelectionSection` model to Uniplan's `Course` model lives at `src/lib/selectionGenerator.ts`.
