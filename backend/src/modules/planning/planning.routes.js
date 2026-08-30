import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as controller from './planning.controller.js';

export const planningRoutes = Router();

planningRoutes.post('/runs', asyncHandler(controller.createRun));
planningRoutes.get('/runs', asyncHandler(controller.listRuns));
planningRoutes.get('/runs/:id', asyncHandler(controller.getRun));
planningRoutes.get('/runs/:id/plans', asyncHandler(controller.getPlansForRun));

/** Mounted at /plans because the problem's API list places these at the root. */
export const plansRoutes = Router();

plansRoutes.get('/compare', asyncHandler(controller.comparePlans));
plansRoutes.get('/:id', asyncHandler(controller.getPlan));
plansRoutes.get('/:id/blocks', asyncHandler(controller.getPlanBlocks));
plansRoutes.get('/:id/unscheduled-tasks', asyncHandler(controller.getUnscheduledTasks));
