import { execSync } from 'child_process';
try {
  console.log(execSync('npx prisma db push --accept-data-loss', { encoding: 'utf-8' }));
} catch (e) {
  console.log('Error Output:');
  console.log(e.stdout);
  console.log(e.stderr);
}
