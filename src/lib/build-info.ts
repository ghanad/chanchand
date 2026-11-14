export interface BuildInfo {
  version: string;
  commit: string | null;
  builtAt: string | null;
}

export interface BuildInfoInput {
  version?: string | null;
  commit?: string | null;
  builtAt?: string | null;
}

const SHORT_COMMIT_LENGTH = 7;
const VERSION_PREFIX = /^v/i;
const HEX_COMMIT = /^[0-9a-f]{7,40}$/i;

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function resolveBuildInfo(input: BuildInfoInput): BuildInfo | null {
  const version = clean(input.version)?.replace(VERSION_PREFIX, "");
  if (!version) return null;

  const commit = clean(input.commit);

  return {
    version,
    commit:
      commit && HEX_COMMIT.test(commit)
        ? commit.slice(0, SHORT_COMMIT_LENGTH)
        : commit,
    builtAt: clean(input.builtAt),
  };
}

export function getClientBuildInfo(): BuildInfo | null {
  return resolveBuildInfo({
    version: process.env.NEXT_PUBLIC_APP_VERSION,
    commit: process.env.NEXT_PUBLIC_APP_COMMIT,
    builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT,
  });
}

export function formatBuildInfoCopyText(info: BuildInfo): string {
  const parts = [`chanchand v${info.version}`];
  if (info.commit) parts.push(`(${info.commit})`);
  if (info.builtAt) parts.push(`built ${info.builtAt}`);
  return parts.join(" ");
}
