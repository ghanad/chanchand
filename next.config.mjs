/** @type {import('next').NextConfig} */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    );
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function readGitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

const buildInfo = {
  NEXT_PUBLIC_APP_VERSION: readPackageVersion(),
  NEXT_PUBLIC_APP_COMMIT: process.env.APP_COMMIT || readGitCommit(),
  NEXT_PUBLIC_APP_BUILT_AT: process.env.APP_BUILT_AT || new Date().toISOString(),
};

const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  env: buildInfo,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
        ],
      },
    ];
  },
};

export default nextConfig;
