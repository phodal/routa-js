use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

/// Custom Tauri commands exposed to the frontend via `invoke`.
/// These bridge the gap between the web frontend and native capabilities.

/// Read an environment variable from the host system.
#[tauri::command]
fn get_env(key: String) -> Option<String> {
    std::env::var(&key).ok()
}

/// Get the current working directory.
#[tauri::command]
fn get_cwd() -> String {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Get the user's home directory.
#[tauri::command]
fn get_home_dir() -> Option<String> {
    dirs::home_dir().map(|p| p.to_string_lossy().to_string())
}

/// Check if a given path is a git repository.
#[tauri::command]
fn is_git_repo(path: String) -> bool {
    let git_dir = std::path::Path::new(&path).join(".git");
    git_dir.exists()
}

/// Log a frontend diagnostic message on the Rust side.
#[tauri::command]
fn log_frontend(level: String, scope: String, message: String) {
    println!("[frontend:{}][{}] {}", level, scope, message);
}

fn detect_repo_root() -> Option<PathBuf> {
    if let Ok(v) = std::env::var("ROUTA_REPO_ROOT") {
        let p = PathBuf::from(v);
        if p.join("package.json").exists() {
            return Some(p);
        }
    }

    // During local desktop development/build this points to:
    // <repo>/apps/desktop/src-tauri
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let candidate = manifest_dir.join("../../..");
    if candidate.join("package.json").exists() {
        return Some(candidate);
    }

    None
}

fn wait_for_port(host: &str, port: u16, timeout_secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        if TcpStream::connect((host, port)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
}

fn pipe_child_logs(prefix: &'static str, child: &mut Child) {
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                println!("[{}][stdout] {}", prefix, line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[{}][stderr] {}", prefix, line);
            }
        });
    }
}

fn start_local_next_server() -> Result<Child, String> {
    let repo_root = detect_repo_root().ok_or_else(|| {
        "Unable to detect repository root for desktop local API server".to_string()
    })?;

    println!(
        "[desktop-server] Starting local Next API server from {}",
        repo_root.to_string_lossy()
    );

    let mut child = Command::new("npm")
        .arg("run")
        .arg("start:desktop:server")
        .current_dir(repo_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn desktop API server: {}", e))?;

    pipe_child_logs("desktop-server", &mut child);
    Ok(child)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            get_env,
            get_cwd,
            get_home_dir,
            is_git_repo,
            log_frontend,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            #[cfg(not(debug_assertions))]
            {
                // Allow explicitly enabling DevTools in release builds for diagnostics.
                let force_debug =
                    std::env::var("ROUTA_TAURI_DEBUG").ok().as_deref() == Some("1");
                if force_debug {
                    use tauri::Manager;
                    if let Some(window) = app.get_webview_window("main") {
                        window.open_devtools();
                    }
                }

                // Approach #1: start a local API/web server and navigate app window to it.
                // This keeps all existing /api routes available in desktop builds.
                let api_url = "http://127.0.0.1:3210";
                let already_running = wait_for_port("127.0.0.1", 3210, 1);

                if !already_running {
                    match start_local_next_server() {
                        Ok(_child) => {}
                        Err(err) => {
                            eprintln!("[desktop-server] {}", err);
                        }
                    }
                } else {
                    println!("[desktop-server] Reusing existing local server on {}", api_url);
                }

                if wait_for_port("127.0.0.1", 3210, 25) {
                    use tauri::Manager;
                    if let Some(window) = app.get_webview_window("main") {
                        let js = format!("window.location.replace('{}');", api_url);
                        let _ = window.eval(&js);
                        println!("[desktop-server] Webview navigated to {}", api_url);
                    }
                } else {
                    eprintln!(
                        "[desktop-server] Timed out waiting for {}. Falling back to embedded static UI.",
                        api_url
                    );
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
