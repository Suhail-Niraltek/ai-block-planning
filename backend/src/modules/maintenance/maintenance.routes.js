import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as controller from './maintenance.controller.js';

export const maintenanceRoutes = Router();

maintenanceRoutes.get('/summary', asyncHandler(controller.getSummary));
maintenanceRoutes.post('/recalculate-priorities', asyncHandler(controller.recalculatePriorities));
maintenanceRoutes.get('/tasks', asyncHandler(controller.listTasks));
maintenanceRoutes.get('/tasks/:id', asyncHandler(controller.getTask));
