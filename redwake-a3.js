  Pod.prototype.step = function (dt) {
    if (!this.alive || this.finished) { this.syncVisual(); return; }
    var soft = this.soft;
    // spool
    var tgtL = this.throttleL, tgtR = this.throttleR;
    // heat sag near 100%
    var sag = this.heat > 0.85 ? (1 - (this.heat - 0.85) * 1.5) : 1;
    sag = Math.max(0.35, sag);
    var tau = SPOOL_TAU * soft;
    this.spoolL += (tgtL * sag - this.spoolL) * (1 - Math.exp(-dt / tau));
    this.spoolR += (tgtR * sag - this.spoolR) * (1 - Math.exp(-dt / tau));

    var boostMul = 1;
    if (this.boosting && this.boost > 0 && this.heat < 0.98) {
      boostMul = BOOST_MULT;
      this.boost = Math.max(0, this.boost - dt);
      this.heat = Math.min(1, this.heat + HEAT_RATE * 1.4 * dt);
      if (this.boost <= 0) this.boosting = false;
    } else {
      this.boosting = false;
      this.boost = Math.min(BOOST_MAX, this.boost + dt * 0.35);
    }
    var thrustUse = (this.spoolL + this.spoolR) * 0.5;
    this.heat = Math.min(1, Math.max(0, this.heat + (thrustUse > 0.85 ? HEAT_RATE : -COOL_RATE) * dt));

    var fwd = this.forward();
    var rgt = this.right();
    var fL = this.spoolL * FMAX * boostMul / soft;
    var fR = this.spoolR * FMAX * boostMul / soft;

    // Forces on engines along forward; yaw from differential
    // Convention: MORE LEFT thrust → turn RIGHT (engines push, left-heavy yaws CW when looking down = +yaw if yaw from +z toward +x)
    var totalF = fL + fR;
    var diff = fL - fR; // +diff => more left => yaw right (+)
    var force = fwd.clone().multiplyScalar(totalF);

    // drag
    var spd = this.vel.length();
    var sideslip = 0;
    if (spd > 0.5) {
      var vdir = this.vel.clone().normalize();
      sideslip = 1 - Math.abs(vdir.dot(fwd));
    }
    var Cd = CD0 * (1 + 1.8 * sideslip + 0.6 * Math.abs(this.yawRate));
    if (spd > 0.01) {
      var dragMag = 0.5 * RHO * Cd * AREA * spd * spd;
      force.add(this.vel.clone().normalize().multiplyScalar(-dragMag));
    }

    // mass = cockpit + engines coupled loosely
    var mass = MASS_COCKPIT + MASS_ENGINE * 2;
    var acc = force.multiplyScalar(1 / mass);
    this.vel.addScaledVector(acc, dt);

    // yaw dynamics from differential thrust + lever arm
    var yawTorque = diff * TETHER_LEN * 0.55;
    var I = MASS_ENGINE * TETHER_LEN * TETHER_LEN * 2 + MASS_COCKPIT * 1.5;
    this.yawRate += (yawTorque / I) * dt;
    // yaw damping
    this.yawRate *= Math.exp(-1.8 * dt);
    // low-speed scissor amplification when huge split
    var split = Math.abs(this.spoolL - this.spoolR);
    if (spd < 25 && split > 0.35) {
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
      if (vLat * sign > 0) this.vel.addScaledVector(b, -vLat * 1.15);
      this.vel.multiplyScalar(0.93);
      this.yawRate += -sign * 0.6;
      this.sparkT = 0.35;
      this.heat = Math.min(1, this.heat + 0.03);
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
