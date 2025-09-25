const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Running Price List Processor Tests...\n');

try {
  // Check if node_modules exists
  const fs = require('fs');
  if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  }

  console.log('🧪 Running unit tests...');
  execSync('npm run test', { stdio: 'inherit', cwd: __dirname });

  console.log('\n✅ All tests passed!');
} catch (error) {
  console.error('\n❌ Tests failed:', error.message);
  process.exit(1);
}
