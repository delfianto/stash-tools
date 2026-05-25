import type { Config } from "./config.ts";

export type GQLData = Record<string, unknown>;
export type GQLClient = (query: string, variables?: Record<string, unknown>) => Promise<GQLData>;

export function makeClient(cfg: Config): GQLClient {
  return async function callGQL(query, variables = {}) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey) headers["ApiKey"] = cfg.apiKey;

    const resp = await fetch(cfg.graphqlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!resp.ok) {
      throw new Error(`Stash GraphQL request failed: ${resp.status} ${resp.statusText}`);
    }

    const json = (await resp.json()) as { data?: GQLData; errors?: unknown[] };
    if (json.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data ?? {};
  };
}
