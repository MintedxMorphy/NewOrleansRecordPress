import fs from 'node:fs';
import path from 'node:path';

function readEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

readEnvLocal();

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.env.SHIPMENT_TRACKING_DRY_RUN === 'true';
  const inbox = argValue('--inbox');
  const backfill = argValue('--backfill');
  const lookbackHours = argValue('--lookback-hours');

  const { runShipmentTrackingPipeline } = await import('../lib/shipment-pipeline');

  const result = await runShipmentTrackingPipeline({
    dryRun,
    inbox,
    backfillDays: backfill ? Number(backfill) : undefined,
    lookbackHours: lookbackHours ? Number(lookbackHours) : undefined,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
