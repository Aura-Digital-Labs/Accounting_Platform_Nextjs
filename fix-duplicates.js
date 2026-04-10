const fs = require('fs');

function fixDuplicates() {
    let bs = fs.readFileSync('src/components/BankStatementsDashboard.tsx', 'utf8');
    bs = bs.replace(/toast\.error\("Select account, month, and file\."\);\s*toast\.error\("Select account, month, and file\."\);/g, 'toast.error("Select account, month, and file.");');
    fs.writeFileSync('src/components/BankStatementsDashboard.tsx', bs);
    
    let ee = fs.readFileSync('src/components/EmployeeExpenseSubmission.tsx', 'utf8');
    ee = ee.replace(/toast\.success\(`Review updated for expense #\$\{reviewTarget\.expenseId\}\.`\);\s*toast\.success\(`Review updated for expense #\$\{reviewTarget\.expenseId\}\.`\);/g, 'toast.success(`Review updated for expense #${reviewTarget.expenseId}.`);');
    ee = ee.replace(/import LoadingSpinner from '@\/components\/LoadingSpinner';import toast from 'react-hot-toast';/g, "import LoadingSpinner from '@/components/LoadingSpinner';\nimport toast from 'react-hot-toast';");
    fs.writeFileSync('src/components/EmployeeExpenseSubmission.tsx', ee);
    console.log("Fixed!");
}
fixDuplicates();