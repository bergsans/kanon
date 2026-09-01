/** Which modern classics are already in Gutenberg's catalog? */
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR } from "../src/lib/db";

const NAMES = [
  "Weber, Max", "Durkheim", "Simmel, Georg", "Mauss, Marcel", "Saussure",
  "Veblen, Thorstein", "Luxemburg, Rosa", "Lenin", "Trotsky", "Gramsci",
  "Benjamin, Walter", "Weil, Simone", "Husserl", "Wittgenstein", "Du Bois",
  "Kautsky", "Bernstein, Eduard", "Plekhanov", "Sorel, Georges", "Pareto",
  "Bergson, Henri", "Cassirer", "Ortega y Gasset", "Mariátegui", "Sombart",
  "Tönnies", "Mannheim", "Lévy-Bruhl", "Bogdanov", "Goldman, Emma",
];

const csv = fs.readFileSync(path.join(CACHE_DIR, "pg_catalog.csv"), "utf8");
const lines = csv.split("\n");

for (const name of NAMES) {
  const hits = lines.filter((l) => l.includes(name) && /,en,/.test(l));
  const titles = hits
    .map((l) => {
      const id = /^(\d+)/.exec(l)?.[1];
      const m = /"?([^",]{6,60})/.exec(l.slice(l.indexOf(",Text,") + 6));
      return id && m ? `${id} ${m[1].replace(/\s+/g, " ").trim()}` : null;
    })
    .filter(Boolean);
  console.log(
    `${name.padEnd(20)} ${String(hits.length).padStart(3)} poster  ${titles.slice(0, 3).join(" | ").slice(0, 96)}`,
  );
}
