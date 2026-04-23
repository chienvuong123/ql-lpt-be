const { google } = require("googleapis");
const fs = require("fs");
const readline = require("readline");

const credentials = require("./oauth_credentials.json");
const { client_id, client_secret, redirect_uris } = credentials.installed;

const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
);

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

// Tạo URL đăng nhập
const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
});

console.log("👉 Mở link này trên trình duyệt để đăng nhập:\n");
console.log(authUrl);
console.log();

// Nhập code từ browser
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

rl.question("Paste code (hoặc toàn bộ link) từ trình duyệt vào đây: ", async (input) => {
    rl.close();
    let code = input;

    // Nếu người dùng dán nguyên link, tự động tách lấy code
    try {
        if (input.startsWith("http")) {
            const url = new URL(input);
            code = url.searchParams.get("code") || input;
        }
    } catch (e) {
        // Không phải URL chuẩn, giữ nguyên input
    }

    if (!code || code === input && input.startsWith("http")) {
        // Trường hợp dán link nhưng không tìm thấy tham số code
        console.log("⚠️ Cảnh báo: Không tìm thấy tham số 'code' trong URL, sẽ thử dùng nguyên chuỗi bạn dán.");
    }

    try {
        const { tokens } = await oAuth2Client.getToken(code);

        // Lưu token vào file
        fs.writeFileSync("./token.json", JSON.stringify(tokens, null, 2));
        console.log("✅ Token đã lưu vào token.json!");
    } catch (error) {
        console.error("❌ Lỗi khi lấy token:", error.message);
        console.log("Gợi ý: Hãy chạy lại lệnh và chỉ copy phần mã 'code=' từ thanh địa chỉ.");
    }
});