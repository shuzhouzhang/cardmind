import { createApp } from "./app.js";
import { initializeDatabase } from "./db/database.js";
import { CardMindRepository } from "./repositories.js";

const port = Number(process.env.PORT ?? 4000);
const db = initializeDatabase();
const repository = new CardMindRepository(db);
const app = createApp(repository);

app.listen(port, () => {
  console.log(`CardMind API listening on http://127.0.0.1:${port}`);
});
