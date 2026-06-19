# hilan-orchestrator

Automate self-service tasks on **your own** [Hilan](https://www.hilan.co.il/) account.

Hilan protects login with a one-time password (OTP), so these tools open a real
browser and let **you** log in manually (password + OTP). Once you're in, the
authenticated session is reused to do the work — no credential scraping, no
secrets stored on disk.

First command shipped: **`payslips`** — download every payslip you have as a PDF
in one run.

> Works for any Hilan org (you provide your subdomain). Tested on macOS; it's
> plain Node + Playwright with no OS-specific code, so Linux/Windows should work
> too.

## Commands

| Command | Status | What it does |
|---|---|---|
| `payslips` | ✅ available | Downloads all your payslips into `payslips/` as `payslip-YYYY-MM.pdf` |
| `attendance` | 🛠️ planned | Auto-fill / report attendance hours |
| `salary` | 🛠️ planned | Print a salary summary across months |

## Requirements

- [Node.js](https://nodejs.org/) 18+
- A Hilan account you can log into

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
node bin/hilan.mjs payslips
# or, after `npm link`:  hilan payslips
```

You'll be asked for:

1. **Your Hilan org subdomain** — the part before `.hilan.co.il` in your login
   URL. For `https://acme.net.hilan.co.il/...` it is `acme.net`.
2. **Your numeric employee ID** — the username you log in with. Hilan builds each
   payslip download URL from this id, and the browser session alone doesn't
   expose it, so the tool needs it to construct the links.

A browser opens — log in, complete the OTP, and when you can see your payslip
page, return to the terminal and press **Enter**. PDFs land in `payslips/`.

### Skip the prompts (optional)

```bash
HILAN_SUBDOMAIN=acme.net HILAN_USER=123456 node bin/hilan.mjs payslips
```

## Privacy & security

- Your password and OTP are typed **only into the browser** — never read,
  stored, or logged by the tool.
- The login session is kept **in memory only**; nothing sensitive is written to
  disk. Any stray session file is wiped at start, at the end, and on Ctrl-C.
- Downloaded PDFs and any session file are git-ignored.

## Contributing

PRs welcome. Every pull request is checked automatically by:

- **CI** — a static syntax check of all modules (`.github/workflows/ci.yml`).
- **Claude review** — an AI agent reviews the diff for correctness, security/privacy
  (credential & session handling), and simplicity (`.github/workflows/claude-review.yml`).

## Disclaimer

For automating tasks on **your own** Hilan account. Use it in accordance with
your employer's and Hilan's terms of service.

## License

[MIT](LICENSE) © 2026 Eldar Siboni
