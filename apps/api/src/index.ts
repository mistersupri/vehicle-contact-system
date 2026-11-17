import { buildApp } from './server.ts';
import { config, isProd } from './config.ts';
import { startWorker } from './lib/notify.ts';
import { reapStaleCalls } from './lib/calls.ts';

const app = await buildApp();
reapStaleCalls();
startWorker();
await app.listen({ port: config.port, host: config.host });
if (!isProd) console.log(`\n  API siap di http://localhost:${config.port}/api/v1/health\n  (mode pengembangan: email, WhatsApp & Telegram disimulasikan di log)\n`);
const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
