export class Voice {
  constructor() {
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!this.SR;
  }

  // Resolves with what the person said ('' if nothing was heard).
  listen() {
    return new Promise((resolve, reject) => {
      const r = new this.SR();
      this.rec = r;
      r.lang = 'en-US';
      r.interimResults = false;
      r.maxAlternatives = 1;
      let text = '';
      r.onresult = (e) => {
        text = e.results[0][0].transcript;
        console.log('heard:', text);
      };
      r.onerror = (e) => {
        console.log('speech error:', e.error);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') reject(new Error(e.error));
      };
      r.onend = () => resolve(text);
      r.start();
    });
  }

  stopListening() {
    try { this.rec?.abort(); } catch {}
  }

  // Resolves when the voice finishes talking.
  speak(text, onStart) {
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.pitch = 1.2;          // a little higher so it sounds lamp-sized
      u.onstart = () => onStart?.();
      u.onend = u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}