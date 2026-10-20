import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { ConfigSchemas } from '@core/ConfigManager';

const configs = {
  graphics: ConfigSchemas.graphics,
  audio: ConfigSchemas.audio,
  gameplay: ConfigSchemas.gameplay,
  ai: ConfigSchemas.ai,
};

describe('Shipped configuration', () => {
  for (const [name, schema] of Object.entries(configs)) {
    it(`accepts assets/data/${name}.config.json`, () => {
      const file = path.resolve(__dirname, `../assets/data/${name}.config.json`);
      const config = JSON.parse(readFileSync(file, 'utf-8'));

      expect(schema.safeParse(config).success).toBe(true);
    });
  }
});
