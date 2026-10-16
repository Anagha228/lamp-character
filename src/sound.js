export class Sound {
  ctx = null;

  // Must be called from a click.
  start() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();   // separate bus so music can duck under voice
    this.musicGain.gain.value = 0;
    this.musicGain.connect(this.master);
  }

  tone(freq, t0, dur, { type = 'sine', gain = 0.2, attack = 0.01, dest = this.master } = {}) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  // Sound effects
  chime() {                                  // NOTICED: soft two-note "oh!"
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(880, t, 0.5, { gain: 0.15 });
    this.tone(1318, t + 0.12, 0.7, { gain: 0.15 });
  }

  jingle() {                                 // GREETING: quick happy arpeggio
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, t + i * 0.09, 0.35, { type: 'triangle', gain: 0.18 })
    );
  }

  shutter() {                                // LOOKING_AT_OBJECT: camera click
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * 0.08);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    g.gain.value = 0.25;
    src.buffer = buf;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }

  blip(freq = 620) {                         // THINKING / GOAL steps
    if (!this.ctx) return;
    this.tone(freq, this.ctx.currentTime, 0.12, { type: 'square', gain: 0.06 });
  }

  // Music: a slow, soft chord loop (Cmaj7, Am7, Fmaj7, G), 4 s per chord
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [261.6, 329.6, 392.0, 493.9],
      [220.0, 261.6, 329.6, 392.0],
      [174.6, 261.6, 329.6, 440.0],
      [196.0, 246.9, 293.7, 392.0],
    ];

    let i = 0;
    const playChord = () => {
      const t = this.ctx.currentTime;
      chords[i % chords.length].forEach((f) =>
        this.tone(f, t, 4.2, { type: 'triangle', gain: 0.05, attack: 1.0, dest: this.musicGain })
      );
      i++;
    };
    playChord();
    this.musicTimer = setInterval(playChord, 4000);
    this.setMusicLevel(0.8);
  }
  
  stopMusic() {
    this.setMusicLevel(0);
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  // Use 0.3 or so while listening/speaking so it sits under the voice.
  setMusicLevel(level) {
    if (!this.ctx) return;
    this.musicGain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.4);
  }
}