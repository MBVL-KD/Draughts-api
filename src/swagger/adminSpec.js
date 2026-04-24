export const adminSpec = {
  openapi: "3.0.3",
  info: {
    title: "Draughts4All – Admin API",
    version: "1.0.0",
    description:
      "API for the outreach / admin tool. All endpoints require the `x-admin-api-key` header. " +
      "This surface is intentionally separate from the Roblox-facing player API. " +
      "The primary player identifier is `robloxUserId` (Roblox numeric user id).",
    contact: { name: "Draughts4All" },
  },
  servers: [{ url: "/api/admin", description: "Admin API base" }],
  security: [{ AdminApiKey: [] }],
  components: {
    securitySchemes: {
      AdminApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-admin-api-key",
        description: "Admin API key — different from the Roblox-facing API_KEY.",
      },
    },
    schemas: {
      PlayerStatus: {
        type: "string",
        enum: ["pre_registered", "active"],
        description:
          "`pre_registered` = robloxUserId known but child has not yet logged in to Roblox. " +
          "`active` = player has logged in at least once.",
      },
      RatingBucket: {
        type: "object",
        properties: {
          bucket: { type: "string", example: "international_blitz" },
          rating: { type: "number", example: 1450 },
          rd: { type: "number", example: 68 },
          provisional: { type: "boolean", example: false },
          ratedGames: { type: "integer", example: 34 },
          updatedAtUnix: { type: "integer", nullable: true, example: 1745500000 },
        },
      },
      PlayerStats: {
        type: "object",
        properties: {
          gamesTotal: { type: "integer", example: 44 },
          wins: { type: "integer", example: 28 },
          losses: { type: "integer", example: 12 },
          draws: { type: "integer", example: 4 },
        },
      },
      PlayerProfile: {
        type: "object",
        properties: {
          robloxUserId: { type: "integer", example: 123456789 },
          username: { type: "string", nullable: true, example: "MilanDammer" },
          displayName: { type: "string", nullable: true, example: "Milan" },
          status: { $ref: "#/components/schemas/PlayerStatus" },
          externalRefs: {
            type: "object",
            properties: { childRef: { type: "string", example: "child_001" } },
          },
          ratings: { type: "array", items: { $ref: "#/components/schemas/RatingBucket" } },
          stats: { $ref: "#/components/schemas/PlayerStats" },
          coins: { type: "integer", example: 120 },
          level: { type: "integer", example: 5 },
          xp: { type: "integer", example: 4200 },
          badges: { type: "array", items: { type: "object" } },
          firstSeenAtUnix: { type: "integer", nullable: true, example: 1744000000 },
          lastSeenAtUnix: { type: "integer", nullable: true, example: 1745500800 },
          createdAtUnix: { type: "integer", nullable: true, example: 1744000000 },
        },
      },
      Game: {
        type: "object",
        properties: {
          matchId: { type: "string", nullable: true },
          variant: { type: "string", nullable: true, example: "international" },
          ruleset: { type: "string", nullable: true, example: "classic" },
          rated: { type: "boolean", example: true },
          result: {
            type: "string",
            nullable: true,
            enum: ["win", "loss", "draw"],
            description: "From the perspective of the requested player.",
          },
          color: { type: "string", enum: ["white", "black"] },
          opponent: {
            type: "object",
            properties: {
              robloxUserId: { type: "integer", nullable: true },
              displayName: { type: "string", nullable: true },
            },
          },
          ratingBucket: { type: "string", nullable: true },
          startedAtUnix: { type: "integer", nullable: true },
          endedAtUnix: { type: "integer", nullable: true },
          durationSec: { type: "integer", nullable: true },
          tournamentId: { type: "string", nullable: true },
        },
      },
      LessonProgressItem: {
        type: "object",
        properties: {
          bookId: { type: "string" },
          lessonId: { type: "string" },
          completedSteps: { type: "integer" },
          totalSteps: { type: "integer", nullable: true },
          lastPlayedAtUnix: { type: "integer", nullable: true },
        },
      },
      TournamentResult: {
        type: "object",
        properties: {
          tournamentId: { type: "string", nullable: true },
          name: { type: "string", nullable: true },
          variantId: { type: "string", nullable: true },
          status: { type: "string", nullable: true },
          rank: { type: "integer", nullable: true },
          points: { type: "number", nullable: true },
          wins: { type: "integer", nullable: true },
          draws: { type: "integer", nullable: true },
          losses: { type: "integer", nullable: true },
          gamesPlayed: { type: "integer", nullable: true },
          endedAtUnix: { type: "integer", nullable: true },
        },
      },
      AdminTournament: {
        type: "object",
        properties: {
          tournamentId: { type: "string", example: "tour_2026_nh_01" },
          title: { type: "string", example: "Noord-Holland Basisschool Damtoernooi 2026" },
          countryId: { type: "string", example: "nl" },
          organizerEntityId: { type: "string", nullable: true },
          mode: { type: "string", enum: ["virtual", "physical"], example: "virtual" },
          categories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                categoryId: { type: "string", example: "pupillen" },
                teamSize: { type: "integer", example: 4 },
              },
            },
          },
          schedule: {
            type: "array",
            items: {
              type: "object",
              properties: {
                playMomentId: { type: "string" },
                date: { type: "string", example: "2026-06-06" },
                startTime: { type: "string", example: "10:00" },
                endTime: { type: "string", example: "16:00" },
              },
            },
          },
          location: { type: "string", nullable: true },
          associatedClubId: { type: "string", nullable: true },
          volunteerIds: { type: "array", items: { type: "string" } },
          status: {
            type: "string",
            enum: ["draft", "published", "active", "completed", "cancelled"],
            example: "draft",
          },
          createdAtUnix: { type: "integer" },
          updatedAtUnix: { type: "integer" },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean", example: false },
          error: { type: "string", example: "MISSING_ROBLOX_USER_ID" },
        },
      },
    },
  },
  paths: {
    "/players/register": {
      post: {
        summary: "Pre-register a player by known robloxUserId",
        description:
          "Call this when a parent supplies their child's Roblox user id during registration. " +
          "A shadow player record is created immediately. When the child logs in to Roblox for " +
          "the first time, the record is automatically promoted to `active`. " +
          "If the player already exists, `childRef` is linked to the existing record.",
        operationId: "registerPlayer",
        tags: ["Identity"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["robloxUserId", "childRef"],
                properties: {
                  robloxUserId: {
                    type: "integer",
                    description: "Roblox numeric user id of the child.",
                    example: 123456789,
                  },
                  childRef: {
                    type: "string",
                    description: "Your internal child identifier (childId from your system).",
                    example: "child_001",
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "New player record created (pre_registered).",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    created: { type: "boolean", example: true },
                    player: { $ref: "#/components/schemas/PlayerProfile" },
                  },
                },
              },
            },
          },
          "200": {
            description: "Player already existed — childRef linked to existing record.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    created: { type: "boolean", example: false },
                    player: { $ref: "#/components/schemas/PlayerProfile" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing or invalid fields.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Invalid or missing admin API key.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/by-child/{childRef}": {
      get: {
        summary: "Look up a player by your childRef",
        description:
          "Returns the player linked to this childRef, or `found: false` if no record exists. " +
          "Never returns 404 for a valid childRef — use the `found` flag instead.",
        operationId: "getByChildRef",
        tags: ["Identity"],
        parameters: [
          { name: "childRef", in: "path", required: true, schema: { type: "string" }, example: "child_001" },
        ],
        responses: {
          "200": {
            description: "Lookup result.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    found: { type: "boolean" },
                    player: { nullable: true, allOf: [{ $ref: "#/components/schemas/PlayerProfile" }] },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/batch-profiles": {
      post: {
        summary: "Fetch profiles for multiple players at once",
        description:
          "Use this for school dashboards where you need data for all children at once. " +
          "Maximum 200 robloxUserIds per request. Unknown IDs are silently omitted from the response.",
        operationId: "batchProfiles",
        tags: ["Players"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["robloxUserIds"],
                properties: {
                  robloxUserIds: {
                    type: "array",
                    maxItems: 200,
                    items: { type: "integer" },
                    example: [123456789, 987654321, 555000111],
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Array of found player profiles.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean", example: true },
                    players: { type: "array", items: { $ref: "#/components/schemas/PlayerProfile" } },
                  },
                },
              },
            },
          },
          "400": { description: "Missing or invalid input.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/profile": {
      get: {
        summary: "Get full profile for one player",
        description:
          "Returns profile including ratings, stats, badges. Works for both `pre_registered` " +
          "and `active` players — pre-registered players return null username/displayName and zero stats.",
        operationId: "getProfile",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, description: "robloxUserId", schema: { type: "integer" }, example: 123456789 },
        ],
        responses: {
          "200": {
            description: "Player profile.",
            content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, player: { $ref: "#/components/schemas/PlayerProfile" } } } } },
          },
          "404": { description: "Player not found (robloxUserId completely unknown).", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/games": {
      get: {
        summary: "Recent games for a player",
        description: "Returns completed matches, result from the perspective of the requested player.",
        operationId: "getGames",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "integer" }, example: 123456789 },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
        ],
        responses: {
          "200": { description: "List of games.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, games: { type: "array", items: { $ref: "#/components/schemas/Game" } } } } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/lessons/summary": {
      get: {
        summary: "Lesson progress summary",
        description: "Books started/completed, lessons started/completed, and 10 most recent lesson progress records.",
        operationId: "getLessonSummary",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "integer" }, example: 123456789 },
        ],
        responses: {
          "200": {
            description: "Lesson summary.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    booksStarted: { type: "integer" },
                    lessonsStarted: { type: "integer" },
                    lessonsCompleted: { type: "integer" },
                    recentProgress: { type: "array", items: { $ref: "#/components/schemas/LessonProgressItem" } },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/puzzles/summary": {
      get: {
        summary: "Puzzle stats summary",
        description: "Global puzzle rating, solved/attempted totals, streaks, per-variant breakdown.",
        operationId: "getPuzzleSummary",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "integer" }, example: 123456789 },
        ],
        responses: {
          "200": {
            description: "Puzzle summary.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    rating: { type: "object", properties: { value: { type: "number" }, deviation: { type: "number" }, scope: { type: "string" } } },
                    totals: { type: "object", properties: { solved: { type: "integer" }, attempted: { type: "integer" }, hintsUsed: { type: "integer" } } },
                    streaks: { type: "object", properties: { current: { type: "integer" }, best: { type: "integer" } } },
                    lastActivityAt: { type: "integer", nullable: true },
                    byVariant: { type: "object", additionalProperties: { type: "object" } },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/tournaments": {
      get: {
        summary: "Tournament history for a player",
        operationId: "getTournaments",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "integer" }, example: 123456789 },
          { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 50 } },
        ],
        responses: {
          "200": { description: "Tournament list.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, tournaments: { type: "array", items: { $ref: "#/components/schemas/TournamentResult" } } } } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/players/{userId}/badges": {
      get: {
        summary: "Badges earned by a player",
        operationId: "getBadges",
        tags: ["Players"],
        parameters: [
          { name: "userId", in: "path", required: true, schema: { type: "integer" }, example: 123456789 },
        ],
        responses: {
          "200": { description: "Badge list.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, badges: { type: "array", items: { type: "object" } } } } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/tournaments": {
      post: {
        summary: "Create a tournament (admin side)",
        description:
          "Creates a tournament record in the `admin_tournaments` collection. " +
          "Optionally supply your own `tournamentId`; if omitted, a UUID is generated.",
        operationId: "createTournament",
        tags: ["Tournaments"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["title", "countryId"],
                properties: {
                  tournamentId: { type: "string", description: "Optional — omit to auto-generate." },
                  title: { type: "string", example: "Noord-Holland Basisschool Damtoernooi 2026" },
                  countryId: { type: "string", example: "nl" },
                  organizerEntityId: { type: "string", nullable: true },
                  mode: { type: "string", enum: ["virtual", "physical"], default: "virtual" },
                  categories: { type: "array", items: { type: "object", properties: { categoryId: { type: "string" }, teamSize: { type: "integer" } } } },
                  schedule: { type: "array", items: { type: "object", properties: { playMomentId: { type: "string" }, date: { type: "string" }, startTime: { type: "string" }, endTime: { type: "string" } } } },
                  location: { type: "string", nullable: true },
                  associatedClubId: { type: "string", nullable: true },
                  volunteerIds: { type: "array", items: { type: "string" } },
                  status: { type: "string", default: "draft" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Tournament created.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, tournament: { $ref: "#/components/schemas/AdminTournament" } } } } } },
          "400": { description: "Missing required fields.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "409": { description: "tournamentId already exists.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      get: {
        summary: "List tournaments",
        operationId: "listTournaments",
        tags: ["Tournaments"],
        parameters: [
          { name: "countryId", in: "query", schema: { type: "string" }, example: "nl" },
          { name: "status", in: "query", schema: { type: "string" }, example: "draft" },
          { name: "limit", in: "query", schema: { type: "integer", default: 50, maximum: 100 } },
        ],
        responses: {
          "200": { description: "List of tournaments.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, tournaments: { type: "array", items: { $ref: "#/components/schemas/AdminTournament" } } } } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
    "/tournaments/{tournamentId}": {
      get: {
        summary: "Get one tournament",
        operationId: "getTournament",
        tags: ["Tournaments"],
        parameters: [
          { name: "tournamentId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Tournament found.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, tournament: { $ref: "#/components/schemas/AdminTournament" } } } } } },
          "404": { description: "Not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
      patch: {
        summary: "Update tournament fields",
        description: "Send only the fields you want to change. Updatable fields: `title`, `status`, `mode`, `categories`, `schedule`, `location`, `associatedClubId`, `volunteerIds`, `organizerEntityId`.",
        operationId: "patchTournament",
        tags: ["Tournaments"],
        parameters: [
          { name: "tournamentId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { status: { type: "string" }, title: { type: "string" }, mode: { type: "string" }, categories: { type: "array", items: { type: "object" } }, schedule: { type: "array", items: { type: "object" } } } } } },
        },
        responses: {
          "200": { description: "Tournament updated.", content: { "application/json": { schema: { type: "object", properties: { ok: { type: "boolean" }, tournament: { $ref: "#/components/schemas/AdminTournament" } } } } } },
          "404": { description: "Not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          "401": { description: "Unauthorized.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
        },
      },
    },
  },
  tags: [
    { name: "Identity", description: "Pre-registration and child↔player linking" },
    { name: "Players", description: "Per-player read endpoints for dashboards" },
    { name: "Tournaments", description: "Admin-side tournament management" },
  ],
};
