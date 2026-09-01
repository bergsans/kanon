import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";

function extract(file: string, name: string): string {
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf("const " + name + " = `");
  const from = text.indexOf("`", start) + 1;
  return text.slice(from, text.indexOf("`;", from));
}

const prompts: [string, string][] = [
  ["frågeexpansion", extract("src/lib/claude.ts", "EXPAND_SYSTEM")],
  ["omrankning", extract("src/lib/claude.ts", "RERANK_SYSTEM")],
  ["översättning", extract("src/lib/translate.ts", "TRANSLATE_SYSTEM")],
];

const client = new Anthropic();
// Two rounds: the first writes the cache (if it's written at all), the second reads it.
for (const varv of [1, 2]) {
  for (const [name, text] of prompts) {
    const res = await client.messages.create({
      model: process.env.CANON_MODEL ?? "claude-sonnet-5",
      max_tokens: 0,
      system: [{ type: "text", text, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "x" }],
    });
    const u = res.usage;
    console.log(
      `varv ${varv}  ${name.padEnd(16)} in ${String(u.input_tokens).padStart(5)}` +
        `  skrivet ${String(u.cache_creation_input_tokens ?? 0).padStart(5)}` +
        `  läst ${String(u.cache_read_input_tokens ?? 0).padStart(5)}`,
    );
  }
}
