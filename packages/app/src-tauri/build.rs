use std::fs;
use std::path::Path;

fn main() {
    ensure_windows_icon();
    tauri_build::build()
}

/// Windows resource generation needs `icons/icon.ico`. When it is missing,
/// wrap `icons/icon.png` in a single-entry ICO (PNG-compressed entry).
fn ensure_windows_icon() {
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.ico");

    let ico_path = Path::new("icons/icon.ico");
    if ico_path.exists() {
        return;
    }

    let png = fs::read("icons/icon.png").expect("icons/icon.png is required");
    assert!(
        png.len() > 24 && &png[1..4] == b"PNG" && &png[12..16] == b"IHDR",
        "icons/icon.png is not a valid PNG file"
    );
    let width = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
    let height = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
    // ICO stores 256px as 0.
    let dim = |v: u32| if v >= 256 { 0u8 } else { v as u8 };

    let mut ico = Vec::with_capacity(22 + png.len());
    ico.extend_from_slice(&[0, 0, 1, 0, 1, 0]); // reserved, type = icon, count = 1
    ico.push(dim(width));
    ico.push(dim(height));
    ico.push(0); // palette size
    ico.push(0); // reserved
    ico.extend_from_slice(&1u16.to_le_bytes()); // color planes
    ico.extend_from_slice(&32u16.to_le_bytes()); // bits per pixel
    ico.extend_from_slice(&(png.len() as u32).to_le_bytes());
    ico.extend_from_slice(&22u32.to_le_bytes()); // image data offset
    ico.extend_from_slice(&png);

    fs::write(ico_path, ico).expect("failed to write icons/icon.ico");
}
