import { ApiError } from '../../middleware/api-response.js';
import * as repository from './network.repository.js';

export async function listCorridors() {
  return repository.findAllCorridors();
}

export async function listSectionsForCorridor(corridorId) {
  const corridor = await repository.findCorridorById(corridorId);

  if (!corridor) {
    throw ApiError.notFound(`Corridor ${corridorId} not found`);
  }

  return repository.findSectionsByCorridorId(corridorId);
}

export async function getSection(sectionId) {
  const section = await repository.findSectionById(sectionId);

  if (!section) {
    throw ApiError.notFound(`Section ${sectionId} not found`);
  }

  return section;
}

export async function listSections() {
  return repository.findAllSections();
}
