(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PAL = {
    wave: 'rgba(89, 214, 255, 0.9)',
    waveSoft: 'rgba(89, 214, 255, 0.16)',
    waveGlow: 'rgba(89, 214, 255, 0.5)',
    cloak: 'rgba(167, 139, 250, 0.16)',
    cloakStroke: 'rgba(167, 139, 250, 0.55)',
    obj: 'rgba(255, 210, 122, 0.95)',
    objFill: 'rgba(255, 210, 122, 0.16)',
    grid: 'rgba(148, 163, 196, 0.34)',
    gridBright: 'rgba(233, 237, 247, 0.55)',
  };

  // ---------- Canvas helpers ----------
  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  // Ideal 2D cylindrical cloak: virtual point (t, d) maps to physical offset (x, y)
  // around the cloak center. d = impact parameter, t = travel direction.
  function cloakPoint(d, t, a, b, s) {
    const R = Math.hypot(t, d);
    if (R >= b) return { x: t, y: d };
    const theta = Math.atan2(d, t);
    const mapped = a + (R * (b - a)) / b;
    const r = R + (mapped - R) * s;
    return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
  }

  function ringPath(ctx, cx, cy, a, b) {
    ctx.beginPath();
    ctx.arc(cx, cy, b, 0, Math.PI * 2);
    ctx.arc(cx, cy, a, 0, Math.PI * 2, true);
  }

  // ---------- Ray demo ----------
  function RayDemo(canvas, strengthInput, strengthOut, playBtn, resetBtn) {
    const self = this;
    this.canvas = canvas;
    this.strength = 1;
    this.playing = true;
    this.t = 0;
    this.speed = 90;
    this.cx = 0;
    this.cy = 0;
    this.a = 40;
    this.b = 100;
    this.rays = [];
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.last = performance.now();
    this.travelStart = 0;
    this.travelEnd = 0;

    this.buildGeometry = function () {
      const m = Math.min(this.w, this.h);
      this.cx = this.w / 2;
      this.cy = this.h / 2;
      this.b = Math.max(40, m * 0.36);
      this.a = this.b * 0.5;
      const spacing = this.b * 0.1;
      const start = -this.b * 0.95;
      this.rays = [];
      for (let d = start; d <= this.b * 0.95 + 1e-6; d += spacing) {
        this.rays.push(d);
      }
      this.travelStart = -(this.w / 2 + this.b);
      this.travelEnd = this.w / 2 + this.b;
      if (this.t < this.travelStart || this.t > this.travelEnd) {
        this.t = this.travelStart;
      }
    };

    this.resize = function () {
      const s = fitCanvas(canvas);
      this.ctx = s.ctx;
      this.w = s.w;
      this.h = s.h;
      this.buildGeometry();
    };

    this.isBlocked = function (d) {
      return Math.abs(d) < this.a * (1 - this.strength);
    };

    this.pointAt = function (d, t) {
      const p = cloakPoint(d, t, this.a, this.b, this.strength);
      return { x: this.cx + p.x, y: this.cy + p.y };
    };

    this.drawRays = function () {
      const ctx = this.ctx;
      const samples = 140;
      ctx.save();
      ctx.strokeStyle = PAL.waveSoft;
      ctx.lineWidth = 1.25;
      ctx.lineCap = 'round';
      for (let i = 0; i < this.rays.length; i++) {
        const d = this.rays[i];
        if (this.isBlocked(d)) {
          const xHit = -Math.sqrt(Math.max(this.a * this.a - d * d, 0));
          ctx.beginPath();
          ctx.moveTo(this.cx + this.travelStart, this.cy + d);
          ctx.lineTo(this.cx + xHit, this.cy + d);
          ctx.stroke();
          continue;
        }
        ctx.beginPath();
        for (let k = 0; k <= samples; k++) {
          const t = this.travelStart + ((this.travelEnd - this.travelStart) * k) / samples;
          const p = this.pointAt(d, t);
          if (k === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    this.drawShadow = function () {
      const alpha = (1 - this.strength) * 0.42;
      if (alpha <= 0.005) return;
      const ctx = this.ctx;
      const x0 = this.cx + this.a;
      const x1 = this.cx + this.w;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, 'rgba(0, 0, 0, ' + alpha + ')');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(x0, this.cy - this.a, x1 - x0, this.a * 2);
      ctx.restore();
    };

    this.drawWavefront = function () {
      const ctx = this.ctx;
      const t = this.t;
      const wavePoint = (d) => {
        if (this.isBlocked(d)) {
          const xHit = -Math.sqrt(Math.max(this.a * this.a - d * d, 0));
          if (t <= xHit) {
            return { x: this.cx + t, y: this.cy + d, active: true };
          }
          return { x: 0, y: 0, active: false };
        }
        const p = this.pointAt(d, t);
        return { x: p.x, y: p.y, active: true };
      };
      ctx.save();
      ctx.strokeStyle = PAL.wave;
      ctx.fillStyle = PAL.wave;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.shadowColor = PAL.waveGlow;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      let started = false;
      let prevIndex = -Infinity;
      for (let i = 0; i < this.rays.length; i++) {
        const p = wavePoint(this.rays[i]);
        if (!p.active) {
          started = false;
          continue;
        }
        if (!started || i - prevIndex > 1) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
        prevIndex = i;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = 0; i < this.rays.length; i++) {
        const p = wavePoint(this.rays[i]);
        if (!p.active) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    this.draw = function () {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawShadow();
      if (this.strength > 0.02) {
        ctx.save();
        ringPath(ctx, this.cx, this.cy, this.a, this.b);
        ctx.fillStyle = PAL.cloak;
        ctx.fill('evenodd');
        ctx.strokeStyle = PAL.cloakStroke;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 1 - this.strength;
      ctx.fillStyle = PAL.objFill;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.obj;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
      this.drawRays();
      this.drawWavefront();
    };

    this.tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.playing && !prefersReducedMotion) {
        this.t += this.speed * dt;
        if (this.t > this.travelEnd) this.t = this.travelStart;
      }
      this.draw();
      requestAnimationFrame(this.tick);
    };

    const setStrength = function (v) {
      self.strength = v;
      strengthOut.textContent = Math.round(v * 100) + '%';
    };

    strengthInput.addEventListener('input', function () {
      setStrength(Number(strengthInput.value) / 100);
    });

    playBtn.addEventListener('click', function () {
      self.playing = !self.playing;
      playBtn.setAttribute('aria-pressed', String(self.playing));
      playBtn.querySelector('.btn-label').textContent = self.playing ? '暂停' : '播放';
    });

    resetBtn.addEventListener('click', function () {
      strengthInput.value = 100;
      setStrength(1);
      self.t = self.travelStart;
    });

    this.resize();
    setStrength(Number(strengthInput.value) / 100);
    this.t = this.travelStart;
    requestAnimationFrame(this.tick);
  }

  // ---------- Grid demo ----------
  function GridDemo(canvas, strengthInput, strengthOut, autoInput) {
    const self = this;
    this.canvas = canvas;
    this.strength = 1;
    this.auto = false;
    this.phase = 0;
    this.cx = 0;
    this.cy = 0;
    this.a = 40;
    this.b = 100;
    this.side = 300;
    this.nodes = 15;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.last = performance.now();

    this.buildGeometry = function () {
      const m = Math.min(this.w, this.h);
      this.cx = this.w / 2;
      this.cy = this.h / 2;
      this.side = m * 0.82;
      this.b = this.side * 0.36;
      this.a = this.b * 0.5;
    };

    this.resize = function () {
      const s = fitCanvas(canvas);
      this.ctx = s.ctx;
      this.w = s.w;
      this.h = s.h;
      this.buildGeometry();
    };

    this.node = function (x, y) {
      const p = cloakPoint(y, x, this.a, this.b, this.strength);
      return { x: this.cx + p.x, y: this.cy + p.y };
    };

    this.drawGrid = function () {
      const ctx = this.ctx;
      const half = this.side / 2;
      const step = this.side / (this.nodes - 1);
      const start = -half;
      ctx.save();
      ctx.strokeStyle = PAL.grid;
      ctx.lineWidth = 1;
      // Vertical lines: fixed x, varying y
      for (let j = 0; j < this.nodes; j++) {
        const x = start + j * step;
        ctx.beginPath();
        for (let i = 0; i < this.nodes; i++) {
          const y = start + i * step;
          const p = this.node(x, y);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      // Horizontal lines: fixed y, varying x
      for (let i = 0; i < this.nodes; i++) {
        const y = start + i * step;
        ctx.beginPath();
        for (let j = 0; j < this.nodes; j++) {
          const x = start + j * step;
          const p = this.node(x, y);
          if (j === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    this.draw = function () {
      const ctx = this.ctx;
      if (!ctx) return;
      ctx.clearRect(0, 0, this.w, this.h);
      this.drawGrid();
      if (this.strength > 0.02) {
        ctx.save();
        ringPath(ctx, this.cx, this.cy, this.a, this.b);
        ctx.fillStyle = PAL.cloak;
        ctx.fill('evenodd');
        ctx.strokeStyle = PAL.cloakStroke;
        ctx.lineWidth = 1.25;
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = 1 - this.strength;
      ctx.fillStyle = PAL.objFill;
      ctx.beginPath();
      ctx.arc(this.cx, this.cy, this.a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.obj;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    };

    this.tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (this.auto && !prefersReducedMotion) {
        this.phase += dt * 1.15;
        this.strength = 0.5 - 0.5 * Math.cos(this.phase);
        strengthInput.value = Math.round(this.strength * 100);
        strengthOut.textContent = Math.round(this.strength * 100) + '%';
      }
      this.draw();
      requestAnimationFrame(this.tick);
    };

    const setStrength = function (v) {
      self.strength = v;
      strengthOut.textContent = Math.round(v * 100) + '%';
    };

    strengthInput.addEventListener('input', function () {
      autoInput.checked = false;
      self.auto = false;
      setStrength(Number(strengthInput.value) / 100);
    });

    autoInput.addEventListener('change', function () {
      self.auto = autoInput.checked;
    });

    this.resize();
    setStrength(Number(strengthInput.value) / 100);
    requestAnimationFrame(this.tick);
  }

  // ---------- Hero background ----------
  function HeroCanvas(canvas) {
    const self = this;
    this.canvas = canvas;
    this.cx = 0;
    this.cy = 0;
    this.a = 40;
    this.b = 100;
    this.rays = [];
    this.t = 0;
    this.ctx = null;
    this.w = 0;
    this.h = 0;
    this.last = performance.now();

    this.resize = function () {
      const s = fitCanvas(canvas);
      this.ctx = s.ctx;
      this.w = s.w;
      this.h = s.h;
      this.cx = this.w / 2;
      this.cy = this.h / 2;
      const m = Math.min(this.w, this.h);
      this.b = Math.max(60, m * 0.34);
      this.a = this.b * 0.5;
      const spacing = this.b * 0.12;
      const start = -this.b * 0.9;
      this.rays = [];
      for (let d = start; d <= this.b * 0.9 + 1e-6; d += spacing) {
        this.rays.push(d);
      }
      this.t = -(this.w / 2 + this.b);
    };

    this.draw = function () {
      const ctx = this.ctx;
      if (!ctx) return;
      const s = 0.88;
      const travelStart = -(this.w / 2 + this.b);
      const travelEnd = this.w / 2 + this.b;
      ctx.clearRect(0, 0, this.w, this.h);
      ctx.save();
      ringPath(ctx, this.cx, this.cy, this.a, this.b);
      ctx.fillStyle = 'rgba(167, 139, 250, 0.10)';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(89, 214, 255, 0.14)';
      ctx.lineWidth = 1;
      const samples = 120;
      for (let i = 0; i < this.rays.length; i++) {
        const d = this.rays[i];
        ctx.beginPath();
        for (let k = 0; k <= samples; k++) {
          const t = travelStart + ((travelEnd - travelStart) * k) / samples;
          const p = cloakPoint(d, t, this.a, this.b, s);
          const x = this.cx + p.x;
          const y = this.cy + p.y;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(89, 214, 255, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let i = 0; i < this.rays.length; i++) {
        const d = this.rays[i];
        const p = cloakPoint(d, this.t, this.a, this.b, s);
        const x = this.cx + p.x;
        const y = this.cy + p.y;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    };

    this.tick = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!prefersReducedMotion) {
        this.t += 45 * dt;
        if (this.t > this.w / 2 + this.b) this.t = -(this.w / 2 + this.b);
      }
      this.draw();
      requestAnimationFrame(this.tick);
    };

    this.resize();
    requestAnimationFrame(this.tick);
  }

  // ---------- Boot ----------
  function boot() {
    const hero = document.getElementById('hero-canvas');
    if (hero) new HeroCanvas(hero);

    const rayCanvas = document.getElementById('ray-canvas');
    if (rayCanvas) {
      new RayDemo(
        rayCanvas,
        document.getElementById('ray-strength'),
        document.getElementById('ray-strength-out'),
        document.getElementById('ray-play'),
        document.getElementById('ray-reset')
      );
    }

    const gridCanvas = document.getElementById('grid-canvas');
    if (gridCanvas) {
      new GridDemo(
        gridCanvas,
        document.getElementById('grid-strength'),
        document.getElementById('grid-strength-out'),
        document.getElementById('grid-auto')
      );
    }

    // Reveal on scroll
    const revealEls = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      revealEls.forEach(function (el) {
        io.observe(el);
      });
    } else {
      revealEls.forEach(function (el) {
        el.classList.add('is-visible');
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
