import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const probes = [
  {
    directory: 'packages/quant/__arch_probe__',
    filename: 'pg-import.mjs',
    rule: 'transport-only-persistence-providers',
    source: "import pg from 'pg'; export default pg;\n",
  },
  {
    directory: 'packages/risk/__arch_probe__',
    filename: 'vercel-import.mjs',
    rule: 'no-vercel-imports',
    source: "import gateway from '@vercel/ai-gateway'; export default gateway;\n",
  },
  {
    directory: 'packages/domain/__arch_probe__',
    filename: 'risk-import.mjs',
    rule: 'domain-no-dependencies',
    source: "import '../../risk/src/index.js';\n",
  },
  {
    directory: 'apps/api/__arch_probe__',
    filename: 'cross-app.mjs',
    rule: 'apps-do-not-import-apps',
    source: "import '../../web/src/index.js';\n",
  },
];

function runArch() {
  return spawnSync('pnpm', ['arch'], { cwd: root, encoding: 'utf8' });
}

const mainSource = await readFile(path.join(root, 'apps/api/src/main.ts'), 'utf8');
if (!/from\s+["']\.\/app\.js["']/.test(mainSource)) {
  throw new Error('Expected apps/api/src/main.ts to import its own app.ts entrypoint.');
}

const baseline = runArch();
if (baseline.status !== 0) {
  process.stderr.write(baseline.stdout ?? '');
  process.stderr.write(baseline.stderr ?? '');
  throw new Error('Clean architecture baseline failed before violation probes.');
}

try {
  for (const probe of probes) {
    const directory = path.join(root, probe.directory);
    const file = path.join(directory, probe.filename);
    await mkdir(directory, { recursive: true });
    try {
      await writeFile(file, probe.source, 'utf8');
      const result = runArch();
      const output = (result.stdout ?? '') + (result.stderr ?? '');
      if (result.status === 0 || !output.includes(probe.rule)) {
        process.stderr.write(output);
        throw new Error(`Expected architecture violation "${probe.rule}" for ${probe.filename}.`);
      }
    } finally {
      await rm(file, { force: true });
      await rm(directory, { recursive: true, force: true });
    }
  }
} finally {
  for (const probe of probes) {
    await rm(path.join(root, probe.directory), { recursive: true, force: true });
  }
}

process.stdout.write(
  'Architecture policy proof passed: clean graph accepted; all four forbidden imports rejected.\n',
);
