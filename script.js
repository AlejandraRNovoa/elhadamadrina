/* ============================================================
   Mini experiencia pixel-art
   Control por teclado (← →) + click del ratón para atacar.
   ============================================================ */

(() => {
  // --- CONFIG ---------------------------------------------------
  const SPEED = 4;
  const FRAME_INTERVAL = 140;          // ms entre frames de caminata
  const ATTACK_FRAME_INTERVAL = 100;   // ms entre frames de ataque (más rápido)
  const GROUND_HEIGHT_RATIO = 0.12;
  const SCREEN_MARGIN = 20;

  // Proyectil
  const PROJECTILE_SPEED = 8;          // px/frame
  const PROJECTILE_Y_OFFSET = 0.55;    // 0 = pies, 1 = cabeza. 0.55 ≈ a la altura del torso

  // --- ELEMENTOS ------------------------------------------------
  const footsteps       = document.getElementById('footsteps');
  const bgmusic         = document.getElementById('bgmusic');
  const projectilesRoot = document.getElementById('projectiles');

  // Estado de Madrina
  const madrina = {
    el: document.getElementById('madrina'),
    walkFrames:   document.querySelectorAll('#madrina .walk-frame'),
    attackFrames: document.querySelectorAll('#madrina .attack-frame'),
    x: window.innerWidth / 2,
    flip: 1,
    // --- estado de ataque ---
    isAttacking: false,
    attackFrame: 0,
    attackAccumulator: 0,
    attackDidFire: false,  // ya se lanzó el proyectil en este ataque
  };

  // Lista de proyectiles activos
  const projectiles = [];

  // Estado global del bucle (declarado pronto para que listeners lo vean)
  let walkAccumulator = 0;
  let walkFrameIndex = 0;
  let lastTime = performance.now();
  let isWalking = false;

  // --- INPUT TECLADO --------------------------------------------
  const keys = { left: false, right: false };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });

  // --- INPUT RATÓN: ATAQUE --------------------------------------
  window.addEventListener('mousedown', (e) => {
    // Botón izquierdo solamente
    if (e.button !== 0) return;
    if (madrina.isAttacking) return;
    madrina.isAttacking = true;
    madrina.attackFrame = 0;
    madrina.attackAccumulator = 0;
    madrina.attackDidFire = false;
    // Detener pasos al iniciar ataque (no se mueve durante el ataque)
    if (isWalking) {
      isWalking = false;
      footsteps.pause();
    }
  });

  // --- AUDIO ----------------------------------------------------
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return;
    footsteps.volume = 0.5;
    bgmusic.volume   = 0.35;
    bgmusic.play().catch(() => {});
    footsteps.play().then(() => {
      footsteps.pause();
      footsteps.currentTime = 0;
      audioUnlocked = true;
    }).catch(() => { audioUnlocked = true; });
  };
  window.addEventListener('mousedown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
  window.addEventListener('keydown',    unlockAudio, { once: true });

  // --- ANIMACIÓN: helpers --------------------------------------
  function clearAllFrames(c) {
    c.walkFrames.forEach(img => img.classList.remove('is-active'));
    c.attackFrames.forEach(img => img.classList.remove('is-active'));
  }
  function setWalkFrame(c, index) {
    clearAllFrames(c);
    if (c.walkFrames[index]) c.walkFrames[index].classList.add('is-active');
  }
  function setAttackFrame(c, index) {
    clearAllFrames(c);
    if (c.attackFrames[index]) c.attackFrames[index].classList.add('is-active');
  }

  // --- PROYECTILES ----------------------------------------------
  function spawnProjectile(fromX, fromY, dir) {
    const img = document.createElement('img');
    img.className = 'projectile';
    img.src = 'madrina/estela.png';
    projectilesRoot.appendChild(img);
    projectiles.push({
      el: img,
      x: fromX,
      y: fromY,
      dir: dir,        // -1 izquierda, +1 derecha
      width: 0,        // se rellena al cargar
    });
    img.addEventListener('load', () => {
      // Guardamos el ancho real escalado a la altura CSS (60px)
      const ratio = img.naturalWidth / img.naturalHeight;
      img.style.height = '60px';
      // width auto, pero guardamos referencia
    }, { once: true });
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.dir * PROJECTILE_SPEED;

      // Limpiar si sale de la pantalla
      const w = p.el.offsetWidth || 60;
      if (p.x < -w - 50 || p.x > window.innerWidth + 50) {
        p.el.remove();
        projectiles.splice(i, 1);
        continue;
      }

      // Aplicar transform
      p.el.style.setProperty('--x', (p.x - w / 2) + 'px');
      p.el.style.setProperty('--y', (p.y - 30)    + 'px'); // -30 = centra verticalmente con height 60
      p.el.style.setProperty('--flip', p.dir < 0 ? -1 : 1);
    }
  }

  // --- BUCLE PRINCIPAL ------------------------------------------
  function tick(now) {
    const dt = now - lastTime;
    lastTime = now;

    const c = madrina;

    // Dirección de input
    let dir = 0;
    if (keys.left  && !keys.right) dir = -1;
    if (keys.right && !keys.left ) dir =  1;

    // === Si está atacando, no se mueve y no se anima caminata ===
    if (c.isAttacking) {
      // Avanzar frames de ataque
      c.attackAccumulator += dt;
      while (c.attackAccumulator >= ATTACK_FRAME_INTERVAL) {
        c.attackAccumulator -= ATTACK_FRAME_INTERVAL;
        c.attackFrame++;

        if (c.attackFrame === 3 && !c.attackDidFire) {
          // Acabamos de entrar en madrinaa4.png → disparar al terminar de mostrarse.
          // Lo hacemos al SALIR de ese frame, justo abajo, para cumplir
          // "al terminar el último frame". Aquí solo marcamos para que
          // se dispare al pasar al siguiente tick que cierra el ataque.
        }

        if (c.attackFrame >= c.attackFrames.length) {
          // Acabó la animación de ataque. Disparar AHORA (al terminar madrinaa4).
          if (!c.attackDidFire) {
            const halfW = c.el.offsetWidth / 2;
            const fullH = c.el.offsetHeight;
            const groundY = window.innerHeight * (1 - GROUND_HEIGHT_RATIO);
            const charCenterX = c.x;
            const charY = groundY - fullH * (1 - PROJECTILE_Y_OFFSET);
            // Pequeño offset para que la estela no nazca dentro del cuerpo
            const spawnOffset = halfW + 10;
            spawnProjectile(
              charCenterX + c.flip * spawnOffset,
              charY,
              c.flip
            );
            c.attackDidFire = true;
          }
          // Salir del estado de ataque
          c.isAttacking = false;
          c.attackFrame = 0;
          c.attackAccumulator = 0;
          break;
        }
      }

      // Mientras siga atacando, mostrar frame de ataque correspondiente.
      // Si ya terminó (isAttacking=false), abajo se gestionará caminar/idle.
      if (c.isAttacking) {
        setAttackFrame(c, Math.min(c.attackFrame, c.attackFrames.length - 1));
      }
    }

    // === Si NO está atacando: caminar/idle normal ===
    if (!c.isAttacking) {
      const moving = dir !== 0;

      if (moving) {
        walkAccumulator += dt;
        if (walkAccumulator >= FRAME_INTERVAL) {
          const advance = Math.floor(walkAccumulator / FRAME_INTERVAL);
          const total = c.walkFrames.length || 1;
          walkFrameIndex = (walkFrameIndex + advance) % total;
          walkAccumulator = walkAccumulator % FRAME_INTERVAL;
        }
        c.x += dir * SPEED;
        c.flip = dir < 0 ? -1 : 1;
      } else {
        walkAccumulator = 0;
        walkFrameIndex = 0;
      }

      setWalkFrame(c, walkFrameIndex);

      // Sonido de pasos
      if (moving && !isWalking) {
        isWalking = true;
        if (audioUnlocked) footsteps.play().catch(() => {});
      } else if (!moving && isWalking) {
        isWalking = false;
        footsteps.pause();
      }
    }

    // === Posición y flip (siempre, atacando o no) ===
    const halfW = c.el.offsetWidth / 2;
    const minX  = halfW + SCREEN_MARGIN;
    const maxX  = window.innerWidth - halfW - SCREEN_MARGIN;
    if (c.x < minX) c.x = minX;
    if (c.x > maxX) c.x = maxX;

    const groundY = window.innerHeight * (1 - GROUND_HEIGHT_RATIO);
    const fullH = c.el.offsetHeight;
    c.el.style.setProperty('--x', (c.x - halfW)     + 'px');
    c.el.style.setProperty('--y', (groundY - fullH) + 'px');
    c.el.style.setProperty('--flip', c.flip);

    // === Proyectiles ===
    updateProjectiles();

    requestAnimationFrame(tick);
  }

  // --- INIT -----------------------------------------------------
  const allImages = [];
  madrina.walkFrames.forEach(img => allImages.push(img));
  madrina.attackFrames.forEach(img => allImages.push(img));
  Promise.all(
    allImages.map(img => new Promise(res => {
      if (img.complete) res();
      else img.addEventListener('load', res, { once: true });
    }))
  ).then(() => {
    setWalkFrame(madrina, 0);
    lastTime = performance.now();
    requestAnimationFrame(tick);
  });
})();
