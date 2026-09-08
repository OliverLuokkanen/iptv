require('dotenv').config();

const { createConfig } = require('./config');
const { initDatabase } = require('./db');

async function seed() {
  const config = createConfig({ seedSampleData: true });
  const db = await initDatabase(config);
  await db.close();
  console.log(`Seeded database at ${config.databasePath}`);
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
