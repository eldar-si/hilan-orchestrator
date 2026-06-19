// hilan payslips — download all available payslips from your own Hilan account.
//
// Hilan protects login with a one-time password (OTP), so this opens a real
// browser for you to log in manually (password + OTP). Once you're in, it reuses
// that authenticated session to download every payslip via Hilan's PDF endpoint.
//
// Nothing sensitive is persisted: the login session stays in memory for the run
// only, and any stray session file is wiped at start, end, and on Ctrl-C.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { chromium } from 'playwright';

const MAX_MONTHS_BACK = 360; // safety cap: 30 years
const STOP_AFTER_EMPTY = 6;  // stop after this many consecutive months with no payslip
const OUT_DIR = path.join(process.cwd(), 'payslips');
const STATE_FILE = path.join(process.cwd(), '.hilan-auth.json'); // only referenced to wipe leftovers

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); resolve(a.trim()); });
  });
}

function wipeSession() {
  try { if (fs.existsSync(STATE_FILE)) fs.rmSync(STATE_FILE, { force: true }); } catch {}
}

function isPdf(buf) {
  return buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF';
}

// The org's numeric id is embedded in its public homepage HTML.
async function getOrgId(request, base) {
  const res = await request.get(base);
  const text = await res.text();
  const m = text.match(/OrgId\\?":\\?"(\d+)/);
  if (!m) throw new Error(`Could not determine OrgId from ${base} — is the subdomain correct?`);
  return parseInt(m[1], 10);
}

export async function run() {
  // Org subdomain: the part before ".hilan.co.il" in your login URL.
  // e.g. for https://acme.net.hilan.co.il/... the subdomain is "acme.net".
  const subdomain = process.env.HILAN_SUBDOMAIN
    || await ask('Your Hilan org subdomain (before ".hilan.co.il", e.g. acme.net): ');
  if (!subdomain) throw new Error('Org subdomain is required.');
  const base = `https://${subdomain}.hilan.co.il`;
  const payslipPage = `${base}/Hilannetv2/ng/personal-file/payslip`;

  // Why we ask for the employee ID up front:
  // Hilan builds each payslip download link from your employee ID, e.g.
  //   /Hilannetv2/PersonalFile/PdfPaySlip.aspx?Date=01/MM/YYYY&UserId=<orgId><employeeID>
  // The browser login only gives us session cookies (proof of who you are); it
  // does not expose this id, so we need it to construct each month's download URL.
  console.log('\nWhy your employee ID is needed:');
  console.log('  Each payslip is fetched from …/PdfPaySlip.aspx?Date=…&UserId=<orgId><employeeID>.');
  console.log('  Your browser login provides only session cookies, not this id — so enter it here');
  console.log('  and the tool builds the download link for every month.\n');
  const username = process.env.HILAN_USER || await ask('Your numeric Hilan employee ID: ');
  if (!username) throw new Error('Employee ID is required for the download URL.');

  wipeSession(); // remove any leftover session from a previous run before starting

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext(); // session lives in memory only, never on disk
  const page = await context.newPage();

  console.log('\nOpening Hilan ... a browser window should appear.');
  await page.goto(payslipPage, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('\n------------------------------------------------------------');
  console.log(' Log in in the browser window:');
  console.log('   - username + password');
  console.log('   - enter the OTP code Hilan sends you');
  console.log(' When you can SEE your payslip page, return here.');
  console.log('------------------------------------------------------------');
  await ask('\nPress Enter once you are fully logged in and on the payslip page... ');

  // We deliberately do NOT persist the session: the auth cookies stay in memory
  // for this run only and are gone the moment the browser closes. No secret on disk.
  const request = context.request; // shares cookies with the logged-in browser
  const orgId = await getOrgId(request, base);
  const userId = `${orgId}${username}`;
  fs.mkdirSync(OUT_DIR, { recursive: true }); // ensure the payslips/ folder exists
  console.log(`\nUsing OrgId ${orgId}, UserId ${userId}. Downloading into ${OUT_DIR}\n`);

  const now = new Date();
  let consecutiveEmpty = 0, saved = 0, skipped = 0;

  for (let i = 0; i < MAX_MONTHS_BACK; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const label = `${year}-${mm}`;
    const dest = path.join(OUT_DIR, `payslip-${label}.pdf`);

    if (fs.existsSync(dest)) { console.log(`  ${label}  already downloaded, skipping`); skipped++; consecutiveEmpty = 0; continue; }

    const url = `${base}/Hilannetv2/PersonalFile/PdfPaySlip.aspx?Date=01/${mm}/${year}&UserId=${encodeURIComponent(userId)}`;
    let buf;
    try {
      const res = await request.get(url);
      buf = Buffer.from(await res.body());
    } catch (e) {
      console.log(`  ${label}  error: ${e.message}`); consecutiveEmpty++;
      if (saved > 0 && consecutiveEmpty >= STOP_AFTER_EMPTY) break;
      continue;
    }

    if (isPdf(buf)) {
      fs.writeFileSync(dest, buf);
      console.log(`  ${label}  saved (${(buf.length / 1024).toFixed(0)} KB)`);
      saved++; consecutiveEmpty = 0;
    } else {
      consecutiveEmpty++;
      if (saved === 0 && i === 0) {
        console.log(`  ${label}  no PDF returned — are you sure you're logged in? Continuing...`);
      }
      if (saved > 0 && consecutiveEmpty >= STOP_AFTER_EMPTY) {
        console.log(`\nNo payslips for ${STOP_AFTER_EMPTY} consecutive months — reached the earliest. Stopping.`);
        break;
      }
    }
  }

  console.log(`\nDone. Saved ${saved} new payslip(s), skipped ${skipped} already present.`);
  console.log(`Folder: ${OUT_DIR}`);
  if (saved === 0) {
    console.log('\nNothing downloaded. Likely the login session was not active, or the employee ID is wrong.');
    console.log('Re-run and make sure you complete OTP and land on the payslip page before pressing Enter.');
  }
  await browser.close();
  wipeSession(); // ensure no session file is left behind at the end
  console.log('Session cleared — a fresh OTP login will be required next time.');
}

// Best-effort cleanup if interrupted (Ctrl-C) mid-run.
process.on('SIGINT', () => { wipeSession(); process.exit(130); });
