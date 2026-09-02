      this.yawRate += (this.spoolL - this.spoolR) * 2.8 * dt;
      // tether stretch dump speed
      this.vel.multiplyScalar(Math.max(0.92, 1 - split * 0.04));
    }
    this.yaw += this.yawRate * dt;

    // engine spring-damper offsets (scissor visual + feel)
    var restL = -TETHER_LEN, restR = TETHER_LEN;
    // stretch from yaw rate / split
    var stretch = split * (0.8 + Math.abs(this.yawRate) * 0.5);
    var targetL = restL - stretch * Math.sign(this.spoolL - this.spoolR + 0.0001) * 0.5;
    var targetR = restR + stretch * Math.sign(this.spoolL - this.spoolR + 0.0001) * 0.5;
    // spring on lateral offset
    var aL = (-TETHER_K * (this.engOffsetL.x - targetL) - TETHER_D * this.engVelL.x) / MASS_ENGINE;
    var aR = (-TETHER_K * (this.engOffsetR.x - targetR) - TETHER_D * this.engVelR.x) / MASS_ENGINE;
    this.engVelL.x += aL * dt; this.engVelR.x += aR * dt;
    this.engOffsetL.x += this.engVelL.x * dt; this.engOffsetR.x += this.engVelR.x * dt;
    this.engOffsetL.x = THREE.MathUtils.clamp(this.engOffsetL.x, -TETHER_LEN * 1.45, -TETHER_LEN * 0.55);
    this.engOffsetR.x = THREE.MathUtils.clamp(this.engOffsetR.x, TETHER_LEN * 0.55, TETHER_LEN * 1.45);

    this.pos.addScaledVector(this.vel, dt);

    // ground-effect hover
    var ti = nearestTrack(this.pos);
    var groundY = centerline[ti].y + HOVER_H;
    var dy = groundY - this.pos.y;
    // allow jumps: if going up fast or above, soft spring only when near
    if (this.pos.y < groundY + 6) {
      var hoverAcc = dy * 18 - this.vel.y * 6;
      if (this.pos.y > groundY + 1.5 && this.vel.y > 0) hoverAcc *= 0.15;
      this.vel.y += hoverAcc * dt;
    }
    this.vel.y -= GRAV * 0.35 * dt; // light gravity so lips launch
    if (this.pos.y < groundY - 0.2) {
      this.pos.y = groundY;
      if (this.vel.y < 0) this.vel.y *= -0.2;
    }

    // roll visual from yaw rate + diff
    this.roll = THREE.MathUtils.clamp(-this.yawRate * 0.25 - (this.spoolL - this.spoolR) * 0.15, -0.55, 0.55);

    // wall collision via centerline half-width
    var c = centerline[ti];
    var b = binormals[ti];
    var local = this.pos.clone().sub(c);
    var lat = local.dot(b);
    var hw = widths[ti] - 2.2;
    if (Math.abs(lat) > hw) {
      var pen = Math.abs(lat) - hw;
      var sign = lat > 0 ? 1 : -1;
      this.pos.addScaledVector(b, -sign * pen);
      // bounce
      var vLat = this.vel.dot(b);
      if (vLat * sign > 0) this.vel.addScaledVector(b, -vLat * 1.35);
      this.vel.multiplyScalar(0.72);
      this.yawRate += -sign * 1.5;
      this.sparkT = 0.35;
      this.heat = Math.min(1, this.heat + 0.08);
      if (pen > 4 || this.vel.length() < 4 && pen > 1.5) {
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
  var player = new Pod({ isPlayer: true, name: "Redwake", color: 0xff4422, engColor: 0xff7722 });
  var ai1 = new Pod({ name: "Saffron", color: 0x33bbff, engColor: 0x22a0ff, soft: 1.15 });
  var ai2 = new Pod({ name: "Cinder", color: 0x44ee55, engColor: 0x22cc44, soft: 1.2 });
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
