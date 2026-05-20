import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface BuildInfo {
  commit: string;
  branch: string;
  version: string;
  nodeEnv: string;
  builtAt: string | null;
}

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function readDistStamp(): { commit?: string; branch?: string; builtAt?: string } | null {
  const stampPath = path.join(REPO_ROOT, "dist", "build-stamp.json");
  if (!existsSync(stampPath)) return null;
  try {
    return JSON.parse(readFileSync(stampPath, "utf8")) as {
      commit?: string;
      branch?: string;
      builtAt?: string;
    };
  } catch {
    return null;
  }
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")
    ) as { version?: string };
    return pkg.version?.trim() || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function shortRef(value: string | undefined | null, len = 7): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim();
  if (!t || t === "unknown") return null;
  return t.length > len ? t.slice(0, len) : t;
}

/** Resolve deploy / build identity for release logging and health checks. */
export function getBuildInfo(): BuildInfo {
  const stamp = readDistStamp();
  const commit =
    shortRef(process.env.RENDER_GIT_COMMIT) ||
    shortRef(process.env.COMMIT_SHA) ||
    shortRef(process.env.GIT_COMMIT) ||
    shortRef(stamp?.commit) ||
    "unknown";
  const branch =
    process.env.RENDER_GIT_BRANCH?.trim() ||
    process.env.BRANCH_NAME?.trim() ||
    stamp?.branch?.trim() ||
    "unknown";

  return {
    commit,
    branch,
    version: readPackageVersion(),
    nodeEnv: process.env.NODE_ENV?.trim() || "development",
    builtAt: stamp?.builtAt ?? null,
  };
}

export function formatBuildLabel(info: BuildInfo): string {
  const branchPart =
    info.branch && info.branch !== "unknown" ? ` on branch ${info.branch}` : "";
  return `build ${info.commit}${branchPart}`;
}
