import path from "node:path";
import { makeClient, type GQLClient } from "./client.ts";
import { strftime } from "./utils/strftime.ts";
import { safeMove } from "./utils/move.ts";
import type { Config } from "./config.ts";
import type { Candidate, MoveResult } from "@shared/types";
import pino from "pino";

const log = pino({ name: "renamer" });

const MEDIA_EXTENSIONS = new Set([".mp4", ".mkv", ".avi", ".mov", ".wmv"]);

const QUERY_SCENE_BY_PATH = `
query FindSceneByPath($path: String!) {
  findScenes(
    scene_filter: {
      path: { value: $path, modifier: EQUALS }
    }
  ) {
    scenes {
      id
      title
      date
      studio { name parent_studio { name } }
      performers { name }
      files { path }
    }
  }
}
`;

interface StashScene {
  id: string | number;
  title?: string;
  date?: string;
  studio?: { name?: string; parent_studio?: { name?: string } } | null;
  performers?: Array<{ name: string }>;
}

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export class StashRenamer {
  private callGQL: GQLClient;

  constructor(private readonly config: Config) {
    this.callGQL = makeClient(config);
  }

  get sourceDir(): string {
    return this.config.renamer.source;
  }

  get destRoot(): string {
    return this.config.renamer.dest;
  }

  private toStashPath(localPath: string): string {
    for (const [dockerPrefix, hostPrefix] of Object.entries(this.config.renamer.pathMap)) {
      if (localPath.startsWith(hostPrefix)) {
        return dockerPrefix + localPath.slice(hostPrefix.length);
      }
    }
    return localPath;
  }

  private sanitize(text: string | null | undefined, dots: boolean): string {
    if (!text) return "";
    const cleaned = text.replace(/[\\/*?:"<>|]/g, "").trim();
    return dots ? cleaned.replace(/ /g, ".") : cleaned;
  }

  private computeNames(
    scene: StashScene,
    filePath: string,
  ): { subDir: string; filename: string } | null {
    const r = this.config.renamer;
    const dots = r.dots;
    const san = (t: string | null | undefined) => this.sanitize(t, dots);
    const ext = path.extname(filePath);

    let dateStr = "0000.00.00";
    if (scene.date) {
      try {
        // Append time to avoid UTC-offset date shifts
        dateStr = strftime(r.dateFormat, new Date(scene.date + "T00:00:00"));
      } catch {
        dateStr = scene.date;
      }
    }

    const studio = scene.studio ?? null;
    const studioName = studio?.name ?? "";
    const parentName = studio?.parent_studio?.name ?? "";
    const folderStudio = parentName || studioName;

    if (!folderStudio) return null;

    const performers = (scene.performers ?? []).map((p) => p.name).sort();
    const perfStr = performers.length ? performers.join(", ") : "Unknown";

    const vars: Record<string, string> = {
      title: san(scene.title ?? "Unknown"),
      date: dateStr,
      studio: san(studioName),
      parent_studio: san(parentName),
      studio_or_parent: san(folderStudio),
      performers: san(perfStr),
      performers_first: san(performers[0] ?? "Unknown"),
      ext,
    };

    const subDir = applyTemplate(r.dirStructure, vars);
    const filename = applyTemplate(r.fileStructure, vars) + ext;
    return { subDir, filename };
  }

  async lookupScene(filePath: string): Promise<StashScene | null> {
    const stashPath = this.toStashPath(filePath);
    log.debug({ stashPath }, "lookup");

    const data = await this.callGQL(QUERY_SCENE_BY_PATH, { path: stashPath });
    const scenes = (data["findScenes"] as { scenes?: StashScene[] })?.scenes ?? [];

    if (scenes.length === 1) return scenes[0]!;
    if (scenes.length > 1) {
      log.warn({ file: path.basename(filePath), count: scenes.length }, "ambiguous_match");
      return null;
    }
    return null;
  }

  async scan(): Promise<Candidate[]> {
    const glob = new Bun.Glob("**/*");
    const candidates: Candidate[] = [];
    let fileCount = 0;

    for await (const rel of glob.scan({ cwd: this.sourceDir, onlyFiles: true })) {
      const filePath = path.join(this.sourceDir, rel);
      const ext = path.extname(filePath).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) continue;
      fileCount++;

      const scene = await this.lookupScene(filePath);
      if (!scene) continue;

      const names = this.computeNames(scene, filePath);
      if (!names) {
        log.warn({ file: filePath, sceneId: scene.id }, "skip_missing_studio");
        continue;
      }

      const { subDir, filename } = names;
      candidates.push({
        currentPath: filePath,
        renameTarget: path.join(path.dirname(filePath), filename),
        organizeTarget: path.join(this.destRoot, subDir, filename),
        sceneId: String(scene.id),
        sceneTitle: scene.title ?? "Unknown",
        studio: scene.studio?.name ?? "",
        performers: (scene.performers ?? []).map((p) => p.name).sort(),
        date: scene.date ?? "",
      });
    }

    log.info({ files: fileCount, candidates: candidates.length }, "scan_done");
    return candidates;
  }

  async executeMoves(
    candidates: Candidate[],
    mode: "organize" | "rename",
    dryRun = false,
  ): Promise<MoveResult[]> {
    const results: MoveResult[] = [];

    for (const c of candidates) {
      const dst = mode === "rename" ? c.renameTarget : c.organizeTarget;
      if (c.currentPath === dst) continue;

      if (dryRun) {
        log.info({ src: path.basename(c.currentPath), dst }, "dry_run");
        results.push({ src: c.currentPath, dst, ok: true, error: "", dryRun: true });
        continue;
      }

      try {
        await safeMove(c.currentPath, dst);
        log.info({ src: path.basename(c.currentPath), dst }, "moved");
        results.push({ src: c.currentPath, dst, ok: true, error: "", dryRun: false });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ src: c.currentPath, error: msg }, "move_failed");
        results.push({ src: c.currentPath, dst, ok: false, error: msg, dryRun: false });
      }
    }

    return results;
  }
}
