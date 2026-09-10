// MoneyNote 桌面壳：加载打包好的前端产物（dist），无外部服务器依赖。
// 关闭窗口 = 退出整个应用（覆盖 macOS「关窗仅关闭窗口、应用驻留」的默认行为）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        // 单实例：重复打开时聚焦已有窗口，避免两份进程同时写同一 IndexedDB。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                window.app_handle().exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("MoneyNote 桌面端启动失败");
}
