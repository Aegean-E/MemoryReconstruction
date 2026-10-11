/**
 * RLM Compatibility Validator
 * Checks that all modules implement IGameModule contract
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = 'src';

function findTSFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTSFiles(full));
    } else if (entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

const files = findTSFiles(SRC_ROOT);
let ok = true;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  if (content.includes('implements IGameModule')) {
    const hasTokenBudget = /readonly tokenBudget\s*=/.test(content);
    const hasSerialize = /serialize\(\):/.test(content);
    const hasDeserialize = /deserialize\(/.test(content);
    const hasInitialize = /initialize\(context/.test(content);
    const hasUpdate = /update\(deltaTime/.test(content);
    const hasShutdown = /shutdown\(\):/.test(content);

    if (!(hasTokenBudget && hasSerialize && hasDeserialize && hasInitialize && hasUpdate && hasShutdown)) {
      console.error(`RLM INCOMPLETE: ${file}`);
      console.error({ hasTokenBudget, hasSerialize, hasDeserialize, hasInitialize, hasUpdate, hasShutdown });
      ok = false;
    } else {
      console.log(`RLM OK: ${file}`);
    }
  }
}

if (ok) {
  console.log('All modules are RLM compatible');
  process.exit(0);
} else {
  console.error('RLM compatibility check failed');
  process.exit(1);
}
