const fs = require('fs');

function addToastToComponent(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  if (!content.includes('from "react-hot-toast"') && !content.includes("from 'react-hot-toast'")) {
    content = content.replace(/(import .*?;[\r\n]+)(?!import )/, "$1import toast from 'react-hot-toast';\n");
  }

  // Easy string replacements for strings in double quotes, single quotes, or backticks
  content = content.replace(/setSuccess\("(.+?)"\)/g, 'toast.success("$1"); setSuccess("$1")');
  content = content.replace(/setSuccess\('(.+?)'\)/g, "toast.success('$1'); setSuccess('$1')");
  content = content.replace(/setSuccess\((`.+?`)\)/g, "toast.success($1); setSuccess($1)");
  
  content = content.replace(/setSuccessMessage\("(.+?)"\)/g, 'toast.success("$1"); setSuccessMessage("$1")');
  content = content.replace(/setSuccessMessage\('(.+?)'\)/g, "toast.success('$1'); setSuccessMessage('$1')");
  content = content.replace(/setSuccessMessage\((`.+?`)\)/g, "toast.success($1); setSuccessMessage($1)");
  
  content = content.replace(/setError\("(.+?)"\)/g, 'toast.error("$1"); setError("$1")');
  content = content.replace(/setError\('(.+?)'\)/g, "toast.error('$1'); setError('$1')");
  content = content.replace(/setError\((`.+?`)\)/g, "toast.error($1); setError($1)");

  content = content.replace(/setErrorMessage\("(.+?)"\)/g, 'toast.error("$1"); setErrorMessage("$1")');
  
  // Specific replacements for the error message variables like `err.message` or `error.message`
  content = content.replace(/setError\((.+? instanceof Error \? .+? : .+?)\)/g, 'const errMsg = $1; toast.error(errMsg); setError(errMsg)');
  // handle simpler variables: setError(err.message) -> toast.error(...)
  content = content.replace(/setError\((err\.message)\)/g, 'toast.error($1); setError($1)');
  
  // There are some multi-line success cases:
  // e.g. setSuccess(`Something \n stuff`)
  
  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("Updated", filePath);
  }
}

[
  'src/app/(dashboard)/account/[id]/account-transactions-client.tsx',
  'src/app/(dashboard)/settings/settings-client.tsx',
  'src/app/login/page.tsx',
  'src/components/AdminDashboard.tsx',
  'src/components/AuditLogsDashboard.tsx',
  'src/components/BankStatementsDashboard.tsx',
  'src/components/ClientPaymentsDashboard.tsx',
  'src/components/EmployeeExpenseSubmission.tsx'
].forEach(addToastToComponent);
