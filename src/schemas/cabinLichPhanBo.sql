IF OBJECT_ID(N'dbo.cabin_lich_phan_bo', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.cabin_lich_phan_bo (
    id           BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ma_dk        VARCHAR(50)          NULL,
    ngay         DATE                 NOT NULL,
    ca_hoc       INT                  NOT NULL,
    cabin_so     INT                  NOT NULL,
    gio_bat_dau  VARCHAR(10)          NULL,
    gio_ket_thuc VARCHAR(10)          NULL,
    is_locked    BIT                  DEFAULT 0,
    ghi_chu      NVARCHAR(MAX)        NULL,
    ma_khoa      VARCHAR(50)          NULL,
    giao_vien    NVARCHAR(100)        NULL,
    is_makeup    BIT                  DEFAULT 0,
    is_thieu_gio BIT                  DEFAULT 0,
    thoi_gian_hoc INT                 NULL,
    thoi_gian_tong INT                NULL,
    created_at   DATETIME2(0)         NOT NULL DEFAULT SYSDATETIME()
  );
  
  -- Index for performance on queries by date or student
  CREATE INDEX IX_cabin_lich_ngay ON dbo.cabin_lich_phan_bo(ngay);
  CREATE INDEX IX_cabin_lich_ma_dk ON dbo.cabin_lich_phan_bo(ma_dk);
END;
