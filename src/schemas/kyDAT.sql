IF OBJECT_ID(N'dbo.ky_dat', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ky_dat (
    id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk       VARCHAR(50)       NOT NULL UNIQUE,
    ten_hoc_vien NVARCHAR(100)    NULL,
    ngay_sinh   DATE              NULL,
    khoa_hoc    NVARCHAR(100)     NULL,
    ma_khoa     VARCHAR(20)       NULL,
    hang_dao_tao NVARCHAR(100)    NULL,
    gv_dat      NVARCHAR(100)     NULL,
    trang_thai  NVARCHAR(50)      NULL,
    anh         NVARCHAR(255)     NULL,
    can_cuoc    NVARCHAR(255)     NULL,
    ghi_chu_1   NVARCHAR(MAX)     NULL,
    ghi_chu_2   NVARCHAR(MAX)     NULL,
    created_at  DATETIME2(0)      NOT NULL DEFAULT SYSDATETIME(),
    updated_at  DATETIME2(0)      NOT NULL DEFAULT SYSDATETIME(),
    updated_by  NVARCHAR(100)     NULL
  );
END;