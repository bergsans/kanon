/**
 * Runs once when the server starts. Both models take time to load into memory —
 * the embedding model ~5 s, the cross-encoder ~15 s, plus a download the first
 * time. Without this, the first search pays that entire cost.
 *
 * Neither load is awaited. If one fails it's reloaded on demand, and a search
 * that arrives before it's ready still works: the cross-encoder is then skipped
 * and the candidates stay in fusion order.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const warm = async (label: string, load: () => Promise<unknown>) => {
    try {
      await load();
      console.log(`[canon] ${label} är laddad`);
    } catch (err) {
      console.warn(`[canon] kunde inte förladda ${label}:`, err);
    }
  };

  const [{ warmup: warmEmbed }, rerank] = await Promise.all([
    import("./lib/embed"),
    import("./lib/rerank"),
  ]);

  void warm("embeddingmodellen", warmEmbed);
  if (rerank.ENABLED) void warm(`omrankningsmodellen (${rerank.MODEL_ID})`, rerank.warmup);
}
