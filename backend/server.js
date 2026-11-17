import { getEnvConfig } from './src/config/env.js';
import { createBackendApp } from './src/app.js';

const cfg = getEnvConfig();
const app = createBackendApp({ mountNotFound: true });

app.listen(cfg.port, '0.0.0.0', () => {
  console.log(`RENTAL GATE CRM Backend listening on http://0.0.0.0:${cfg.port}`);
});
