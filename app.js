// ------- Tham chiếu DOM -------
const $ = (id) => document.getElementById(id);
const modelSelect = $('modelSelect');
const loadBtn = $('loadBtn');
const modelHint = $('modelHint');
const progressWrap = $('progressWrap');
const progressBar = $('progressBar');
const progressLabel = $('progressLabel');
const deviceBadge = $('deviceBadge');
const themeToggle = $('themeToggle');
const modeLive = $('modeLive');
const modeRecord = $('modeRecord');
const tsToggle = $('tsToggle');
const recordBtn = $('recordBtn');
const recordLabel = $('recordLabel');
const pauseBtn = $('pauseBtn');
const timerEl = $('timer');
const statusEl = $('status');
const meterIdle = $('meterIdle');
const canvas = $('waveCanvas');
const transcriptEl = $('transcript');
const saveBtn = $('saveBtn');
const copyBtn = $('copyBtn');
const txtBtn = $('txtBtn');
const mdBtn = $('mdBtn');
const srtBtn = $('srtBtn');
const clearBtn = $('clearBtn');
const sessionsPanel = $('sessionsPanel');
const sessionsList = $('sessionsList');
const sessionsHint = $('sessionsHint');

// ------- Trạng thái -------
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const hasWebGPU = 'gpu' in navigator;
let mode = 'live';            // 'live' | 'record'
let modelReady = false;
let recording = false;
let paused = false;
let lastChunks = [];          // dùng cho phụ đề .srt (chế độ bóc băng)

// Đặt mô hình mặc định theo thiết bị
modelSelect.value = isMobile ? 'huuquyet/PhoWhisper-tiny' : 'huuquyet/PhoWhisper-small';
deviceBadge.textContent = (hasWebGPU ? 'WebGPU' : 'CPU') + (isMobile ? ' · mobile' : '');
if (isMobile) {
  modelHint.textContent = 'Trên iPhone/Android nên dùng Tiny (bản nhẹ, lượng tử hóa) để tránh hết RAM. Cần chính xác cao thì bóc băng trên máy tính.';
}

// ------- Giao diện sáng/tối -------
const THEME_KEY = 'bienban-theme';
const prefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
function isDarkNow() {
  const t = document.documentElement.getAttribute('data-theme');
  return t ? t === 'dark' : prefersDark();
}
function applyTheme(t) {
  const root = document.documentElement;
  if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t);
  else root.removeAttribute('data-theme');
  themeToggle.textContent = isDarkNow() ? '☀️' : '🌙';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDarkNow() ? '#0F1B2D' : '#0E8F8C');
}
applyTheme(localStorage.getItem(THEME_KEY));
themeToggle.addEventListener('click', () => {
  const next = isDarkNow() ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

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
  mdBtn.disabled = !has;
  clearBtn.disabled = !has;
  saveBtn.disabled = !has;
  srtBtn.disabled = !(has && lastChunks.length);
}
transcriptEl.addEventListener('input', updateActionButtons);

function fmtClock(sec) {
  if (sec == null || isNaN(sec)) sec = 0;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${p(h)}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

// Thêm văn bản vào ô nội dung. Nếu có `ts` (giây) thì xuống dòng kèm mốc thời gian.
function appendText(text, opts = {}) {
  if (!text) return;
  const t = text.trim();
  if (!t) return;
  const cur = transcriptEl.textContent;
  if (opts.ts != null) {
    const prefix = cur && !/\n$/.test(cur) ? '\n' : '';
    transcriptEl.textContent = cur + prefix + `[${fmtClock(opts.ts)}] ` + t;
  } else {
    const needsSpace = cur && !/\s$/.test(cur);
    transcriptEl.textContent = cur + (needsSpace ? ' ' : '') + t;
  }
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

// ------- Đồng hồ (có tạm dừng) -------
let timerInt = null, timerBase = 0, timerAccum = 0, timerRunning = false;
function elapsedMs() { return timerAccum + (timerRunning ? Date.now() - timerBase : 0); }
function renderTimer() {
  const s = Math.floor(elapsedMs() / 1000);
  timerEl.textContent = fmtClock(s);
}
function startTimer() {
  timerAccum = 0; timerBase = Date.now(); timerRunning = true;
  renderTimer();
  clearInterval(timerInt);
  timerInt = setInterval(renderTimer, 500);
}
function pauseTimer() { if (timerRunning) { timerAccum += Date.now() - timerBase; timerRunning = false; } }
function resumeTimer() { if (!timerRunning) { timerBase = Date.now(); timerRunning = true; } }
function stopTimer() { clearInterval(timerInt); timerInt = null; timerRunning = false; }

// ------- Đo âm thanh (canvas) -------
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
    g.strokeStyle = (recording && !paused) ? '#3FD6C6' : '#4A5B70';
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
    setStatus('Xong. Có thể sửa nội dung và tải .txt, .md hoặc .srt.');
    setTimeout(() => { progressWrap.hidden = true; }, 700);
  } catch (e) {
    setStatus('Lỗi khi nhận dạng: ' + e.message, true);
    progressWrap.hidden = true;
  }
}

// ------- Ghi âm: chế độ GHI CHÚ TRỰC TIẾP -------
let liveCtx = null, liveNode = null, liveSource = null, liveStream = null;
let liveBuf = [], liveRate = 16000, liveBusy = false, liveTick = null, liveSegStartSec = 0;
const SEGMENT_MS = 6000;

// Bắt PCM qua AudioWorklet (ưu tiên) hoặc ScriptProcessor (dự phòng cho trình duyệt cũ).
async function startLiveCapture(ctx, source) {
  try {
    await ctx.audioWorklet.addModule('./pcm-worklet.js');
    const node = new AudioWorkletNode(ctx, 'pcm-worklet');
    node.port.onmessage = (e) => { if (recording && !paused) liveBuf.push(e.data); };
    source.connect(node);
    node.connect(ctx.destination); // giữ node chạy; đầu ra rỗng nên không vọng tiếng
    return node;
  } catch (err) {
    const sp = ctx.createScriptProcessor(4096, 1, 1);
    sp.onaudioprocess = (e) => {
      if (recording && !paused) liveBuf.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    source.connect(sp);
    sp.connect(ctx.destination);
    return sp;
  }
}

async function startLiveMode() {
  liveStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const AC = window.AudioContext || window.webkitAudioContext;
  liveCtx = new AC();
  liveRate = liveCtx.sampleRate;
  liveSource = liveCtx.createMediaStreamSource(liveStream);
  startMeter(liveCtx, liveSource);
  liveBuf = [];
  liveSegStartSec = 0;
  liveNode = await startLiveCapture(liveCtx, liveSource);
  startTimer();
  setStatus('Đang nghe… chữ sẽ hiện dần theo từng đoạn.');
  liveTick = setInterval(flushLive, SEGMENT_MS);
}

async function flushLive() {
  if (liveBusy || paused || liveBuf.length === 0) return;
  liveBusy = true;
  const segStart = liveSegStartSec;
  const parts = liveBuf; liveBuf = [];
  liveSegStartSec = elapsedMs() / 1000; // đoạn kế tiếp bắt đầu từ đây
  let total = 0; parts.forEach(p => total += p.length);
  const merged = new Float32Array(total);
  let off = 0; for (const p of parts) { merged.set(p, off); off += p.length; }
  const audio = resample(merged, liveRate, 16000);
  try {
    const res = await call(
      { type: 'transcribe', audio, options: { return_timestamps: false, chunk_length_s: 30 } },
      [audio.buffer]
    );
    appendText(res.text, tsToggle.checked ? { ts: segStart } : {});
  } catch (e) {
    setStatus('Lỗi nhận dạng đoạn: ' + e.message, true);
  } finally {
    liveBusy = false;
  }
}

function stopLive() {
  if (liveTick) clearInterval(liveTick);
  liveTick = null;
  if (liveNode) {
    try { liveNode.disconnect(); } catch {}
    if (liveNode.port) liveNode.port.onmessage = null;
    if ('onaudioprocess' in liveNode) liveNode.onaudioprocess = null;
  }
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

// ------- Nút ghi & tạm dừng -------
function endRecordingUI() {
  recording = false;
  paused = false;
  recordBtn.classList.remove('recording');
  recordLabel.textContent = 'Bắt đầu ghi';
  pauseBtn.hidden = true;
  pauseBtn.textContent = 'Tạm dừng';
}

recordBtn.addEventListener('click', async () => {
  if (recording) {
    const wasRecordMode = mode === 'record';
    endRecordingUI();
    if (wasRecordMode) { mediaRecorder && mediaRecorder.state !== 'inactive' && mediaRecorder.stop(); }
    else { stopLive(); setStatus('Đã dừng.'); }
    return;
  }
  try {
    await ensureModel();
  } catch { return; }
  try {
    recording = true;
    paused = false;
    recordBtn.classList.add('recording');
    recordLabel.textContent = mode === 'record' ? 'Dừng & bóc băng' : 'Dừng';
    pauseBtn.hidden = false;
    pauseBtn.textContent = 'Tạm dừng';
    if (mode === 'record') await startRecordMode();
    else await startLiveMode();
  } catch (e) {
    endRecordingUI();
    setStatus('Không truy cập được micro: ' + e.message, true);
  }
});

pauseBtn.addEventListener('click', () => {
  if (!recording) return;
  paused = !paused;
  pauseBtn.textContent = paused ? 'Tiếp tục' : 'Tạm dừng';
  if (paused) {
    pauseTimer();
    if (mode === 'record' && mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
    setStatus('Đã tạm dừng. Nhấn “Tiếp tục” để ghi tiếp.');
  } else {
    resumeTimer();
    if (mode === 'record' && mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
    setStatus(mode === 'record' ? 'Đang ghi âm…' : 'Đang nghe…');
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
mdBtn.addEventListener('click', () => {
  const title = 'Biên bản họp — ' + new Date().toLocaleString('vi-VN');
  const body = `# ${title}\n\n${transcriptEl.textContent.trim()}\n`;
  download(`bien_ban_hop_${stamp()}.md`, body, 'text/markdown;charset=utf-8');
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
function toSrt() {
  let out = '';
  lastChunks.forEach((c, i) => {
    const [start, end] = c.timestamp || [0, 0];
    out += `${i + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${(c.text || '').trim()}\n\n`;
  });
  return out;
}
srtBtn.addEventListener('click', () => {
  if (!lastChunks.length) { setStatus('Chưa có mốc thời gian (phụ đề chỉ có ở chế độ bóc băng).', true); return; }
  download(`bien_ban_hop_${stamp()}.srt`, toSrt());
});

clearBtn.addEventListener('click', () => {
  transcriptEl.textContent = '';
  lastChunks = [];
  updateActionButtons();
  setStatus('Đã xóa nội dung.');
});

// ------- Lưu phiên họp (IndexedDB) -------
const DB_NAME = 'bienban-hop', STORE = 'sessions';
function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function makeTitle(text) {
  const firstLine = text.trim().split('\n')[0].replace(/^\[\d{2}:\d{2}(:\d{2})?\]\s*/, '').trim();
  return (firstLine.slice(0, 48) || 'Phiên họp') + (firstLine.length > 48 ? '…' : '');
}

async function renderSessions() {
  let items;
  try { items = await dbAll(); }
  catch { sessionsPanel.hidden = true; return; }
  items.sort((a, b) => b.createdAt - a.createdAt);
  sessionsPanel.hidden = items.length === 0;
  sessionsHint.textContent = items.length ? `${items.length} phiên` : '';
  sessionsList.innerHTML = '';
  for (const it of items) {
    const li = document.createElement('li');
    li.className = 'session-item';
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    const title = document.createElement('span');
    title.className = 'session-title';
    title.textContent = it.title;
    const date = document.createElement('span');
    date.className = 'session-date';
    date.textContent = new Date(it.createdAt).toLocaleString('vi-VN') + (it.chunks && it.chunks.length ? ' · có phụ đề' : '');
    meta.appendChild(title); meta.appendChild(date);
    const btns = document.createElement('div');
    btns.className = 'session-btns';
    const openB = document.createElement('button');
    openB.className = 'btn btn-mini'; openB.textContent = 'Mở';
    openB.addEventListener('click', () => loadSession(it));
    const delB = document.createElement('button');
    delB.className = 'btn btn-mini btn-danger'; delB.textContent = 'Xóa';
    delB.addEventListener('click', async () => { await dbDelete(it.id); renderSessions(); });
    btns.appendChild(openB); btns.appendChild(delB);
    li.appendChild(meta); li.appendChild(btns);
    sessionsList.appendChild(li);
  }
}

function loadSession(it) {
  if (recording) { setStatus('Đang ghi — hãy dừng trước khi mở phiên khác.', true); return; }
  transcriptEl.textContent = it.text || '';
  lastChunks = it.chunks || [];
  updateActionButtons();
  setStatus('Đã mở phiên: ' + it.title);
  transcriptEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

saveBtn.addEventListener('click', async () => {
  const text = transcriptEl.textContent.trim();
  if (!text) return;
  const session = {
    id: 's_' + Date.now(),
    title: makeTitle(text),
    text,
    chunks: lastChunks,
    createdAt: Date.now(),
  };
  try {
    await dbPut(session);
    setStatus('Đã lưu phiên vào máy.');
    renderSessions();
  } catch (e) {
    setStatus('Không lưu được phiên: ' + e.message, true);
  }
});

// khởi tạo
setMode('live');
updateActionButtons();
renderSessions();
