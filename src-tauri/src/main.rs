// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Start the Node.js backend server as a sidecar process
            // In dev mode, src-tauri is the cwd; backend is at ../backend/server.js
            let cwd = std::env::current_dir().unwrap();
            let candidates = [
                cwd.join("backend").join("server.js"),           // production: cwd/backend/
                cwd.join("..").join("backend").join("server.js"), // dev: src-tauri/../backend/
            ];

            let server_path = candidates.iter()
                .find(|p| p.exists())
                .cloned()
                .unwrap_or_else(|| candidates[0].clone());

            let backend_dir = server_path.parent().unwrap();
            let child = Command::new("node")
                .arg(&server_path)
                .current_dir(backend_dir)
                .spawn()
                .expect("Failed to start backend server");

            app.manage(BackendProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill backend process when window closes
                if let Some(state) = window.try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
