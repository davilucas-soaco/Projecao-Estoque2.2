class Particle {
  constructor(width, height) {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.9;
    this.vy = (Math.random() - 0.5) * 0.9;
    this.radius = 2;
  }

  update(width, height, mouse) {
    this.x += this.vx;
    this.y += this.vy;

    if (this.x < 0 || this.x > width) this.vx *= -1;
    if (this.y < 0 || this.y > height) this.vy *= -1;

    if (mouse.x === null || mouse.y === null) return;
    const dx = this.x - mouse.x;
    const dy = this.y - mouse.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 120) {
      this.x -= dx * 0.02;
      this.y -= dy * 0.02;
    }
  }
}

export function initLoginParticles(canvas) {
  if (!canvas) return () => undefined;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => undefined;

  let width = window.innerWidth;
  let height = window.innerHeight;
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const particleCount = Math.max(70, Math.min(100, Math.floor((width * height) / 18000)));
  const particles = Array.from({ length: particleCount }, () => new Particle(width, height));
  const mouse = { x: null, y: null };
  let rafId = 0;

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      p.update(width, height, mouse);
      ctx.fillStyle = '#1e22aa';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < particles.length; i += 1) {
      for (let j = i + 1; j < particles.length; j += 1) {
        const p1 = particles[i];
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > 10000) continue;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(30, 34, 170, 0.26)';
        ctx.lineWidth = 1;
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
    rafId = requestAnimationFrame(draw);
  };

  const onMouseMove = (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  };

  const onMouseLeave = () => {
    mouse.x = null;
    mouse.y = null;
  };

  resize();
  draw();

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', onMouseMove, { passive: true });
  window.addEventListener('mouseout', onMouseLeave, { passive: true });

  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resize);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseout', onMouseLeave);
  };
}
