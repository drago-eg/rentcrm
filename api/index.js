import { createBackendApp } from '../backend/src/app.js';

const app = createBackendApp({ mountNotFound: true });

export default function handler(req, res) {
  if (req.url && !req.url.startsWith('/api')) {
    req.url = req.url === '/' ? '/api' : `/api${req.url.startsWith('/') ? '' : '/'}${req.url}`;
  }
  if (req.readableEnded && req.body !== undefined) {
    req._body = true;
  }
  return app(req, res);
}
