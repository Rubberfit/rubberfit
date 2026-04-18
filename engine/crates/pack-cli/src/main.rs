use rema_layout::application::pack;
use rema_layout::domain::PackRequest;
use std::io::{self, Read, Write};
use std::process::ExitCode;

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
    match pack(request) {
        Ok(result) => {
            let out = match serde_json::to_string(&result) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("pack-cli: failed to serialize result: {e}");
                    return ExitCode::FAILURE;
                }
            };
            let mut stdout = io::stdout().lock();
            if let Err(e) = stdout.write_all(out.as_bytes()) {
                eprintln!("pack-cli: failed to write stdout: {e}");
                return ExitCode::FAILURE;
            }
            if let Err(e) = stdout.write_all(b"\n") {
                eprintln!("pack-cli: failed to write stdout: {e}");
                return ExitCode::FAILURE;
            }
            if let Err(e) = stdout.flush() {
                eprintln!("pack-cli: failed to flush stdout: {e}");
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
