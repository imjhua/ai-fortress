// Eight-second repeating retro background music, 120 BPM.
// Starts after a game-start gesture to comply with mobile autoplay policies.
const button = document.getElementById('bgmToggle');
const melody = [
  [0,392],[.5,523.25],[1,587.33],[1.5,523.25],[2,440],[2.5,523.25],[3,659.25],[3.5,587.33],
  [4,392],[4.5,493.88],[5,587.33],[5.5,493.88],[6,349.23],[6.5,440],[7,523.25],[7.5,493.88],
  [8,440],[8.5,523.25],[9,659.25],[9.5,523.25],[10,392],[10.5,493.88],[11,587.33],[11.5,523.25],
  [12,349.23],[12.5,440],[13,523.25],[13.5,440],[14,392],[14.5,493.88],[15,392],[15.5,329.63]
];
const LOOP_SECONDS = 8;
let audioContext, master, timer, nextLoop, enabled = true;
function playNote(frequency, at) {
  const oscillator = audioContext.createOscillator();
  const envelope = audioContext.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(frequency, at);
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.18, at + 0.018);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.37);
  oscillator.connect(envelope).connect(master);
  oscillator.start(at);
  oscillator.stop(at + 0.39);
}
function schedule() {
  if (!audioContext || !enabled || audioContext.state !== 'running') return;
  while (nextLoop < audioContext.currentTime + 0.6) {
    for (const [beat, frequency] of melody) playNote(frequency, nextLoop + beat * 0.5);
    nextLoop += LOOP_SECONDS;
  }
}
function refreshButton() {
  button.textContent = enabled ? '♫ BGM ON' : '♫ BGM OFF';
  button.setAttribute('aria-pressed', String(enabled));
}
async function startMusic() {
  if (!enabled) return;
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      master = audioContext.createGain();
      master.gain.value = 0.3;
      master.connect(audioContext.destination);
      nextLoop = audioContext.currentTime + 0.05;
    }
    await audioContext.resume();
    if (!timer) {
      schedule();
      timer = window.setInterval(schedule, 200);
    }
  } catch (error) {
    console.warn('Unable to start background music:', error);
  }
}
button.addEventListener('click', () => {
  enabled = !enabled;
  refreshButton();
  if (audioContext) {
    master.gain.setTargetAtTime(enabled ? 0.3 : 0, audioContext.currentTime, 0.02);
    if (enabled) {
      // Rebase after a long muted period to avoid scheduling notes in the past.
      nextLoop = audioContext.currentTime + 0.05;
      schedule();
    }
  }
  if (enabled) void startMusic();
});
document.getElementById('startGame')?.addEventListener('click', () => { void startMusic(); });
refreshButton();
