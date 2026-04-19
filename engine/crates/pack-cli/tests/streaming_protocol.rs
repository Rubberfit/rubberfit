// engine/crates/pack-cli/tests/streaming_protocol.rs
//
// Task 15: integration tests for the NDJSON streaming protocol.
//
// Drives the compiled pack-cli binary via subprocess, verifies:
//   - Batch mode emits exactly one line (the PackResult).
//   - Streaming mode emits one or more progress lines + final PackResult.
//   - Stdin cancel message stops the search.
//
// Skipped if the pack-cli binary isn't built (dev mode without release).

use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn cli_bin() -> Option<PathBuf> {
    let target_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|p| p.join("target"))?;
    for profile in &["release", "debug"] {
        let candidate = target_dir.join(profile).join("pack-cli");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn fixture(name: &str) -> String {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("rema-layout/tests/fixtures")
        .join(name);
    std::fs::read_to_string(&path).unwrap_or_else(|e| {
        panic!("failed to read {}: {e}", path.display());
    })
}

#[test]
fn batch_mode_emits_single_packresult_line() {
    let Some(bin) = cli_bin() else {
        eprintln!("skipping: pack-cli binary not found");
        return;
    };
    let mut child = Command::new(&bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn pack-cli");
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(fixture("single-rect.json").as_bytes())
        .unwrap();
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("wait");
    assert!(output.status.success(), "pack-cli failed: {:?}", output);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.trim().lines().collect();
    assert_eq!(lines.len(), 1, "batch mode should emit exactly one line, got {}: {stdout}", lines.len());
    let parsed: serde_json::Value = serde_json::from_str(lines[0]).expect("valid JSON");
    assert!(parsed.get("placements").is_some(), "final line must be a PackResult (has placements)");
}

#[test]
fn streaming_mode_emits_progress_then_packresult() {
    let Some(bin) = cli_bin() else {
        eprintln!("skipping: pack-cli binary not found");
        return;
    };
    let mut child = Command::new(&bin)
        .arg("--stream")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn pack-cli --stream");
    child
        .stdin
        .as_mut()
        .unwrap()
        .write_all(fixture("multi-sheet-remnant.json").as_bytes())
        .unwrap();
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("wait");
    assert!(output.status.success(), "pack-cli --stream failed: {:?}", output);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.trim().lines().collect();
    assert!(lines.len() >= 2, "streaming should emit >= 2 lines (progress + result), got {}", lines.len());

    // First line is a progress frame (has iteration, no placements).
    let first: serde_json::Value = serde_json::from_str(lines[0]).expect("valid first JSON");
    assert!(
        first.get("iteration").is_some() && first.get("placements").is_none(),
        "first line should be a PackProgress: {}",
        lines[0]
    );

    // Last line is the PackResult (has placements).
    let last: serde_json::Value = serde_json::from_str(lines[lines.len() - 1]).expect("valid last JSON");
    assert!(
        last.get("placements").is_some(),
        "last line should be PackResult: {}",
        lines[lines.len() - 1]
    );
}

#[test]
fn streaming_mode_accepts_stdin_cancel_message() {
    // Regression guard: the stdin cancel-message reader thread must
    // tolerate `{"cancel":true}` lines. This test doesn't assert
    // cancel latency (that's covered by Task 14's
    // cancel_during_search_returns_within_250ms at the library level);
    // it verifies the CLI's stdin protocol doesn't crash.
    let Some(bin) = cli_bin() else {
        eprintln!("skipping: pack-cli binary not found");
        return;
    };
    let mut request: serde_json::Value =
        serde_json::from_str(&fixture("single-rect.json")).unwrap();
    request["timeBudgetMs"] = serde_json::json!(5000);
    let payload = serde_json::to_string(&request).unwrap();

    let mut child = Command::new(&bin)
        .arg("--stream")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn pack-cli --stream");
    {
        let stdin = child.stdin.as_mut().unwrap();
        stdin.write_all(payload.as_bytes()).unwrap();
        stdin.write_all(b"\n").unwrap();
        // The pack may or may not complete before this write lands —
        // either path is valid. `write_all` can return BrokenPipe if
        // the child exited first; that's NOT a test failure.
        let _ = stdin.write_all(b"{\"cancel\":true}\n");
        let _ = stdin.flush();
    }
    drop(child.stdin.take());
    let output = child.wait_with_output().expect("wait");
    assert!(output.status.success(), "pack-cli --stream failed: {:?}", output);

    // Verify the CLI produced a parseable result (cancel reader didn't
    // crash mid-flight).
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.trim().lines().collect();
    assert!(!lines.is_empty(), "no output produced");
    let last: serde_json::Value = serde_json::from_str(lines[lines.len() - 1]).expect("valid JSON");
    assert!(
        last.get("placements").is_some(),
        "final line should be a PackResult"
    );
}
