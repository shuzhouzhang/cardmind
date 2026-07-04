import fs from "node:fs";
import path from "node:path";

const source = path.resolve("src/db/schema.sql");
const target = path.resolve("dist/db/schema.sql");

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

console.log(`Copied ${source} to ${target}`);
