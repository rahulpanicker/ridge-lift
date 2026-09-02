        // hard hit DNF if slamming deep
        if (spd > 55 && pen > 3.5) {
          this.alive = false;
          this.vel.multiplyScalar(0.1);
        }
      }
    }

    // keep roughly on track heading assist very light for AI only handled outside
    this.progress = ti / NSEG;
    this.updateRaceProgress();
    this.syncVisual();
  };

  Pod.prototype.updateRaceProgress = function () {
    var p = this.progress;
    var expect = checkpoints[this.cp];
    var dist = (p - expect + 1) % 1;
    // require forward approach within window; prevents cutting by requiring sequential CPs
    if (dist < 0.05 || (this.cp > 0 && dist < 0.08)) {
      // only advance if we are near expected CP (cutting skips ahead on progress but not cp index)
      var near = Math.min((p - expect + 1) % 1, (expect - p + 1) % 1);
      if (near < 0.045) {
        this.cp++;
        if (this.cp >= checkpoints.length) {
          this.cp = 0;
          this.lap++;
          if (this.lap > LAPS) {
            this.finished = true;
            this.finishTime = raceTime;
            this.throttleL = this.throttleR = 0;
          }
        }
      }
    }
    this.raceProg = (this.lap - 1) + (this.cp / checkpoints.length) * 0.99 + this.progress * 0.01;
    // better ordering: lap + checkpoint fraction + fine progress
    this.raceProg = (this.lap - 1) + (this.cp / checkpoints.length) + (p / checkpoints.length);
  };

  // ========== INPUT ==========
  var input = { L: 0, R: 0, boost: false, keys: {} };
  var railPointers = {}; // id -> {side, mode}

  function setRailVisual(side, v) {
    v = Math.max(0, Math.min(1, v));
    var fill = side === "L" ? Lfill : Rfill;
    var knob = side === "L" ? Lknob : Rknob;
    if (fill) fill.style.height = (v * 100).toFixed(1) + "%";
    if (knob) knob.style.bottom = (v * 100).toFixed(1) + "%";
    if (side === "L") input.L = v; else input.R = v;
  }

  function valueFromClientY(el, clientY) {
    var rect = el.getBoundingClientRect();
    var t = 1 - (clientY - rect.top) / rect.height;
    return Math.max(0, Math.min(1, t));
  }

  function bindThrottle(el, side, isRail) {
    if (!el) return;
    function down(e) {
      e.preventDefault();
      unlockAudio();
      var id = e.pointerId != null ? e.pointerId : 0;
      try { el.setPointerCapture(id); } catch (err) {}
      railPointers[id] = { side: side, el: isRail ? el : (side === "L" ? Lrail : Rrail), zone: !isRail };
      var target = isRail ? el : (side === "L" ? Lrail : Rrail);
      var y = e.clientY;
      if (e.touches && e.touches[0]) y = e.touches[0].clientY;
      // zone fallback: map vertical position of screen half
      if (!isRail) {
        var vh = window.innerHeight;
        setRailVisual(side, Math.max(0, Math.min(1, 1 - y / vh)));
      } else {
        setRailVisual(side, valueFromClientY(el, y));
      }
    }
    function move(e) {
      var id = e.pointerId != null ? e.pointerId : 0;
      var st = railPointers[id];
      if (!st || st.side !== side) return;
      e.preventDefault();
      var y = e.clientY;
      if (st.zone) {
        setRailVisual(side, Math.max(0, Math.min(1, 1 - y / window.innerHeight)));
      } else {
        setRailVisual(side, valueFromClientY(st.el, y));
      }
    }
    function up(e) {
      var id = e.pointerId != null ? e.pointerId : 0;
      if (!railPointers[id]) return;
      delete railPointers[id];
      // release to 0 only on up/end — ignore cancel keeps last (we still delete cancel but keep value)
      if (e.type === "pointercancel" || e.type === "touchcancel") {
        // keep last value
        return;
      }
      // if no other pointers on this side, release
      var held = false;
      for (var k in railPointers) if (railPointers[k].side === side) held = true;
      if (!held) setRailVisual(side, 0);
    }
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up, { passive: false });
    el.addEventListener("pointercancel", up, { passive: false });
    el.addEventListener("lostpointercapture", function (e) {
      // keep value on cancel-like loss
    });
  }

  bindThrottle(Lrail, "L", true);
  bindThrottle(Rrail, "R", true);
  bindThrottle(zoneL, "L", false);
  bindThrottle(zoneR, "R", false);

  // boost button
  function boostDown(e) { e.preventDefault(); input.boost = true; boostBtn.classList.add("active"); unlockAudio(); }
  function boostUp(e) { input.boost = false; boostBtn.classList.remove("active"); }
  boostBtn.addEventListener("pointerdown", boostDown, { passive: false });
  boostBtn.addEventListener("pointerup", boostUp, { passive: false });
  boostBtn.addEventListener("pointercancel", function () { /* keep boost if cancel? release */ boostUp(); });
  boostBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // keyboard
  window.addEventListener("keydown", function (e) {
    input.keys[e.code] = true;
    if (e.code === "Space") { e.preventDefault(); if (state === "title") startRace(); }
    if (e.code === "KeyR") { e.preventDefault(); retryRace(); }
    unlockAudio();
  });
  window.addEventListener("keyup", function (e) { input.keys[e.code] = false; });

  function applyKeyboardThrottles() {
    var k = input.keys;
    if (k.KeyW || k.ArrowUp) { input.L = Math.max(input.L, 1); input.R = Math.max(input.R, 1); }
    if (k.KeyS || k.ArrowDown) { input.L = 0; input.R = 0; }
    if (k.KeyA || k.ArrowLeft) { input.L = Math.max(input.L, 1); input.R = Math.min(input.R, 0.25); }
    if (k.KeyD || k.ArrowRight) { input.R = Math.max(input.R, 1); input.L = Math.min(input.L, 0.25); }
    if (k.ShiftLeft || k.ShiftRight) input.boost = true;
    // if no keys and no pointers, don't zero — touch may hold
    var anyPtr = false;
    for (var p in railPointers) { anyPtr = true; break; }
    if (!anyPtr && !(k.KeyW || k.KeyS || k.KeyA || k.KeyD || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight)) {
      // leave touch values; if never touched stay 0
    }
    if (!anyPtr && (k.KeyW || k.KeyA || k.KeyD || k.KeyS || k.ArrowUp || k.ArrowDown || k.ArrowLeft || k.ArrowRight)) {
      setRailVisual("L", input.L);
      setRailVisual("R", input.R);
    }
    if (!(k.ShiftLeft || k.ShiftRight) && !boostBtn.classList.contains("active")) {
      // don't force false if button held — button sets input.boost
      if (!boostHeld) input.boost = false;
    }
  }
  var boostHeld = false;
  boostBtn.addEventListener("pointerdown", function () { boostHeld = true; });
  boostBtn.addEventListener("pointerup", function () { boostHeld = false; });

  // ========== AUDIO ==========
  var audioCtx = null, rumble = null;
  function unlockAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      var filt = audioCtx.createBiquadFilter();
      filt.type = "lowpass"; filt.frequency.value = 120;
      gain.gain.value = 0.0001;
      osc.type = "sawtooth"; osc.frequency.value = 55;
      osc.connect(filt); filt.connect(gain); gain.connect(audioCtx.destination);
      osc.start();
      rumble = { osc: osc, gain: gain, filt: filt };
    } catch (err) {}
  }
  function updateAudio(thrust) {
    if (!rumble || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    rumble.gain.gain.setTargetAtTime(0.0001 + thrust * 0.035, audioCtx.currentTime, 0.05);
    rumble.osc.frequency.setTargetAtTime(45 + thrust * 70, audioCtx.currentTime, 0.08);
  }

  // ========== GAME STATE ==========
  var player = new Pod({ isPlayer: true, name: "Redwake", color: 0xff3344, engColor: 0xff6622 });
  var ai1 = new Pod({ name: "Saffron", color: 0x44aaff, engColor: 0x3388ff, soft: 1.15 });
  var ai2 = new Pod({ name: "Cinder", color: 0x55dd66, engColor: 0x33aa44, soft: 1.2 });
  var pods = [player, ai1, ai2];
  var state = "title"; // title | countdown | racing | done
  var countdown = 0;
  var raceTime = 0;
  var camPos = new THREE.Vector3(0, 10, 20);
  var camLook = new THREE.Vector3();
  var dust = [];

  // dust particles
  (function () {
    var geo = new THREE.BufferGeometry();
    var N = 400;
    var pos = new Float32Array(N * 3);
    for (var i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 400;
      pos[i * 3 + 1] = Math.random() * 12 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: 0xe8c890, size: 1.2, transparent: true, opacity: 0.45, depthAttenuation: true });
    var pts = new THREE.Points(geo, mat);
    scene.add(pts);
    dust.push(pts);
  })();

  function placeGrid() {
    player.resetAt(2, 0);
    ai1.resetAt(0, -5);
    ai2.resetAt(0, 5);
  }
  placeGrid();

  function startRace() {
    startOv.classList.add("hidden");
    endOv.classList.add("hidden");
    placeGrid();
    state = "countdown";
    countdown = 3.2;
    raceTime = 0;
    elMsg.textContent = "3";
    setRailVisual("L", 0); setRailVisual("R", 0);
    unlockAudio();
  }
  function retryRace() { startRace(); }
  window.startRace = startRace;
  window.retryRace = retryRace;
  var btnStart = document.getElementById("btnStart");
  var btnRetry = document.getElementById("btnRetry");
  var btnRestart = document.getElementById("btnRestart");
  if (btnStart) btnStart.addEventListener("click", startRace);
  if (btnRetry) btnRetry.addEventListener("click", retryRace);
  if (btnRestart) btnRestart.addEventListener("click", startRace);

  function finishRace(dnf) {
    state = "done";
    endOv.classList.remove("hidden");
    if (dnf || !player.alive) {
      endKick.textContent = "DNF";
      endTitle.textContent = "WRECKED";
      endResult.textContent = "Hard wall hit. Differential discipline next time.";
    } else {
      var place = getPlace(player);
      endKick.textContent = "FINISH";
      endTitle.textContent = place === 1 ? "1ST" : place === 2 ? "2ND" : "3RD";
      endResult.textContent = "Time " + raceTime.toFixed(2) + "s · Lap best stored locally.";
      try {
        var best = parseFloat(localStorage.getItem("redwakeBest") || "9999");
        if (raceTime < best) localStorage.setItem("redwakeBest", String(raceTime.toFixed(2)));
      } catch (err) {}
    }
    elMsg.textContent = "";
  }

  function getPlace(pod) {
    var better = 0;
    for (var i = 0; i < pods.length; i++) {
      if (pods[i] === pod) continue;
      if (pods[i].finished && !pod.finished) { better++; continue; }
      if (pods[i].raceProg > pod.raceProg) better++;
    }
    return better + 1;
  }

  // AI: follow centerline with mild differential
  function updateAI(pod, dt) {
    if (!pod.alive || pod.finished || state !== "racing") return;
    var ti = nearestTrack(pod.pos);
    var look = centerline[Math.min(NSEG, ti + 8)];
    var to = look.clone().sub(pod.pos);
    to.y = 0;
