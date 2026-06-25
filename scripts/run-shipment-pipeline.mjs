import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const result = spawnSync('npx', ['--yes', 'tsx', 'scripts/run-shipment-pipeline.ts', ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

process.exit(result.status ?? 1);
