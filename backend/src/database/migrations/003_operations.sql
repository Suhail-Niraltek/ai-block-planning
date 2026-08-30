-- Operations: train movements, goods forecasts, and COA block windows.

CREATE TABLE IF NOT EXISTS train_movements (
  id CHAR(36) NOT NULL,
  source_system_id CHAR(36) NOT NULL,
  external_id VARCHAR(96) NOT NULL,
  train_number VARCHAR(16) NOT NULL,
  train_type ENUM('PASSENGER','FREIGHT') NOT NULL,
  priority_class TINYINT UNSIGNED NOT NULL DEFAULT 3,
  section_id CHAR(36) NOT NULL,
  entry_at DATETIME(3) NOT NULL,
  exit_at DATETIME(3) NOT NULL,
  protected TINYINT(1) NOT NULL DEFAULT 1,
  source_type ENUM('TIMETABLE','COA','FORECAST') NOT NULL DEFAULT 'TIMETABLE',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_movements_source_external (source_system_id, external_id),
  KEY ix_movements_section (section_id),
  KEY ix_movements_window (section_id, entry_at, exit_at),
  KEY ix_movements_entry_at (entry_at),
  KEY ix_movements_exit_at (exit_at),
  KEY ix_movements_protected (protected),
  KEY ix_movements_type (train_type),
  CONSTRAINT fk_movements_source FOREIGN KEY (source_system_id)
    REFERENCES source_systems (id) ON DELETE CASCADE,
  CONSTRAINT fk_movements_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS goods_forecasts (
  id CHAR(36) NOT NULL,
  source_system_id CHAR(36) NOT NULL,
  external_id VARCHAR(96) NOT NULL,
  corridor_id CHAR(36) NOT NULL,
  bucket_start DATETIME(3) NOT NULL,
  bucket_end DATETIME(3) NOT NULL,
  expected_train_count DECIMAL(6,2) NOT NULL DEFAULT 0,
  lower_count DECIMAL(6,2) NOT NULL DEFAULT 0,
  upper_count DECIMAL(6,2) NOT NULL DEFAULT 0,
  source_type ENUM('COA','DEMO_MODEL') NOT NULL DEFAULT 'COA',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_forecasts_source_external (source_system_id, external_id),
  KEY ix_forecasts_corridor (corridor_id),
  KEY ix_forecasts_bucket (corridor_id, bucket_start, bucket_end),
  KEY ix_forecasts_bucket_start (bucket_start),
  CONSTRAINT fk_forecasts_source FOREIGN KEY (source_system_id)
    REFERENCES source_systems (id) ON DELETE CASCADE,
  CONSTRAINT fk_forecasts_corridor FOREIGN KEY (corridor_id)
    REFERENCES corridors (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS block_windows (
  id CHAR(36) NOT NULL,
  source_system_id CHAR(36) NOT NULL,
  external_id VARCHAR(96) NOT NULL,
  corridor_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  available_line_count TINYINT UNSIGNED NOT NULL DEFAULT 1,
  power_isolation_available TINYINT(1) NOT NULL DEFAULT 0,
  signalling_disconnection_available TINYINT(1) NOT NULL DEFAULT 0,
  confidence DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  status ENUM('AVAILABLE','UNAVAILABLE') NOT NULL DEFAULT 'AVAILABLE',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_windows_source_external (source_system_id, external_id),
  KEY ix_windows_corridor (corridor_id),
  KEY ix_windows_section (section_id),
  KEY ix_windows_range (section_id, starts_at, ends_at),
  KEY ix_windows_starts_at (starts_at),
  KEY ix_windows_ends_at (ends_at),
  KEY ix_windows_status (status),
  CONSTRAINT fk_windows_source FOREIGN KEY (source_system_id)
    REFERENCES source_systems (id) ON DELETE CASCADE,
  CONSTRAINT fk_windows_corridor FOREIGN KEY (corridor_id)
    REFERENCES corridors (id) ON DELETE CASCADE,
  CONSTRAINT fk_windows_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
