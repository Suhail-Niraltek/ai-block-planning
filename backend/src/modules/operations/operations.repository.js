import { query } from '../../database/connection.js';
import { toMysql } from '../planning/planning.repository.js';

/** Shared time-range and location filtering for every operations query. */
function buildFilters({ corridorColumn, sectionColumn, startColumn, endColumn }, filters) {
  const clauses = [];
  const params = [];

  if (filters.corridorId) {
    clauses.push(`${corridorColumn} = ?`);
    params.push(filters.corridorId);
  }

  if (filters.sectionId && sectionColumn) {
    clauses.push(`${sectionColumn} = ?`);
    params.push(filters.sectionId);
  }

  if (filters.start) {
    clauses.push(`${endColumn} > ?`);
    params.push(toMysql(Date.parse(filters.start)));
  }

  if (filters.end) {
    clauses.push(`${startColumn} < ?`);
    params.push(toMysql(Date.parse(filters.end)));
  }

  return { where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

function limitOf(limit, fallback = 500, ceiling = 5000) {
  return Math.min(Math.max(Number.parseInt(limit, 10) || fallback, 1), ceiling);
}

export function findTrainMovements(filters = {}) {
  const { where, params } = buildFilters(
    {
      corridorColumn: 'sec.corridor_id',
      sectionColumn: 'm.section_id',
      startColumn: 'm.entry_at',
      endColumn: 'm.exit_at',
    },
    filters,
  );

  return query(
    `SELECT m.id, m.train_number AS trainNumber, m.train_type AS trainType,
            m.priority_class AS priorityClass, m.section_id AS sectionId,
            sec.code AS sectionCode, sec.name AS sectionName, cor.code AS corridorCode,
            m.entry_at AS entryAt, m.exit_at AS exitAt, m.protected,
            m.source_type AS sourceType
     FROM train_movements m
     JOIN sections sec ON sec.id = m.section_id
     JOIN corridors cor ON cor.id = sec.corridor_id
     ${where}
     ORDER BY m.entry_at ASC
     LIMIT ${limitOf(filters.limit)}`,
    params,
  );
}

export function findGoodsForecasts(filters = {}) {
  const { where, params } = buildFilters(
    {
      corridorColumn: 'f.corridor_id',
      sectionColumn: null,
      startColumn: 'f.bucket_start',
      endColumn: 'f.bucket_end',
    },
    filters,
  );

  return query(
    `SELECT f.id, f.corridor_id AS corridorId, cor.code AS corridorCode, cor.name AS corridorName,
            f.bucket_start AS bucketStart, f.bucket_end AS bucketEnd,
            f.expected_train_count AS expectedTrainCount, f.lower_count AS lowerCount,
            f.upper_count AS upperCount, f.source_type AS sourceType
     FROM goods_forecasts f
     JOIN corridors cor ON cor.id = f.corridor_id
     ${where}
     ORDER BY f.bucket_start ASC
     LIMIT ${limitOf(filters.limit)}`,
    params,
  );
}

export function findBlockWindows(filters = {}) {
  const { where, params } = buildFilters(
    {
      corridorColumn: 'w.corridor_id',
      sectionColumn: 'w.section_id',
      startColumn: 'w.starts_at',
      endColumn: 'w.ends_at',
    },
    filters,
  );

  return query(
    `SELECT w.id, w.external_id AS externalId, w.corridor_id AS corridorId,
            cor.code AS corridorCode, w.section_id AS sectionId, sec.code AS sectionCode,
            sec.name AS sectionName, w.starts_at AS startsAt, w.ends_at AS endsAt,
            w.available_line_count AS availableLineCount,
            w.power_isolation_available AS powerIsolationAvailable,
            w.signalling_disconnection_available AS signallingDisconnectionAvailable,
            w.confidence, w.status,
            TIMESTAMPDIFF(MINUTE, w.starts_at, w.ends_at) AS durationMinutes
     FROM block_windows w
     JOIN sections sec ON sec.id = w.section_id
     JOIN corridors cor ON cor.id = w.corridor_id
     ${where}
     ORDER BY w.starts_at ASC
     LIMIT ${limitOf(filters.limit)}`,
    params,
  );
}
