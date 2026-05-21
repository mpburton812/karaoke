import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const authPath = path.join(root, "src", "api", "auth.ts");
const marker = "export async function changeUsername";

let text = fs.readFileSync(authPath, "utf8");
const first = text.indexOf(marker);
const second = text.indexOf(marker, first + marker.length);

if (second === -1) {
  process.exit(0);
}

const fixed = `${text.slice(0, second).trimEnd()}\n`;
fs.writeFileSync(authPath, fixed, "utf8");
console.warn(
  "[dedupe-auth-export] Removed duplicate changeUsername from src/api/auth.ts — save conflicts can reintroduce it; prefer git restore src/api/auth.ts"
);
