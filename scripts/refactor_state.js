const fs = require('fs');

async function main() {
  const target = 'c:/Users/Thakshana/accounting-app/src/components/AdminDashboard.tsx';
  let code = fs.readFileSync(target, 'utf8');

  // 1. Replace State Variables
  code = code.replace(
    /const \[showCreateAdmin, setShowCreateAdmin\] = useState\(false\);\s*const \[showCreateEmployee, setShowCreateEmployee\] = useState\(false\);\s*const \[showCreatePm, setShowCreatePm\] = useState\(false\);/g,
    `const [showCreateUser, setShowCreateUser] = useState(false);`
  );

  // 2. Replace Form Variables
  code = code.replace(
    /const \[userForm, setUserForm\] = useState\(\{ fullName: "", email: "", password: "" \}\);\s*const \[pmForm, setPmForm\] = useState\(\{ fullName: "", email: "", password: "", pettyCashAccountId: "" \}\);/g,
    `const [userForm, setUserForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: "admin" | "financial_officer" | "employee" | "project_manager" | "client";
    pettyCashAccountId: string;
    selectedProjects: string[];
  }>({
    fullName: "",
    email: "",
    password: "",
    role: "employee",
    pettyCashAccountId: "",
    selectedProjects: []
  });`
  );

  fs.writeFileSync(target, code);
  console.log("Refactored state definitions");
}

main().catch(console.error);