mod commands;

#[cfg(desktop)]
use std::sync::Mutex;

#[cfg(desktop)]
struct BossKeyState(Mutex<tauri_plugin_global_shortcut::Shortcut>);

#[cfg(desktop)]
fn install_desktop_shortcuts(app: &mut tauri::App) -> tauri::Result<()> {
    use std::str::FromStr;
    use tauri::Manager;
    use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

    let boss_key = Shortcut::new(None, Code::F12);

    app.handle().plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, _shortcut, event| {
                if event.state() != ShortcutState::Pressed {
                    return;
                }

                let Some(window) = app.get_webview_window("main") else {
                    return;
                };

                if window.is_visible().unwrap_or(true) {
                    let _ = window.hide();
                } else {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            })
            .build(),
    )?;

    if let Err(error) = app.global_shortcut().register(boss_key) {
        eprintln!("failed to register F12 boss key: {error}");
    }
    app.manage(BossKeyState(Mutex::new(
        Shortcut::from_str("F12").expect("F12 must be a valid shortcut"),
    )));

    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn set_boss_key(
    app: tauri::AppHandle,
    state: tauri::State<'_, BossKeyState>,
    accelerator: String,
) -> Result<(), String> {
    use std::str::FromStr;
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let new_shortcut = Shortcut::from_str(accelerator.trim()).map_err(|error| error.to_string())?;
    let mut current_shortcut = state.0.lock().map_err(|_| "老板键状态不可用".to_string())?;

    if *current_shortcut == new_shortcut && app.global_shortcut().is_registered(new_shortcut) {
        return Ok(());
    }

    if let Err(error) = app.global_shortcut().register(new_shortcut) {
        return Err(format!("快捷键可能已被其他程序占用：{error}"));
    }

    if *current_shortcut != new_shortcut && app.global_shortcut().is_registered(*current_shortcut) {
        if let Err(error) = app.global_shortcut().unregister(*current_shortcut) {
            let _ = app.global_shortcut().unregister(new_shortcut);
            return Err(format!("无法释放旧快捷键：{error}"));
        }
    }
    *current_shortcut = new_shortcut;
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        if window.is_minimized().unwrap_or(false) {
            app.global_shortcut()
                .unregister(new_shortcut)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(desktop)]
fn sync_boss_key(window: &tauri::Window, closing: bool) {
    use tauri::Manager;
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if window.label() != "main" {
        return;
    }
    let Some(state) = window.app_handle().try_state::<BossKeyState>() else {
        return;
    };
    let Ok(shortcut) = state.0.lock() else {
        return;
    };
    let shortcuts = window.app_handle().global_shortcut();
    if closing || window.is_minimized().unwrap_or(false) {
        if shortcuts.is_registered(*shortcut) {
            let _ = shortcuts.unregister(*shortcut);
        }
    } else if window.is_visible().unwrap_or(false) && !shortcuts.is_registered(*shortcut) {
        if let Err(error) = shortcuts.register(*shortcut) {
            eprintln!("无法恢复老板键，请在设置中更换快捷键：{error}");
        }
    }
}

#[cfg(mobile)]
#[tauri::command]
fn set_boss_key(_accelerator: String) -> Result<(), String> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .on_window_event(|_window, _event| {
            #[cfg(desktop)]
            match _event {
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_) => {
                    sync_boss_key(_window, false)
                }
                tauri::WindowEvent::Destroyed => sync_boss_key(_window, true),
                _ => {}
            }
        })
        .setup(|app| {
            #[cfg(desktop)]
            install_desktop_shortcuts(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_file_info,
            commands::read_chunk,
            commands::read_text_file,
            commands::scan_books,
            commands::close_file,
            commands::parse_toc,
            commands::read_buffer,
            commands::read_cover_image,
            commands::import_text_copy,
            commands::get_progress,
            commands::save_progress,
            commands::delete_progress,
            commands::migrate_progress,
            commands::delete_book_cache,
            set_boss_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running Reader");
}
