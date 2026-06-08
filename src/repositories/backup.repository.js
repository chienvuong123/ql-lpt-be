const mssql = require("mssql");
const connectSQL = require("../configs/sql");

// Helper to bind parameters dynamically
function bindInputs(request, data, schema) {
  Object.keys(schema).forEach((key) => {
    const value = data[key] === undefined ? null : data[key];
    request.input(key, schema[key], value);
  });
}

// 1. Table schema definitions
const SCHEMAS = {
  hvk: {
    enrolment_plan_iid: mssql.VarChar,
    ma_dk: mssql.VarChar,
    total_hour_learned: mssql.Decimal(10, 2),
    progress: mssql.Decimal(5, 2),
    passed: mssql.Bit,
    learned: mssql.Bit,
    score_by_rubrik: mssql.NVarChar,
  },
  cam: {
    lotus_snapshot_id: mssql.VarChar,
    ma_dk: mssql.VarChar,
    enrolment_plan_iid: mssql.VarChar,
    item_iid: mssql.VarChar,
    image_url: mssql.VarChar,
    captured_at: mssql.Int,
    captured_at_iso: mssql.DateTime2(0),
    verify_status: mssql.NVarChar,
  },
  tt: {
    lotus_log_id: mssql.VarChar,
    ma_dk: mssql.VarChar,
    enrolment_plan_iid: mssql.VarChar,
    item_iid: mssql.VarChar,
    item_name: mssql.NVarChar,
    start_time: mssql.Int,
    start_time_iso: mssql.DateTime2(0),
    end_time: mssql.Int,
    end_time_iso: mssql.DateTime2(0),
    duration: mssql.Int,
    device: mssql.NVarChar,
    ip_address: mssql.VarChar,
  },
  lt: {
    ma_dk: mssql.VarChar,
    enrolment_plan_iid: mssql.VarChar,
    item_iid: mssql.VarChar,
    item_name: mssql.NVarChar,
    total_time: mssql.Int,
    progress: mssql.Decimal(5, 2),
    last_learned_at: mssql.Int,
    last_learned_at_iso: mssql.DateTime2(0),
  },
  tdht: {
    ma_dk: mssql.VarChar,
    enrolment_plan_iid: mssql.VarChar,
    course_iid: mssql.VarChar,
    course_name: mssql.NVarChar,
    cp: mssql.Decimal(5, 2),
    p: mssql.Decimal(10, 2),
    pf: mssql.Int,
    rubric_iid: mssql.VarChar,
  },
  sbr: {
    ma_dk: mssql.VarChar,
    enrolment_plan_iid: mssql.VarChar,
    rubric_iid: mssql.VarChar,
    rubric_name: mssql.NVarChar,
    score: mssql.Decimal(10, 2),
    cp: mssql.Decimal(5, 2),
    passed: mssql.Int,
    score_by_rubrik: mssql.NVarChar,
  }
};

// 2. Query/Retrieve functions (GET optimized)
async function getHocVienKhoa(enrolmentPlanIid, search = "") {
  const pool = await connectSQL();
  const request = pool.request();
  request.input("enrolment_plan_iid", mssql.VarChar, enrolmentPlanIid);
  
  let searchClause = "";
  if (search?.trim()) {
    request.input("search", mssql.NVarChar, `%${search.trim()}%`);
    searchClause = " AND (hv.ho_ten LIKE @search OR hvt.ma_dk LIKE @search OR hv.cccd LIKE @search)";
  }
  
  // Left join to get detailed student info directly from QUAN_LY_LPT database
  const result = await request.query(`
    SELECT 
      hvt.ma_dk,
      hvt.ma_khoa,
      hvt.enrolment_plan_iid,
      hvt.total_hour_learned,
      hvt.progress,
      hvt.passed,
      hvt.learned,
      hvt.score_by_rubrik,
      hvt.updated_at,
      hv.ho_ten,
      hv.cccd AS identification_card,
      hv.nam_sinh AS birth_year,
      hv.avatar_url AS avatar
    FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] hvt WITH (NOLOCK)
    LEFT JOIN [QUAN_LY_LPT].[dbo].[hoc_vien] hv WITH (NOLOCK) ON hvt.ma_dk = hv.ma_dk
    WHERE hvt.enrolment_plan_iid = @enrolment_plan_iid ${searchClause}
    ORDER BY hv.ho_ten ASC
  `);
  return result.recordset;
}

async function getCameraSnapshots(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  let where = "WHERE 1=1";
  
  if (filters.ma_dk) {
    request.input("ma_dk", mssql.VarChar, filters.ma_dk);
    where += " AND ma_dk = @ma_dk";
  }
  if (filters.enrolment_plan_iid) {
    request.input("enrolment_plan_iid", mssql.VarChar, filters.enrolment_plan_iid);
    where += " AND enrolment_plan_iid = @enrolment_plan_iid";
  }
  
  const limitClause = filters.limit ? `TOP ${parseInt(filters.limit)}` : "";
  const result = await request.query(`
    SELECT ${limitClause} * FROM [BACK_UP].[dbo].[backup_camera_snapshot] WITH (NOLOCK)
    ${where}
    ORDER BY captured_at DESC
  `);
  return result.recordset;
}

async function getTimeTrackingLogs(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  let where = "WHERE 1=1";
  
  if (filters.ma_dk) {
    request.input("ma_dk", mssql.VarChar, filters.ma_dk);
    where += " AND ma_dk = @ma_dk";
  }
  if (filters.enrolment_plan_iid) {
    request.input("enrolment_plan_iid", mssql.VarChar, filters.enrolment_plan_iid);
    where += " AND enrolment_plan_iid = @enrolment_plan_iid";
  }
  
  const limitClause = filters.limit ? `TOP ${parseInt(filters.limit)}` : "";
  const result = await request.query(`
    SELECT ${limitClause} * FROM [BACK_UP].[dbo].[backup_time_tracking] WITH (NOLOCK)
    ${where}
    ORDER BY start_time DESC
  `);
  return result.recordset;
}

async function getLearningTimeTracking(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  let where = "WHERE 1=1";
  
  if (filters.ma_dk) {
    request.input("ma_dk", mssql.VarChar, filters.ma_dk);
    where += " AND ma_dk = @ma_dk";
  }
  if (filters.enrolment_plan_iid) {
    request.input("enrolment_plan_iid", mssql.VarChar, filters.enrolment_plan_iid);
    where += " AND enrolment_plan_iid = @enrolment_plan_iid";
  }
  
  const result = await request.query(`
    SELECT * FROM [BACK_UP].[dbo].[backup_learning_time] WITH (NOLOCK)
    ${where}
    ORDER BY last_learned_at ASC
  `);
  return result.recordset;
}

async function getTienDoHoanThanh(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  let where = "WHERE 1=1";
  
  if (filters.ma_dk) {
    request.input("ma_dk", mssql.VarChar, filters.ma_dk);
    where += " AND ma_dk = @ma_dk";
  }
  if (filters.enrolment_plan_iid) {
    request.input("enrolment_plan_iid", mssql.VarChar, filters.enrolment_plan_iid);
    where += " AND enrolment_plan_iid = @enrolment_plan_iid";
  }
  
  const result = await request.query(`
    SELECT * FROM [BACK_UP].[dbo].[backup_tien_do_hoan_thanh] WITH (NOLOCK)
    ${where}
    ORDER BY id ASC
  `);
  return result.recordset;
}

async function getScoreByRubric(filters = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  let where = "WHERE 1=1";
  
  if (filters.ma_dk) {
    request.input("ma_dk", mssql.VarChar, filters.ma_dk);
    where += " AND ma_dk = @ma_dk";
  }
  if (filters.enrolment_plan_iid) {
    request.input("enrolment_plan_iid", mssql.VarChar, filters.enrolment_plan_iid);
    where += " AND enrolment_plan_iid = @enrolment_plan_iid";
  }
  
  const result = await request.query(`
    SELECT * FROM [BACK_UP].[dbo].[backup_score_by_rubric] WITH (NOLOCK)
    ${where}
    ORDER BY id ASC
  `);
  return result.recordset;
}

// 3. Single Upsert implementations
async function upsertHocVienKhoaItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.hvk);
  await request.query(`
    -- Sync simplified learning progress to [BACK_UP] database (hoc_vien_hoc_tap)
    DECLARE @ma_khoa VARCHAR(20) = NULL;
    SELECT TOP 1 @ma_khoa = ma_khoa FROM [QUAN_LY_LPT].[dbo].[hoc_vien] WITH (NOLOCK) WHERE ma_dk = @ma_dk;

    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] WHERE ma_dk = @ma_dk)
      UPDATE [BACK_UP].[dbo].[hoc_vien_hoc_tap] SET
        ma_khoa = ISNULL(@ma_khoa, ma_khoa),
        enrolment_plan_iid = @enrolment_plan_iid,
        total_hour_learned = @total_hour_learned,
        progress = @progress,
        passed = @passed,
        learned = @learned,
        score_by_rubrik = @score_by_rubrik,
        updated_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[hoc_vien_hoc_tap] (
        ma_dk, ma_khoa, enrolment_plan_iid, total_hour_learned, progress, passed, learned, score_by_rubrik, updated_at
      ) VALUES (
        @ma_dk, @ma_khoa, @enrolment_plan_iid, @total_hour_learned, @progress, @passed, @learned, @score_by_rubrik, SYSDATETIME()
      );
  `);
}

async function upsertCameraSnapshotItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.cam);
  await request.query(`
    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_camera_snapshot] WHERE ma_dk = @ma_dk AND captured_at = @captured_at AND image_url = @image_url)
      UPDATE [BACK_UP].[dbo].[backup_camera_snapshot] SET
        lotus_snapshot_id = @lotus_snapshot_id, enrolment_plan_iid = @enrolment_plan_iid, item_iid = @item_iid,
        captured_at_iso = @captured_at_iso, verify_status = @verify_status, synced_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk AND captured_at = @captured_at AND image_url = @image_url;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[backup_camera_snapshot] (lotus_snapshot_id, ma_dk, enrolment_plan_iid, item_iid, image_url, captured_at, captured_at_iso, verify_status)
      VALUES (@lotus_snapshot_id, @ma_dk, @enrolment_plan_iid, @item_iid, @image_url, @captured_at, @captured_at_iso, @verify_status);
  `);
}

async function upsertTimeTrackingItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.tt);
  await request.query(`
    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_time_tracking] WHERE ma_dk = @ma_dk AND start_time = @start_time AND item_iid = @item_iid)
      UPDATE [BACK_UP].[dbo].[backup_time_tracking] SET
        lotus_log_id = @lotus_log_id, enrolment_plan_iid = @enrolment_plan_iid, item_name = @item_name,
        start_time_iso = @start_time_iso, end_time = @end_time, end_time_iso = @end_time_iso,
        duration = @duration, device = @device, ip_address = @ip_address, synced_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk AND start_time = @start_time AND item_iid = @item_iid;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[backup_time_tracking] (lotus_log_id, ma_dk, enrolment_plan_iid, item_iid, item_name, start_time, start_time_iso, end_time, end_time_iso, duration, device, ip_address)
      VALUES (@lotus_log_id, @ma_dk, @enrolment_plan_iid, @item_iid, @item_name, @start_time, @start_time_iso, @end_time, @end_time_iso, @duration, @device, @ip_address);
  `);
}

async function upsertLearningTimeItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.lt);
  await request.query(`
    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_learning_time] WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND item_iid = @item_iid)
      UPDATE [BACK_UP].[dbo].[backup_learning_time] SET
        item_name = @item_name, total_time = @total_time, progress = @progress,
        last_learned_at = @last_learned_at, last_learned_at_iso = @last_learned_at_iso, synced_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND item_iid = @item_iid;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[backup_learning_time] (ma_dk, enrolment_plan_iid, item_iid, item_name, total_time, progress, last_learned_at, last_learned_at_iso)
      VALUES (@ma_dk, @enrolment_plan_iid, @item_iid, @item_name, @total_time, @progress, @last_learned_at, @last_learned_at_iso);
  `);
}

async function upsertTienDoHoanThanhItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.tdht);
  await request.query(`
    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_tien_do_hoan_thanh] WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND course_iid = @course_iid)
      UPDATE [BACK_UP].[dbo].[backup_tien_do_hoan_thanh] SET
        course_name = @course_name, cp = @cp, p = @p, pf = @pf, rubric_iid = @rubric_iid, synced_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND course_iid = @course_iid;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[backup_tien_do_hoan_thanh] (ma_dk, enrolment_plan_iid, course_iid, course_name, cp, p, pf, rubric_iid)
      VALUES (@ma_dk, @enrolment_plan_iid, @course_iid, @course_name, @cp, @p, @pf, @rubric_iid);
  `);
}

async function upsertScoreByRubricTableItem(pool, record) {
  const request = pool.request();
  bindInputs(request, record, SCHEMAS.sbr);
  await request.query(`
    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_score_by_rubric] WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND rubric_iid = @rubric_iid)
      UPDATE [BACK_UP].[dbo].[backup_score_by_rubric] SET
        rubric_name = @rubric_name, score = @score, cp = @cp, passed = @passed, score_by_rubrik = @score_by_rubrik, synced_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk AND enrolment_plan_iid = @enrolment_plan_iid AND rubric_iid = @rubric_iid;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[backup_score_by_rubric] (ma_dk, enrolment_plan_iid, rubric_iid, rubric_name, score, cp, passed, score_by_rubrik)
      VALUES (@ma_dk, @enrolment_plan_iid, @rubric_iid, @rubric_name, @score, @cp, @passed, @score_by_rubrik);
  `);
}

// 4. Batch Upsert wrappers
async function upsertHocVienKhoa(records) {
  if (!records || !records.length) return 0;
  const pool = await connectSQL();
  for (const record of records) {
    if (!record.enrolment_plan_iid || !record.ma_dk) continue;
    await upsertHocVienKhoaItem(pool, record).catch(err => 
      console.error("[backupRepo] upsertHocVienKhoa single record failed:", err.message)
    );
  }
  return records.length;
}

async function upsertCameraSnapshots(records) {
  if (!records || !records.length) return 0;
  const pool = await connectSQL();
  for (const record of records) {
    if (!record.ma_dk || !record.captured_at || !record.image_url) continue;
    await upsertCameraSnapshotItem(pool, record).catch(err => 
      console.error("[backupRepo] upsertCameraSnapshots single record failed:", err.message)
    );
  }
  return records.length;
}

async function upsertTimeTrackingLogs(records) {
  if (!records || !records.length) return 0;
  const pool = await connectSQL();
  for (const record of records) {
    if (!record.ma_dk || !record.start_time || !record.item_iid) continue;
    await upsertTimeTrackingItem(pool, record).catch(err => 
      console.error("[backupRepo] upsertTimeTrackingLogs single record failed:", err.message)
    );
  }
  return records.length;
}

async function upsertLearningTimeTracking(records) {
  if (!records || !records.length) return 0;
  const pool = await connectSQL();
  for (const record of records) {
    if (!record.ma_dk || !record.enrolment_plan_iid || !record.item_iid) continue;
    await upsertLearningTimeItem(pool, record).catch(err => 
      console.error("[backupRepo] upsertLearningTimeTracking single record failed:", err.message)
    );
  }
  return records.length;
}

async function upsertTienDoHoanThanh(records) {
  if (!records || !records.length) return 0;
  const pool = await connectSQL();
  for (const record of records) {
    if (!record.ma_dk || !record.enrolment_plan_iid || !record.course_iid) continue;
    await upsertTienDoHoanThanhItem(pool, record).catch(err => 
      console.error("[backupRepo] upsertTienDoHoanThanh single record failed:", err.message)
    );
  }
  return records.length;
}

async function upsertScoreByRubricTable(record) {
  if (!record || !record.ma_dk || !record.enrolment_plan_iid || !record.rubric_iid) return 0;
  const pool = await connectSQL();
  await upsertScoreByRubricTableItem(pool, record).catch(err => 
    console.error("[backupRepo] upsertScoreByRubricTable single record failed:", err.message)
  );
  return 1;
}

async function getHocVienHocTap(maDk) {
  const pool = await connectSQL();
  const request = pool.request();
  request.input("ma_dk", mssql.VarChar, maDk);
  const result = await request.query(`
    SELECT 
      hvt.*,
      hv.ho_ten,
      hv.cccd AS identification_card,
      hv.nam_sinh AS birth_year,
      hv.avatar_url AS avatar
    FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] hvt WITH (NOLOCK)
    LEFT JOIN [QUAN_LY_LPT].[dbo].[hoc_vien] hv WITH (NOLOCK) ON hvt.ma_dk = hv.ma_dk
    WHERE hvt.ma_dk = @ma_dk
  `);
  return result.recordset[0] || null;
}

async function upsertHocVienHocTap(record) {
  const pool = await connectSQL();
  const request = pool.request();
  request.input("ma_dk", mssql.VarChar, record.ma_dk);
  request.input("enrolment_plan_iid", mssql.VarChar, record.enrolment_plan_iid);
  request.input("total_hour_learned", mssql.Decimal(10, 2), record.total_hour_learned);
  request.input("progress", mssql.Decimal(5, 2), record.progress);
  request.input("passed", mssql.Bit, record.passed);
  request.input("learned", mssql.Bit, record.learned);

  await request.query(`
    DECLARE @ma_khoa VARCHAR(20) = NULL;
    SELECT TOP 1 @ma_khoa = ma_khoa FROM [QUAN_LY_LPT].[dbo].[hoc_vien] WITH (NOLOCK) WHERE ma_dk = @ma_dk;

    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] WHERE ma_dk = @ma_dk)
      UPDATE [BACK_UP].[dbo].[hoc_vien_hoc_tap] SET
        ma_khoa = ISNULL(@ma_khoa, ma_khoa),
        enrolment_plan_iid = ISNULL(@enrolment_plan_iid, enrolment_plan_iid),
        total_hour_learned = ISNULL(@total_hour_learned, total_hour_learned),
        progress = ISNULL(@progress, progress),
        passed = ISNULL(@passed, passed),
        learned = ISNULL(@learned, learned),
        updated_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[hoc_vien_hoc_tap] (
        ma_dk, ma_khoa, enrolment_plan_iid, total_hour_learned, progress, passed, learned, updated_at
      ) VALUES (
        @ma_dk, @ma_khoa, @enrolment_plan_iid, ISNULL(@total_hour_learned, 0.0), ISNULL(@progress, 0.0), ISNULL(@passed, 0), ISNULL(@learned, 0), SYSDATETIME()
      );
  `);
  return 1;
}

async function upsertScoreByRubric(maDk, enrolmentPlanIid, scoreJson) {
  const pool = await connectSQL();
  const request = pool.request();
  request.input("ma_dk", mssql.VarChar, maDk);
  request.input("enrolment_plan_iid", mssql.VarChar, enrolmentPlanIid);
  request.input("score_by_rubrik", mssql.NVarChar, scoreJson);

  await request.query(`
    DECLARE @ma_khoa VARCHAR(20) = NULL;
    SELECT TOP 1 @ma_khoa = ma_khoa FROM [QUAN_LY_LPT].[dbo].[hoc_vien] WITH (NOLOCK) WHERE ma_dk = @ma_dk;

    IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[hoc_vien_hoc_tap] WHERE ma_dk = @ma_dk)
      UPDATE [BACK_UP].[dbo].[hoc_vien_hoc_tap] SET
        ma_khoa = ISNULL(@ma_khoa, ma_khoa),
        enrolment_plan_iid = ISNULL(@enrolment_plan_iid, enrolment_plan_iid),
        score_by_rubrik = @score_by_rubrik,
        updated_at = SYSDATETIME()
      WHERE ma_dk = @ma_dk;
    ELSE
      INSERT INTO [BACK_UP].[dbo].[hoc_vien_hoc_tap] (
        ma_dk, ma_khoa, enrolment_plan_iid, score_by_rubrik, updated_at
      ) VALUES (
        @ma_dk, @ma_khoa, @enrolment_plan_iid, @score_by_rubrik, SYSDATETIME()
      );
  `);
  return 1;
}

async function initializeBackupDatabase() {
  const pool = await connectSQL();
  const request = pool.request();
  try {
    // 1. Create BACK_UP database if not exists
    await request.query(`
      IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'BACK_UP')
      BEGIN
        CREATE DATABASE [BACK_UP];
      END
    `);
    
    // 2. Create tables inside BACK_UP
    await request.query(`
      USE [BACK_UP];

      IF OBJECT_ID(N'dbo.hoc_vien_hoc_tap', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.hoc_vien_hoc_tap (
          ma_dk VARCHAR(100) NOT NULL PRIMARY KEY,
          ma_khoa VARCHAR(20) NULL,
          enrolment_plan_iid VARCHAR(100) NULL,
          total_hour_learned DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
          progress DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
          passed BIT NOT NULL DEFAULT 0,
          learned BIT NOT NULL DEFAULT 0,
          score_by_rubrik NVARCHAR(MAX) NULL,
          updated_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
        );
      END;

      IF OBJECT_ID(N'dbo.backup_camera_snapshot', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_camera_snapshot (
          id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          lotus_snapshot_id VARCHAR(100) NULL,
          ma_dk VARCHAR(100) NOT NULL,
          enrolment_plan_iid VARCHAR(100) NULL,
          item_iid VARCHAR(100) NULL,
          image_url VARCHAR(500) NOT NULL,
          captured_at INT NOT NULL,
          captured_at_iso DATETIME2(0) NULL,
          verify_status NVARCHAR(50) NULL,
          synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
          CONSTRAINT UQ_backup_camera_snapshot UNIQUE (ma_dk, captured_at, image_url)
        );
      END;

      IF OBJECT_ID(N'dbo.backup_time_tracking', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_time_tracking (
          id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          lotus_log_id VARCHAR(100) NULL,
          ma_dk VARCHAR(100) NOT NULL,
          enrolment_plan_iid VARCHAR(100) NULL,
          item_iid VARCHAR(100) NULL,
          item_name NVARCHAR(255) NULL,
          start_time INT NOT NULL,
          start_time_iso DATETIME2(0) NULL,
          end_time INT NULL,
          end_time_iso DATETIME2(0) NULL,
          duration INT NOT NULL DEFAULT 0,
          device NVARCHAR(255) NULL,
          ip_address VARCHAR(50) NULL,
          synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
          CONSTRAINT UQ_backup_time_tracking UNIQUE (ma_dk, start_time, item_iid)
        );
      END;

      IF OBJECT_ID(N'dbo.backup_learning_time', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_learning_time (
          id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ma_dk VARCHAR(100) NOT NULL,
          enrolment_plan_iid VARCHAR(100) NOT NULL,
          item_iid VARCHAR(100) NOT NULL,
          item_name NVARCHAR(255) NULL,
          total_time INT NOT NULL DEFAULT 0,
          progress DECIMAL(5,2) NOT NULL DEFAULT 0.0,
          last_learned_at INT NULL,
          last_learned_at_iso DATETIME2(0) NULL,
          synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
          CONSTRAINT UQ_backup_learning_time UNIQUE (ma_dk, enrolment_plan_iid, item_iid)
        );
      END;

      IF OBJECT_ID(N'dbo.backup_tien_do_hoan_thanh', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_tien_do_hoan_thanh (
          id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ma_dk VARCHAR(100) NOT NULL,
          enrolment_plan_iid VARCHAR(100) NOT NULL,
          course_iid VARCHAR(100) NOT NULL,
          course_name NVARCHAR(255) NULL,
          cp DECIMAL(5,2) NOT NULL DEFAULT 0.0,
          p DECIMAL(10,2) NOT NULL DEFAULT 0.0,
          pf INT NOT NULL DEFAULT 0,
          rubric_iid VARCHAR(100) NULL,
          synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
          CONSTRAINT UQ_backup_tien_do_hoan_thanh UNIQUE (ma_dk, enrolment_plan_iid, course_iid)
        );
      END;

      IF OBJECT_ID(N'dbo.backup_score_by_rubric', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_score_by_rubric (
          id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
          ma_dk VARCHAR(100) NOT NULL,
          enrolment_plan_iid VARCHAR(100) NOT NULL,
          rubric_iid VARCHAR(100) NOT NULL,
          rubric_name NVARCHAR(255) NULL,
          score DECIMAL(10,2) NOT NULL DEFAULT 0.0,
          cp DECIMAL(5,2) NOT NULL DEFAULT 0.0,
          passed INT NOT NULL DEFAULT 0,
          score_by_rubrik NVARCHAR(MAX) NULL,
          synced_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
          CONSTRAINT UQ_backup_score_by_rubric UNIQUE (ma_dk, enrolment_plan_iid, rubric_iid)
        );
      END;

      USE [${process.env.DB_DATABASE || "QUAN_LY_LPT"}];
    `);
    console.log("[backupRepo] Database BACK_UP and all backup tables initialized/verified.");
  } catch (err) {
    console.error("[backupRepo] Failed to initialize BACK_UP database:", err.message);
  }
}

module.exports = {
  getHocVienKhoa,
  getCameraSnapshots,
  getTimeTrackingLogs,
  getLearningTimeTracking,
  getTienDoHoanThanh,
  getScoreByRubric,
  getHocVienHocTap,
  upsertHocVienKhoa,
  upsertCameraSnapshots,
  upsertTimeTrackingLogs,
  upsertLearningTimeTracking,
  upsertTienDoHoanThanh,
  upsertScoreByRubricTable,
  upsertHocVienHocTap,
  upsertScoreByRubric,
  initializeBackupDatabase,
};
