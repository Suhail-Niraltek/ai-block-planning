import { ok } from '../../middleware/api-response.js';
import * as service from './network.service.js';

export async function listCorridors(req, res) {
  const corridors = await service.listCorridors();
  return ok(res, corridors);
}

export async function listSectionsForCorridor(req, res) {
  const sections = await service.listSectionsForCorridor(req.params.id);
  return ok(res, sections);
}

export async function listSections(req, res) {
  const sections = await service.listSections();
  return ok(res, sections);
}

export async function getSection(req, res) {
  const section = await service.getSection(req.params.id);
  return ok(res, section);
}
