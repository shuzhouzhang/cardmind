import { getDatabasePath, initializeDatabase } from "./database.js";

const db = initializeDatabase();
db.close();

console.log(`CardMind SQLite database initialized at ${getDatabasePath()}`);
