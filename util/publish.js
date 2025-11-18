#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function run(cmd, opts={}) {
  try {
    const out = cp.execSync(cmd, { stdio: 'inherit', ...opts });
    return out;
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    throw err;
  }
}

function tagExists(tag) {
  try {
    cp.execSync(`git rev-parse -q --verify refs/tags/${tag}`);
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  const root = path.resolve(__dirname, '..');
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    console.error('package.json not found in repository root');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version;
  if (!version) {
    console.error('package.json missing version');
    process.exit(1);
  }

  const tag = version.startsWith('v') ? version : `v${version}`;
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const push = !args.includes('--no-push');
  const dry = args.includes('--dry-run');
  const messageIndex = args.indexOf('--message');
  const tagMessage = (messageIndex !== -1 && args[messageIndex + 1]) ? args[messageIndex + 1] : `Release ${tag}`;

  console.log(`Repository root: ${root}`);
  console.log(`Package version: ${version}`);
  console.log(`Tag to create: ${tag}`);

  if (tagExists(tag)) {
    if (force) {
      console.log(`Tag ${tag} already exists, deleting due to --force`);
      if (!dry) { run(`git tag -d ${tag}`); }
      { run(`git push origin --delete ${tag}`, { stdio: 'inherit' }); }
    } else {
      console.error(`Tag ${tag} already exists. Use --force to replace it.`);
      process.exit(1);
    }
  }

  const tagCmd = `git tag -a ${tag} -m "${tagMessage}"`;
  if (dry) {
    console.log(`[dry-run] ${tagCmd}`);
  } else {
    run(tagCmd);
  }

  if (push) {
    const pushCmd = `git push origin ${tag}`;
    if (dry) {
      console.log(`[dry-run] ${pushCmd}`);
    } else {
      run(pushCmd);
    }
  }

  console.log(`Tag ${tag} created${push ? ' and pushed' : ''}.`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
