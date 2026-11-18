//! 课序PLUS 桌面启动器
//!
//! 双击运行：优先用 Edge 应用模式打开线上课表（独立窗口、无浏览器工具栏，
//! 观感接近桌面应用）；没有 Edge 时回退到默认浏览器。全程不弹控制台窗口。
//!
//! 线上地址随 Qoder Sites 发布页维护，更新时同步修改这里的 URL 并重新构建。

#![cfg(windows)]
#![windows_subsystem = "windows"]

use std::os::windows::process::CommandExt;
use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 课序PLUS 线上地址
const URL: &str = "https://kexu-plus-94kvqohlzrh.qoder.zone/";

fn main() {
    let edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ];
    for path in edge_paths {
        if std::path::Path::new(path).exists() {
            let _ = Command::new(path)
                .arg(format!("--app={URL}"))
                .spawn();
            return;
        }
    }
    let _ = Command::new("cmd")
        .args(["/c", "start", "", URL])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}
