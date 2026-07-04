// Web Worker: tải và chạy mô hình nhận dạng giọng nói (PhoWhisper qua Transformers.js).
// Chạy trong worker để không làm treo giao diện.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3';

// Chỉ tải mô hình từ Hugging Face Hub; bật cache trình duyệt để dùng lại offline.
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let currentModel = null;
let currentDevice = null;

function post(msg) { self.postMessage(msg); }

async function loadModel(model, preferWebGPU) {
  if (transcriber && currentModel === model) {
    post({ type: 'loaded', model, device: currentDevice });
    return;
  }
  transcriber = null;
  const devices = preferWebGPU ? ['webgpu', 'wasm'] : ['wasm'];
  let lastErr;

  for (const device of devices) {
    try {
      post({ type: 'status', message: `Đang tải mô hình (${device})…` });
      // WASM (điện thoại/CPU): dùng trọng số lượng tử hóa q8 để giảm bộ nhớ ~4 lần,
      // tránh sập tab do hết RAM trên iPhone/Android. WebGPU (máy mạnh): giữ fp32 cho chính xác.
      const dtype = device === 'webgpu' ? 'fp32' : 'q8';
      transcriber = await pipeline('automatic-speech-recognition', model, {
        device,
        dtype,
        progress_callback: (p) => {
          if (p && p.status === 'progress') {
            post({ type: 'progress', file: p.file, progress: p.progress || 0 });
          } else if (p && p.status) {
            post({ type: 'status', message: `${p.status}: ${p.file || ''}` });
          }
        },
      });
      currentModel = model;
      currentDevice = device;
      post({ type: 'loaded', model, device });
      return;
    } catch (e) {
      lastErr = e;
      transcriber = null;
      post({ type: 'status', message: `Không dùng được ${device}, thử phương án khác…` });
    }
  }
  throw lastErr || new Error('Không tải được mô hình.');
}

async function transcribe(audio, options) {
  if (!transcriber) throw new Error('Mô hình chưa được tải.');
  const opts = {
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5,
    ...options,
  };
  // Ưu tiên ép tiếng Việt; nếu phiên bản/model không nhận tham số language thì thử lại không ép.
  try {
    return await transcriber(audio, { language: 'vietnamese', ...opts });
  } catch (e) {
    return await transcriber(audio, opts);
  }
}

self.onmessage = async (ev) => {
  const { id, type } = ev.data || {};
  try {
    if (type === 'load') {
      await loadModel(ev.data.model, ev.data.preferWebGPU);
      post({ id, type: 'load-done' });
    } else if (type === 'transcribe') {
      const out = await transcribe(ev.data.audio, ev.data.options || {});
      post({
        id,
        type: 'result',
        text: (out && out.text ? out.text : '').trim(),
        chunks: (out && out.chunks) || [],
      });
    }
  } catch (e) {
    post({ id, type: 'error', message: (e && e.message) || String(e) });
  }
};
