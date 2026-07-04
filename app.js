// ------- Tham chiếu DOM -------
const $ = (id) => document.getElementById(id);
const modelSelect = $('modelSelect');
const loadBtn = $('loadBtn');
const modelHint = $('modelHint');
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressLabel = $('progressLabel');
const deviceBadge = $('deviceBadge');
const modeLive = $('modeLive');
const modeRecord = $('modeRecord');
const recordBtn = $('recordBtn');
const recordLabel = $('recordLabel');
const timerEl = $('timer');
const statusEl = $('status');
const meterIdle = $('meterIdle');
const canvas = $('waveCanvas');
const transcriptEl = $('transcript');
const copyBtn = $('copyBtn');
const txtBtn = $('txtBtn');
const srtBtn = $('srtBtn');
const clearBtn = $('clearBtn');

// ------- Trạng thái -------
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const hasWebGPU = 'gpu' in navigator;
let mode = 'live';            // 'live' | 'record'
let modelReady = false;
let recording = false;
let lastChunks = [];          // dùng cho phụ đề .srt (chế độ bóc băng)

// Đặt mô hình mặc định theo thiết bị
modelSelect.value = isMobile ? 'huuquyet/PhoWhisper-base' : 'huuquyet/PhoWhisper-small';
deviceBadge.textContent = (hasWebGPU ? 'WebGPU' : 'CPU') + (isMobile ? ' · mobile' : '');
if (isMobile) {
  modelHint.textContent = 'Trên điện thoại nên dùng Tiny/Base cho nhẹ. Bản chính xác cao nên bóc băng trên máy tính.';
}

// ------- Worker -------
const worker = new Worker('./worker.js', { type: 'module' });
let msgId = 0;
const pending = new Map();

worker.onmessage = (ev) => {
  const d = ev.data || {};
  if (d.type === 'status') {
    progressLabel.textContent = d.message;
  } else if (d.type === 'progress') {
    progressWrap.hidden = false;
    const pct = Math.round((d.progress || 0));
    progressBar.style.width = pct + '%';
    progressLabel.textContent = `Đang tải: ${d.file || ''} — ${pct}%`;
  } else if (d.id && pending.has(d.id)) {
    const { resolve, reject } = pending.get(d.id);
    pending.delete(d.id);
    if (d.type === 'error') reject(new Error(d.message));
    else resolve(d);
  }
};

function call(payload, transfer) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, ...payload }, transfer || []);
  });
}

async function ensureModel() {
  if (modelReady) return;
  loadBtn.disabled = true;
  progressWrap.hidden = false;
  progressLabel.textContent = 'Đang chuẩn bị tải mô hình…';
  try {
    await call({ type: 'load', model: modelSelect.value, preferWebGPU: hasWebGPU });
    modelReady = true;
    progressBar.style.width = '100%';
    progressLabel.textContent = 'Đã sẵn sàng.';
    setTimeout(() => { progressWrap.hidden = true; }, 800);
    setStatus('Mô hình đã sẵn sàng. Nhấn “Bắt đầu ghi”.');
  } catch (e) {
    progressLabel.textContent = 'Lỗi tải mô hình: ' + e.message;
    setStatus('Không tải được mô hình. Kiểm tra kết nối mạng lần đầu.', true);
    throw e;
  } finally {
    loadBtn.disabled = false;
  }
}

loadBtn.addEventListener('click', () => { modelReady = false; ensureModel(); });
modelSelect.addEventListener('change', () => { modelReady = false; setStatus('Đã đổi mô hình — sẽ tải khi bắt đầu ghi.'); });

// ------- Chuyển chế độ -------
function setMode(m) {
  if (recording) return;
  mode = m;
  const live = m === 'live';
  modeLive.classList.toggle('active', live);
  modeRecord.classList.toggle('active', !live);
  modeLive.setAttribute('aria-selected', String(live));
  modeRecord.setAttribute('aria-selected', String(!live));
  srtBtn.disabled = live || !transcriptEl.textContent.trim();
  setStatus(live
    ? 'Chế độ ghi chú trực tiếp: chữ hiện dần khi bạn nói.'
    : 'Chế độ bóc băng: ghi âm cả buổi rồi tạo biên bản + phụ đề.');
}
modeLive.addEventListener('click', () => setMode('live'));
modeRecord.addEventListener('click', () => setMode('record'));

// ------- Tiện ích -------
function setStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? 'var(--rec)' : 'var(--muted)';
}
function updateActionButtons() {
  const has = transcriptEl.textContent.trim().length > 0;
  copyBtn.disabled = !has;
  txtBtn.disabled = !has;
  clearBtn.disabled = !has;
  srtBtn.disabled = !(has && mode === 'record' && lastChunks.length);
}
transcriptEl.addEventListener('input', updateActionButtons);

function appendText(text, opts = {}) {
  if (!text) return;
  const t = text.trim();
  if (!t) return;
  const needsSpace = transcriptEl.textContent && !/\s$/.test(transcriptEl.textContent);
  transcriptEl.textContent += (needsSpace ? ' ' : '') + t;
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
  updateActionButtons();
}

// Resample tuyến tính Float32 -> tần số đích
function resample(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const newLen = Math.round(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    const idx = i * ratio;
    const i0 = Math.floor(idx);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = idx - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

// Giải mã Blob ghi âm -> Float32 mono 16kHz (dùng cho chế độ bóc băng)
async function blobTo16k(blob) {
  const arrBuf = await blob.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmp = new AC();
  const decoded = await tmp.decodeAudioData(arrBuf);
  tmp.close();
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// ------- Đồng hồ & đo âm thanh -------
let timerInt = null, startTime = 0;
function startTimer() {
  startTime = Date.now();
  timerEl.textContent = '00:00';
  timerInt = setInterval(() => {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }, 500);
}
function stopTimer() { clearInterval(timerInt); timerInt = null; }

let analyser = null, drawReq = null;
function startMeter(ctx, sourceNode) {
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  sourceNode.connect(analyser);
  meterIdle.style.display = 'none';
  const cvs = canvas, g = cvs.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  cvs.width = cvs.clientWidth * dpr; cvs.height = cvs.clientHeight * dpr;
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const draw = () => {
    drawReq = requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);
    g.clearRect(0, 0, cvs.width, cvs.height);
    g.lineWidth = 2 * dpr;
    g.strokeStyle = recording ? '#3FD6C6' : '#4A5B70';
    g.beginPath();
    const slice = cvs.width / buf.length;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] / 128.0;
      const y = (v * cvs.height) / 2;
      const x = i * slice;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.lineTo(cvs.width, cvs.height / 2);
    g.stroke();
  };
  draw();
}
function stopMeter() {
  if (drawReq) cancelAnimationFrame(drawReq);
  drawReq = null; analyser = null;
  const g = canvas.getContext('2d');
  g && g.clearRect(0, 0, canvas.width, canvas.height);
  meterIdle.style.display = '';
}

// ------- Ghi âm: chế độ BÓC BĂNG -------
let mediaRecorder = null, recChunks = [], recStream = null, recCtx = null;
async function startRecordMode() {
  recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AC = window.AudioContext || window.webkitAudioContext;
  recCtx = new AC();
  startMeter(recCtx, recCtx.createMediaStreamSource(recStream));
  recChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  mediaRecorder = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  mediaRecorder.onstop = onRecordStop;
  mediaRecorder.start();
  startTimer();
  setStatus('Đang ghi âm… Nhấn “Dừng” khi kết thúc để bóc băng.');
}
async function onRecordStop() {
  const blob = new Blob(recChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
  cleanupStream();
  setStatus('Đang xử lý âm thanh…');
  progressWrap.hidden = false; progressBar.style.width = '30%';
  try {
    const audio = await blobTo16k(blob);
    progressBar.style.width = '55%';
    progressLabel.textContent = 'Đang nhận dạng… (có thể mất một lúc với file dài)';
    const res = await call(
      { type: 'transcribe', audio, options: { return_timestamps: true } },
      [audio.buffer]
    );
    lastChunks = res.chunks || [];
    if (transcriptEl.textContent.trim()) transcriptEl.textContent += '\n\n';
    appendText(res.text);
    progressBar.style.width = '100%';
    setStatus('Xong. Có thể sửa nội dung và tải .txt hoặc .srt.');
    setTimeout(() => { progressWrap.hidden = true; }, 700);
  } catch (e) {
    setStatus('Lỗi khi nhận dạng: ' + e.message, true);
    progressWrap.hidden = true;
  }
}

// ------- Ghi âm: chế độ GHI CHÚ TRỰC TIẾP -------
let liveCtx = null, liveProcessor = null, liveSource = null, liveStream = null;
let liveBuf = [], liveRate = 16000, liveBusy = false, liveTick = null;
const SEGMENT_MS = 6000;

async function startLiveMode() {
  liveStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AC = window.AudioContext || window.webkitAudioContext;
  liveCtx = new AC();
  liveRate = liveCtx.sampleRate;
  liveSource = liveCtx.createMediaStreamSource(liveStream);
  startMeter(liveCtx, liveSource);
  liveProcessor = liveCtx.createScriptProcessor(4096, 1, 1);
  liveBuf = [];
  liveProcessor.onaudioprocess = (e) => {
    liveBuf.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  liveSource.connect(liveProcessor);
  liveProcessor.connect(liveCtx.destination);
  startTimer();
  setStatus('Đang nghe… chữ sẽ hiện dần theo từng đoạn.');
  liveTick = setInterval(flushLive, SEGMENT_MS);
}

async function flushLive() {
  if (liveBusy || liveBuf.length === 0) return;
  liveBusy = true;
  const parts = liveBuf; liveBuf = [];
  let total = 0; parts.forEach(p => total += p.length);
  const merged = new Float32Array(total);
  let off = 0; for (const p of parts) { merged.set(p, off); off += p.length; }
  const audio = resample(merged, liveRate, 16000);
  try {
    const res = await call(
      { type: 'transcribe', audio, options: { return_timestamps: false, chunk_length_s: 30 } },
      [audio.buffer]
    );
    appendText(res.text);
  } catch (e) {
    setStatus('Lỗi nhận dạng đoạn: ' + e.message, true);
  } finally {
    liveBusy = false;
  }
}

function stopLive() {
  if (liveTick) clearInterval(liveTick);
  liveTick = null;
  if (liveProcessor) { liveProcessor.disconnect(); liveProcessor.onaudioprocess = null; }
  if (liveSource) liveSource.disconnect();
  // bóc nốt phần còn lại
  const finalFlush = flushLive();
  if (liveCtx) { finalFlush.finally(() => liveCtx && liveCtx.close()); }
  cleanupStream();
}

// ------- Dọn dẹp -------
function cleanupStream() {
  [recStream, liveStream].forEach(s => s && s.getTracks().forEach(t => t.stop()));
  recStream = liveStream = null;
  if (recCtx) { recCtx.close(); recCtx = null; }
  stopMeter();
  stopTimer();
}

// ------- Nút ghi -------
recordBtn.addEventListener('click', async () => {
  if (recording) {
    recording = false;
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'Bắt đầu ghi';
    if (mode === 'record') { mediaRecorder && mediaRecorder.state !== 'inactive' && mediaRecorder.stop(); }
    else { stopLive(); setStatus('Đã dừng.'); }
    return;
  }
  try {
    await ensureModel();
  } catch { return; }
  try {
    recording = true;
    recordBtn.classList.add('recording');
    recordLabel.textContent = mode === 'record' ? 'Dừng & bóc băng' : 'Dừng';
    if (mode === 'record') await startRecordMode();
    else await startLiveMode();
  } catch (e) {
    recording = false;
    recordBtn.classList.remove('recording');
    recordLabel.textContent = 'Bắt đầu ghi';
    setStatus('Không truy cập được micro: ' + e.message, true);
  }
});

// ------- Xuất kết quả -------
copyBtn.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(transcriptEl.textContent.trim()); setStatus('Đã sao chép.'); }
  catch { setStatus('Không sao chép được.', true); }
});

function download(name, content, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
txtBtn.addEventListener('click', () => {
  download(`bien_ban_hop_${stamp()}.txt`, transcriptEl.textContent.trim() + '\n');
});

function srtTime(sec) {
  if (sec == null || isNaN(sec)) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}
srtBtn.addEventListener('click', () => {
  if (!lastChunks.length) { setStatus('Chưa có mốc thời gian (phụ đề chỉ có ở chế độ bóc băng).', true); return; }
  let out = '';
  lastChunks.forEach((c, i) => {
    const [start, end] = c.timestamp || [0, 0];
    out += `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${(c.text || '').trim()}\n\n`;
  });
  download(`bien_ban_hop_${stamp()}.srt`, out);
});

clearBtn.addEventListener('click', () => {
  transcriptEl.textContent = '';
  lastChunks = [];
  updateActionButtons();
  setStatus('Đã xóa nội dung.');
});

// khởi tạo
setMode('live');
updateActionButtons();
