# Lesson progress API v1 (bridge / Roblox server)

Server-to-server: header **`x-api-key`** (zelfde als `/v1/puzzles/*` en `/api/players/.../puzzle-stats`).

Padparameter **`userId`** = Roblox user id (numeriek); intern opgeslagen als string **`playerId`**.

---

## GET `/api/players/:userId/lesson-progress`

### Query (verplicht)

| Param | Type |
|-------|------|
| `bookId` | string |
| `lessonId` | string |

### 200 — body

```json
{
  "ok": true,
  "bookId": "book_1",
  "lessonId": "lesson_7",
  "furthestStepIndex": 3,
  "furthestStepId": "step_12",
  "totalStepsKnown": 12,
  "completedStepIds": ["step_10", "step_11", "step_12"],
  "lastPlayedAt": 1710000000,
  "bookRevision": 42,
  "schemaVersion": 1
}
```

**Geen document:** zelfde velden; `furthestStepIndex`, `furthestStepId`, `totalStepsKnown`, `lastPlayedAt`, `bookRevision` zijn **`null`**; `completedStepIds` = `[]`.

### Fouten

| HTTP | `error` |
|------|---------|
| 400 | `BAD_USER_ID`, `BAD_BOOK_ID`, `BAD_LESSON_ID` |
| 401 | `UNAUTHORIZED` |
| 500 | `INTERNAL_ERROR` |

---

## PUT / PATCH `/api/players/:userId/lesson-progress`

Zelfde handler. Body JSON:

| Veld | Verplicht | Type | Opmerking |
|------|-----------|------|------------|
| `bookId` | ja | string | |
| `lessonId` | ja | string | |
| `stepId` | ja | string | Wordt idempotent toegevoegd aan `completedStepIds`. |
| `stepIndex` | ja | number ≥ 0 | `furthestStepIndex` = max(bestaand, `stepIndex`). |
| `totalSteps` | nee | number ≥ 0 | `totalStepsKnown` = max(bestaand, `totalSteps`) indien gezet. |
| `bookRevision` | nee | number | Zie **409** hieronder. |
| `source` | nee | string | Default `"roblox"`. |

### 200

Zelfde shape als GET 200 (actuele staat na upsert).

### 409 — `BOOK_REVISION_MISMATCH`

Alleen wanneer er al een opgeslagen **`bookRevision`** is en de client stuurt een **strikt lagere** `bookRevision` (stale client).

```json
{
  "ok": false,
  "error": "BOOK_REVISION_MISMATCH",
  "expectedRevision": 10,
  "actualRevision": 8
}
```

- **`expectedRevision`:** waarde op de server (bron van waarheid voor progress).
- **`actualRevision`:** waarde uit het request.

Bij gelijke of hogere client-`bookRevision` wordt opgeslagen naar max(client, server) voor die sleutel (zie implementatie).

### Overige fouten

| HTTP | `error` |
|------|---------|
| 400 | `BAD_USER_ID`, `BAD_BOOK_ID`, `BAD_LESSON_ID`, `BAD_STEP_INDEX` |
| 401 | `UNAUTHORIZED` |
| 500 | `INTERNAL_ERROR` |

---

## Mongo

Collectie **`player_lesson_progress`**, unieke sleutel `{ playerId, bookId, lessonId }`.

---

## Optioneel later

- Zelfde blok embedden onder `GET /api/books/:bookId` (één call) — niet in v1.
- JWT/owner naast `x-api-key` — gateway-spec.

**schemaVersion:** `1` (response); wijzigingen backward-compatible uitbreiden met hogere versie.
