# Runtime Content API v1

Doel: Roblox lesson-content in lichte chunks laden (metadata eerst, steps later), zonder zware volledige boekpayloads.

Auth: `x-api-key` vereist op alle endpoints.

## 1) GET `/api/runtime/books?userId={id}&lang=nl`

Lichte catalogus voor de speler.

- Bevat per boek: `eligible`, `lockReasons`, `unlockProgress`, `bookProgress`, `revision`
- Bevat **geen** lesson-step bodies.

## 2) GET `/api/runtime/books/:bookId/lessons?userId={id}&lang=nl`

Lessonmetadata voor één boek.

- Bevat per les: `lessonId`, `title`, `status`, `progress`, `actions`, `entryStepId`, `resumeStepId`, `totalSteps`
- Bevat **geen** volledige `steps[]`.

## 3) GET `/api/runtime/lessons/:lessonId/steps?bookId={bookId}&offset=0&limit=100&lang=nl`

Paginering voor lesson steps.

- Query:
  - `bookId` verplicht
  - `offset` default `0`
  - `limit` default `100`, max `200`
- Response:
  - `revision`, `etag`
  - `pagination.totalSteps`, `hasMore`, `nextOffset`
  - `steps[]` chunk met lichte stepvelden (`stepId`, `title`, `prompt`, `initialState`, ...)

## Aanbevolen Roblox flow

1. `GET /api/runtime/books` (1 call bij openen Learning)
2. Bij boekselectie: `GET /api/runtime/books/:bookId/lessons`
3. Bij lesstart: `GET /api/runtime/lessons/:lessonId/steps` met `offset=0&limit=...`
4. Terwijl speler nadert einde chunk: volgende chunk laden via `nextOffset`
5. Cache-key: `lessonId + revision + offset + limit + lang`
