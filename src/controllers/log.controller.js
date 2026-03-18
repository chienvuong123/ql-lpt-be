const connectSQL = require("../configs/sql");
const sql = require("mssql");

async function getLichSuThayDoi(req, res) {
  try {
    const {
      ma_dk,
      loai,
      ref_id,
      truong_thay_doi,
      nguoi_thay_doi,
      page = 1,
      limit = 50,
    } = req.query;

    const pool = await connectSQL();
    const conditions = ["1=1"];

    const buildRequest = () => {
      const request = pool.request();
      if (ma_dk) {
        conditions.push("ma_dk = @ma_dk");
        request.input("ma_dk", sql.VarChar, ma_dk);
      }
      if (loai) {
        conditions.push("loai = @loai");
        request.input("loai", sql.VarChar, loai);
      }
      if (ref_id) {
        conditions.push("ref_id = @ref_id");
        request.input("ref_id", sql.Int, Number(ref_id));
      }
      if (truong_thay_doi) {
        conditions.push("truong_thay_doi = @truong_thay_doi");
        request.input("truong_thay_doi", sql.VarChar, truong_thay_doi);
      }
      if (nguoi_thay_doi) {
        conditions.push("nguoi_thay_doi LIKE @nguoi_thay_doi");
        request.input("nguoi_thay_doi", sql.NVarChar, `%${nguoi_thay_doi}%`);
      }
      return request;
    };

    const offset = (Number(page) - 1) * Number(limit);
    const where = conditions.join(" AND ");

    const dataRequest = buildRequest();
    dataRequest.input("limit", sql.Int, Number(limit));
    dataRequest.input("offset", sql.Int, offset);

    const [dataResult, countResult] = await Promise.all([
      dataRequest.query(`
        SELECT id, ma_dk, loai, ref_id, truong_thay_doi,
               gia_tri_cu, gia_tri_moi, nguoi_thay_doi, thoi_gian
        FROM   lich_su_thay_doi
        WHERE  ${where}
        ORDER  BY thoi_gian DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
      pool.request().query(`
        SELECT COUNT(*) AS total
        FROM   lich_su_thay_doi
        WHERE  ${where}
      `),
    ]);

    return res.json({
      success: true,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: countResult.recordset[0].total,
        totalPages: Math.ceil(countResult.recordset[0].total / Number(limit)),
      },
      data: dataResult.recordset,
    });
  } catch (err) {
    console.error("[getLichSuThayDoi]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getLichSuThayDoi };
