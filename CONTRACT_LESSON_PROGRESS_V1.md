# Lesson progress API v1 (bridge / Kid Draughts API)

Server-to-server: header **`x-api-key`** (zelfde als `/v1/puzzles/*` en `/api/players/.../puzzle-stats`).

Padparameter **`userId`** = Roblox user id (numeriek); intern opgeslagen als string **`playerId`**.

---

## 1) Overzicht — GET lijst (aanbevolen voor “tab”)

`GET /api/players/:userId/lesson-progress` **zonder** `bookId` en **zonder** `lessonId`.

### Query

| Param | Default | Max | Beschrijving |
|-------|---------|-----|--------------|
| `limit` | 25 | 100 | Rijen per pagina |
| `offset` | 0 | — | Skip (offset-paginatie) |

Sort: **`lastPlayedAt`** aflopend (recent eerst), tie-break `bookId`, `lessonId`.

### 200 — body

```json
{
  "ok": true,
  "mode": "list",
  "schemaVersion": 1,
  "items": [
    {
      "bookId": "book_1",
      "lessonId": "lesson_7",
      "furthestStepIndex": 3,
      "furthestStepId": "step_12",
      "totalStepsKnown": 12,
      "bookRevision": 42,
      "completedStepIds": ["step_10", "step_11", "step_12"],
      "completedCount": 3,
      "lastPlayedAt": 1710000000
    }
  ],
  "pagination": { "limit": 25, "offset": 0, "total": 2 }
}
```

Lege collectie: `items: []`, `pagination.total` = 0.

### Fouten (lijst)

| HTTP | `error` |
|------|---------|
| 400 | `BAD_USER_ID` |
| 401 | `UNAUTHORIZED` |
| 500 | `INTERNAL_ERROR` |

---

## 2) Detail — GET één boek/les (bestaand)

`GET /api/players/:userId/lesson-progress?bookId=&lessonId=` — **beide** query-params verplicht.

Alleen **`bookId`** of alleen **`lessonId`**: **400** `LESSON_PROGRESS_QUERY_PAIR`.

### 200 — body (`mode` ontbreekt; enkel record)

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

**Geen document:** zelfde velden; voortgang-velden **`null`** / `completedStepIds` = `[]`.

### Fouten (detail)

| HTTP | `error` |
|------|---------|
| 400 | `BAD_USER_ID`, `BAD_BOOK_ID`, `BAD_LESSON_ID`, `LESSON_PROGRESS_QUERY_PAIR` |
| 401 | `UNAUTHORIZED` |
| 500 | `INTERNAL_ERROR` |

**Later (niet in v1):** batch meerdere `(bookId, lessonId)` in één call.

---

## 3) Schrijven — PUT / PATCH (bestaand)

Zelfde route: `PUT` / `PATCH` `/api/players/:userId/lesson-progress`.

| Veld | Verplicht | Opmerking |
|------|-----------|------------|
| `bookId`, `lessonId` | ja | |
| `stepId` of **`completedStepId`** | ja | Alias. |
| `stepIndex` | ja | ≥ 0 |
| `totalSteps` of **`totalStepsKnown`** | nee | Alias. |
| `markStepCompleted` | nee | Default `true`; `false` = geen append op `completedStepIds`. |
| `bookRevision` | nee | 409 bij stale client (zie eerdere spec). |
| `source` | nee | Default `"roblox"`. |

409 `BOOK_REVISION_MISMATCH` met `expectedRevision` / `actualRevision`.

---

## 4) Later — scores / examens

**Scores:** aparte velden + regels (per stap / les / boek) en vastleggen of dit via uitbreiding van PATCH of een **apart endpoint** gaat. Niet in Roblox hardcoderen tot de API dit definieert.

**Examens:** eigen resource of `lessonType` + endpoints (start, submit, resultaat, herkansing). Geen gokwerk in de client tot contract staat.

---

## 5) Auth / privacy

- Alleen requests met geldige **`x-api-key`** (server-to-server / bridge).
- **Productregel (vast te leggen in gateway/Roblox):** mag de caller alleen **`userId` = eigen speler** opvragen, of ook vrienden/coach? De API enforce’t **geen** “eigen user only” op basis van JWT — dat hoort in **jullie** bridge of game-server (welke `userId` je überhaupt aanvraagt).
- Roblox: roep alleen toegestane `userId`-routes aan.

---

## Optie B (niet geïmplementeerd)

Embed `lessonProgress` / lijst in `GET /api/players/:userId/profile-snapshot` — mogelijk later om één round-trip te besparen.

---

## Mongo

Collectie **`player_lesson_progress`**.

- Uniek: `{ playerId: 1, bookId: 1, lessonId: 1 }`
- Lijst-query: `{ playerId: 1, lastPlayedAtUnix: -1 }`

**schemaVersion:** `1` op records; lijst-response bevat ook `schemaVersion`.

**Changelog:** v1.2 — GET lijst zonder book/lesson; `LESSON_PROGRESS_QUERY_PAIR`; index lijst; §4–§5.
