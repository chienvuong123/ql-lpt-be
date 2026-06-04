-- DDL Script for BACK_UP cached tables in MS SQL Server
-- Created at: 2026-06-02

-- 1. Table: backup_hoc_vien_khoa (caches /api/ly-thuyet/hoc-vien/khoa/:enrolmentPlanIid)
IF OBJECT_ID(N'dbo.backup_hoc_vien_khoa', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.backup_hoc_vien_khoa (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    enrolment_plan_iid VARCHAR(100) NOT NULL,
    ma_dk VARCHAR(100) NOT NULL,
    user_iid VARCHAR(100) NULL,
    ho_ten NVARCHAR(255) NULL,
    first_name NVARCHAR(100) NULL,
    last_name NVARCHAR(100) NULL,
    avatar VARCHAR(500) NULL,
    birthday INT NULL, -- Linux timestamp
    birth_year INT NULL,
    sex VARCHAR(20) NULL,
    identification_card VARCHAR(50) NULL,
    identification_card_date NVARCHAR(50) NULL,
    identification_card_place NVARCHAR(255) NULL,
    nationality NVARCHAR(100) NULL,
    organization_name NVARCHAR(255) NULL,
    school NVARCHAR(255) NULL,
    user_status NVARCHAR(100) NULL,
    last_login_ts INT NULL, -- last_login timestamp
    last_login_device NVARCHAR(255) NULL,
    
    -- learning progress
    item_iid VARCHAR(100) NULL,
    total_hour_learned DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    progress DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    passed BIT NOT NULL DEFAULT 0,
    learned BIT NOT NULL DEFAULT 0,
    score_by_rubrik NVARCHAR(MAX) NULL, -- JSON string
    
    synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    
    CONSTRAINT UQ_backup_hoc_vien_khoa UNIQUE (enrolment_plan_iid, ma_dk)
  );
  
  -- Indexes optimized for GET
  CREATE NONCLUSTERED INDEX idx_backup_hvk_enrolment ON dbo.backup_hoc_vien_khoa(enrolment_plan_iid) INCLUDE (ma_dk, ho_ten, progress, passed);
  CREATE NONCLUSTERED INDEX idx_backup_hvk_ma_dk ON dbo.backup_hoc_vien_khoa(ma_dk);
  CREATE NONCLUSTERED INDEX idx_backup_hvk_cccd ON dbo.backup_hoc_vien_khoa(identification_card);
END;

-- 2. Table: backup_camera_snapshot (caches /camera-snapshot)
IF OBJECT_ID(N'dbo.backup_camera_snapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.backup_camera_snapshot (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lotus_snapshot_id VARCHAR(100) NULL,
    ma_dk VARCHAR(100) NOT NULL,
    enrolment_plan_iid VARCHAR(100) NULL,
    item_iid VARCHAR(100) NULL,
    image_url VARCHAR(500) NOT NULL,
    captured_at INT NOT NULL, -- Unix timestamp
    captured_at_iso DATETIME2(0) NULL,
    verify_status NVARCHAR(50) NULL,
    synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    
    -- Prevent duplicate snapshots
    CONSTRAINT UQ_backup_camera_snapshot UNIQUE (ma_dk, captured_at, image_url)
  );
  
  -- Indexes optimized for GET
  CREATE NONCLUSTERED INDEX idx_backup_cam_ma_dk ON dbo.backup_camera_snapshot(ma_dk, enrolment_plan_iid) INCLUDE (captured_at, image_url);
  CREATE NONCLUSTERED INDEX idx_backup_cam_captured ON dbo.backup_camera_snapshot(captured_at DESC);
END;

-- Check and create optional index for lotus_snapshot_id
IF OBJECT_ID(N'dbo.backup_camera_snapshot', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_backup_cam_lotus_id' AND object_id = OBJECT_ID('dbo.backup_camera_snapshot'))
BEGIN
  CREATE NONCLUSTERED INDEX idx_backup_cam_lotus_id ON dbo.backup_camera_snapshot(lotus_snapshot_id) WHERE lotus_snapshot_id IS NOT NULL;
END;

-- 3. Table: backup_time_tracking (caches /time-tracking)
IF OBJECT_ID(N'dbo.backup_time_tracking', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.backup_time_tracking (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    lotus_log_id VARCHAR(100) NULL,
    ma_dk VARCHAR(100) NOT NULL,
    enrolment_plan_iid VARCHAR(100) NULL,
    item_iid VARCHAR(100) NULL,
    item_name NVARCHAR(255) NULL,
    start_time INT NOT NULL, -- Unix timestamp
    start_time_iso DATETIME2(0) NULL,
    end_time INT NULL, -- Unix timestamp
    end_time_iso DATETIME2(0) NULL,
    duration INT NOT NULL DEFAULT 0, -- seconds
    device NVARCHAR(255) NULL,
    ip_address VARCHAR(50) NULL,
    synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    
    CONSTRAINT UQ_backup_time_tracking UNIQUE (ma_dk, start_time, item_iid)
  );
  
  -- Indexes optimized for GET
  CREATE NONCLUSTERED INDEX idx_backup_tt_ma_dk ON dbo.backup_time_tracking(ma_dk, enrolment_plan_iid) INCLUDE (start_time, duration);
  CREATE NONCLUSTERED INDEX idx_backup_tt_start ON dbo.backup_time_tracking(start_time DESC);
END;

-- Check and create optional index for lotus_log_id
IF OBJECT_ID(N'dbo.backup_time_tracking', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_backup_tt_lotus_id' AND object_id = OBJECT_ID('dbo.backup_time_tracking'))
BEGIN
  CREATE NONCLUSTERED INDEX idx_backup_tt_lotus_id ON dbo.backup_time_tracking(lotus_log_id) WHERE lotus_log_id IS NOT NULL;
END;

-- 4. Table: backup_learning_time (caches /learning-time)
IF OBJECT_ID(N'dbo.backup_learning_time', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.backup_learning_time (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk VARCHAR(100) NOT NULL,
    enrolment_plan_iid VARCHAR(100) NOT NULL,
    item_iid VARCHAR(100) NOT NULL,
    item_name NVARCHAR(255) NULL,
    total_time INT NOT NULL DEFAULT 0, -- seconds
    progress DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    last_learned_at INT NULL, -- Unix timestamp
    last_learned_at_iso DATETIME2(0) NULL,
    synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    
    CONSTRAINT UQ_backup_learning_time UNIQUE (ma_dk, enrolment_plan_iid, item_iid)
  );
  
  -- Indexes optimized for GET
  CREATE NONCLUSTERED INDEX idx_backup_lt_ma_dk ON dbo.backup_learning_time(ma_dk, enrolment_plan_iid) INCLUDE (item_iid, total_time, progress);
  CREATE NONCLUSTERED INDEX idx_backup_lt_item ON dbo.backup_learning_time(item_iid);
END;
