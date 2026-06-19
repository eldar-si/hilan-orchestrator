#!/usr/bin/env node
// hilan — orchestrator CLI for self-service tasks on your own Hilan account.
// Routes subcommands to individual tools under ../src. Command modules are
// loaded lazily so `--help` (and unknown commands) don't pull in heavy deps.

const COMMANDS = {
  payslips: { load: () => import('../src/payslips.mjs'), desc: 'Download all your payslips as PDFs' },
};

// Tools planned but not yet implemented — listed in help so the roadmap is visible.
const PLANNED = {
  attendance: 'Auto-fill / report attendance hours',
  salary: 'Print a salary summary across months',
};

function help() {
  console.log('hilan — automate self-service tasks on your own Hilan account\n');
  console.log('Usage: hilan <command>\n');
  console.log('Commands:');
  for (const [name, c] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(12)} ${c.desc}`);
  console.log('\nPlanned:');
  for (const [name, desc] of Object.entries(PLANNED)) console.log(`  ${name.padEnd(12)} ${desc}`);
}

const cmd = process.argv[2];
if (!cmd || cmd === '-h' || cmd === '--help') { help(); process.exit(0); }

const entry = COMMANDS[cmd];
if (!entry) { console.error(`Unknown command: ${cmd}\n`); help(); process.exit(1); }

try {
  const mod = await entry.load();
  await mod.run(process.argv.slice(3));
} catch (e) {
  console.error('\nFailed:', e.message);
  process.exit(1);
}
