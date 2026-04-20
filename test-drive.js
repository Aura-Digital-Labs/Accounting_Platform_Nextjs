const { ensureDrivePath } = require('./src/lib/googleDrive');
require('dotenv').config();

async function main() {
  try {
    const p = await ensureDrivePath(["Accounting Platform", "Financial_Records", "Bank_Statements", "test"]);
    console.log(p);
  } catch (e) {
    console.error("DRIVE ERROR:", e);
  }
}
main();