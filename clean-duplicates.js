const fs = require('fs');
const path = require('path');

function cleanDuplicates(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            cleanDuplicates(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let updated = false;

            // Fix exact duplicate occurrences: toast.error("..."); toast.error("...");
            const originalContent = content;
            
            // Replaces double toast.success or toast.error on the same line
            content = content.replace(/(toast\.(success|error)\([^)]+\);)\s*\1/g, '$1');
            
            // Fix double imports just in case
            content = content.replace(/import toast from 'react-hot-toast';\s*import toast from 'react-hot-toast';/g, "import toast from 'react-hot-toast';");

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Cleaned duplicates in ${fullPath}`);
            }
            
            // Check if toast is used but not imported
            if (content.includes('toast.') && !content.includes('import toast from')) {
                const match = content.match(/import.*?['"];/);
                if (match) {
                    content = content.replace(match[0], "import toast from 'react-hot-toast';\n" + match[0]);
                    fs.writeFileSync(fullPath, content);
                    console.log(`Added react-hot-toast import to ${fullPath}`);
                }
            }
        }
    }
}

cleanDuplicates('./src');