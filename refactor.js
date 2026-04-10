
const fs = require("fs");
let code = fs.readFileSync("src/components/AdminDashboard.tsx", "utf8");

// Remove the big wrapper
code = code.replace(/\{\(viewMode === "all" \|\| viewMode === "detailed"\) && \(\n\s*<>\n/, "");
code = code.replace(/<\/div>\n\s*\)\}\n\n\s*<\/>\n\s*\)\}/, "</div>\n              )}");
code = code.replace(/\{\(viewMode === "all" \|\| viewMode === "overview"\) && \(/, "{showOverview && (");

// Add show conditions
code = code.replace(/<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Accounting Management<\/h2>/, "{showAccountingMgmt && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Accounting Management</h2>");
code = code.replace(/<\/div>\n\n\s*<\/section>\n\n\s*<section className=\{styles\.twoColumnGrid\}>/, "</div>\n\n        </section>\n        )}\n\n        {showHealth && (\n        <section className={styles.twoColumnGrid}>");
code = code.replace(/<\/div>\n\s*<\/article>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Pending Expenses<\/h2>/, "</div>\n          </article>\n        </section>\n        )}\n\n        {showPending && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Pending Expenses</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Pending Client Payments<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showPending && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Pending Client Payments</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Cash Flow<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showCashFlow && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Cash Flow</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Custom Accounts Table<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showCustomAccounts && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Custom Accounts Table</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Employer Accounts Table<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showEmployerAccounts && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Employer Accounts Table</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Project Accounts Table<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showProjectAccounts && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Project Accounts Table</h2>");
code = code.replace(/<\/div>\n\s*<\/section>\n\n\s*<section className=\{styles\.card\}>\n\s*<h2 className=\{styles\.sectionTitle\}>Project Managers Table<\/h2>/, "</div>\n        </section>\n        )}\n\n        {showProjectManagers && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Project Managers Table</h2>");
code = code.replace(/<\/div>\n\s*\)\}\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*\)\}\n\n\s*\{loading && \(/, "</div>\n              )}\n            </div>\n          </div>\n        </div>\n      )}\n      </section>\n      )}\n\n      {loading && (");

// Add bank table logic right after that:
code = code.replace(
      /\}     \n\s*<\/section>\n\s*\)\}\n\n\s*\{loading && \(/, // Wait, I made a mistake above ")\}\n      </section>\n      )}\n\n      {loading && ("
      "}\n              )}\n            </div>\n          </div>\n        </div>\n      )}\n      </section>\n      )}\n\n      {showBank && (\n        <section className={styles.card}>\n          <h2 className={styles.sectionTitle}>Payment Accepting Accounts</h2>\n          <div className={styles.tableWrap}>\n            <table className={styles.table}>\n              <thead>\n                <tr>\n                  <th>Code</th>\n                  <th>Name</th>\n                  <th>Type</th>\n                  <th>Balance</th>\n                </tr>\n              </thead>\n              <tbody>\n                {data.accounts.filter(a => a.isPaymentAccepting).map(account => (\n                  <tr key={account.id}>\n                    <td>{account.code}</td>\n                    <td>{account.name}</td>\n                    <td>{account.type}</td>\n                    <td className={styles.numericCell}>{formatCurrency(accountBalance(account))}</td>\n                  </tr>\n                ))}\n               </tbody>\n             </table>\n           </div>\n         </section>\n      )}\n\n      {viewMode === \"bank\" && bankStatementsNode}\n\n      {loading && ("
);

fs.writeFileSync("src/components/AdminDashboard.tsx", code);
console.log("Done");

