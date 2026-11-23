// no console window on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::webview::DownloadEvent;
use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// The Argent server (the `argent-server` sidecar) and whether it has already ended.
struct Server {
    child: Mutex<Option<CommandChild>>,
    ended: Arc<AtomicBool>,
}

/// Shows a message in the window while there is no server to show (as text, never as markup).
fn show_message(app: &tauri::AppHandle, title: &str, detail: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let script = format!(
            "document.getElementById('status').innerHTML = '<h1></h1><pre></pre>'; \
             document.querySelector('#status h1').textContent = {}; \
             document.querySelector('#status pre').textContent = {};",
            js_string(title),
            js_string(detail)
        );
        let _ = window.eval(&script);
    }
}

/// A JavaScript string literal (JSON escaping is enough for one).
fn js_string(text: &str) -> String {
    let mut out = String::from("\"");
    for c in text.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => {}
            '<' => out.push_str("\\u003c"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // The window is built here (not in tauri.conf.json) because only the builder can handle downloads.
            // Without a handler the webview never saves a file: clicking "Download backup" would do nothing.
            // Files go to the user's Downloads folder (a free name is chosen); the page is told where it ended up.
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Argent")
                .inner_size(1280.0, 820.0)
                .min_inner_size(900.0, 600.0)
                .on_download(|webview, event| {
                    if let DownloadEvent::Finished { path, success, .. } = event {
                        let path = path.map(|p| p.display().to_string()).unwrap_or_default();
                        let _ = webview.eval(format!(
                            "window.dispatchEvent(new CustomEvent('argent-download', {{ detail: {{ success: {success}, path: {} }} }}))",
                            js_string(&path)
                        ));
                    }
                    true
                })
                .build()?;

            // The server picks the data directory and reads ~/.config/argent/config.json itself; it prints
            // "ARGENT_LISTENING <url>" once it accepts requests and stops cleanly when told to.
            let (mut events, child) = app
                .shell()
                .sidecar("argent-server")?
                .args(["--no-open", "--exit-on-stdin-close"])
                .spawn()?;
            let ended = Arc::new(AtomicBool::new(false));
            app.manage(Server {
                child: Mutex::new(Some(child)),
                ended: ended.clone(),
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut log = String::new();
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            for line in text.lines() {
                                if let Some(url) = line.trim().strip_prefix("ARGENT_LISTENING ") {
                                    if let (Some(window), Ok(url)) =
                                        (handle.get_webview_window("main"), url.parse::<Url>())
                                    {
                                        let _ = window.navigate(url);
                                    }
                                } else {
                                    eprintln!("[argent] {line}");
                                    log.push_str(line);
                                    log.push('\n');
                                }
                            }
                        }
                        CommandEvent::Error(message) => {
                            log.push_str(&message);
                            log.push('\n');
                        }
                        CommandEvent::Terminated(payload) => {
                            ended.store(true, Ordering::SeqCst);
                            show_message(
                                &handle,
                                "Argent stopped",
                                &format!(
                                    "The server ended (exit code {:?}).\n\n{}",
                                    payload.code, log
                                ),
                            );
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Argent app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Let the server flush and close its database: ask it to shut down, give it a few seconds, then stop it.
            if let Some(server) = handle.try_state::<Server>() {
                if let Some(mut child) = server.child.lock().unwrap().take() {
                    let _ = child.write(b"shutdown\n");
                    let deadline = Instant::now() + Duration::from_secs(5);
                    while !server.ended.load(Ordering::SeqCst) && Instant::now() < deadline {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    if !server.ended.load(Ordering::SeqCst) {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
