import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as controller from './network.controller.js';

export const networkRoutes = Router();

networkRoutes.get('/corridors', asyncHandler(controller.listCorridors));
networkRoutes.get('/corridors/:id/sections', asyncHandler(controller.listSectionsForCorridor));
networkRoutes.get('/sections', asyncHandler(controller.listSections));
networkRoutes.get('/sections/:id', asyncHandler(controller.getSection));
