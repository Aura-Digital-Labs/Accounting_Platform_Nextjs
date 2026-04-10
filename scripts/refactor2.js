const fs = require('fs');

async function main() {
  const target = 'C:/Users/Thakshana/accounting-app/src/components/AdminDashboard.tsx';
  let code = fs.readFileSync(target, 'utf8');
  
  // Replace the three modal states with one
  code = code.replace(
    /const \[showCreateAdmin, setShowCreateAdmin\] = useState\(false\);\n\s*const \[showCreateEmployee, setShowCreateEmployee\] = useState\(false\);\n\s*const \[showCreatePm, setShowCreatePm\] = useState\(false\);/g,
    `const [showCreateUser, setShowCreateUser] = useState(false);`
  );

  // Replace user and pm forms with unified one
  code = code.replace(
    /const \[userForm, setUserForm\] = useState\(\{ fullName: "", email: "", password: "" \}\);\n\s*const \[pmForm, setPmForm\] = useState\(\{ fullName: "", email: "", password: "", pettyCashAccountId: "" \}\);/g,
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

  // In close buttons for modals:
  code = code.replace(/setShowCreateAdmin\(false\)/g, 'setShowCreateUser(false)');
  code = code.replace(/setShowCreateEmployee\(false\)/g, 'setShowCreateUser(false)');
  code = code.replace(/setShowCreatePm\(false\)/g, 'setShowCreateUser(false)');

  // Merge the handlers handleCreateUser and handleCreatePm.

  // We find "const handleCreateUser = async (e: React.FormEvent) =>" till "const handleCreateProject = async"
  const submitStartIndex = code.indexOf('const handleCreateUser = async');
  const submitEndIndex = code.indexOf('const handleCreateProject = async');

  const newHandleSubmit = `const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!userForm.fullName || !userForm.email || !userForm.password) {
      setError("Please fill out all required fields.");
      return;
    }
    
    if (userForm.role === "project_manager" && !userForm.pettyCashAccountId) {
      setError("Please select a petty cash account for the PM.");
      return;
    }

    try {
      const endpoint = userForm.role === "project_manager" ? "/api/users/project-managers" : "/api/users";
      
      const payload: any = {
        full_name: userForm.fullName,
        email: userForm.email,
        password: userForm.password,
        role: userForm.role,
      };
      
      if (userForm.role === "project_manager") {
         payload.petty_cash_account_id = Number(userForm.pettyCashAccountId);
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const payloadData = (await res.json()) as { detail?: string };
        throw new Error(payloadData.detail || "Failed to create user");
      }

      const createdUser = await res.json();
      
      // Handle PM projects
      if (userForm.role === "project_manager" && userForm.selectedProjects.length > 0) {
         await fetch(\`/api/users/project-managers/\${createdUser.id}/assignments\`, {
           method: "POST",
           headers: { "Content-Type": "application/json" },
           body: JSON.stringify({ project_ids: userForm.selectedProjects })
         });
      }
      
      // Handle Client / Employee projects 
      if ((userForm.role === "employee" || userForm.role === "client") && userForm.selectedProjects.length > 0) {
         for (const projectId of userForm.selectedProjects) {
            const project = data.projects.find(p => p.id === projectId);
            if (!project) continue;
            
            const patchPayload: any = {};
            if (userForm.role === "employee") {
               patchPayload.employee_ids = [...(project.employee_ids || []), createdUser.id];
               patchPayload.client_ids = project.client_ids || [];
            } else if (userForm.role === "client") {
               patchPayload.client_ids = [...(project.client_ids || []), createdUser.id];
               patchPayload.employee_ids = project.employee_ids || [];
            }
            
            patchPayload.user_ids = Array.from(new Set([...(project.user_ids || []), createdUser.id]));
            patchPayload.budget = Number(project.budget);
            patchPayload.account_id = Number(project.account_id);
            
            await fetch(\`/api/projects/\${projectId}\`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchPayload)
            });
         }
      }

      setSuccess("User created successfully.");
      setUserForm({ fullName: "", email: "", password: "", role: "employee", pettyCashAccountId: "", selectedProjects: [] });
      setShowCreateUser(false);
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create user");
    }
  };

  `;

  if (submitStartIndex !== -1 && submitEndIndex !== -1) {
     code = code.substring(0, submitStartIndex) + newHandleSubmit + code.substring(submitEndIndex);
  }

  // Remove existing admin/pm modals and replace with our unified generic form
  code = code.replace(
      /\{showCreateUser && \([\s\S]*?\{showCreateUser && \([\s\S]*?<\/div>[\s]*<\/div>[\s]*\)\}/,
`{showCreateUser && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalPanel}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create User</h3>
              <button className={styles.secondaryButton} type="button" onClick={() => setShowCreateUser(false)}>
                Close
              </button>
            </div>

            {error && <div className={styles.errorAlert}>{error}</div>}
            {success && <div className={styles.successAlert}>{success}</div>}

            <form onSubmit={handleCreateUser} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Title / Role</label>
                <select
                  className={styles.select}
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value as any, selectedProjects: [] })}
                >
                  <option value="employee">Employee</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                  <option value="financial_officer">Financial Officer</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name</label>
                <input
                  className={styles.input}
                  value={userForm.fullName}
                  onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Email</label>
                <input
                  type="email"
                  className={styles.input}
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Password</label>
                <input
                  type="password"
                  className={styles.input}
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  required
                />
              </div>

              {userForm.role === "project_manager" && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>Petty Cash Account</label>
                  <select
                    className={styles.select}
                    value={userForm.pettyCashAccountId}
                    onChange={(e) => setUserForm({ ...userForm, pettyCashAccountId: e.target.value })}
                    required
                  >
                    <option value="">Select Petty Cash Account</option>
                    {data.accounts.filter(a => a.type === "asset").map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {(userForm.role === "project_manager" || userForm.role === "client" || userForm.role === "employee") && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>Assign Projects</label>
                  <select
                    className={styles.select}
                    multiple
                    size={4}
                    value={userForm.selectedProjects}
                    onChange={(e) => {
                      const options = e.target.options;
                      const values = [];
                      for (let i = 0; i < options.length; i++) {
                        if (options[i].selected) values.push(options[i].value);
                      }
                      setUserForm({ ...userForm, selectedProjects: values });
                    }}
                  >
                    {data.projects.map(p => (
                      <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                    ))}
                  </select>
                  <small className={styles.helpText}>Hold Ctrl/Cmd to select multiple</small>
                </div>
              )}

              <div className={styles.actionsRowSimple}>
                <button className={styles.primaryButton} type="submit">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}`
  );

  // In DashboardOverview prop, replace it
  code = code.replace(
      /setShowCreateEmployee\(true\);\s*setShowCreateUser\(false\);\s*setShowCreateUser\(false\);/g,
      'setShowCreateUser(true);'
  );

  fs.writeFileSync(target, code);
  console.log("Refactoring complete");
}

main().catch(console.error);
