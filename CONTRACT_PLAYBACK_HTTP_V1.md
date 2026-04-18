# HTTP-contract: lesson step playback (Draughts Studio → Roblox)

**Doel:** Roblox (of een tussenliggende Kid Draughts API) haalt **één lesstap** op als **kanonieke runtime-DTO** (`playbackPayload`). Geen directe Mongo-lees in de game; alleen HTTP + caching op basis van **stap-identiteit + taal + boek-revision**.

**Bron (Studio):** `server/src/routes/playback.ts`, `server/src/services/playbackService.ts`, `server/src/validation/playbackSchemas.ts`, `server/src/routes/ownerContext.ts`.

**Integratie in deze repo (Kid Draughts API → Studio):** `src/services/puzzleSelection.service.js` — zelfde URL/query/headers als hieronder.

---

## 1. Base URL & mount

| | |
|--|--|
| API-prefix | **`/api`** |
| Playback-router | **`/api/steps`** |

Voorbeeld base: `https://<studio-host>` (bijv. `https://draughts-studio.onrender.com`).

---

## 2. Authenticatie / owner context

Studio roept per request `getOwnerContext(req)` aan (`server/src/routes/ownerContext.ts`). Zonder geldige **owner** hoort de server **`403`** te geven (bijv. ontbrekende owner context).

### 2.1 Vastgelegd formaat (server-to-server, Kid Draughts API)

De puzzle-runtime in deze repo roept Studio aan met:

| Header | Voorbeeld | Opmerking |
|--------|-----------|-----------|
| **`x-owner-type`** | `user` | Moet overeenkomen met wat Studio verwacht (`PLAYBACK_OWNER_TYPE`). |
| **`x-owner-id`** | `dev-user-1` | Stabiele id voor de service-account (`PLAYBACK_OWNER_ID`). |

Env (zie `.env.example`): `PLAYBACK_OWNER_TYPE`, `PLAYBACK_OWNER_ID`.

### 2.2 Roblox / gateway

Exact hetzelfde header-paar meesturen als jullie gateway of Studio-deploy voorschrijft. Als jullie later JWT / `Authorization` gebruiken, leg dat vast in **jullie** gateway-contract; dit document beschrijft het **minimale** mechanisme dat al in productie-integratie zit.

**Geen Mongo in Roblox:** alleen deze HTTP-call (+ optioneel cache).

---

## 3. Endpoints

### 3.1 Stap via globale step-ref (aanbevolen als je alleen `stepId` hebt)

```http
GET /api/steps/:stepId/playback
```

### 3.2 Stap via expliciet boek + les

```http
GET /api/steps/book/:bookId/lesson/:lessonId/step/:stepId
```

**Query (beide routes, aanbevolen voor integriteit en taal):**

| Parameter | Type | Default | Beschrijving |
|-----------|------|---------|--------------|
| `bookId` | string | — | Moet matchen met opgeloste stap-context; anders **400** (bijv. `playback.context.book_mismatch`). |
| `lessonId` | string | — | Idem (bijv. `lesson_mismatch`). |
| `lang` | string | `en` | Primaire taal voor `title`, `prompt`, timeline, hints. |
| `requiredLanguage` | herhaald / komma | `en` | Alle gevraagde talen moeten voor export gevuld zijn; anders **400** bij validatie (zie §6). |

**Kid Draughts API** bouwt de query als: `bookId`, `lessonId`, `lang` (eerste taal uit genormaliseerde lijst), en **`requiredLanguage` meerdere keren** (één query-param per taal), zie `fetchPlaybackPayload` in `puzzleSelection.service.js`.

---

## 4. Response-envelope (succes)

HTTP **200**, JSON:

```json
{
  "item": { },
  "meta": {
    "bookId": "<string>",
    "lessonId": "<string>",
    "stepId": "<string>",
    "language": "<string>"
  }
}
```

- **`item`:** `PlaybackPayload` na `buildPlaybackPayload`, gevalideerd met Zod `PlaybackPayloadSchema`.
- Roblox gebruikt **`item`** als enige bron voor bord, validatie en UI (niet `authoringV2` uit Mongo).

---

## 5. PlaybackPayload — `payloadVersion` 2

`payloadType` is altijd **`"lesson-step-playback"`**. Huidige export: **`payloadVersion: 2`**.

### 5.1 Top-level (samenvatting)

| Veld | Type | Opmerking |
|------|------|-----------|
| `payloadType` | `"lesson-step-playback"` | Contract-anker. |
| `payloadVersion` | `1` \| `2` | Server zet nu **2**. |
| `stepId` | string | |
| `lessonId` | string? | |
| `stepType` | string | Legacy step-type. |
| `title` | string | Gelokaliseerd voor `lang`. |
| `prompt` | string | Idem. |
| `initialFen` | string | Start-FEN. |
| `sideToMove` | `"white"` \| `"black"` | |
| `variantId` | string? | Les-variant; default-build vaak `"international"`. |
| `lineMode` | `"mainline"` \| `"variation"` \| `"custom"` | |
| `sourceId` | string? | |
| `startNodeId` | string \| null? | |
| `endNodeId` | string \| null? | |
| `nodes` | array | Zie §5.2. |
| `autoplayMoves` | string[] | |
| `events` | array | Zie §5.3. |
| `validation` | object? | Zie §5.4. |
| `puzzleScan` | object? | Zie §5.5. |
| `navigation` | object? | Zie §5.6. |
| `stepIndex` | number? | |
| `totalSteps` | number? | |
| `previousStepId` | string \| null? | |
| `nextStepId` | string \| null? | |
| `hint` | object? | o.a. `text`, `expectedFrom`, `expectedTo`. |

### 5.2 `nodes[]`

`id`, `ply`, `notation?`, `fenAfter?`, `parentId?`, `childrenIds` (string[]).

### 5.3 `events[]` (discriminated union)

- `{ "type": "pre_comment", "ply": number, "text": string }`
- `{ "type": "post_comment", "ply": number, "text": string }`
- `{ "type": "glyphs", "ply": number, "glyphs": string[] }`
- `{ "type": "overlay", "ply": number, "highlights": unknown[], "arrows": unknown[], "routes": unknown[] }`

Vaak één **`overlay`** op `ply: 0` met presentation highlights/arrows/routes.

### 5.4 `validation` (runtime discriminated union)

Exact één van:

**A) Lijn**

```json
{
  "runtimeKind": "line",
  "acceptMode": "exact",
  "acceptedLines": [{ "moves": [ { "notation": "32-28", "from": 32, "to": 28, "path": [32, 28], "captures": [], "resultFen": "<fen>" } ] }],
  "moveSource": "notation_engine" | "timeline_engine" | "mixed"
}
```

**B) Geen harde zet-validatie**

```json
{ "runtimeKind": "none", "acceptMode": "exact" }
```

**C) Doel**

```json
{
  "runtimeKind": "goal",
  "acceptMode": "exact",
  "goalType": "<string>",
  "targetSquare": 23,
  "sideToTest": "white" | "black"
}
```

**D) Authoring-only / fallback**

```json
{
  "runtimeKind": "authoring_only",
  "acceptMode": "exact",
  "authoring": { "<key>": "<unknown>", "_resolveError": "sequence_line_unresolved" }
}
```

Roblox: bij `authoring_only` niet blind als volledige engine behandelen.

### 5.5 `puzzleScan` (optioneel)

Volgens `PuzzleScanPlaybackMetaSchema` (o.a. `scanFallbackEnabled`, `strictAuthoredOnly`, `puzzleSide`, `baseline`, `policy`, `debug`).

### 5.6 `navigation` (optioneel)

```json
{
  "bookId": "<string>",
  "lessonId": "<string>",
  "stepId": "<string>",
  "stepIndex": 0,
  "totalSteps": 12,
  "previousStepId": "<string> | null",
  "nextStepId": "<string> | null"
}
```

Volgorde uit `authoringV2.authoringLesson.stepIds` of `lesson.steps` in boekvolgorde.

---

## 6. Export-gates (400)

`validateStepForRuntimeExport`: tenzij speciale `askSequence`-cases, faalt incomplete content/taal met o.a.:

- **400** — `ValidationError`: `"Step is not ready for runtime playback export"` met `issues` (pad/code/message).

**Praktisch:** zet `lang` / `requiredLanguage` consistent (bijv. `en`+`en` voor snelle tests).

---

## 7. Andere HTTP-fouten

| Status | Voorbeeld |
|--------|-----------|
| 400 | Validatie, context mismatch, ontbrekende params. |
| 403 | Geen owner context. |
| 404 | Step/lesson niet gevonden. |
| 409 | Conflict (zelden). |
| 500 | Serverfout. |

**Kid Draughts puzzle-flow:** bij herhaalde playback-fout na alternatieven → client krijgt **`503`** `PLAYBACK_UNAVAILABLE` (zie `CONTRACT_PUZZLES_V1.md`).

---

## 8. Revision & caching (contract)

Roblox leest **geen** Mongo; cache alleen op HTTP-signalen.

| Sleutel | Gebruik |
|---------|---------|
| **Stap** | `(bookId, lessonId, stepId, lang)` — invalideer bij wijziging content. |
| **Boek-revision** | Haal **`revision`** (of equivalent) uit **`GET /api/books`** of een door Studio gedocumenteerd meta-endpoint. Bij gewijzigde revision: cache voor dat boek invalideren of opnieuw valideren. |

**Aanbevolen cache-key string:**  
`playback:{bookId}:{lessonId}:{stepId}:{lang}:{bookRevision}`

Als `bookRevision` ontbreekt in de response, gebruik alleen de stap-sleutel en kortere TTL (bijv. 5–15 min) of ETag als Studio die ooit toevoegt.

---

## 9. Rolverdeling

| Laag | Rol |
|------|-----|
| **Mongo (Studio)** | `books`, lessons, `steps`, `authoringV2`. |
| **Studio HTTP** | Leest DB, bouwt `item`, valideert export + taal. |
| **Roblox** | Alleen **GET** + owner-headers; parse `item`; cache met revision. |

---

## 10. Minimale Roblox-checklist

1. Owner-headers correct (§2).  
2. Endpoint §3.1 of §3.2; query `bookId`/`lessonId`/`lang`/`requiredLanguage` (§3).  
3. Parse `item.initialFen`, `item.sideToMove`, `item.variantId`.  
4. Input tegen `item.validation` (§5.4).  
5. UI: `item.title` / `item.prompt`; overlays via `events` (`type === "overlay"`).  
6. Navigatie: `item.navigation` of `previousStepId` / `nextStepId`.  
7. Optioneel: `item.puzzleScan`.  
8. Bij **400** export: `issues` tonen/loggen; niet gokken in client.  
9. Cache: §8.

---

## 11. Voorbeeld (ingekort)

Zie gebruikerspecificatie §10; response heeft altijd **`item`** + **`meta`**.

---

## 12. Kruisverwijzingen

- Puzzle-runtime die playback ophaalt: `CONTRACT_PUZZLES_V1.md` (`playbackPayload` in `POST /v1/puzzles/next`).  
- Implementatie Kid Draughts → Studio: `src/services/puzzleSelection.service.js` (`fetchPlaybackPayload`).

**Versie:** `contractVersion: playback-http-v1` (documentversie; niet verwarren met `payloadVersion` in JSON).
