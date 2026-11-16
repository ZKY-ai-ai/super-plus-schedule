# Third-party notices

This project includes code adapted from the following MIT-licensed projects.

## StudyDesk

- Source: https://github.com/arun-v-p/StudyDesk
- Used in: `src/lib/tasks.ts`
- Adapted parts: minute-estimate validation and the rule that completing a
  parent task completes its remaining subtasks (`src/features/tasks/workload.ts`).

```
MIT License

Copyright (c) 2026 Arun V P

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## StudyDesk（专注计时与复习排期）

- Source: https://github.com/arun-v-p/StudyDesk
- Used in: `src/lib/study/focusTimer.ts`, `src/lib/study/reviewSchedule.ts`
- Adapted parts: the deadline-driven Pomodoro hook (daily-persisted session
  counts, long-break cycle) from `src/features/timer/usePomodoro.ts`, and the
  even review-allocation algorithm from `src/features/revision/schedule.ts`.
- License: MIT, same text as the StudyDesk entry above.

## Gapwise

- Source: https://github.com/GapwiseHQ/gapwise
- Used in: `src/lib/gapsEngine/`
- Adapted parts: gap scoring, recommendation candidates, timing and confidence
  from `src/features/gaps/assess-gap.ts`; campus routing and residence planning
  were removed. Full license: `src/lib/gapsEngine/LICENSE-Gapwise`.

```
MIT License

Copyright (c) 2026 Andrew Muratov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Course_Planner

- Source: https://github.com/Sira-pel/Course_Planner
- Used in: `src/lib/planning/`
- Adapted parts: timetable types, time utilities and the course-plan generator.
- License: Apache-2.0. Full license: `src/lib/planning/LICENSE-Course_Planner`.

## qq-reminder

- Source: https://github.com/Spectrum-o/qq-reminder
- Used in: `src/lib/tasks.ts`
- Adapted parts: the four-level homework reminder schedule (72h / 24h / 3h / 1h)
  from `plugins/homework/models.py` (`HOMEWORK_REMIND_LEVELS`).

```
MIT License

Copyright (c) 2026 zyn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
