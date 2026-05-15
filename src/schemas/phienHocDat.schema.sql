IF OBJECT_ID(N'dbo.phien_hoc_dat', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.phien_hoc_dat (
    id                 INT IDENTITY(1,1) PRIMARY KEY,
    ma_dk              NVARCHAR(50) NOT NULL,
    ma_hoc_vien        NVARCHAR(50) NULL,
    ngay               NVARCHAR(20),
    gio_tu             NVARCHAR(20) NULL,
    gio_den            NVARCHAR(20) NULL,
    bien_so_xe         NVARCHAR(20) NULL,
    so_km              FLOAT NULL,
    thoi_gian          NVARCHAR(20) NULL,
    trang_thai         NVARCHAR(20) NOT NULL DEFAULT N'CHO_DUYET',
    nguoi_thay_doi     NVARCHAR(100) NULL,
    thoi_gian_thay_doi DATETIME2(0) NULL,
    updated_at         DATETIME2(0) NULL
  );
END;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ma_hoc_vien') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ma_hoc_vien NVARCHAR(50) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'phien_hoc_id') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD phien_hoc_id INT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ma_khoa') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ma_khoa NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ly_do_tong') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ly_do_tong NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ly_do_td') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ly_do_td NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ly_do_dem') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ly_do_dem NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ly_do_so_san') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ly_do_so_san NVARCHAR(500) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'duyet_tong') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD duyet_tong BIT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'duyet_tu_dong') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD duyet_tu_dong BIT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'duyet_dem') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD duyet_dem BIT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'duyet_so_san') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD duyet_so_san BIT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'id_gv') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD id_gv NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ho_ten_gv') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ho_ten_gv NVARCHAR(255) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'ho_ten_hv') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD ho_ten_hv NVARCHAR(255) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'thoi_gian_dem') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD thoi_gian_dem FLOAT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'quang_duong_dem') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD quang_duong_dem FLOAT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'tile') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD tile FLOAT NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'guid_session_id') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD guid_session_id NVARCHAR(200) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'nguoi_thay_doi') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD nguoi_thay_doi NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'thoi_gian_thay_doi') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD thoi_gian_thay_doi DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'created_at') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD created_at DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'updated_at') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD updated_at DATETIME2(0) NULL;
GO

