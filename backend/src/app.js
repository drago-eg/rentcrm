import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { getEnvConfig } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createBackendApp(options = {}) {
  const { mountNotFound = true } = options;
  const app = express();
  const cfg = getEnvConfig();

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin: cfg.corsOrigins === '*' ? true : cfg.corsOrigins,
      credentials: true,
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  app.use('/api', apiRouter);

  if (mountNotFound) {
    app.use('/api', notFoundHandler);
    app.use(notFoundHandler);
    app.use(errorHandler);
  } else {
    app.use('/api', notFoundHandler);
  }

  return app;
}

export { errorHandler };
