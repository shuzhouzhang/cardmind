import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDataDir = path.resolve(process.cwd(), "data");
const defaultDatabasePath = path.join(defaultDataDir, "cardmind.sqlite");

export function getDatabasePath() {
  return process.env.CARDMIND_DB_PATH ?? defaultDatabasePath;
}

export function openDatabase() {
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  return db;
}

export function initializeDatabase(db = openDatabase()) {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  db.exec(schema);
  return db;
}
