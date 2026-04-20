import { ensureDrivePath } from "./src/lib/googleDrive";

async function run() {
  try {
    const parentId = await ensureDrivePath(["Accounting Platform", "Financial_Records", "Bank_Statements", "1010-001"]);
    console.log("Success:", parentId);
  } catch (err) {
    console.error("FAIL:", err);
  }
}
run();