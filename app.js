(() => {
  const selectScreen = document.getElementById('select-screen');
  const playScreen = document.getElementById('play-screen');
  const backBtn = document.getElementById('back-btn');
  const bellVisual = document.getElementById('bell-visual');
  const noteLabel = document.getElementById('current-note-label');
  const statusEl = document.getElementById('status');
  const canvas = document.getElementById('particle-canvas');
  const ctx2d = canvas.getContext('2d');

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
    spawnStars();
  }

  function triggerSwing() {
    bellVisual.classList.remove('swing');
    // Force reflow so the animation restarts even on rapid repeated shakes.
    void bellVisual.offsetWidth;
    bellVisual.classList.add('swing');
  }

  // --- Star particles (Tanabata-style sparkle on each ring) ---
  const STAR_COLORS = ['#fff9d6', '#ffe9a8', '#bfe3ff', '#ffffff'];
  let particles = [];
  let particleLoopRunning = false;

  function resizeCanvas() {
    canvas.width = canvas.clientWidth * window.devicePixelRatio;
    canvas.height = canvas.clientHeight * window.devicePixelRatio;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawStar(x, y, radius, rotation, alpha, color) {
    ctx2d.save();
    ctx2d.translate(x, y);
    ctx2d.rotate(rotation);
    ctx2d.globalAlpha = alpha;
    ctx2d.beginPath();
    for (let i = 0; i < 5; i++) {
      const outerAngle = (i / 5) * Math.PI * 2;
      const innerAngle = outerAngle + Math.PI / 5;
      const ox = Math.cos(outerAngle) * radius;
      const oy = Math.sin(outerAngle) * radius;
      const ix = Math.cos(innerAngle) * radius * 0.45;
      const iy = Math.sin(innerAngle) * radius * 0.45;
      if (i === 0) {
        ctx2d.moveTo(ox, oy);
      } else {
        ctx2d.lineTo(ox, oy);
      }
      ctx2d.lineTo(ix, iy);
    }
    ctx2d.closePath();
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = radius;
    ctx2d.fill();
    ctx2d.restore();
  }

  function spawnStars() {
    const dpr = window.devicePixelRatio;
    const count = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: (6 + Math.random() * 10) * dpr,
        rotation: Math.random() * Math.PI * 2,
        alpha: 1,
        decay: 0.012 + Math.random() * 0.02,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
      });
    }
    if (!particleLoopRunning) {
      particleLoopRunning = true;
      requestAnimationFrame(runParticleLoop);
    }
  }

  function runParticleLoop() {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.alpha -= p.decay;
      drawStar(p.x, p.y, p.radius, p.rotation, Math.max(p.alpha, 0), p.color);
    });
    particles = particles.filter(p => p.alpha > 0);

    if (particles.length > 0) {
      requestAnimationFrame(runParticleLoop);
    } else {
      particleLoopRunning = false;
    }
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
      const isPlaying = playScreen.classList.contains('active');
      if (isPlaying && delta > SHAKE_THRESHOLD && now - lastShakeTime > SHAKE_COOLDOWN_MS) {
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
      resizeCanvas(); // play-screen was display:none, so clientWidth/Height were 0 until now
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
