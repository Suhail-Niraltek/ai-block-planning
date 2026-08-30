import { query, queryOne } from '../../database/connection.js';

const CORRIDOR_COLUMNS = `
  id, code, name, description, importance_score AS importanceScore,
  active, created_at AS createdAt, updated_at AS updatedAt
`;

const SECTION_COLUMNS = `
  s.id, s.corridor_id AS corridorId, s.code, s.name,
  s.sequence_number AS sequenceNumber, s.start_km AS startKm, s.end_km AS endKm,
  s.line_type AS lineType, s.electrified, s.active,
  s.created_at AS createdAt, s.updated_at AS updatedAt
`;

export function findAllCorridors() {
  return query(
    `SELECT ${CORRIDOR_COLUMNS} FROM corridors WHERE active = 1 ORDER BY importance_score DESC, code ASC`,
  );
}

export function findCorridorById(id) {
  return queryOne(`SELECT ${CORRIDOR_COLUMNS} FROM corridors WHERE id = ?`, [id]);
}

export function findSectionsByCorridorId(corridorId) {
  return query(
    `SELECT ${SECTION_COLUMNS} FROM sections s WHERE s.corridor_id = ? AND s.active = 1
     ORDER BY s.sequence_number ASC`,
    [corridorId],
  );
}

export function findSectionById(id) {
  return queryOne(
    `SELECT ${SECTION_COLUMNS}, c.code AS corridorCode, c.name AS corridorName,
            c.importance_score AS corridorImportance
     FROM sections s
     JOIN corridors c ON c.id = s.corridor_id
     WHERE s.id = ?`,
    [id],
  );
}

export function findAllSections() {
  return query(
    `SELECT ${SECTION_COLUMNS}, c.code AS corridorCode, c.importance_score AS corridorImportance
     FROM sections s
     JOIN corridors c ON c.id = s.corridor_id
     WHERE s.active = 1
     ORDER BY c.code ASC, s.sequence_number ASC`,
  );
}
