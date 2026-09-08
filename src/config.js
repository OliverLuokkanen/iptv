const path = require('path');

function toBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'False', 'FALSE'].includes(String(value));
}

function createConfig(overrides = {}) {
  return {
    port: Number(overrides.port ?? process.env.PORT ?? 3000),
    databasePath: path.resolve(
      overrides.databasePath ?? process.env.DATABASE_PATH ?? './data/iptv.sqlite',
    ),
    jwtSecret: overrides.jwtSecret ?? process.env.JWT_SECRET ?? 'development-secret',
    seedSampleData: toBoolean(
      overrides.seedSampleData ?? process.env.SEED_SAMPLE_DATA,
      true,
    ),
    baseUrl: overrides.baseUrl ?? process.env.BASE_URL ?? null,
  };
}

module.exports = {
  createConfig,
};
