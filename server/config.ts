import { z } from "zod";

const jsonMap = z
  .string()
  .default("{}")
  .transform((s) => {
    try {
      return JSON.parse(s) as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  });

const schema = z.object({
  // Stash connection
  STASH_SCHEME: z.string().default("http"),
  STASH_HOST: z.string().default("localhost"),
  STASH_PORT: z.coerce.number().int().positive().default(9999),
  STASH_API_KEY: z.string().optional(),
  STASH_API_KEY_DB: z.string().optional(),
  STASH_DB_ENDPOINT: z.string().url().default("https://stashdb.org/graphql"),

  // Tagger
  STASH_TAG_RULES_FILE: z.string().default("./rules/scene.json"),
  STASH_PERFORMER_RULES_FILE: z.string().default("./rules/performer.json"),

  // Renamer
  RENAMER_SOURCE: z.string().default(""),
  RENAMER_DEST: z.string().default(""),
  RENAMER_PATH_MAP: jsonMap,
  RENAMER_DIR_STRUCTURE: z.string().default("{studio_or_parent}"),
  RENAMER_FILE_STRUCTURE: z.string().default("{studio} - {date} - {performers} - {title}"),
  RENAMER_DOTS: z
    .string()
    .default("false")
    .transform((s) => s === "true"),
  RENAMER_DATE_FORMAT: z.string().default("%y.%m.%d"),
});

const env = schema.parse(process.env);

export const config = {
  // Stash connection
  scheme: env.STASH_SCHEME,
  tagRulesFile: env.STASH_TAG_RULES_FILE,
  performerRulesFile: env.STASH_PERFORMER_RULES_FILE,
  host: env.STASH_HOST,
  port: env.STASH_PORT,
  apiKey: env.STASH_API_KEY,
  apiKeyDb: env.STASH_API_KEY_DB,
  dbEndpoint: env.STASH_DB_ENDPOINT,

  // Renamer
  renamer: {
    source: env.RENAMER_SOURCE,
    dest: env.RENAMER_DEST,
    pathMap: env.RENAMER_PATH_MAP,
    dirStructure: env.RENAMER_DIR_STRUCTURE,
    fileStructure: env.RENAMER_FILE_STRUCTURE,
    dots: env.RENAMER_DOTS,
    dateFormat: env.RENAMER_DATE_FORMAT,
  },

  get graphqlUrl(): string {
    return `${this.scheme}://${this.host}:${this.port}/graphql`;
  },
  get baseUrl(): string {
    return `${this.scheme}://${this.host}:${this.port}`;
  },
  get dbBaseUrl(): string {
    return this.dbEndpoint.replace(/\/graphql$/, "");
  },
};

export type Config = typeof config;
