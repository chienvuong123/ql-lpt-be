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
      YEAR(hv.ngay_sinh) AS birth_year,
      hv.anh AS avatar
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
      YEAR(hv.ngay_sinh) AS birth_year,
      hv.anh AS avatar
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

      IF OBJECT_ID(N'dbo.backup_hanh_trinh', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.backup_hanh_trinh (
          ID              INT,
          SessionId       NVARCHAR(50) NOT NULL PRIMARY KEY,
          MaDK            NVARCHAR(100),
          MaKhoaHoc       NVARCHAR(50),
          KhoaHoc         NVARCHAR(50),
          HoTen           NVARCHAR(100),
          IDGV            NVARCHAR(20),
          HoTenGV         NVARCHAR(100),
          HangDaoTao      NVARCHAR(10),
          BienSo          NVARCHAR(20),
          Imei            NVARCHAR(50),
          ThoiDiemDangNhap    DATETIME,
          ThoiDiemDangXuat    DATETIME,
          TongThoiGian        INT,
          TongQuangDuong      FLOAT,
          ThoiGianBanDem      INT,
          QuangDuongBanDem    FLOAT,
          Tile                FLOAT,
          IsSend              BIT,
          Bug                 INT,
          ThoiGianTruyen      DATETIME,
          CenterResponseMessage NVARCHAR(MAX),
          Srcdn           NVARCHAR(500),
          Srcdx           NVARCHAR(500),
          StartLatitude   FLOAT,
          StartLongitude  FLOAT,
          EndLatitude     FLOAT,
          EndLongitude    FLOAT,
          NgayBackup      DATETIME DEFAULT GETDATE(),
          MaKhoaHocKetThuc NVARCHAR(50)
        );
      END;

      USE [${process.env.DB_DATABASE || "QUAN_LY_LPT"}];
    `);
    console.log("[backupRepo] Database BACK_UP and all backup tables initialized/verified.");
  } catch (err) {
    console.error("[backupRepo] Failed to initialize BACK_UP database:", err.message);
  }
}

async function upsertBackUpHanhTrinh(sessions) {
  if (!sessions || !sessions.length) return 0;
  const pool = await connectSQL();
  let successCount = 0;

  for (const session of sessions) {
    try {
      const request = pool.request();
      request.input("ID", mssql.Int, session.ID || null);
      request.input("SessionId", mssql.NVarChar(50), session.SessionId || null);
      request.input("MaDK", mssql.NVarChar(100), session.MaDK || null);
      request.input("MaKhoaHoc", mssql.NVarChar(50), session.MaKhoaHoc || null);
      request.input("KhoaHoc", mssql.NVarChar(50), session.KhoaHoc || null);
      request.input("HoTen", mssql.NVarChar(100), session.HoTen || null);
      request.input("IDGV", mssql.NVarChar(20), session.IDGV || null);
      request.input("HoTenGV", mssql.NVarChar(100), session.HoTenGV || null);
      request.input("HangDaoTao", mssql.NVarChar(10), session.HangDaoTao || null);
      request.input("BienSo", mssql.NVarChar(20), session.BienSo || null);
      request.input("Imei", mssql.NVarChar(50), session.Imei || null);

      const parseDate = (val) => {
        if (!val || val === "0001-01-01T00:00:00") return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      request.input("ThoiDiemDangNhap", mssql.DateTime, parseDate(session.ThoiDiemDangNhap));
      request.input("ThoiDiemDangXuat", mssql.DateTime, parseDate(session.ThoiDiemDangXuat));
      request.input("TongThoiGian", mssql.Int, session.TongThoiGian !== undefined ? parseInt(session.TongThoiGian) : null);
      request.input("TongQuangDuong", mssql.Float, session.TongQuangDuong !== undefined ? parseFloat(session.TongQuangDuong) : null);
      request.input("ThoiGianBanDem", mssql.Int, session.ThoiGianBanDem !== undefined ? parseInt(session.ThoiGianBanDem) : null);
      request.input("QuangDuongBanDem", mssql.Float, session.QuangDuongBanDem !== undefined ? parseFloat(session.QuangDuongBanDem) : null);
      request.input("Tile", mssql.Float, session.Tile !== undefined ? parseFloat(session.Tile) : null);
      request.input("IsSend", mssql.Bit, session.IsSend === true || session.IsSend === 1 ? 1 : 0);
      request.input("Bug", mssql.Int, session.Bug !== undefined ? parseInt(session.Bug) : null);
      request.input("ThoiGianTruyen", mssql.DateTime, parseDate(session.ThoiGianTruyen));
      request.input("CenterResponseMessage", mssql.NVarChar(mssql.MAX), session.CenterResponseMessage || null);
      request.input("Srcdn", mssql.NVarChar(500), session.Srcdn || null);
      request.input("Srcdx", mssql.NVarChar(500), session.Srcdx || null);
      request.input("StartLatitude", mssql.Float, session.StartLatitude !== undefined ? parseFloat(session.StartLatitude) : null);
      request.input("StartLongitude", mssql.Float, session.StartLongitude !== undefined ? parseFloat(session.StartLongitude) : null);
      request.input("EndLatitude", mssql.Float, session.EndLatitude !== undefined ? parseFloat(session.EndLatitude) : null);
      request.input("EndLongitude", mssql.Float, session.EndLongitude !== undefined ? parseFloat(session.EndLongitude) : null);
      request.input("MaKhoaHocKetThuc", mssql.NVarChar(50), session.MaKhoaHocKetThuc || null);

      await request.query(`
        IF EXISTS (SELECT 1 FROM [BACK_UP].[dbo].[backup_hanh_trinh] WHERE SessionId = @SessionId)
        BEGIN
          UPDATE [BACK_UP].[dbo].[backup_hanh_trinh] SET
            ID = @ID,
            MaDK = @MaDK,
            MaKhoaHoc = @MaKhoaHoc,
            KhoaHoc = @KhoaHoc,
            HoTen = @HoTen,
            IDGV = @IDGV,
            HoTenGV = @HoTenGV,
            HangDaoTao = @HangDaoTao,
            BienSo = @BienSo,
            Imei = @Imei,
            ThoiDiemDangNhap = @ThoiDiemDangNhap,
            ThoiDiemDangXuat = @ThoiDiemDangXuat,
            TongThoiGian = @TongThoiGian,
            TongQuangDuong = @TongQuangDuong,
            ThoiGianBanDem = @ThoiGianBanDem,
            QuangDuongBanDem = @QuangDuongBanDem,
            Tile = @Tile,
            IsSend = @IsSend,
            Bug = @Bug,
            ThoiGianTruyen = @ThoiGianTruyen,
            CenterResponseMessage = @CenterResponseMessage,
            Srcdn = @Srcdn,
            Srcdx = @Srcdx,
            StartLatitude = @StartLatitude,
            StartLongitude = @StartLongitude,
            EndLatitude = @EndLatitude,
            EndLongitude = @EndLongitude,
            NgayBackup = GETDATE(),
            MaKhoaHocKetThuc = @MaKhoaHocKetThuc
          WHERE SessionId = @SessionId;
        END
        ELSE
        BEGIN
          INSERT INTO [BACK_UP].[dbo].[backup_hanh_trinh] (
            ID, SessionId, MaDK, MaKhoaHoc, KhoaHoc, HoTen, IDGV, HoTenGV, HangDaoTao, BienSo, Imei,
            ThoiDiemDangNhap, ThoiDiemDangXuat, TongThoiGian, TongQuangDuong, ThoiGianBanDem, QuangDuongBanDem, Tile,
            IsSend, Bug, ThoiGianTruyen, CenterResponseMessage, Srcdn, Srcdx, StartLatitude, StartLongitude, EndLatitude, EndLongitude,
            NgayBackup, MaKhoaHocKetThuc
          ) VALUES (
            @ID, @SessionId, @MaDK, @MaKhoaHoc, @KhoaHoc, @HoTen, @IDGV, @HoTenGV, @HangDaoTao, @BienSo, @Imei,
            @ThoiDiemDangNhap, @ThoiDiemDangXuat, @TongThoiGian, @TongQuangDuong, @ThoiGianBanDem, @QuangDuongBanDem, @Tile,
            @IsSend, @Bug, @ThoiGianTruyen, @CenterResponseMessage, @Srcdn, @Srcdx, @StartLatitude, @StartLongitude, @EndLatitude, @EndLongitude,
            GETDATE(), @MaKhoaHocKetThuc
          );
        END
      `);
      successCount++;
    } catch (err) {
      console.error(`[backupRepo] upsertBackUpHanhTrinh single record failed for SessionId ${session.SessionId}:`, err.message);
    }
  }
  return successCount;
}

async function checkOverlap({ ma_khoa, start_date, end_date, type, page = 1, limit = 20 } = {}) {
  const pool = await connectSQL();
  const request = pool.request();
  request.timeout = 300000; // 5 minutes request timeout to prevent tedious timeout errors

  let whereClauses = [];
  if (ma_khoa) {
    let maKhoaArr = Array.isArray(ma_khoa) ? ma_khoa : String(ma_khoa).split(",").map(k => k.trim()).filter(Boolean);
    if (maKhoaArr.length > 0) {
      const clauses = maKhoaArr.map((mk, idx) => {
        const paramName = `maKhoa_${idx}`;
        request.input(paramName, mssql.NVarChar(50), mk);
        return `p1.MaKhoaHocKetThuc = @${paramName} OR p2.MaKhoaHocKetThuc = @${paramName} OR p1.MaKhoaHoc = @${paramName} OR p2.MaKhoaHoc = @${paramName}`;
      });
      whereClauses.push(`(${clauses.join(" OR ")})`);
    }
  }

  if (start_date) {
    request.input("startDate", mssql.DateTime, new Date(start_date));
    whereClauses.push("(p1.ThoiDiemDangNhap >= @startDate OR p2.ThoiDiemDangNhap >= @startDate)");
  }
  if (end_date) {
    request.input("endDate", mssql.DateTime, new Date(end_date));
    whereClauses.push("(p1.ThoiDiemDangNhap <= @endDate OR p2.ThoiDiemDangNhap <= @endDate)");
  }

  const whereClauseStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  // 1. Fetch Xe overlaps if requested or if checking both
  let listXe = [];
  if (!type || type === "xe") {
    const queryXe = `
      SELECT 
          p1.ID AS id1, p1.SessionId AS sessionId1, p1.MaDK AS maDk1, p1.HoTen AS hoTen1, p1.MaKhoaHoc AS maKhoaHoc1, p1.BienSo AS bienSo1, p1.IDGV AS idGv1, p1.HoTenGV AS hoTenGv1, p1.ThoiDiemDangNhap AS thoiDiemDangNhap1, p1.ThoiDiemDangXuat AS thoiDiemDangXuat1, p1.MaKhoaHocKetThuc AS maKhoaHocKetThuc1,
          p2.ID AS id2, p2.SessionId AS sessionId2, p2.MaDK AS maDk2, p2.HoTen AS hoTen2, p2.MaKhoaHoc AS maKhoaHoc2, p2.BienSo AS bienSo2, p2.IDGV AS idGv2, p2.HoTenGV AS hoTenGv2, p2.ThoiDiemDangNhap AS thoiDiemDangNhap2, p2.ThoiDiemDangXuat AS thoiDiemDangXuat2, p2.MaKhoaHocKetThuc AS maKhoaHocKetThuc2
      FROM [BACK_UP].[dbo].[backup_hanh_trinh] p1 WITH (NOLOCK)
      INNER JOIN [BACK_UP].[dbo].[backup_hanh_trinh] p2 WITH (NOLOCK)
          ON p1.SessionId < p2.SessionId
          AND p1.BienSo = p2.BienSo 
          AND p1.BienSo IS NOT NULL 
          AND p1.BienSo <> '' 
          AND p2.ThoiDiemDangNhap < p1.ThoiDiemDangXuat 
          AND p2.ThoiDiemDangXuat > p1.ThoiDiemDangNhap
      ${whereClauseStr}
    `;
    const resXe = await request.query(queryXe);
    listXe = resXe.recordset || [];
  }

  // 2. Fetch GV overlaps if requested or if checking both
  let listGv = [];
  if (!type || type === "gv") {
    const queryGv = `
      SELECT 
          p1.ID AS id1, p1.SessionId AS sessionId1, p1.MaDK AS maDk1, p1.HoTen AS hoTen1, p1.MaKhoaHoc AS maKhoaHoc1, p1.BienSo AS bienSo1, p1.IDGV AS idGv1, p1.HoTenGV AS hoTenGv1, p1.ThoiDiemDangNhap AS thoiDiemDangNhap1, p1.ThoiDiemDangXuat AS thoiDiemDangXuat1, p1.MaKhoaHocKetThuc AS maKhoaHocKetThuc1,
          p2.ID AS id2, p2.SessionId AS sessionId2, p2.MaDK AS maDk2, p2.HoTen AS hoTen2, p2.MaKhoaHoc AS maKhoaHoc2, p2.BienSo AS bienSo2, p2.IDGV AS idGv2, p2.HoTenGV AS hoTenGv2, p2.ThoiDiemDangNhap AS thoiDiemDangNhap2, p2.ThoiDiemDangXuat AS thoiDiemDangXuat2, p2.MaKhoaHocKetThuc AS maKhoaHocKetThuc2
      FROM [BACK_UP].[dbo].[backup_hanh_trinh] p1 WITH (NOLOCK)
      INNER JOIN [BACK_UP].[dbo].[backup_hanh_trinh] p2 WITH (NOLOCK)
          ON p1.SessionId < p2.SessionId
          AND p1.IDGV = p2.IDGV 
          AND p1.IDGV IS NOT NULL 
          AND p1.IDGV <> '' 
          AND p2.ThoiDiemDangNhap < p1.ThoiDiemDangXuat 
          AND p2.ThoiDiemDangXuat > p1.ThoiDiemDangNhap
      ${whereClauseStr}
    `;
    const resGv = await request.query(queryGv);
    listGv = resGv.recordset || [];
  }

  // 3. Combine and Deduplicate
  const combined = [];
  const seenKeys = new Set();

  for (const row of listXe) {
    const key = `${row.sessionId1}_${row.sessionId2}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      combined.push(row);
    }
  }

  for (const row of listGv) {
    const key = `${row.sessionId1}_${row.sessionId2}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      combined.push(row);
    }
  }

  // 4. Sort by ThoiDiemDangNhap1 DESC
  combined.sort((a, b) => {
    const t1 = a.thoiDiemDangNhap1 ? new Date(a.thoiDiemDangNhap1).getTime() : 0;
    const t2 = b.thoiDiemDangNhap1 ? new Date(b.thoiDiemDangNhap1).getTime() : 0;
    return t2 - t1;
  });

  // 5. Paginate in memory
  const total = combined.length;
  const parsedLimit = parseInt(limit);
  const parsedPage = Math.max(1, parseInt(page));
  const offset = (parsedPage - 1) * parsedLimit;
  const paginatedData = combined.slice(offset, offset + parsedLimit);

  return {
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit),
    data: paginatedData
  };
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
  upsertBackUpHanhTrinh,
  checkOverlap,
  initializeBackupDatabase,
};
