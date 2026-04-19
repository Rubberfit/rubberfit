// engine/crates/pack-cli/src/main.rs
//
// Task 15: NDJSON streaming protocol.
//
// Modes:
//   - default (no flag): read full stdin as one PackRequest, emit one
//     PackResult JSON line on stdout. Same as Tasks 1-14 behavior.
//   - `--stream`: read the initial PackRequest (first JSON value on
//     stdin), start packing, emit one PackProgress JSON line per
//     monotonic global incumbent, and finally emit one PackResult
//     JSON line. Subsequent lines on stdin are parsed as cancel
//     messages — `{"cancel":true}` flips the cancel token.
//
// See docs/superpowers/plans/2026-04-18-s2.5-rust-engine.md Task 15.

use rema_layout::application::pack::{pack, pack_with_options};
use rema_layout::application::pack_lbf::pack_lbf;
use rema_layout::application::pack_lbf_lns::pack_lbf_lns;
use rema_layout::domain::{PackRequest, PackResult, SearchOptions};
use rema_layout::infrastructure::search::progress::ProgressCallback;
use serde_json::Deserializer;
use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::ExitCode;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let streaming = args.iter().any(|a| a == "--stream");

    if streaming {
        run_streaming()
    } else {
        run_batch()
    }
}

fn run_batch() -> ExitCode {
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
    // Engine selection. Default is pack_lbf_lns + polish (the Phase 3
    // pipeline): polygon-aware LBF constructive → density-changing LNS
    // → score-aware polish. The legacy pack() path is retained behind
    // `REMA_ENGINE=legacy` as an escape hatch; `REMA_ENGINE=lbf` skips
    // LNS. Both are primarily for benches and debugging.
    let result = match std::env::var("REMA_ENGINE").as_deref() {
        Ok("legacy") => pack(request),
        Ok("lbf") => pack_lbf(request),
        _ => pack_lbf_lns(request),
    };
    match result {
        Ok(result) => write_json_line(&result),
        Err(e) => {
            eprintln!("pack-cli: pack failed: {e}");
            ExitCode::FAILURE
        }
    }
}

/// NDJSON streaming mode.
///
/// Sequence on stdout:
///   <PackProgress>\n  (one per monotonic incumbent, baseline always
///                      fires first)
///   ...
///   <PackResult>\n    (exactly one, at the very end)
///
/// Protocol discipline:
///   - Every stdout line is a complete JSON value.
///   - Progress frames carry an `iteration` field (no `placements`).
///   - The final PackResult carries a `placements` array.
///   - Consumers read until the final PackResult line or EOF.
///
/// Cancel: caller writes `{"cancel":true}\n` to stdin AFTER the initial
/// request JSON. The cancel thread flips the AtomicBool; the search
/// returns `Ok(PackResult { was_cancelled: true, .. })` promptly.
fn run_streaming() -> ExitCode {
    let stdin = io::stdin();
    let mut reader = BufReader::new(stdin.lock());

    // Parse the initial PackRequest from the first JSON value on stdin.
    // `Deserializer::from_reader` streams — leaves unread bytes for the
    // cancel reader thread below.
    let mut deserializer = Deserializer::from_reader(&mut reader).into_iter::<PackRequest>();
    let request = match deserializer.next() {
        Some(Ok(r)) => r,
        Some(Err(e)) => {
            eprintln!("pack-cli: invalid JSON request: {e}");
            return ExitCode::FAILURE;
        }
        None => {
            eprintln!("pack-cli: stdin closed before request received");
            return ExitCode::FAILURE;
        }
    };
    drop(deserializer);
    drop(reader);

    let cancel_token = Arc::new(AtomicBool::new(false));
    // Shared writer so progress frames and the final result go out
    // atomically (prevents interleaving).
    let stdout_mutex: Arc<Mutex<io::Stdout>> = Arc::new(Mutex::new(io::stdout()));

    // Cancel reader thread — watches for `{"cancel":true}` lines on
    // stdin and flips the token.
    let token_for_thread = cancel_token.clone();
    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                if val.get("cancel").and_then(|v| v.as_bool()).unwrap_or(false) {
                    token_for_thread.store(true, Ordering::Relaxed);
                    break;
                }
            }
        }
    });

    // Progress callback — writes each frame as an NDJSON line.
    let stdout_for_cb = stdout_mutex.clone();
    let cb: ProgressCallback = Arc::new(move |frame| {
        let Ok(line) = serde_json::to_string(&frame) else {
            return;
        };
        let Ok(mut out) = stdout_for_cb.lock() else {
            return;
        };
        // Ignore write errors in the callback — if stdout is broken,
        // the final result write will surface it.
        let _ = out.write_all(line.as_bytes());
        let _ = out.write_all(b"\n");
        let _ = out.flush();
    });

    let options = SearchOptions {
        progress_callback: Some(cb),
        cancel_token: Some(cancel_token.clone()),
    };

    let result = pack_with_options(request, options);

    match result {
        Ok(pack_result) => write_packresult_line(&stdout_mutex, &pack_result),
        Err(e) => {
            eprintln!("pack-cli: pack failed: {e}");
            ExitCode::FAILURE
        }
    }
}

fn write_json_line(value: &PackResult) -> ExitCode {
    let s = match serde_json::to_string(value) {
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

fn write_packresult_line(stdout_mutex: &Arc<Mutex<io::Stdout>>, result: &PackResult) -> ExitCode {
    let s = match serde_json::to_string(result) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("pack-cli: failed to serialize result: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut out = match stdout_mutex.lock() {
        Ok(g) => g,
        Err(_) => {
            eprintln!("pack-cli: stdout mutex poisoned");
            return ExitCode::FAILURE;
        }
    };
    if out.write_all(s.as_bytes()).is_err()
        || out.write_all(b"\n").is_err()
        || out.flush().is_err()
    {
        eprintln!("pack-cli: failed to write stdout");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}
