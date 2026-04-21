# Player Books API v1

Doel: Roblox krijgt per speler direct een **player-aware boekenlijst** met `eligible`, `lockReasons` en `unlockProgress`, zodat unlocklogica niet in client verspreid raakt.

Auth: `x-api-key` (server-to-server).

## GET `/api/players/:userId/books`

### Query
- `lang` (optioneel, default `nl`) voor `titleText`.

### 200
```json
{
  "ok": true,
  "schemaVersion": 1,
  "userId": 123,
  "items": [
    {
      "bookId": "book_5",
      "title": { "values": { "en": "Level 5", "nl": "Niveau 5" } },
      "titleText": "Niveau 5",
      "description": { "values": { "en": "", "nl": "" } },
      "accessModel": "paid",
      "productId": "NIVEAU5",
      "sequenceIndex": 9,
      "unlockRules": {
        "type": "requires_exams",
        "requiredBookId": "book_4",
        "requiredExamLessonIds": [],
        "requiredPassMode": "all"
      },
      "eligible": false,
      "lockReasons": ["LOCKED_PURCHASE_REQUIRED", "LOCKED_PREREQ_EXAMS"],
      "unlockProgress": {
        "requiredBookId": "book_4",
        "requiredExamLessonIds": ["lesson_exam_4a", "lesson_exam_4b"],
        "passedExamLessonIds": ["lesson_exam_4a"],
        "requiredExamCount": 2,
        "passedExamCount": 1,
        "requiredPassMode": "all"
      },
      "lessons": [
        { "lessonId": "lesson_exam_5a", "title": { "values": { "nl": "Examen Niveau 5A" } }, "isExam": true }
      ]
    }
  ]
}
```

### Fouten
- `400` `BAD_USER_ID`
- `401` `UNAUTHORIZED`
- `500` `INTERNAL_ERROR`

## Fallback / backward compatibility
- `accessModel` ontbreekt -> `"free"`
- `unlockRules` ontbreekt -> `{ "type": "none", "requiredBookId": null, "requiredExamLessonIds": [], "requiredPassMode": "all" }`
- `sequenceIndex` ontbreekt -> `9999`
- `lesson.isExam` ontbreekt -> `false`

## Eligibility regels
- Entitlement gate:
  - `free` => `entitlementOk=true`
  - `paid` => `entitlementOk=true` alleen als `productId` in speler-entitlements/purchases zit
- Exam gate:
  - alleen bij `unlockRules.type === "requires_exams"`
  - required exam lessons:
    - eerst `unlockRules.requiredExamLessonIds` als die niet leeg zijn
    - anders alle `isExam=true` lessons in `requiredBookId`
  - pass mode:
    - `all`: alle vereiste examens
    - `any`: minimaal 1 vereist examen

`eligible = entitlementOk && examGateOk`
