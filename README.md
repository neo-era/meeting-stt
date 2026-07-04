# Biên bản họp — Giọng nói tiếng Việt sang văn bản (chạy trên trình duyệt)

Ứng dụng web tĩnh ghi âm cuộc họp và chuyển **giọng nói tiếng Việt → văn bản**, chạy **hoàn toàn trên máy người dùng**. Dữ liệu âm thanh không gửi lên bất kỳ máy chủ nào. Deploy được thẳng lên **GitHub Pages**.

- Nhận dạng bằng **PhoWhisper** (VinAI) qua **Transformers.js** (ONNX Runtime Web).
- Hai chế độ:
  - **Ghi chú trực tiếp** — hiện chữ gần như tức thời khi họp (dùng mô hình nhỏ, theo từng đoạn ~6 giây).
  - **Bóc băng chính xác** — ghi âm cả buổi rồi tạo biên bản + phụ đề `.srt`.
- Xuất **`.txt`** và **`.srt`**, nội dung **sửa được trực tiếp** trước khi lưu.
- **PWA**: cài như app trên điện thoại/máy tính, chạy **offline** sau lần tải mô hình đầu tiên.

## Triển khai lên GitHub Pages

1. Tạo repo mới trên GitHub, đẩy toàn bộ các file này lên nhánh `main`.
2. Vào **Settings → Pages → Build and deployment**, chọn *Deploy from a branch*, nhánh `main`, thư mục `/ (root)`.
3. Mở link `https://<tài-khoản>.github.io/<tên-repo>/`.

> Trang phải chạy qua **HTTPS** (GitHub Pages có sẵn) để dùng được micro. Chạy thử ở máy: `python3 -m http.server` rồi mở `http://localhost:8000` (localhost cũng được coi là an toàn).

## Cách dùng

1. Chọn **mô hình** (mặc định: Base cho điện thoại, Small cho máy tính) → nhấn **Tải mô hình** (lần đầu cần mạng để tải về).
2. Chọn chế độ, nhấn **Bắt đầu ghi**, cho phép truy cập micro.
3. Nhấn **Dừng** để kết thúc. Sửa nội dung nếu cần, rồi **Tải .txt / .srt**.

## Chọn mô hình theo thiết bị

| Mô hình | Độ chính xác | Tốc độ | Gợi ý |
|---|---|---|---|
| PhoWhisper Tiny | thấp | rất nhanh | điện thoại, ghi chú nhanh |
| PhoWhisper Base | khá | nhanh | điện thoại / laptop |
| PhoWhisper Small | tốt | vừa | **máy tính, khuyên dùng** |
| PhoWhisper Medium | cao | chậm | máy mạnh, bóc băng |
| PhoWhisper Large | cao nhất | chậm nhất | máy tính có GPU |

## Lưu ý thực tế

- **Trình duyệt**: khuyên dùng **Chrome/Edge** (có WebGPU chạy nhanh hơn nhiều). Firefox cần bật `dom.workers.modules.enabled = true` trong `about:config`.
- **Điện thoại**: mô hình lớn có thể chậm hoặc không đủ RAM. Với biên bản chính xác, nên **ghi âm trên điện thoại rồi bóc băng trên máy tính**.
- **Ghi chú trực tiếp** cắt âm theo đoạn ~6 giây nên đôi khi hụt chữ ở ranh giới đoạn — hợp để bắt ý, không thay cho bản bóc băng chính xác.
- **Offline tuyệt đối**: nếu máy cần cô lập mạng hoàn toàn, tải sẵn file mô hình từ Hugging Face (`huuquyet/PhoWhisper-*`) và cấu hình `env.localModelPath` để không gọi ra ngoài. Hiện tại lần đầu vẫn cần mạng để tải mô hình.

## Cấu trúc

```
index.html      # giao diện
styles.css      # màu sắc, bố cục
app.js          # ghi âm, hai chế độ, xuất txt/srt
worker.js       # chạy PhoWhisper trong Web Worker
sw.js           # service worker (offline)
manifest.json   # cấu hình PWA
icon-192.png / icon-512.png
```

## Ghi công

- PhoWhisper © VinAI Research (BSD-3), bản ONNX: `huuquyet/PhoWhisper-*` trên Hugging Face.
- [Transformers.js](https://github.com/huggingface/transformers.js) © Hugging Face.
