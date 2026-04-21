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

### 1.1 Optioneel: zelfde pad via Kid Draughts API (proxy)

Als de game-server **`https://draughts-api.onrender.com`** als enige base URL gebruikt, kan playback daar ook (na deploy) worden aangeroepen op **hetzelfde pad** als Studio: **`/api/steps/...`**.

- De API stuurt de request door naar **`INTERNAL_API_BASE_URL`** (Studio-origin).
- **Auth Kid Draughts:** header **`x-api-key`** (zelfde als andere `/api/*`-calls).
- **Auth Studio (doorgezet):** **`x-owner-type`** / **`x-owner-id`** op de request; ontbrekend → fallback `PLAYBACK_OWNER_TYPE` / `PLAYBACK_OWNER_ID` op de server (zoals de puzzle-bridge).

Zonder `INTERNAL_API_BASE_URL` → **503** `PLAYBACK_UPSTREAM_NOT_CONFIGURED`.

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

### 3.3 Equivalentie §3.1 ↔ §3.2 (normatief)

Studio (`Editor/server/src/routes/playback.ts`) gebruikt voor **beide** routes dezelfde helpers:

- `resolveRequestedLanguage(req)` → `lang` query (default `"en"`).
- `resolveRequiredLanguages(req)` → `requiredLanguage` als **array** (herhaalde query-keys **of** komma-gescheiden string); default `["en"]`.

**Kid Draughts `fetchPlaybackPayload`** roept alleen **§3.1** aan:

`GET /api/steps/:stepId/playback?bookId=…&lessonId=…&lang=…&requiredLanguage=nl&requiredLanguage=en` (voorbeeld met twee herhaalde params).

**§3.2** zet `bookId`, `lessonId`, `stepId` in het **pad**; de **querystring hoeft alleen** `lang` en `requiredLanguage` (zelfde vorm als hierboven). Geen dubbele `bookId`/`lessonId` in de query nodig.

**Gedrag:** Voor dezelfde owner, dezelfde canonieke `(bookId, lessonId, stepId)` en dezelfde `lang` / `requiredLanguage`-lijst roepen beide routes dezelfde **`buildPlaybackPayload`** aan op dezelfde stap (zodra de stap uniek is opgelost). Het JSON-resultaat **`item`** + **`meta`** (zie §4) is dan functioneel hetzelfde. Randgeval: als `stepId` in §3.1 via `findStepRef` een andere les zou oplossen dan het pad in §3.2, zijn context guards op §3.1 (`bookId`/`lessonId` query) leidend — gebruik consistente refs.

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
    "language": "<string>",
    "revision": 42,
    "bookRevision": 42
  }
}
```

- **`item`:** `PlaybackPayload` na `buildPlaybackPayload`, gevalideerd met Zod `PlaybackPayloadSchema`.
- Roblox gebruikt **`item`** als enige bron voor bord, validatie en UI (niet `authoringV2` uit Mongo).

### 4.1 `meta` en boek-revision (cache)

| Veld in playback-`meta` | Studio (huidig) | Opmerking |
|-------------------------|-----------------|-----------|
| `bookId`, `lessonId`, `stepId`, `language` | **Ja** | Zoals hierboven. |
| **`revision`** | **Ja** (als bekend) | Zelfde numerieke bron als **`GET /api/books/:bookId` → `item.revision`** (`BookModel`). |
| **`bookRevision`** | **Ja** (als bekend) | **Alias** van `revision` (zelfde getal); handig voor `LessonContentService:GetPlayback({ bookRevision })`. |

Als het boekdocument geen geldig `revision`-veld heeft (zeldzaam / legacy), ontbreken **`revision`** en **`bookRevision`** in `meta`.

**Fallback cache / invalidatie:** zonder playback-`meta.revision` kun je nog steeds **`GET /api/books/:bookId` → `item.revision`** aanroepen.

**Strikte cache-key (aanbevolen):**  
`playback:{bookId}:{lessonId}:{stepId}:{lang}:{revision}`  
waar **`revision`** voorkeursgewijs uit **`meta.revision`** (of **`meta.bookRevision`**) komt; anders uit **`item.revision`** van de books-route (zie §8).

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

- **400** — body: `{ "message": "<string>", "issues": [ … ] }` (Studio `ValidationError`).
- Message vaak: **`"Step is not ready for runtime playback export"`** — `issues`: array met minimaal `path`, `code`, `message`, `severity` (export-validatie).

**Praktisch:** zet `lang` / `requiredLanguage` consistent (bijv. `en`+`en` voor snelle tests).

---

## 7. HTTP-fouten (Studio — vastgelegde vorm)

Body is altijd JSON met minimaal **`message`**; bij **400** vaak ook **`issues`**.

| Status | Wanneer | Voorbeeld `message` | `issues[].code` (indien van toepassing) |
|--------|---------|----------------------|----------------------------------------|
| **400** | Context guard §3.1 | `"Step context mismatch"` | **`playback.context.book_mismatch`** (`path`: `bookId`) of **`playback.context.lesson_mismatch`** (`path`: `lessonId`) |
| **400** | Ontbrekende pad-params §3.2 | `"Missing playback route params"` | **`playback.context.missing`** (`path`: `params`) |
| **400** | Export niet klaar | `"Step is not ready for runtime playback export"` | Validator-codes in `issues` (geen vaste lijst; altijd `issues` lezen) |
| **403** | Geen owner | `"Missing owner context"` of `"Invalid owner context"` | — |
| **404** | — | `"Step not found"`, `"Lesson not found"`, `"Book not found"` | — |
| **409** | Zeldzaam | — | — |
| **500** | Server | `"Internal server error"` | — |

**Kid Draughts puzzle-flow:** bij herhaalde playback-fout na alternatieven → client krijgt **`503`** `PLAYBACK_UNAVAILABLE` (zie `CONTRACT_PUZZLES_V1.md`) — **niet** van Studio zelf, maar van de Kid Draughts API.

---

## 8. Revision & caching (contract)

Roblox leest **geen** Mongo; cache alleen op HTTP-signalen.

| Sleutel | Gebruik |
|---------|---------|
| **Stap** | `(bookId, lessonId, stepId, lang)` — basis. |
| **Boek-revision (primair)** | Playback **`meta.revision`** of **`meta.bookRevision`** (zelfde **number** als `GET /api/books/:bookId` → **`item.revision`**). Bij gewijzigde revision: cache voor die stap invalideren. |
| **Boek-revision (fallback)** | **`GET /api/books/:bookId`** → **`item.revision`** als `meta` geen revision bevat. |

**Aanbevolen cache-key string:**  
`playback:{bookId}:{lessonId}:{stepId}:{lang}:{revision}`  
met **`revision`** = **`meta.revision`** (of **`meta.bookRevision`**), anders **`item.revision`** van books.

Ontbreken beide: alleen stap-sleutel + kortere TTL (bijv. 5–15 min).

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

**Changelog:**  
- playback-http-v1.2 — `meta.revision` + `meta.bookRevision` (Studio playback); §4 / §4.1 / §8 bijgewerkt.  
- playback-http-v1.1 — §3.3 equivalentie Kid Draughts vs §3.2; §4.1 vs `item.revision`; §7 foutcodes gelijk aan Studio `playback.ts` / `httpErrors`.
