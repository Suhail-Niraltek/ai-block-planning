import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as controller from './sources.controller.js';

export const sourcesRoutes = Router();

sourcesRoutes.get('/', asyncHandler(controller.listSources));
sourcesRoutes.get('/sync-runs', asyncHandler(controller.listSyncRuns));
sourcesRoutes.get('/sync-runs/:id', asyncHandler(controller.getSyncRun));
sourcesRoutes.post('/sync-all', asyncHandler(controller.syncAllSources));
sourcesRoutes.post('/:code/sync', asyncHandler(controller.syncSource));
