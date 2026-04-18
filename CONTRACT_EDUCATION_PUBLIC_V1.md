# Education / public progress v1 (bridge)

Geen les-voortgang per boek in deze response — alleen **opleidingsniveau** + **afgeronde examens/boeken** voor profiel-tab (andere spelers). Zie ook `GET /api/players/:userId/profile-snapshot` → **`educationPublic`** (zelfde velden + `schemaVersion`).

**Auth:** `x-api-key` (server-to-server), zelfde als overige bridge-routes. Privacy: welke `userId` je opvraagt bepaalt **Roblox** (geen private `lesson-progress` lijst voor vreemden).

---

## GET `/api/players/:userId/lesson-progress/public`

### 200

```json
{
  "ok": true,
  "schemaVersion": 1,
  "userId": 123456789,
  "educationTier": "youth",
  "educationLevel": 3,
  "educationLevelDisplay": { "nl": "Niveau 3", "en": "Level 3" },
  "educationLevelLabel": "Niveau 3",
  "examsCompleted": [
    { "examId": "exam_intro", "title": "Introductietoets", "passedAt": 1710000000, "score": 88 }
  ],
  "booksCompleted": [
    { "bookId": "book_basics", "title": "Basis", "completedAt": 1710000100 }
  ]
}
```

Leeg profiel / geen `education` in Mongo: `educationTier` … `educationLevelLabel` **`null`**, `educationLevel` **`null`**, `educationLevelDisplay` **`{ "nl": null, "en": null }`**, arrays **`[]`**.

### Fouten

| HTTP | `error` |
|------|---------|
| 400 | `BAD_USER_ID` |
| 401 | `UNAUTHORIZED` |
| 500 | `INTERNAL_ERROR` |

---

## Mongo — `player_profiles.education` (optioneel)

Schrijven doet een aparte sync/patch (niet in deze route). Vorm:

```json
{
  "educationTier": "youth",
  "tier": "youth",
  "educationLevel": 3,
  "level": 3,
  "educationLevelDisplay": { "nl": "Niveau 3", "en": "Level 3" },
  "levelDisplay": { "nl": "…", "en": "…" },
  "examsCompleted": [
    { "examId": "…", "title": "…", "passedAt": 1710000000, "passedAtUnix": 1710000000, "score": 88 }
  ],
  "booksCompleted": [
    { "bookId": "…", "title": "…", "completedAt": 1710000100, "completedAtUnix": 1710000100 }
  ]
}
```

- Aliassen **`tier`** / **`level`** / **`levelDisplay`** worden ook gelezen.
- Tijden: **`passedAt`** of **`passedAtUnix`**; **`completedAt`** of **`completedAtUnix`** (Unix seconden).

---

## Profile snapshot

`GET /api/players/:userId/profile-snapshot` bevat altijd:

```json
"educationPublic": {
  "schemaVersion": 1,
  "userId": 123456789,
  "educationTier": null,
  "educationLevel": null,
  "educationLevelDisplay": { "nl": null, "en": null },
  "educationLevelLabel": null,
  "examsCompleted": [],
  "booksCompleted": []
}
```

(Zelfde mapping als hierboven.)

**PersistenceHttpClient:** één regel URL naar  
`/api/players/{userId}/lesson-progress/public`  
voor dit blok alleen.
