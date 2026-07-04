// AudioWorklet: thu PCM mono từ micro, gửi từng khối Float32 về luồng chính.
// Thay cho ScriptProcessorNode (đã deprecated) — chạy trên luồng audio riêng,
// ít rớt khung (dropout) hơn khi máy bận.
class PCMWorklet extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (ch && ch.length) {
      // Copy vì buffer nội bộ được tái sử dụng ở khung sau; transfer để khỏi copy thêm.
      const buf = new Float32Array(ch);
      this.port.postMessage(buf, [buf.buffer]);
    }
    return true; // giữ node sống chừng nào còn kết nối trong đồ thị audio
  }
}
registerProcessor('pcm-worklet', PCMWorklet);
