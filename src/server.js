require('dotenv').config();

const { createApp } = require('./app');
const { createConfig } = require('./config');

async function start() {
  const config = createConfig();
  const app = await createApp(config);

  app.listen(config.port, () => {
    console.log(`IPTV backend listening on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
