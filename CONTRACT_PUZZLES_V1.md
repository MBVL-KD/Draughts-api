# Puzzles Contract v1.0

## Globale regels

- `contractVersion = "puzzles-v1"` in:
  - response body veld `contractVersion`
  - header `x-contract-version: puzzles-v1`
- elke response (ook errors) bevat `requestId`
- `puzzleId` is immutable runtime id en unique in `puzzle_catalog`
- mapping is altijd: `puzzleId -> contentRef{bookId,lessonId,stepId,stepVersion}`

## 1) POST `/v1/puzzles/next`

### Request

```json
{
  "playerId": 123456789,
  "sessionId": null,
  "variantId": "international",
  "mode": "training",
  "lang": "nl",
  "requiredLanguage": ["nl", "en"],
  "topicTags": ["capture_chain"],
  "excludePuzzleIds": ["pz_old1"],
  "debug": false,
  "seed": null
}
```

### Defaults

- Als `requiredLanguage` ontbreekt of leeg is, zet server:
  - `requiredLanguage = [lang, "en"]`
- Als `lang` ontbreekt, gebruik server default (aanbevolen: `"nl"`).

### Session policy (hard)

- Client mag `sessionId` meesturen.
- Als `sessionId` ontbreekt/null: server maakt nieuwe.
- Als meegestuurde `sessionId` niet bij `playerId` past: `409 SESSION_PLAYER_MISMATCH`.

### Anti-repeat fallback policy (hard, traceable)

Server probeert vensters in volgorde:

1. 50
2. 20
3. 10

`selectionMeta` geeft gebruikte window terug.

### Playback failure policy

Server probeert max 3 alternatieve kandidaten bij playback-fout.  
Pas daarna return:

- `503 PLAYBACK_UNAVAILABLE`

### Success response

```json
{
  "ok": true,
  "contractVersion": "puzzles-v1",
  "requestId": "req_...",
  "sessionId": "sess_7721",
  "puzzleId": "pz_8f2d1c",
  "contentRef": {
    "bookId": "book_1",
    "lessonId": "lesson_7",
    "stepId": "step_12",
    "stepVersion": 3
  },
  "playbackPayload": {},
  "selectionMeta": {
    "targetRating": 1240,
    "windowUsed": 20,
    "candidateRetriesUsed": 1,
    "reason": "rating_fit_topic_need"
  }
}
```

- **`playbackPayload`:** zelfde DTO als Studio `GET /api/steps/.../playback` → `item` (zie **`CONTRACT_PLAYBACK_HTTP_V1.md`**: auth `x-owner-type` / `x-owner-id`, query, `payloadVersion: 2`, revision/cache).

## 2) POST `/v1/puzzles/result`

### Request

```json
{
  "attemptId": "att_01H...",
  "playerId": 123456789,
  "sessionId": "sess_7721",
  "mode": "training",
  "puzzleId": "pz_8f2d1c",
  "contentVersion": 3,
  "variantId": "international",
  "result": {
    "outcome": "solved",
    "attemptCount": 1,
    "timeMs": 39000,
    "hintsUsed": 1,
    "mistakes": 0,
    "usedSolution": false
  }
}
```

### Validatie (hard)

- `mode` toegestaan op v1: `training | lesson`
- `ranked` op v1: reject met `422 MODE_NOT_ENABLED`
- `attemptId` format:
  - toegestaan: UUID v4, ULID, of veilige string-id
  - regex: `^[A-Za-z0-9:_-]{8,64}$`
  - lengte: min 8, max 64

### Content version check

- Bij aangeleverde `contentVersion` die niet matcht met actuele contentversie:
  - `409 CONTENT_VERSION_MISMATCH`

### Canonieke rating-bron (hard)

Server leidt `actualScore` af uit `outcome/timeMs/hintsUsed/mistakes/usedSolution`.  
Client stuurt geen `progressScore` voor ratingbesluit (optioneel alleen telemetry).

### Idempotency-hardening

- unique key: `attemptId`
- store + log: `safetyHash = hash(playerId|puzzleId|sessionId|attemptId)`
- replay met zelfde `attemptId` geeft exact dezelfde eerder opgeslagen response.

### Success response

```json
{
  "ok": true,
  "contractVersion": "puzzles-v1",
  "requestId": "req_...",
  "attemptId": "att_01H...",
  "playerRating": { "before": 1229, "after": 1240, "delta": 11 },
  "puzzleRating": { "before": 1328, "after": 1325, "delta": -3 }
}
```

## Statuscode matrix

- `400` invalid payload
- `401` unauthenticated
- `404` puzzle/session not found
- `409` conflict (session mismatch, revision mismatch, idempotency conflict)
- `422` semantically invalid (variant mismatch, mode not enabled, impossible state)
- `500` internal error
- `503` playback unavailable after retries

### Error shape

```json
{
  "ok": false,
  "contractVersion": "puzzles-v1",
  "requestId": "req_...",
  "code": "PLAYBACK_UNAVAILABLE",
  "message": "Playback could not be generated after 3 candidates."
}
```

## 3) Puzzle-statistieken (read-model, Roblox server)

Server-to-server: header `x-api-key: <API_KEY>` (zelfde als `/v1/puzzles/*`).

### GET `/api/players/:userId/puzzle-stats`

- **200** — body (minimaal):

```json
{
  "schemaVersion": 1,
  "ok": true,
  "userId": 123456789,
  "rating": {
    "value": 820,
    "deviation": 200,
    "scope": "global"
  },
  "totals": { "solved": 42, "attempted": 50, "hintsUsed": 12 },
  "streaks": { "current": 3, "best": 10 },
  "lastActivityAt": 1710000000,
  "byVariant": {
    "international": {
      "solved": 40,
      "attempted": 48,
      "rating": 815,
      "provisional": true
    }
  }
}
```

- **Lege speler** (geen attempts/profielen): `solved`/`attempted`/`hintsUsed` = 0, `rating.value` = **800** (default), `streaks` = `{ "current": 0, "best": 0 }`, `lastActivityAt` = `null`, `byVariant` = `{}`.

- **Fouten**

| HTTP | `error`              |
|------|----------------------|
| 400  | `BAD_USER_ID`      |
| 401  | `UNAUTHORIZED`     |
| 500  | `INTERNAL_ERROR`   |
| 500  | `API_KEY_NOT_CONFIGURED` (server) |

### Streak-definitie

Attempts gesorteerd op `playedAtUnix` (oplopend). `solved === true` telt mee in de run; elke niet-opgeloste poging zet de run op 0. **current** = aaneengesloten successen eindigend bij de laatste poging; **best** = langste run ooit.

### Rating (samenvatting)

Zelfde kern als `POST /v1/puzzles/result`: verwachte score vs puzzelrating, `actualScore` uit tijd/hints/fouten; updates per variant in `player_puzzle_profiles`. **Globale** `rating.value` = gewogen gemiddelde over varianten (gewicht = aantal attempts per variant). `deviation` is een **heuristiek** (geen echte Glicko-RD): hoog (~200) bij weinig data / provisional, lager (~75) na voldoende attempts.

### Idempotentie

Zelfde `attemptId` dubbel tellen wordt voorkomen door unieke index op `puzzle_attempts.attemptId` (bestaand gedrag).

### Profielintegratie (option A)

`GET /api/players/:userId/profile-snapshot` bevat optioneel hetzelfde object onder **`puzzleStats`** (één HTTP-call). Bij fout tijdens ophalen ontbreekt het veld.

### Caching

Roblox-server mag 30–60 s per user cachen; API hoeft geen extra cache-header te zetten.

### OpenAPI-fragment

```yaml
paths:
  /api/players/{userId}/puzzle-stats:
    get:
      summary: Puzzle statistics for Roblox profile UI
      parameters:
        - name: userId
          in: path
          required: true
          schema: { type: integer }
      security:
        - ApiKeyAuth: []
      responses:
        '200':
          description: Stats payload
          content:
            application/json:
              schema:
                type: object
                required: [schemaVersion, ok, userId]
                properties:
                  schemaVersion: { type: integer, example: 1 }
                  ok: { type: boolean }
                  userId: { type: integer }
        '401': { description: Missing or invalid x-api-key }
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
```
