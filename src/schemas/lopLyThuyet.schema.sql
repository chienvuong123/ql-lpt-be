IF OBJECT_ID(N'dbo.khoa_hoc', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.khoa_hoc (
    ma_khoa VARCHAR(20) NOT NULL PRIMARY KEY,
    ten_khoa NVARCHAR(100) NULL,
    mo_ta NVARCHAR(MAX) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
  );
END;

IF OBJECT_ID(N'dbo.hoc_vien', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.hoc_vien (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk VARCHAR(50) NOT NULL UNIQUE,
    ho_ten NVARCHAR(100) NOT NULL,
    cccd VARCHAR(20) NULL,
    nam_sinh INT NULL,
    khoa VARCHAR(20) NULL,
    ma_khoa VARCHAR(20) NULL,
    avatar_url NVARCHAR(255) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    CONSTRAINT FK_hoc_vien_khoa_hoc
      FOREIGN KEY (ma_khoa) REFERENCES dbo.khoa_hoc(ma_khoa)
  );
END;

IF OBJECT_ID(N'dbo.trang_thai_hoc_vien', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.trang_thai_hoc_vien (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk VARCHAR(50) NOT NULL UNIQUE,
    loai_ly_thuyet BIT NOT NULL DEFAULT 0,
    loai_het_mon BIT NOT NULL DEFAULT 0,
    ghi_chu NVARCHAR(MAX) NULL,
    thoi_gian_thay_doi_trang_thai DATETIME2(0) NULL,
    updated_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    updated_by NVARCHAR(100) NULL
  );
END;

-- Migration: keep table independent from hoc_vien and remove old columns.
IF OBJECT_ID(N'dbo.trang_thai_hoc_vien', N'U') IS NOT NULL
BEGIN
  DECLARE @DropDefaultSql NVARCHAR(MAX) = N'';

  SELECT @DropDefaultSql = @DropDefaultSql +
    N'ALTER TABLE dbo.trang_thai_hoc_vien DROP CONSTRAINT [' + dc.name + N'];'
  FROM sys.default_constraints dc
  JOIN sys.columns c
    ON c.default_object_id = dc.object_id
  JOIN sys.tables t
    ON t.object_id = c.object_id
  WHERE t.name = N'trang_thai_hoc_vien'
    AND c.name IN (N'cabin', N'dat', N'tot_nghiep');

  IF LEN(@DropDefaultSql) > 0
    EXEC sp_executesql @DropDefaultSql;

  IF COL_LENGTH(N'dbo.trang_thai_hoc_vien', N'cabin') IS NOT NULL
    ALTER TABLE dbo.trang_thai_hoc_vien DROP COLUMN cabin;
  IF COL_LENGTH(N'dbo.trang_thai_hoc_vien', N'dat') IS NOT NULL
    ALTER TABLE dbo.trang_thai_hoc_vien DROP COLUMN dat;
  IF COL_LENGTH(N'dbo.trang_thai_hoc_vien', N'tot_nghiep') IS NOT NULL
    ALTER TABLE dbo.trang_thai_hoc_vien DROP COLUMN tot_nghiep;

  IF COL_LENGTH(N'dbo.trang_thai_hoc_vien', N'thoi_gian_thay_doi_trang_thai') IS NULL
    ALTER TABLE dbo.trang_thai_hoc_vien
      ADD thoi_gian_thay_doi_trang_thai DATETIME2(0) NULL;

  DECLARE @DropFKSql NVARCHAR(MAX) = N'';
  SELECT @DropFKSql = @DropFKSql +
    N'ALTER TABLE dbo.trang_thai_hoc_vien DROP CONSTRAINT [' + fk.name + N'];'
  FROM sys.foreign_keys fk
  JOIN sys.tables t
    ON t.object_id = fk.parent_object_id
  WHERE t.name = N'trang_thai_hoc_vien';

  IF LEN(@DropFKSql) > 0
    EXEC sp_executesql @DropFKSql;
END;

IF OBJECT_ID(N'dbo.lich_su_thay_doi', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.lich_su_thay_doi (
    id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk VARCHAR(50) NOT NULL,
    truong_thay_doi VARCHAR(50) NOT NULL,
    gia_tri_cu BIT NULL,
    gia_tri_moi BIT NULL,
    thoi_gian DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
    nguoi_thay_doi NVARCHAR(100) NULL
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.khoa_hoc WHERE ma_khoa = 'K26C1002')
BEGIN
  INSERT INTO dbo.khoa_hoc (ma_khoa, ten_khoa)
  VALUES ('K26C1002', N'Khoa 26 - Lop C1002');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.khoa_hoc WHERE ma_khoa = 'K25C1001')
BEGIN
  INSERT INTO dbo.khoa_hoc (ma_khoa, ten_khoa)
  VALUES ('K25C1001', N'Khoa 25 - Lop C1001');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.hoc_vien WHERE ma_dk = '30004-20260303133006143')
BEGIN
  INSERT INTO dbo.hoc_vien (ma_dk, ho_ten, cccd, nam_sinh, khoa, ma_khoa)
  VALUES ('30004-20260303133006143', N'LE DANG HAI DANG', '030207010823', 2007, 'K26C1002', 'K26C1002');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.hoc_vien WHERE ma_dk = '30004-20260303133729860')
BEGIN
  INSERT INTO dbo.hoc_vien (ma_dk, ho_ten, cccd, nam_sinh, khoa, ma_khoa)
  VALUES ('30004-20260303133729860', N'DANG TUAN THANH', '030099004990', 1999, 'K26C1002', 'K26C1002');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.hoc_vien WHERE ma_dk = '30004-20260303133636283')
BEGIN
  INSERT INTO dbo.hoc_vien (ma_dk, ho_ten, cccd, nam_sinh, khoa, ma_khoa)
  VALUES ('30004-20260303133636283', N'DANG HAI ANH', '030098011229', 1998, 'K26C1002', 'K26C1002');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.hoc_vien WHERE ma_dk = '30004-20260303133621013')
BEGIN
  INSERT INTO dbo.hoc_vien (ma_dk, ho_ten, cccd, nam_sinh, khoa, ma_khoa)
  VALUES ('30004-20260303133621013', N'LE VAN TU ANH', '030099005235', 1999, 'K26C1002', 'K26C1002');
END;

IF NOT EXISTS (SELECT 1 FROM dbo.hoc_vien WHERE ma_dk = '30004-20260303133504103')
BEGIN
  INSERT INTO dbo.hoc_vien (ma_dk, ho_ten, cccd, nam_sinh, khoa, ma_khoa)
  VALUES ('30004-20260303133504103', N'TRAN BA DAI', '030097009784', 1997, 'K26C1002', 'K26C1002');
END;

INSERT INTO dbo.trang_thai_hoc_vien (ma_dk)
SELECT hv.ma_dk
FROM dbo.hoc_vien hv
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.trang_thai_hoc_vien tt WHERE tt.ma_dk = hv.ma_dk
);
