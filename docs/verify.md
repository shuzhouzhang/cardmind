# Verification Log

This file records real verification commands for the MVP. Do not mark a command as passed unless it was actually run.

## Commands

```powershell
pnpm install
pnpm --recursive check
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm eval:extractor
pnpm verify
pnpm build:desktop
git diff --check
git status --short --branch
```

## Latest Result

Verified on Windows PowerShell in `E:\CardMind` on 2026-07-05.

The shell used the Codex bundled Node/pnpm runtime because the default shell PATH did not initially expose `node`.

| Command | Result |
| --- | --- |
| `pnpm --recursive check` | Passed: `apps/api`, `apps/web`, `packages/shared` TypeScript checks |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Passed |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Passed: 11 tests |
| `pnpm eval:extractor` | Passed: 2 extractor tests |
| `pnpm verify` | Passed |
| `pnpm build:desktop` | First run failed because a running `cardmind.exe` locked `src-tauri\target\release\cardmind.exe`; after stopping the process, rerun passed |

Desktop installer generated at:

```text
src-tauri\target\release\bundle\nsis\CardMind_0.1.0_x64-setup.exe
```

Known warning:

```text
The bundle identifier "com.cardmind.app" ends with ".app". This is not recommended because it conflicts with the application bundle extension on macOS.
```

This is acceptable for the current Windows-only MVP but should be renamed before macOS packaging.

## Screenshot Check

Screenshots were generated from the release build and reviewed:

- `docs/screenshots/home.png`
- `docs/screenshots/cards.png`
- `docs/screenshots/graph.png`
