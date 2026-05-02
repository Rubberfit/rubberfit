// engine/crates/pack-cli/src/main.rs
//
// Single-shot stdin → stdout JSON delivery for the rf-layout packing
// engine. Reads one PackRequest as JSON on stdin, dispatches to a
// concrete `NestingStrategy` selected via `request.engine`, and writes
// one PackResult as JSON on stdout. Exit code 0 on success, 1 on
// any read/parse/serialise/pack failure (with the diagnostic on stderr).
//
// The browser caller (`/api/v2/pack`) and parity tests are the only
// consumers. Streaming/cancellation has been removed — the TS layer
// uses a single fetch round-trip.

use rf_layout::application::strategy::strategy_for;
use rf_layout::domain::{PackEngine, PackRequest};
use std::io::{self, Read, Write};
use std::process::ExitCode;

/// Resolve which backend to dispatch to.
///
/// Priority:
///   1. `request.engine` (in-band, request-level)
///   2. `RF_ENGINE` environment variable — `"legacy"` / `"lbf"` /
///      anything else (incl. unset) → `Default`
///
/// Request-level wins so the client can choose per-request without
/// needing control of the server's env. Env var is kept as a legacy
/// escape hatch + CI knob.
fn resolve_engine(request: &PackRequest) -> Option<PackEngine> {
    if let Some(e) = request.engine {
        return Some(e);
    }
    match std::env::var("RF_ENGINE").as_deref() {
        Ok("legacy") => Some(PackEngine::Legacy),
        Ok("lbf") => Some(PackEngine::Lbf),
        _ => None,
    }
}

fn main() -> ExitCode {
    let mut input = String::new();
    if let Err(e) = io::stdin().read_to_string(&mut input) {
        eprintln!("pack-cli: failed to read stdin: {e}");
        return ExitCode::FAILURE;
    }
    let request: PackRequest = match serde_json::from_str(&input) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("pack-cli: invalid JSON request: {e}");
            return ExitCode::FAILURE;
        }
    };
    let engine = resolve_engine(&request);
    let strategy = strategy_for(engine);
    match strategy.pack(request) {
        Ok(result) => {
            let s = match serde_json::to_string(&result) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("pack-cli: failed to serialize result: {e}");
                    return ExitCode::FAILURE;
                }
            };
            let mut stdout = io::stdout().lock();
            if stdout.write_all(s.as_bytes()).is_err()
                || stdout.write_all(b"\n").is_err()
                || stdout.flush().is_err()
            {
                eprintln!("pack-cli: failed to write stdout");
                return ExitCode::FAILURE;
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("pack-cli: pack failed: {e}");
            ExitCode::FAILURE
        }
    }
}
