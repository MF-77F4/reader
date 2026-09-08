use base64::Engine;
use chardetng::EncodingDetector;
use encoding_rs::{Encoding, UTF_16BE, UTF_16LE, UTF_8};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfoResult {
    size: u64,
    exists: bool,
    error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadChunkParams {
    file_path: String,
    offset: u64,
    size: usize,
    encoding: Option<String>,
    need_align: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadChunkResult {
    success: bool,
    content: String,
    bytes_read: usize,
    real_offset: u64,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookInfo {
    file_name: String,
    full_path: String,
    cover: Option<String>,
    format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TocItem {
    title: String,
    title_start: u64,
    title_end: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TocResult {
    success: bool,
    encoding: Option<String>,
    toc: Option<Vec<TocItem>>,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct BinaryResult {
    success: bool,
    data: Option<Vec<u8>>,
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverResult {
    success: bool,
    data_url: Option<String>,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct ImportResult {
    success: bool,
    path: Option<String>,
    error: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Deserialize, Serialize)]
#[serde(untagged)]
pub enum ProgressValue {
    Number(f64),
    Text(String),
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProgressParams {
    file_path: String,
    offset: ProgressValue,
    #[allow(dead_code)]
    progress: f64,
}

#[derive(Deserialize)]
pub struct MigrateProgressParams {
    from: String,
    to: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCacheParams {
    file_path: String,
    source_path: Option<String>,
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path)
}

fn progress_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("reading_progress.json"))
}

static PROGRESS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn read_progress_file(path: &Path) -> Result<HashMap<String, ProgressValue>, String> {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content)
            .map_err(|error| format!("进度文件损坏，已保留原文件：{error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(error) => Err(format!("无法读取进度文件：{error}")),
    }
}

fn load_progress_map(app: &AppHandle) -> Result<HashMap<String, ProgressValue>, String> {
    read_progress_file(&progress_path(app)?)
}

fn move_progress(progress: &mut HashMap<String, ProgressValue>, from: &str, to: &str) {
    if from == to {
        return;
    }
    if let Some(value) = progress.remove(from) {
        progress.entry(to.to_string()).or_insert(value);
    }
}

fn write_progress_map(
    app: &AppHandle,
    progress: &HashMap<String, ProgressValue>,
) -> Result<(), String> {
    let json = serde_json::to_string(progress).map_err(|error| error.to_string())?;
    fs::write(progress_path(app)?, json).map_err(|error| error.to_string())
}

fn encoding_for_label(label: Option<&str>) -> &'static Encoding {
    let normalized = label.unwrap_or("utf-8").trim().to_ascii_lowercase();
    let normalized = match normalized.as_str() {
        "utf-8-sig" | "ascii" => "utf-8",
        "gb18030" | "gb2312" | "cp936" => "gbk",
        other => other,
    };
    Encoding::for_label(normalized.as_bytes()).unwrap_or(UTF_8)
}

fn detect_encoding(bytes: &[u8]) -> &'static Encoding {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) || std::str::from_utf8(bytes).is_ok() {
        return UTF_8;
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        return UTF_16LE;
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        return UTF_16BE;
    }
    let mut detector = EncodingDetector::new();
    detector.feed(bytes, true);
    detector.guess(None, true)
}

fn is_supported_text(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("txt" | "md")
    )
}

#[tauri::command]
pub fn get_file_info(file_path: String) -> FileInfoResult {
    match fs::metadata(&file_path) {
        Ok(metadata) => FileInfoResult {
            size: metadata.len(),
            exists: metadata.is_file(),
            error: None,
        },
        Err(error) => FileInfoResult {
            size: 0,
            exists: false,
            error: Some(error.to_string()),
        },
    }
}

#[tauri::command]
pub fn read_chunk(params: ReadChunkParams) -> ReadChunkResult {
    let result = (|| -> Result<(String, usize, u64), String> {
        let mut file = fs::File::open(&params.file_path).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(params.offset))
            .map_err(|error| error.to_string())?;

        let mut buffer = vec![0_u8; params.size];
        let bytes_read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        buffer.truncate(bytes_read);

        let mut start = 0;
        if params.need_align.unwrap_or(false) && params.offset > 0 && !buffer.is_empty() {
            file.seek(SeekFrom::Start(params.offset - 1))
                .map_err(|error| error.to_string())?;
            let mut previous = [0_u8; 1];
            if file.read(&mut previous).unwrap_or(0) > 0 && previous[0] != b'\n' {
                start = buffer
                    .iter()
                    .position(|byte| *byte == b'\n')
                    .map(|index| index + 1)
                    .unwrap_or(0);
            }
        }

        let valid = &buffer[start..];
        let encoding = encoding_for_label(params.encoding.as_deref());
        let (content, _, _) = encoding.decode(valid);
        Ok((
            content.into_owned(),
            valid.len(),
            params.offset + start as u64,
        ))
    })();

    match result {
        Ok((content, bytes_read, real_offset)) => ReadChunkResult {
            success: true,
            content,
            bytes_read,
            real_offset,
            error: None,
        },
        Err(error) => ReadChunkResult {
            success: false,
            content: String::new(),
            bytes_read: 0,
            real_offset: params.offset,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn read_text_file(file_path: String) -> Result<String, String> {
    let bytes = fs::read(file_path).map_err(|error| error.to_string())?;
    let encoding = detect_encoding(&bytes[..bytes.len().min(10_000)]);
    let (content, _, _) = encoding.decode(&bytes);
    Ok(content.into_owned())
}

#[tauri::command]
pub fn scan_books(dir_path: String) -> Vec<BookInfo> {
    fs::read_dir(dir_path)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if !is_supported_text(&path) {
                return None;
            }
            Some(BookInfo {
                file_name: entry.file_name().to_string_lossy().into_owned(),
                full_path: path.to_string_lossy().into_owned(),
                cover: None,
                format: path
                    .extension()
                    .map(|value| value.to_string_lossy().to_ascii_lowercase()),
            })
        })
        .collect()
}

#[tauri::command]
pub fn close_file(_file_path: String) -> bool {
    true
}

struct TitleRules {
    bad_line: Regex,
    bad_content: Regex,
    repeated_noise: Regex,
    repeated_entity: Regex,
    chapter: Regex,
    volume: Regex,
    extra: Regex,
}

impl TitleRules {
    fn new() -> Result<Self, String> {
        let compile = |pattern: &str| Regex::new(pattern).map_err(|error| error.to_string());
        Ok(Self {
            bad_line: compile(
                r#"(?i)^(?:插图\s*[pPＰｐ]\s*\d+\s*$|(?:（|\(|【|\[)\s*(?:译注|注|注释|说明|备注|校注|编注|校对|录入|扫图)|(?:译注|注释|说明|备注|校注|编注|校对|录入|扫图)\s*[:：]|后记执笔中\s*[BbＢｂ][GgＧｇ][MmＭｍ]|参考文献\s*[:：]?|本文(?:由|来自)|转自\s*[:：]?|转载\s*[:：]?|来源\s*[:：]?|翻译\s*[:：]?|图源\s*[:：]?|修图\s*[:：]?|轻之国度|LK\s*[-_ ]?ID|(?:&#8226;|•|·)?\s*各章节标题\s*$|(?:第[零〇一二三四五六七八九十百千万两\d]+卷\s*)?行间|[~～〜]\s*第[零〇一二三四五六七八九十百千万两\d]+\s*幕\s*[~～〜]\s*$|(?:序章|终章|第[零〇一二三四五六七八九十百千万两\d]+章)\s*[:：])"#,
            )?,
            bad_content: compile(
                r"(?:这句台词|这部分的剧情|责任编辑|我先声明|只是开个小玩笑|决定推出漫画版|保留到现在才用|可以连着.*一块看)",
            )?,
            repeated_noise: compile(
                r"(?i)^(?:(?:&#\d+;)|[\s哦啊哈嗯呃唔哼…⋯.!！?？—\-_=~～〜·•]){24,}$",
            )?,
            repeated_entity: compile(r"(?i)(?:&#\d+;){12,}")?,
            chapter: compile(
                r"^(?:第?[零〇一二三四五六七八九十百千万两\d]+(?:章|话|节)|序章|终章|间章|幕间|番外|后记|插图)",
            )?,
            volume: compile(
                r"^第[零〇一二三四五六七八九十百千万两\d]+(?:[.．]\d+)?卷(?:\s+|[-—–_A-Za-z0-9\p{Han}①-⑳])",
            )?,
            extra: compile(
                r"^(?:短篇(?:集)?|新作短篇|杂志短篇|学园祭IF线|生贺短篇|特典(?:小册子|短篇)?|幕间\d+|○间章|DB特典|结\d+\s+.*(?:Prelude|Interlude|后记))",
            )?,
        })
    }

    fn matches_title(&self, text: &str) -> bool {
        self.chapter.is_match(text) || self.volume.is_match(text) || self.extra.is_match(text)
    }

    fn is_noise(&self, text: &str) -> bool {
        text.chars().count() > 180
            || self.bad_line.is_match(text)
            || self.bad_content.is_match(text)
            || self.repeated_noise.is_match(text)
            || has_repeated_run(text, 21)
            || self.repeated_entity.is_match(text)
    }

    fn is_title(&self, text: &str) -> bool {
        let title = text.trim();
        if title.is_empty() || self.is_noise(title) {
            return false;
        }
        if self.matches_title(title) {
            return true;
        }
        let normalized = normalize_title_numbers(title);
        !self.is_noise(&normalized) && self.matches_title(&normalized)
    }
}

fn has_repeated_run(text: &str, minimum: usize) -> bool {
    let mut previous = None;
    let mut run = 0;
    for character in text.chars() {
        if previous == Some(character) {
            run += 1;
        } else {
            previous = Some(character);
            run = 1;
        }
        if run >= minimum {
            return true;
        }
    }
    false
}

fn normalize_title_numbers(text: &str) -> String {
    text.chars().fold(String::new(), |mut output, character| {
        let replacement = match character {
            '①' | 'Ⅰ' | '一' => "1",
            '②' | 'Ⅱ' | '二' => "2",
            '③' | 'Ⅲ' | '三' => "3",
            '④' | 'Ⅳ' | '四' => "4",
            '⑤' | 'Ⅴ' | '五' => "5",
            '⑥' | 'Ⅵ' | '六' => "6",
            '⑦' | 'Ⅶ' | '七' => "7",
            '⑧' | 'Ⅷ' | '八' => "8",
            '⑨' | 'Ⅸ' | '九' => "9",
            '⑩' | 'Ⅹ' | '十' => "10",
            '⑪' => "11",
            '⑫' => "12",
            '⑬' => "13",
            '⑭' => "14",
            '⑮' => "15",
            '⑯' => "16",
            '⑰' => "17",
            '⑱' => "18",
            '⑲' => "19",
            '⑳' => "20",
            _ => {
                output.push(character);
                return output;
            }
        };
        output.push_str(replacement);
        output
    })
}

#[cfg(test)]
mod progress_tests {
    use super::*;

    #[test]
    fn txt_and_epub_positions_survive_serialization() {
        let map = HashMap::from([
            ("book.txt".to_string(), ProgressValue::Number(8192.0)),
            (
                "book.epub".to_string(),
                ProgressValue::Text("epubcfi(/6/2!/4/2:10)".into()),
            ),
        ]);
        let decoded: HashMap<String, ProgressValue> =
            serde_json::from_str(&serde_json::to_string(&map).unwrap()).unwrap();
        assert_eq!(decoded, map);
    }

    #[test]
    fn migration_preserves_self_and_existing_destination() {
        let mut map = HashMap::from([
            ("a".into(), ProgressValue::Number(20.0)),
            ("b".into(), ProgressValue::Number(40.0)),
        ]);
        move_progress(&mut map, "a", "a");
        assert_eq!(map["a"], ProgressValue::Number(20.0));
        move_progress(&mut map, "a", "b");
        assert_eq!(map["b"], ProgressValue::Number(40.0));
        assert!(!map.contains_key("a"));
        move_progress(&mut map, "b", "c");
        assert_eq!(map["c"], ProgressValue::Number(40.0));
    }

    #[test]
    fn corrupt_file_is_not_treated_as_empty() {
        let path = std::env::temp_dir().join(format!(
            "reader-progress-test-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        assert!(read_progress_file(&path).unwrap().is_empty());
        fs::write(&path, "{broken").unwrap();
        assert!(read_progress_file(&path).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "{broken");
        fs::write(&path, r#"{"book.txt":1024,"book.epub":"epubcfi(/6/2)"}"#).unwrap();
        let restored = read_progress_file(&path).unwrap();
        assert_eq!(restored["book.txt"], ProgressValue::Number(1024.0));
        assert_eq!(
            restored["book.epub"],
            ProgressValue::Text("epubcfi(/6/2)".into())
        );
        fs::remove_file(path).unwrap();
    }
}

#[cfg(test)]
mod title_rule_tests {
    use super::{parse_toc, TitleRules};

    #[test]
    fn recognizes_original_chapter_variants() {
        let rules = TitleRules::new().expect("title rules should compile");
        for title in [
            "第一章 开始",
            "第①章 圆圈数字",
            "第12.5卷 新篇",
            "短篇集 夏日",
            "结2 Some Prelude",
            "幕间3",
        ] {
            assert!(rules.is_title(title), "expected title: {title}");
        }
    }

    #[test]
    fn rejects_known_noise_lines() {
        let rules = TitleRules::new().expect("title rules should compile");
        for line in [
            "责任编辑：第一章",
            "轻之国度 第一章",
            "啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊啊第一章",
            "第一章：这不是目录标题",
        ] {
            assert!(!rules.is_title(line), "expected noise: {line}");
        }
    }

    #[test]
    #[ignore = "requires READER_TOC_FIXTURE to point to a local text file"]
    fn parses_external_fixture() {
        let path = std::env::var("READER_TOC_FIXTURE").expect("READER_TOC_FIXTURE is required");
        let result = parse_toc(path);
        assert!(result.success, "parse error: {:?}", result.error);
        let encoding = result.encoding.unwrap_or_default();
        let toc = result.toc.expect("successful parse should return a toc");
        eprintln!("encoding {encoding}; recognized {} chapters", toc.len());
        assert!(!toc.is_empty(), "expected at least one chapter");
    }
}

#[tauri::command]
pub fn parse_toc(file_path: String) -> TocResult {
    let result = (|| -> Result<(String, Vec<TocItem>), String> {
        let path = Path::new(&file_path);
        if !is_supported_text(path) {
            return Err("标题识别仅用于 TXT 和 Markdown 文本".to_string());
        }

        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        let encoding = detect_encoding(&bytes[..bytes.len().min(10_000)]);
        let encoding_name = encoding.name().to_ascii_lowercase();
        let title_rules = TitleRules::new()?;

        let mut toc = Vec::new();
        let mut start = 0_usize;
        for end in 0..=bytes.len() {
            if end < bytes.len() && bytes[end] != b'\n' {
                continue;
            }
            let line_end = if end < bytes.len() { end + 1 } else { end };
            let (line, _, _) = encoding.decode(&bytes[start..line_end]);
            let title = line.trim().to_string();
            if title_rules.is_title(&title) {
                toc.push(TocItem {
                    title,
                    title_start: start as u64,
                    title_end: line_end as u64,
                });
            }
            start = line_end;
        }

        Ok((encoding_name, toc))
    })();

    match result {
        Ok((encoding, toc)) => TocResult {
            success: true,
            encoding: Some(encoding),
            toc: Some(toc),
            error: None,
        },
        Err(error) => TocResult {
            success: false,
            encoding: None,
            toc: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn read_buffer(file_path: String) -> BinaryResult {
    match fs::read(file_path) {
        Ok(data) => BinaryResult {
            success: true,
            data: Some(data),
            error: None,
        },
        Err(error) => BinaryResult {
            success: false,
            data: None,
            error: Some(error.to_string()),
        },
    }
}

#[tauri::command]
pub fn read_cover_image(file_path: String) -> CoverResult {
    let result = (|| -> Result<String, String> {
        let path = Path::new(&file_path);
        let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
        if metadata.len() > 10 * 1024 * 1024 {
            return Err("图片文件不能超过 10 MB".to_string());
        }
        let mime = match path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .as_deref()
        {
            Some("jpg" | "jpeg") => "image/jpeg",
            Some("png") => "image/png",
            Some("webp") => "image/webp",
            Some("gif") => "image/gif",
            Some("bmp") => "image/bmp",
            _ => return Err("不支持这种图片格式".to_string()),
        };
        let bytes = fs::read(path).map_err(|error| error.to_string())?;
        Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    })();

    match result {
        Ok(data_url) => CoverResult {
            success: true,
            data_url: Some(data_url),
            error: None,
        },
        Err(error) => CoverResult {
            success: false,
            data_url: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn import_text_copy(app: AppHandle, source_path: String) -> ImportResult {
    let result = (|| -> Result<String, String> {
        let source = Path::new(&source_path);
        if !is_supported_text(source) {
            return Err("仅支持托管 TXT 和 Markdown 文本".to_string());
        }
        let target_dir = app_data_dir(&app)?.join("imported_texts");
        fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("txt")
            .to_ascii_lowercase();
        let digest = format!("{:x}", md5::compute(source_path.as_bytes()));
        let target = target_dir.join(format!("{digest}.{extension}"));
        fs::copy(source, &target).map_err(|error| error.to_string())?;
        Ok(target.to_string_lossy().into_owned())
    })();

    match result {
        Ok(path) => ImportResult {
            success: true,
            path: Some(path),
            error: None,
        },
        Err(error) => ImportResult {
            success: false,
            path: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn get_progress(app: AppHandle, file_path: String) -> Result<ProgressValue, String> {
    let _guard = PROGRESS_LOCK
        .lock()
        .map_err(|_| "进度存储不可用".to_string())?;
    Ok(load_progress_map(&app)?
        .get(&file_path)
        .cloned()
        .unwrap_or(ProgressValue::Number(0.0)))
}

#[tauri::command]
pub fn save_progress(app: AppHandle, data: SaveProgressParams) -> bool {
    let Ok(_guard) = PROGRESS_LOCK.lock() else {
        return false;
    };
    let Ok(mut progress) = load_progress_map(&app) else {
        return false;
    };
    progress.insert(data.file_path, data.offset);
    write_progress_map(&app, &progress).is_ok()
}

#[tauri::command]
pub fn delete_progress(app: AppHandle, file_path: String) -> bool {
    let Ok(_guard) = PROGRESS_LOCK.lock() else {
        return false;
    };
    let Ok(mut progress) = load_progress_map(&app) else {
        return false;
    };
    progress.remove(&file_path);
    write_progress_map(&app, &progress).is_ok()
}

#[tauri::command]
pub fn migrate_progress(app: AppHandle, paths: MigrateProgressParams) -> bool {
    let Ok(_guard) = PROGRESS_LOCK.lock() else {
        return false;
    };
    let Ok(mut progress) = load_progress_map(&app) else {
        return false;
    };
    move_progress(&mut progress, &paths.from, &paths.to);
    write_progress_map(&app, &progress).is_ok()
}

#[tauri::command]
pub fn delete_book_cache(app: AppHandle, params: DeleteCacheParams) -> bool {
    let related = [Some(params.file_path), params.source_path]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();
    let Ok(_guard) = PROGRESS_LOCK.lock() else {
        return false;
    };
    let Ok(mut progress) = load_progress_map(&app) else {
        return false;
    };
    for path in &related {
        progress.remove(path);
    }
    if write_progress_map(&app, &progress).is_err() {
        return false;
    }

    if let Ok(data_dir) = app_data_dir(&app) {
        for path in related {
            let candidate = Path::new(&path);
            if candidate.starts_with(data_dir.join("imported_texts")) {
                let _ = fs::remove_file(candidate);
            }
        }
    }
    true
}
