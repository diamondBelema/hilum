use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
async fn pick_vault_directory<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    Ok(app
        .dialog()
        .file()
        .set_title("Choose Hilum vault")
        .blocking_pick_folder()
        .map(|path| path.to_string()))
}

#[tauri::command]
fn open_vault_folder(path: String) -> Result<(), String> {
    let folder = Path::new(&path);
    if !folder.is_absolute() || !folder.is_dir() {
        return Err("vault path must be an existing directory".to_string());
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(folder);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(folder);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(folder);
        command
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("could not open vault folder: {error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let app_data = app
                    .path()
                    .app_data_dir()
                    .map_err(|error| error.to_string())?;
                fs::create_dir_all(&app_data).map_err(|error| error.to_string())?;
                let vault = app
                    .path()
                    .document_dir()
                    .map_err(|error| error.to_string())?
                    .join("hilum-vault");
                fs::create_dir_all(&vault).map_err(|error| error.to_string())?;
                app.shell()
                    .sidecar("hilum-server")
                    .map_err(|error| error.to_string())?
                    .env("HARNESS_DB", app_data.join("app.db"))
                    .env("HARNESS_VAULT", vault)
                    .env("HOST", "127.0.0.1")
                    .env("PORT", "4747")
                    .spawn()
                    .map_err(|error| error.to_string())?;

                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Ok(updater) = handle.updater() {
                        if let Ok(Some(update)) = updater.check().await {
                            let _ = update.download_and_install(|_, _| {}, || {}).await;
                        }
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_vault_directory,
            open_vault_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Hilum");
}
