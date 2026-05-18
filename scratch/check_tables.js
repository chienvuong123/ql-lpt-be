const connectSQL = require("../src/configs/sql");
const sql = require("mssql");

async function check() {
  try {
    const pool = await connectSQL();
    const req = pool.request();
    
    console.log("=== CHECKING TABLE: phien_hoc_duyet_log ===");
    const cols = await req.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'phien_hoc_duyet_log'
    `);
    console.table(cols.recordset);

    console.log("=== CHECKING FOREIGN KEYS FOR phien_hoc_duyet_log ===");
    const fks = await req.query(`
      SELECT 
          obj.name AS FK_name,
          parent_tab.name AS Parent_table,
          parent_col.name AS Parent_column,
          ref_tab.name AS Referenced_table,
          ref_col.name AS Referenced_column
      FROM sys.foreign_key_columns fkc
      INNER JOIN sys.objects obj ON fkc.constraint_object_id = obj.object_id
      INNER JOIN sys.tables parent_tab ON fkc.parent_object_id = parent_tab.object_id
      INNER JOIN sys.columns parent_col ON fkc.parent_object_id = parent_col.object_id AND fkc.parent_column_id = parent_col.column_id
      INNER JOIN sys.tables ref_tab ON fkc.referenced_object_id = ref_tab.object_id
      INNER JOIN sys.columns ref_col ON fkc.referenced_object_id = ref_col.object_id AND fkc.referenced_column_id = ref_col.column_id
      WHERE parent_tab.name = 'phien_hoc_duyet_log'
    `);
    console.table(fks.recordset);

    console.log("=== CHECKING TABLE: hoc_vien_duyet_log ===");
    const cols2 = await req.query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'hoc_vien_duyet_log'
    `);
    console.table(cols2.recordset);

    console.log("=== CHECKING FOREIGN KEYS FOR hoc_vien_duyet_log ===");
    const fks2 = await req.query(`
      SELECT 
          obj.name AS FK_name,
          parent_tab.name AS Parent_table,
          parent_col.name AS Parent_column,
          ref_tab.name AS Referenced_table,
          ref_col.name AS Referenced_column
      FROM sys.foreign_key_columns fkc
      INNER JOIN sys.objects obj ON fkc.constraint_object_id = obj.object_id
      INNER JOIN sys.tables parent_tab ON fkc.parent_object_id = parent_tab.object_id
      INNER JOIN sys.columns parent_col ON fkc.parent_object_id = parent_col.object_id AND fkc.parent_column_id = parent_col.column_id
      INNER JOIN sys.tables ref_tab ON fkc.referenced_object_id = ref_tab.object_id
      INNER JOIN sys.columns ref_col ON fkc.referenced_object_id = ref_col.object_id AND fkc.referenced_column_id = ref_col.column_id
      WHERE parent_tab.name = 'hoc_vien_duyet_log'
    `);
    console.table(fks2.recordset);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
