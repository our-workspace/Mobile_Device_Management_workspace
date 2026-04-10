const { spawn } = require('child_process');

console.log('Starting npm run dev...');
const child = spawn('npm.cmd', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true
});

child.on('error', (err) => {
  console.error('Failed to start subprocess:', err);
});

child.on('exit', (code) => {
  process.exit(code);
});
