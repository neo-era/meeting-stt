# CLAUDE.md — meeting-stt

> Hướng dẫn cho Claude Code khi làm việc trong repo này. Viết bằng tiếng Việt để đồng bộ với giao diện và nội dung ứng dụng.

## Tổng quan

Ứng dụng web **tĩnh** ghi âm cuộc họp và chuyển **giọng nói tiếng Việt → văn bản**, chạy **hoàn toàn trên máy người dùng** (client-side). Không có backend, không gửi âm thanh lên bất kỳ máy chủ nào. Deploy thẳng lên **GitHub Pages** (nhánh `main`, thư mục `/ (root)`).

- Nhận dạng bằng **PhoWhisper** (VinAI) qua **Transformers.js** (`@huggingface/transformers@3`, load từ CDN jsDelivr), chạy trên **ONNX Runtime Web**.
- Ưu tiên **WebGPU**, tự động fallback sang **WASM (CPU)** nếu không có.
- Là **PWA**: cài như app, chạy **offline** sau lần đầu tải mô hình.

## Kiến trúc — không có build step

Đây là **vanilla JS/HTML/CSS thuần**, không có bundler, không `npm`, không transpile. File nào cũng chạy trực tiếp trong trình duyệt. **Không** thêm framework, TypeScript, hay bước build trừ khi được yêu cầu rõ ràng.

| File | Vai trò |
|---|---|
| [index.html](index.html) | Giao diện, khai báo layout + đăng ký service worker |
| [styles.css](styles.css) | Design tokens (`:root`), layout, responsive |
| [app.js](app.js) | ES module chính: điều khiển UI, ghi âm, 2 chế độ, tạm dừng, mốc thời gian, xuất `.txt`/`.md`/`.srt`, lưu phiên (IndexedDB), dark mode |
| [worker.js](worker.js) | Web Worker: tải & chạy mô hình PhoWhisper (tách khỏi luồng UI) |
| [pcm-worklet.js](pcm-worklet.js) | AudioWorklet: thu PCM mono cho chế độ live (thay `ScriptProcessor`; app.js tự fallback nếu trình duyệt không hỗ trợ) |
| [sw.js](sw.js) | Service worker: cache app shell + thư viện CDN để offline (version cache hiện tại: `bienban-hop-v2`) |
| [manifest.json](manifest.json) | Cấu hình PWA |
| icon-192.png / icon-512.png | Icon PWA |

### Luồng dữ liệu

- [app.js](app.js) ↔ [worker.js](worker.js) giao tiếp qua `postMessage`. app.js dùng cơ chế `call()` gán `id` tăng dần + `Map` `pending` để khớp request/response (Promise-based). Worker gửi `progress`/`status` không có `id` để cập nhật thanh tiến trình.
- Audio truyền sang worker bằng **Transferable** (`[audio.buffer]`) — sau khi transfer, buffer ở phía app **không dùng lại được**.
- Worker chỉ nhận `Float32` mono **16kHz**. app.js chịu trách nhiệm resample/decode về đúng định dạng trước khi gửi.

### Hai chế độ ghi (trong app.js)

1. **Ghi chú trực tiếp** (`live`): dùng `ScriptProcessor` gom audio, cứ mỗi `SEGMENT_MS` (6s) `flushLive()` gửi 1 đoạn đi nhận dạng → hiện chữ gần tức thời. Cắt theo đoạn nên có thể hụt chữ ở ranh giới. `return_timestamps: false`.
2. **Bóc băng chính xác** (`record`): `MediaRecorder` ghi cả buổi → `blobTo16k()` giải mã qua `OfflineAudioContext` → nhận dạng 1 lần với `return_timestamps: true`, lưu `lastChunks` để xuất `.srt`.

**Tạm dừng/tiếp tục** dùng chung đồng hồ có `elapsedMs()` (loại trừ thời gian dừng): record mode gọi `mediaRecorder.pause()/resume()`, live mode chặn đẩy audio qua cờ `paused`.

**Lưu phiên**: IndexedDB (`openDB/dbAll/dbPut/dbDelete`), DB `bienban-hop` / store `sessions`, mỗi bản ghi `{id, title, text, chunks, createdAt}`. Panel "Phiên đã lưu" render từ `renderSessions()`.

**Dark mode**: token `:root` bị override qua `@media (prefers-color-scheme: dark)` (tự động) và `:root[data-theme="dark"|"light"]` (ép bằng nút, lưu ở `localStorage['bienban-theme']`). Nền các bề mặt dùng `var(--surface)` để tự đổi màu — **không** hardcode `#fff`.

## Quy tắc khi sửa code

- **Giữ nguyên phong cách vanilla**: DOM thao tác trực tiếp qua helper `$ = (id) => document.getElementById(id)`, không thêm thư viện.
- **Toàn bộ text UI bằng tiếng Việt** — giữ đúng giọng điệu hiện có (thân thiện, ngắn gọn). Comment code cũng bằng tiếng Việt.
- **Micro cần HTTPS** hoặc `localhost`. Test local: `python3 -m http.server` rồi mở `http://localhost:8000`.
- Khi đổi danh sách file app shell, **cập nhật cả `SHELL` trong [sw.js](sw.js)** và **tăng version `CACHE`** (`bienban-hop-v*`) để buộc client làm mới cache.
- Mô hình Hugging Face **không** được cache trong sw.js (Transformers.js tự cache qua `useBrowserCache`) — đừng thêm vào `SHELL`.
- Danh sách mô hình nằm trong `<select id="modelSelect">` ([index.html](index.html)); mặc định theo thiết bị được set ở [app.js](app.js) (`isMobile ? base : small`).

## Design tokens (styles.css `:root`)

```
--bg #F5F7FA · --surface #FFFFFF · --ink #0F1B2D · --muted #5B6B7F
--accent #0E8F8C (teal) · --rec #E4572E (nút ghi/đỏ) · --radius 14px
```

Container chính `.app` giới hạn `max-width: 760px`. Ưu tiên **mobile-first**, tôn trọng `env(safe-area-inset-*)`.

## Kiểm thử thủ công (chưa có test tự động)

Không có test runner. Sau khi sửa, kiểm tra bằng tay:

1. Serve tĩnh (`python3 -m http.server`) và mở qua `localhost`.
2. Tải mô hình (lần đầu cần mạng), kiểm tra thanh tiến trình.
3. Thử cả 2 chế độ: live (chữ hiện dần) và record (xuất được `.txt` + `.srt`).
4. Kiểm tra fallback WebGPU→WASM (mở trên trình duyệt không có WebGPU).
5. Kiểm tra offline: tải lại trang sau khi đã cache, tắt mạng.

## Ghi công / giấy phép

- PhoWhisper © VinAI Research (BSD-3), bản ONNX: `huuquyet/PhoWhisper-*` trên Hugging Face.
- [Transformers.js](https://github.com/huggingface/transformers.js) © Hugging Face.
