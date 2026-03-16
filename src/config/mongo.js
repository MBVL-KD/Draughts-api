import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "./env.js";

let client;
let db;

export async function connectMongo() {
  if (db) return db;
  if (!env.mongoUri) {
    throw new Error("Missing MONGODB_URI");
  }

  client = new MongoClient(env.mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  db = client.db(env.mongoDbName);
  return db;
}

export function getDb() {
  if (!db) {
    throw new Error("Mongo not connected yet");
  }
  return db;
}
