(() => {
  const selectScreen = document.getElementById('select-screen');
  const playScreen = document.getElementById('play-screen');
  const backBtn = document.getElementById('back-btn');
  const bellVisual = document.getElementById('bell-visual');
  const noteLabel = document.getElementById('current-note-label');
  const statusEl = document.getElementById('status');

  let audioCtx = null;
  let currentFreq = 261.63;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Synthesize a bell-like tone from inharmonic partials with independent decay envelopes.
  function ringBell(freq) {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.9, now);
    master.connect(ctx.destination);

    // Ratios and relative levels chosen to sound bell-like (inharmonic, not a plain harmonic series).
    const partials = [
      { ratio: 1.0, gain: 1.0, decay: 2.6 },
      { ratio: 2.0, gain: 0.55, decay: 2.0 },
      { ratio: 2.76, gain: 0.35, decay: 1.4 },
      { ratio: 4.07, gain: 0.22, decay: 0.9 },
      { ratio: 5.4, gain: 0.14, decay: 0.6 },
      { ratio: 6.8, gain: 0.09, decay: 0.35 },
    ];

    partials.forEach(p => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq * p.ratio;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(p.gain, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

      osc.connect(gain);
      gain.connect(master);
      osc.start(now);
      osc.stop(now + p.decay + 0.1);
    });

    // Short noise burst for the strike transient.
    const clickBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.02, ctx.sampleRate);
    const data = clickBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const click = ctx.createBufferSource();
    click.buffer = clickBuffer;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.25;
    click.connect(clickGain);
    clickGain.connect(master);
    click.start(now);

    triggerSwing();
  }

  function triggerSwing() {
    bellVisual.classList.remove('swing');
    // Force reflow so the animation restarts even on rapid repeated shakes.
    void bellVisual.offsetWidth;
    bellVisual.classList.add('swing');
  }

  function showScreen(screen) {
    [selectScreen, playScreen].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // --- Shake detection ---
  let lastAccel = null;
  let lastShakeTime = 0;
  const SHAKE_THRESHOLD = 14; // m/s^2 change between samples
  const SHAKE_COOLDOWN_MS = 400;

  function handleMotion(event) {
    const a = event.accelerationIncludingGravity || event.acceleration;
    if (!a || a.x === null) return;

    if (lastAccel) {
      const delta = Math.abs(a.x - lastAccel.x) + Math.abs(a.y - lastAccel.y) + Math.abs(a.z - lastAccel.z);
      const now = Date.now();
      if (delta > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
        lastShakeTime = now;
        ringBell(currentFreq);
      }
    }
    lastAccel = { x: a.x, y: a.y, z: a.z };
  }

  let motionListenerAttached = false;

  function enableMotion() {
    if (motionListenerAttached) return;

    const start = () => {
      window.addEventListener('devicemotion', handleMotion);
      motionListenerAttached = true;
      statusEl.textContent = '';
    };

    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission()
        .then(result => {
          if (result === 'granted') {
            start();
          } else {
            statusEl.textContent = 'センサーの利用が許可されませんでした。画面をタップして鳴らしてください。';
          }
        })
        .catch(() => {
          statusEl.textContent = 'センサーを利用できません。画面をタップして鳴らしてください。';
        });
    } else if (window.DeviceMotionEvent) {
      start();
    } else {
      statusEl.textContent = 'このデバイスは加速度センサーに対応していません。画面をタップして鳴らしてください。';
    }
  }

  // --- Wire up UI ---
  document.querySelectorAll('.note-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFreq = parseFloat(btn.dataset.freq);
      noteLabel.textContent = btn.dataset.note;
      getAudioContext(); // create/resume AudioContext within this user gesture
      enableMotion();
      showScreen(playScreen);
    });
  });

  backBtn.addEventListener('click', () => {
    showScreen(selectScreen);
  });

  // Tap-to-ring fallback (also works on desktop / when sensors are unavailable).
  bellVisual.addEventListener('click', () => {
    ringBell(currentFreq);
  });
})();
