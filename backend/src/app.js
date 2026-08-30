import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { checkDatabase } from './database/connection.js';
import { ok } from './middleware/api-response.js';
import { asyncHandler } from './middleware/async-handler.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { maintenanceRoutes } from './modules/maintenance/maintenance.routes.js';
import { networkRoutes } from './modules/network/network.routes.js';
import { operationsRoutes } from './modules/operations/operations.routes.js';
import { plansRoutes, planningRoutes } from './modules/planning/planning.routes.js';
import { sourcesRoutes } from './modules/sources/sources.routes.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.frontendOrigin }));
  app.use(express.json({ limit: '2mb' }));

  const api = express.Router();

  api.get(
    '/health',
    asyncHandler(async (req, res) => {
      const database = await checkDatabase();

      return ok(
        res,
        {
          status: database.connected ? 'ok' : 'degraded',
          database: database.connected ? 'connected' : 'disconnected',
          databaseError: database.error,
          dataOrigin: 'SYNTHETIC',
          notice: 'Synthetic demonstration data - not Indian Railways production data.',
        },
        null,
        database.connected ? 200 : 503,
      );
    }),
  );

  api.use('/sources', sourcesRoutes);
  api.use('/maintenance', maintenanceRoutes);
  api.use('/operations', operationsRoutes);
  api.use('/planning', planningRoutes);
  api.use('/plans', plansRoutes);
  // Network endpoints sit at the API root: /corridors, /sections.
  api.use('/', networkRoutes);

  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
