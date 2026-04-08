const fs = require('fs');
let code = fs.readFileSync('src/components/AdminDashboard.tsx', 'utf8');

const regexTop = /\{editingPmId !== null && \(\r?\n\s+<div className=\{styles\.inlineCard\}>\r?\n\s+<h3 className=\{styles\.subTitle\}>Edit Project Manager<\/h3>\r?\n\s+<div className=\{styles\.inlineGrid\}>/;

const replacementTop = \{editingPmId !== null && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalPanel}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Edit Project Manager</h3>
                <button className={styles.secondaryButton} type="button" onClick={() => setEditingPmId(null)}>
                  Close
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.inlineGrid}>\;

code = code.replace(regexTop, replacementTop);

const regexBottom = /\s+<div className=\{styles\.actionsRow\}>\r?\n\s+<button className=\{styles\.secondaryButton\} type="button" onClick=\{\(\) => setEditingPmId\(null\)\}>\r?\n\s+Cancel\r?\n\s+<\/button>\r?\n\s+<button className=\{styles\.primaryButton\} type="button" onClick=\{savePmEdit\}>\r?\n\s+Save\r?\n\s+<\/button>\r?\n\s+<\/div>\r?\n\s+<\/div>\r?\n\s+\)\}/;

const replacementBottom = \
                <div className={styles.actionsRowSimple}>
                  <button className={styles.secondaryButton} type="button" onClick={() => setEditingPmId(null)}>
                    Cancel
                  </button>
                  <button className={styles.primaryButton} type="button" onClick={savePmEdit}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}\;

code = code.replace(regexBottom, replacementBottom);
fs.writeFileSync('src/components/AdminDashboard.tsx', code);
