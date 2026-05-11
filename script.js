/* ============================================================
   Mini experiencia pixel-art
   Control por teclado (← →) + click del ratón para atacar.
   ============================================================ */

(() => {
  // --- CONFIG ---------------------------------------------------
  const SPEED = 4;
  const FRAME_INTERVAL = 140;          // ms entre frames de caminata
  const ATTACK_FRAME_INTERVAL = 100;   // ms entre frames de ataque (más rápido)
  const CROUCH_FRAME_INTERVAL = 250;   // ms entre frames de agacharse (más lento)
  const GROUND_HEIGHT_RATIO = 0.12;
  const SCREEN_MARGIN = 20;

  // --- ESTADO GLOBAL DEL JUEGO ----------------------------------
  // Hasta que el usuario pulse PLAY, los inputs de gameplay se ignoran.
  let gameStarted = false;

  // Vidas del jugador (sistema preparado para futuro daño)
  let playerLives = 3;

  // Proyectil
  const PROJECTILE_SPEED = 8;          // px/frame
  const PROJECTILE_Y_OFFSET = 0.55;    // 0 = pies, 1 = cabeza. 0.55 ≈ a la altura del torso

  // --- ELEMENTOS ------------------------------------------------
  const footsteps       = document.getElementById('footsteps');
  const firesound       = document.getElementById('firesound');
  const confirmsound    = document.getElementById('confirmsound');
  const bgmusic         = document.getElementById('bgmusic');
  const projectilesRoot = document.getElementById('projectiles');
  const hudLives        = document.getElementById('hud-lives');

  // Estado de Madrina
  const madrina = {
    el: document.getElementById('madrina'),
    walkFrames:   document.querySelectorAll('#madrina .walk-frame'),
    attackFrames: document.querySelectorAll('#madrina .attack-frame'),
    crouchFrames: document.querySelectorAll('#madrina .crouch-frame'),
    x: window.innerWidth / 2,
    flip: 1,
    // --- estado de ataque ---
    isAttacking: false,
    attackFrame: 0,
    attackAccumulator: 0,
    attackDidFire: false,  // ya se lanzó el proyectil en este ataque
    // --- estado de agacharse ---
    isCrouching: false,
    crouchFrame: 0,
    crouchAccumulator: 0,
  };

  // Lista de proyectiles activos
  const projectiles = [];

  // Estado global del bucle (declarado pronto para que listeners lo vean)
  let walkAccumulator = 0;
  let walkFrameIndex = 0;
  let lastTime = performance.now();
  let isWalking = false;

  // --- INPUT TECLADO --------------------------------------------
  const keys = { left: false, right: false, down: false };

  window.addEventListener('keydown', (e) => {
    if (!gameStarted) return;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') keys.down  = true;
  });

  window.addEventListener('keyup', (e) => {
    if (!gameStarted) return;
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') keys.down  = false;
  });

  // --- ATAQUE (función reutilizable) ----------------------------
  function tryAttack() {
    if (!gameStarted) return;
    if (madrina.isAttacking) return;
    madrina.isAttacking = true;
    madrina.attackFrame = 0;
    madrina.attackAccumulator = 0;
    madrina.attackDidFire = false;
    // Detener pasos al iniciar ataque
    if (isWalking) {
      isWalking = false;
      footsteps.pause();
    }
  }

  // --- INPUT RATÓN: ATAQUE --------------------------------------
  window.addEventListener('mousedown', (e) => {
    // Botón izquierdo solamente
    if (e.button !== 0) return;
    // Ignorar clicks sobre los botones táctiles (tienen su propio handler)
    if (e.target && e.target.closest('.touch-controls')) return;
    // Ignorar clicks sobre el botón PLAY de la pantalla inicial
    if (e.target && e.target.closest('.title-screen')) return;
    tryAttack();
  });

  // --- AUDIO ----------------------------------------------------
  let audioUnlocked = false;
  const unlockAudio = () => {
    if (audioUnlocked) return;
    footsteps.volume = 0.5;
    firesound.volume = 0.6;
    confirmsound.volume = 0.7;
    bgmusic.volume   = 0.35;
    // Desbloquear pasos (play+pause inmediato)
    footsteps.play().then(() => {
      footsteps.pause();
      footsteps.currentTime = 0;
    }).catch(() => {});
    // Desbloquear firesound (play+pause inmediato)
    firesound.play().then(() => {
      firesound.pause();
      firesound.currentTime = 0;
    }).catch(() => {});
    // Desbloquear bgmusic silenciosamente (no arranca todavía,
    // se reproducirá desde startGame con un retardo)
    bgmusic.play().then(() => {
      bgmusic.pause();
      bgmusic.currentTime = 0;
      audioUnlocked = true;
    }).catch(() => { audioUnlocked = true; });
  };
  window.addEventListener('mousedown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
  window.addEventListener('keydown',    unlockAudio, { once: true });

  // --- HUD DE VIDAS ---------------------------------------------
  function updateLivesUI() {
    // Re-pintado completo: vacía y reconstruye N gatitos
    hudLives.innerHTML = '';
    for (let i = 0; i < playerLives; i++) {
      const img = document.createElement('img');
      img.src = 'elements/catlife.png';
      img.alt = 'Vida';
      hudLives.appendChild(img);
    }
  }

  // --- ANIMACIÓN: helpers --------------------------------------
  function clearAllFrames(c) {
    c.walkFrames.forEach(img => img.classList.remove('is-active'));
    c.attackFrames.forEach(img => img.classList.remove('is-active'));
    c.crouchFrames.forEach(img => img.classList.remove('is-active'));
  }
  function setWalkFrame(c, index) {
    clearAllFrames(c);
    if (c.walkFrames[index]) c.walkFrames[index].classList.add('is-active');
  }
  function setAttackFrame(c, index) {
    clearAllFrames(c);
    if (c.attackFrames[index]) c.attackFrames[index].classList.add('is-active');
  }
  function setCrouchFrame(c, index) {
    clearAllFrames(c);
    if (c.crouchFrames[index]) c.crouchFrames[index].classList.add('is-active');
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
            // Sonido de disparo (one-shot, reset por si se repite seguido)
            if (audioUnlocked) {
              firesound.currentTime = 0;
              firesound.play().catch(() => {});
            }
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

    // === Si NO está atacando: comprobar agacharse o caminar ===
    if (!c.isAttacking) {
      // Gate de agacharse: si pulsa abajo, no se mueve y anima crouch.
      if (keys.down) {
        if (!c.isCrouching) {
          // Recién entra en agacharse: reset
          c.isCrouching = true;
          c.crouchFrame = 0;
          c.crouchAccumulator = 0;
          // Cortar pasos si venía caminando
          if (isWalking) {
            isWalking = false;
            footsteps.pause();
          }
          // Reset del walk para que al levantarse empiece desde 0
          walkAccumulator = 0;
          walkFrameIndex = 0;
        }

        // Avanzar frames de agacharse alternando
        c.crouchAccumulator += dt;
        if (c.crouchAccumulator >= CROUCH_FRAME_INTERVAL) {
          const advance = Math.floor(c.crouchAccumulator / CROUCH_FRAME_INTERVAL);
          const total = c.crouchFrames.length || 1;
          c.crouchFrame = (c.crouchFrame + advance) % total;
          c.crouchAccumulator = c.crouchAccumulator % CROUCH_FRAME_INTERVAL;
        }

        setCrouchFrame(c, c.crouchFrame);
        // No se mueve, no se cambia flip → mantiene orientación
      } else {
        // No está pulsando abajo: si venía agachada, salir del estado
        if (c.isCrouching) {
          c.isCrouching = false;
          c.crouchFrame = 0;
          c.crouchAccumulator = 0;
        }

        // --- Caminar / idle normal ---
        const moving = (dir !== 0);

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

  // --- CONTROLES TÁCTILES ---------------------------------------
  // Pointer Events: cubren touch + mouse + stylus con una sola API.
  // Cada botón llama a onPress al pulsar y onRelease al soltar/cancelar.
  function bindTouchButton(el, onPress, onRelease) {
    if (!el) return;
    let active = false;

    const press = (e) => {
      e.preventDefault();
      if (!gameStarted) return;
      if (active) return;
      active = true;
      el.classList.add('is-pressed');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      onPress();
    };

    const release = (e) => {
      if (!active) return;
      active = false;
      el.classList.remove('is-pressed');
      try { el.releasePointerCapture(e.pointerId); } catch (_) {}
      onRelease();
    };

    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);

    // Evitar menú contextual o selección
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  const tcLeft   = document.getElementById('tc-left');
  const tcRight  = document.getElementById('tc-right');
  const tcDown   = document.getElementById('tc-down');
  const tcAttack = document.getElementById('tc-attack');

  bindTouchButton(tcLeft,   () => { keys.left  = true;  }, () => { keys.left  = false; });
  bindTouchButton(tcRight,  () => { keys.right = true;  }, () => { keys.right = false; });
  bindTouchButton(tcDown,   () => { keys.down  = true;  }, () => { keys.down  = false; });
  bindTouchButton(tcAttack, () => { tryAttack();         }, () => { /* one-shot */    });

  // --- PANTALLA INICIAL ----------------------------------------
  const titleScreen = document.getElementById('title-screen');
  const playButton  = document.getElementById('title-play');

  function startGame() {
    if (gameStarted) return;
    // Sonido de confirmación (dentro del gesto del usuario)
    confirmsound.currentTime = 0;
    confirmsound.play().catch(() => {});
    gameStarted = true;
    titleScreen.classList.add('hidden');
    // Música de fondo: arranca ~1s después para dejar que suene el confirm
    setTimeout(() => {
      bgmusic.play().catch(() => {});
    }, 1000);
  }

  playButton.addEventListener('click', startGame);
  playButton.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startGame();
    }
  });
  // También Enter/Espacio aunque el botón no tenga foco
  window.addEventListener('keydown', (e) => {
    if (gameStarted) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startGame();
    }
  });

  // --- INIT -----------------------------------------------------
  const allImages = [];
  madrina.walkFrames.forEach(img => allImages.push(img));
  madrina.attackFrames.forEach(img => allImages.push(img));
  madrina.crouchFrames.forEach(img => allImages.push(img));
  Promise.all(
    allImages.map(img => new Promise(res => {
      if (img.complete) res();
      else img.addEventListener('load', res, { once: true });
    }))
  ).then(() => {
    setWalkFrame(madrina, 0);
    updateLivesUI();
    lastTime = performance.now();
    requestAnimationFrame(tick);
  });
})();