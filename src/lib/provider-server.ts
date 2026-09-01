/**
 * The model choice, read from the cookie. Same split as `i18n-server.ts`,
 * for the same reason: `next/headers` only exists on the server.
 */

import { cookies } from "next/headers";
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  EFFORT_COOKIE,
  isEffort,
  isModelId,
  PROVIDER_COOKIE,
  type Effort,
  type ModelId,
} from "./provider";

export async function getProvider(): Promise<ModelId> {
  const value = (await cookies()).get(PROVIDER_COOKIE)?.value;
  return isModelId(value) ? value : DEFAULT_MODEL;
}

/** The reranking effort, read the same way as the model choice above. */
export async function getEffort(): Promise<Effort> {
  const value = (await cookies()).get(EFFORT_COOKIE)?.value;
  return isEffort(value) ? value : DEFAULT_EFFORT;
}
