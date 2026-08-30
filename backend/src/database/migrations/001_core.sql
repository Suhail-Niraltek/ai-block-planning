-- Core: integration sources and the railway network.

CREATE TABLE IF NOT EXISTS source_systems (
  id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  adapter_type ENUM('MOCK','JSON','REST') NOT NULL DEFAULT 'MOCK',
  last_sync_at DATETIME(3) NULL,
  last_sync_status ENUM('NEVER','RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'NEVER',
  record_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_source_systems_code (code),
  KEY ix_source_systems_last_sync_at (last_sync_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sync_runs (
  id CHAR(36) NOT NULL,
  source_system_id CHAR(36) NOT NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  status ENUM('RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'RUNNING',
  received_count INT UNSIGNED NOT NULL DEFAULT 0,
  accepted_count INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_sync_runs_source (source_system_id),
  KEY ix_sync_runs_started_at (started_at),
  KEY ix_sync_runs_status (status),
  CONSTRAINT fk_sync_runs_source FOREIGN KEY (source_system_id)
    REFERENCES source_systems (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS corridors (
  id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  importance_score TINYINT UNSIGNED NOT NULL DEFAULT 3,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_corridors_code (code),
  KEY ix_corridors_active (active),
  KEY ix_corridors_importance (importance_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sections (
  id CHAR(36) NOT NULL,
  corridor_id CHAR(36) NOT NULL,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  sequence_number SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  start_km DECIMAL(8,3) NOT NULL DEFAULT 0,
  end_km DECIMAL(8,3) NOT NULL DEFAULT 0,
  line_type ENUM('SINGLE','DOUBLE','MULTIPLE') NOT NULL DEFAULT 'DOUBLE',
  electrified TINYINT(1) NOT NULL DEFAULT 1,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sections_code (code),
  KEY ix_sections_corridor (corridor_id),
  KEY ix_sections_active (active),
  KEY ix_sections_sequence (corridor_id, sequence_number),
  CONSTRAINT fk_sections_corridor FOREIGN KEY (corridor_id)
    REFERENCES corridors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS assets (
  id CHAR(36) NOT NULL,
  source_system_id CHAR(36) NOT NULL,
  external_id VARCHAR(96) NOT NULL,
  section_id CHAR(36) NOT NULL,
  department ENUM('ENG','TRD','SNT') NOT NULL,
  asset_type VARCHAR(64) NOT NULL,
  asset_code VARCHAR(96) NOT NULL,
  name VARCHAR(160) NOT NULL,
  km_from DECIMAL(8,3) NULL,
  km_to DECIMAL(8,3) NULL,
  criticality TINYINT UNSIGNED NOT NULL DEFAULT 3,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assets_source_external (source_system_id, external_id),
  KEY ix_assets_section (section_id),
  KEY ix_assets_department (department),
  KEY ix_assets_criticality (criticality),
  KEY ix_assets_code (asset_code),
  CONSTRAINT fk_assets_source FOREIGN KEY (source_system_id)
    REFERENCES source_systems (id) ON DELETE CASCADE,
  CONSTRAINT fk_assets_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
