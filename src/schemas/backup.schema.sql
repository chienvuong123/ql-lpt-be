-- SQL Script to create BACK_UP database and its tables

-- 1. Create database BACK_UP if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'BACK_UP')
BEGIN
    CREATE DATABASE [BACK_UP];
END
GO

USE [BACK_UP];
GO

-- 2. Table: BACK_UP_HANH_TRINH
IF OBJECT_ID(N'dbo.BACK_UP_HANH_TRINH', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.BACK_UP_HANH_TRINH (
        ID                    INT NULL,
        SessionId             NVARCHAR(50) NOT NULL PRIMARY KEY,
        MaDK                  NVARCHAR(100) NULL,
        MaKhoaHoc             NVARCHAR(50) NULL,
        KhoaHoc               NVARCHAR(50) NULL,
        HoTen                 NVARCHAR(100) NULL,
        IDGV                  NVARCHAR(20) NULL,
        HoTenGV               NVARCHAR(100) NULL,
        HangDaoTao            NVARCHAR(10) NULL,
        BienSo                NVARCHAR(20) NULL,
        Imei                  NVARCHAR(50) NULL,
        ThoiDiemDangNhap      DATETIME NULL,
        ThoiDiemDangXuat      DATETIME NULL,
        TongThoiGian          INT NULL,
        TongQuangDuong        FLOAT NULL,
        ThoiGianBanDem        INT NULL,
        QuangDuongBanDem      FLOAT NULL,
        Tile                  FLOAT NULL,
        IsSend                BIT NULL,
        Bug                   INT NULL,
        ThoiGianTruyen        DATETIME NULL,
        CenterResponseMessage NVARCHAR(MAX) NULL,
        Srcdn                 NVARCHAR(500) NULL,
        Srcdx                 NVARCHAR(500) NULL,
        StartLatitude         FLOAT NULL,
        StartLongitude        FLOAT NULL,
        EndLatitude           FLOAT NULL,
        EndLongitude          FLOAT NULL,
        NgayBackup            DATETIME DEFAULT GETDATE(),
        MaKhoaHocKetThuc      NVARCHAR(50) NULL
    );
END
GO

-- 3. Table: backup_camera_snapshot
IF OBJECT_ID(N'dbo.backup_camera_snapshot', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.backup_camera_snapshot (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        lotus_snapshot_id  VARCHAR(100) NULL,
        ma_dk              VARCHAR(100) NOT NULL,
        enrolment_plan_iid VARCHAR(100) NULL,
        item_iid           VARCHAR(100) NULL,
        image_url          VARCHAR(500) NOT NULL,
        captured_at        INT NOT NULL,
        captured_at_iso    DATETIME2(0) NULL,
        verify_status      NVARCHAR(50) NULL,
        synced_at          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_backup_camera_snapshot UNIQUE (ma_dk, captured_at, image_url)
    );
END
GO

-- 4. Table: backup_learning_time
IF OBJECT_ID(N'dbo.backup_learning_time', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.backup_learning_time (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ma_dk              VARCHAR(100) NOT NULL,
        enrolment_plan_iid VARCHAR(100) NOT NULL,
        item_iid           VARCHAR(100) NOT NULL,
        item_name          NVARCHAR(255) NULL,
        total_time         INT NOT NULL DEFAULT 0,
        progress           DECIMAL(5,2) NOT NULL DEFAULT 0.0,
        last_learned_at    INT NULL,
        last_learned_at_iso DATETIME2(0) NULL,
        synced_at          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_backup_learning_time UNIQUE (ma_dk, enrolment_plan_iid, item_iid)
    );
END
GO

-- 5. Table: backup_score_by_rubric
IF OBJECT_ID(N'dbo.backup_score_by_rubric', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.backup_score_by_rubric (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ma_dk              VARCHAR(100) NOT NULL,
        enrolment_plan_iid VARCHAR(100) NOT NULL,
        rubric_iid         VARCHAR(100) NOT NULL,
        rubric_name        NVARCHAR(255) NULL,
        score              DECIMAL(10,2) NOT NULL DEFAULT 0.0,
        cp                 DECIMAL(5,2) NOT NULL DEFAULT 0.0,
        passed             INT NOT NULL DEFAULT 0,
        score_by_rubrik    NVARCHAR(MAX) NULL,
        synced_at          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_backup_score_by_rubric UNIQUE (ma_dk, enrolment_plan_iid, rubric_iid)
    );
END
GO

-- 6. Table: backup_tien_do_hoan_thanh
IF OBJECT_ID(N'dbo.backup_tien_do_hoan_thanh', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.backup_tien_do_hoan_thanh (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        ma_dk              VARCHAR(100) NOT NULL,
        enrolment_plan_iid VARCHAR(100) NOT NULL,
        course_iid         VARCHAR(100) NOT NULL,
        course_name        NVARCHAR(255) NULL,
        cp                 DECIMAL(5,2) NOT NULL DEFAULT 0.0,
        p                  DECIMAL(10,2) NOT NULL DEFAULT 0.0,
        pf                 INT NOT NULL DEFAULT 0,
        rubric_iid         VARCHAR(100) NULL,
        synced_at          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_backup_tien_do_hoan_thanh UNIQUE (ma_dk, enrolment_plan_iid, course_iid)
    );
END
GO

-- 7. Table: backup_time_tracking
IF OBJECT_ID(N'dbo.backup_time_tracking', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.backup_time_tracking (
        id                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        lotus_log_id       VARCHAR(100) NULL,
        ma_dk              VARCHAR(100) NOT NULL,
        enrolment_plan_iid VARCHAR(100) NULL,
        item_iid           VARCHAR(100) NULL,
        item_name          NVARCHAR(255) NULL,
        start_time         INT NOT NULL,
        start_time_iso     DATETIME2(0) NULL,
        end_time           INT NULL,
        end_time_iso       DATETIME2(0) NULL,
        duration           INT NOT NULL DEFAULT 0,
        device             NVARCHAR(255) NULL,
        ip_address         VARCHAR(50) NULL,
        synced_at          DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        CONSTRAINT UQ_backup_time_tracking UNIQUE (ma_dk, start_time, item_iid)
    );
END
GO

-- 8. Table: hoc_vien_hoc_tap
IF OBJECT_ID(N'dbo.hoc_vien_hoc_tap', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.hoc_vien_hoc_tap (
        ma_dk              VARCHAR(100) NOT NULL PRIMARY KEY,
        ma_khoa            VARCHAR(20) NULL,
        enrolment_plan_iid VARCHAR(100) NULL,
        total_hour_learned DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
        progress           DECIMAL(5, 2) NOT NULL DEFAULT 0.0,
        passed             BIT NOT NULL DEFAULT 0,
        learned            BIT NOT NULL DEFAULT 0,
        score_by_rubrik    NVARCHAR(MAX) NULL,
        updated_at         DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
    );
END
GO
