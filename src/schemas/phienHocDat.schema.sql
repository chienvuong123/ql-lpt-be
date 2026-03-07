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

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'nguoi_thay_doi') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD nguoi_thay_doi NVARCHAR(100) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'thoi_gian_thay_doi') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD thoi_gian_thay_doi DATETIME2(0) NULL;
GO

IF COL_LENGTH(N'dbo.phien_hoc_dat', N'updated_at') IS NULL
  ALTER TABLE dbo.phien_hoc_dat ADD updated_at DATETIME2(0) NULL;
GO
