-- Planning output: runs, plans, blocks, assignments, and unscheduled reasons.

CREATE TABLE IF NOT EXISTS planning_runs (
  id CHAR(36) NOT NULL,
  horizon_type ENUM('WEEKLY','MONTHLY') NOT NULL,
  horizon_start DATETIME(3) NOT NULL,
  horizon_end DATETIME(3) NOT NULL,
  status ENUM('RUNNING','COMPLETED','FAILED') NOT NULL DEFAULT 'RUNNING',
  solver_type ENUM('GLPK','FALLBACK') NULL,
  started_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_runs_status (status),
  KEY ix_runs_horizon (horizon_type, horizon_start, horizon_end),
  KEY ix_runs_started_at (started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) NOT NULL,
  planning_run_id CHAR(36) NOT NULL,
  plan_type ENUM('OPTIMIZED','BASELINE') NOT NULL,
  horizon_type ENUM('WEEKLY','MONTHLY') NOT NULL,
  horizon_start DATETIME(3) NOT NULL,
  horizon_end DATETIME(3) NOT NULL,
  total_tasks INT UNSIGNED NOT NULL DEFAULT 0,
  scheduled_tasks INT UNSIGNED NOT NULL DEFAULT 0,
  unscheduled_tasks INT UNSIGNED NOT NULL DEFAULT 0,
  critical_tasks_scheduled INT UNSIGNED NOT NULL DEFAULT 0,
  critical_tasks_unscheduled INT UNSIGNED NOT NULL DEFAULT 0,
  total_block_count INT UNSIGNED NOT NULL DEFAULT 0,
  total_block_minutes INT UNSIGNED NOT NULL DEFAULT 0,
  asset_availability_percentage DECIMAL(6,3) NOT NULL DEFAULT 0,
  train_impact_score DECIMAL(10,3) NOT NULL DEFAULT 0,
  multi_department_block_count INT UNSIGNED NOT NULL DEFAULT 0,
  solver_status ENUM('OPTIMAL','FEASIBLE','FALLBACK_FEASIBLE','INFEASIBLE','FAILED') NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plans_run_type (planning_run_id, plan_type),
  KEY ix_plans_run (planning_run_id),
  KEY ix_plans_type (plan_type),
  KEY ix_plans_horizon (horizon_start, horizon_end),
  CONSTRAINT fk_plans_run FOREIGN KEY (planning_run_id)
    REFERENCES planning_runs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS plan_blocks (
  id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  block_window_id CHAR(36) NOT NULL,
  corridor_id CHAR(36) NOT NULL,
  section_id CHAR(36) NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  block_type ENUM('LINE','POWER','DISCONNECTION','INTEGRATED') NOT NULL DEFAULT 'LINE',
  departments_json JSON NOT NULL,
  utilization_percentage DECIMAL(6,3) NOT NULL DEFAULT 0,
  train_impact_score DECIMAL(10,3) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_blocks_plan (plan_id),
  KEY ix_blocks_window (block_window_id),
  KEY ix_blocks_section (section_id),
  KEY ix_blocks_corridor (corridor_id),
  KEY ix_blocks_range (plan_id, starts_at, ends_at),
  CONSTRAINT fk_blocks_plan FOREIGN KEY (plan_id)
    REFERENCES plans (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_window FOREIGN KEY (block_window_id)
    REFERENCES block_windows (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_corridor FOREIGN KEY (corridor_id)
    REFERENCES corridors (id) ON DELETE CASCADE,
  CONSTRAINT fk_blocks_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS plan_block_tasks (
  id CHAR(36) NOT NULL,
  plan_block_id CHAR(36) NOT NULL,
  maintenance_task_id CHAR(36) NOT NULL,
  planned_start DATETIME(3) NOT NULL,
  planned_end DATETIME(3) NOT NULL,
  sequence_number SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  assignment_reason_json JSON NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_block_tasks_block (plan_block_id),
  KEY ix_block_tasks_task (maintenance_task_id),
  KEY ix_block_tasks_range (plan_block_id, planned_start, planned_end),
  CONSTRAINT fk_block_tasks_block FOREIGN KEY (plan_block_id)
    REFERENCES plan_blocks (id) ON DELETE CASCADE,
  CONSTRAINT fk_block_tasks_task FOREIGN KEY (maintenance_task_id)
    REFERENCES maintenance_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS unscheduled_tasks (
  id CHAR(36) NOT NULL,
  plan_id CHAR(36) NOT NULL,
  maintenance_task_id CHAR(36) NOT NULL,
  reason_code ENUM(
    'NO_BLOCK_WINDOW',
    'TRAIN_CONFLICT',
    'INSUFFICIENT_DURATION',
    'POWER_ISOLATION_UNAVAILABLE',
    'DISCONNECTION_UNAVAILABLE',
    'INCOMPATIBLE_TASK',
    'OUTSIDE_HORIZON'
  ) NOT NULL,
  explanation VARCHAR(500) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unscheduled_plan_task (plan_id, maintenance_task_id),
  KEY ix_unscheduled_plan (plan_id),
  KEY ix_unscheduled_task (maintenance_task_id),
  KEY ix_unscheduled_reason (reason_code),
  CONSTRAINT fk_unscheduled_plan FOREIGN KEY (plan_id)
    REFERENCES plans (id) ON DELETE CASCADE,
  CONSTRAINT fk_unscheduled_task FOREIGN KEY (maintenance_task_id)
    REFERENCES maintenance_tasks (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
