import { Router } from 'express';
import { asyncHandler } from '../../middleware/async-handler.js';
import * as controller from './operations.controller.js';

export const operationsRoutes = Router();

operationsRoutes.get('/train-movements', asyncHandler(controller.listTrainMovements));
operationsRoutes.get('/goods-forecasts', asyncHandler(controller.listGoodsForecasts));
operationsRoutes.get('/block-windows', asyncHandler(controller.listBlockWindows));
