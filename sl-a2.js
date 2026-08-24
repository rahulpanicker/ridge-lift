    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

  function applyControls(dt) {
    var px = 0, pz = 0;
    if (keys.KeyW || keys.ArrowUp) px += 1;
    if (keys.KeyS || keys.ArrowDown) px -= 1;
    if (keys.KeyA || keys.ArrowLeft) pz += 1;
    if (keys.KeyD || keys.ArrowRight) pz -= 1;
    if (keys.ShiftLeft || keys.ShiftRight) ac.throttle = clamp(ac.throttle + dt * 0.7, 0, 1);
    if (keys.ControlLeft || keys.ControlRight) ac.throttle = clamp(ac.throttle - dt * 0.7, 0, 1);

    var dirHeld = dirHold.pitch !== 0 || dirHold.yaw !== 0;
    var keyHeld = px !== 0 || pz !== 0;
    if (dirHeld || tiltPad.active || keyHeld) {
      var pitchCmd = clamp(ac.pitch + dirHold.pitch + px, -1, 1);
      var yawCmd = clamp(ac.yaw + dirHold.yaw + pz, -1, 1);
      targetTiltX = pitchCmd * MAX_TILT;
      targetTiltZ = yawCmd * MAX_TILT;
      leanCoastUntil = 0;
    } else if (deviceTilt.use && deviceTilt.granted && (Math.abs(deviceTilt.bx) + Math.abs(deviceTilt.bz) > 0.02)) {
      targetTiltX = clamp(deviceTilt.bx, -1, 1) * MAX_TILT;
      targetTiltZ = clamp(deviceTilt.bz, -1, 1) * MAX_TILT;
      leanCoastUntil = 0;
    } else {
      var tnow = nowMs();
      if (leanCoastUntil === 0) leanCoastUntil = tnow + 200;
      if (tnow >= leanCoastUntil) {
        targetTiltX = 0;
        targetTiltZ = 0;
      }
    }
  }

  function stepPhysics(dt) {
    if (dt <= 0 || dt > 0.05) dt = 0.016;
    applyControls(dt);
    st.mass = massNow();

    var follow = 1 - Math.exp(-dt * 12);
    st.tiltX += (targetTiltX - st.tiltX) * follow;
    st.tiltZ += (targetTiltZ - st.tiltZ) * follow;
    st.wx = (targetTiltX - st.tiltX) * 8;
    st.wz = (targetTiltZ - st.tiltZ) * 8;
    st.tiltX = clamp(st.tiltX, -MAX_TILT, MAX_TILT);
    st.tiltZ = clamp(st.tiltZ, -MAX_TILT, MAX_TILT);

    var te = throttleEff();
    var alt = Math.max(0, st.y - LEGS);
    var rho = RHO0 * Math.exp(-alt / HSCALE);
    var isp = ISP_SL + (ISP_VAC - ISP_SL) * (1 - clamp(rho / RHO0, 0, 1));
    var thrust = FMAX * te;
    if (st.fuel <= 0) thrust = 0;
    var ve = isp * G0;
    var mdot = thrust > 0 ? thrust / ve : 0;
    st.fuel = Math.max(0, st.fuel - mdot * dt);
    st.mass = massNow();

    var sx = Math.sin(st.tiltZ), cx = Math.cos(st.tiltZ);
    var sy = Math.sin(st.tiltX), cy = Math.cos(st.tiltX);
    var ux = -sx;
    var uy = cx * cy;
    var uz = sy * cx;
    var un = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1;
    ux /= un; uy /= un; uz /= un;

    var ax = 0, ay = -G0, az = 0;
    var couple = 1.28;
    ax += ux * thrust / st.mass * couple;
    ay += uy * thrust / st.mass;
    az += uz * thrust / st.mass * couple;

    var spd = Math.sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz);
    var tiltAng = Math.acos(clamp(uy, -1, 1));
    var cd = CD_AX + (CD_BELLY - CD_AX) * Math.abs(Math.sin(tiltAng));
    var area = AREA * (1 + 1.05 * Math.abs(Math.sin(tiltAng)));
    if (spd > 0.2) {
      var fd = 0.5 * rho * spd * spd * cd * area;
      ax -= (st.vx / spd) * fd / st.mass;
      ay -= (st.vy / spd) * fd / st.mass;
      az -= (st.vz / spd) * fd / st.mass;
    }

    st.vx += ax * dt;
    st.vy += ay * dt;
    st.vz += az * dt;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    st.z += st.vz * dt;

    last.alt = st.y - LEGS;
    last.vs = st.vy;
    last.hs = hypot2(st.vx, st.vz);
    last.tilt = tiltAng * 180 / Math.PI;
    last.fuel = st.fuel;
    last.twr = thrust / (st.mass * G0);
    last.contact = Math.sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz);

    if (st.y <= LEGS) {
      st.y = LEGS;
      if (st.vy < 0) st.vy += Math.min(-st.vy, 18 * dt);
      st.vx *= Math.pow(0.22, dt);
      st.vz *= Math.pow(0.22, dt);
      contact(dt);
    } else {
      contactGrace = 0;
    }
  }

  function contact(dt) {
    if (phase !== "fly") return;
    var hs = hypot2(st.vx, st.vz);
    var vs = st.vy;
    var tilt = last.tilt;
    var r = hypot2(st.x, st.z);
    var onPad = r <= PAD_R;
    if (contactGrace <= 0) {
      last.contact = Math.sqrt(hs * hs + vs * vs);
      last.hs = hs;
      last.vs = vs;
    }
    var firstSoft = onPad && Math.abs(last.vs) < 4 && last.hs < 3 && tilt < 8;
    var nowSoft = onPad && Math.abs(vs) < 4 && hs < 3 && tilt < 8;
    if (firstSoft || nowSoft) {
      if (nowSoft) {
        last.hs = hs;
        last.vs = vs;
        last.contact = Math.sqrt(hs * hs + vs * vs);
      }
      succeed();
      return;
    }
    contactGrace += dt || 0.016;
    if (!onPad || Math.abs(last.vs) > 14 || last.hs > 12 || tilt > 28) {
      fail(onPad, last.vs, last.hs, tilt, r);
      return;
    }
    if (contactGrace >= 0.15) fail(onPad, last.vs, last.hs, tilt, r);
  }

  function succeed() {
    phase = "landed";
    document.body.classList.remove("phase-fly");
    ac.throttle = 0; st.lit = false;
    st.vx = 0; st.vz = 0; st.vy = 0;
    st.wx = 0; st.wz = 0;
    settle = 1;
    saveBest(last.contact);
    showEnd(true, "Catch.", "Pad is steel. You are steel.", "SOFT LANDING");
  }

  function fail(onPad, vs, hs, tilt, r) {
    phase = "crash";
    document.body.classList.remove("phase-fly");
    ac.throttle = 0; st.lit = false;
    crashT = 0; flash = 1.2;
    st.wx = (Math.random() - 0.5) * 1.8;
    st.wz = (Math.random() - 0.5) * 1.8;
    spawnBoom();
    var why = "RUD.";
    var tag = "The Gulf keeps what you give it.";
    if (!onPad) { why = "Off pad."; tag = "Salt water. No chopsticks."; }
    else if (tilt >= 18) { why = "Tipped."; tag = "Eighteen degrees is a tip-over."; }
    else if (Math.abs(vs) > 8 || hs > 6) { why = "Fast."; tag = "Kill the speed. Then the steel."; }
    else { why = "Hard."; tag = "On the concrete — not soft enough."; }
    showEnd(false, why, tag, "RAPID UNPLANNED");
  }

  function showEnd(ok, title, tag, kicker) {
    document.getElementById("endKicker").textContent = kicker;
    document.getElementById("endTitle").textContent = title;
    document.getElementById("endTag").textContent = tag;
    document.getElementById("eV").textContent = last.contact.toFixed(1) + " m/s";
    document.getElementById("eTilt").textContent = last.tilt.toFixed(1) + "°";
    document.getElementById("eFuel").textContent = (last.fuel / 1000).toFixed(1) + " t";
    document.getElementById("end").classList.add("show");
    document.getElementById("bestV").textContent = fmtBest(loadBest());
    document.getElementById("reBtn").textContent = ok ? "Again" : "Relight";
  }

  function spawnBoom() {
    for (var i = 0; i < 14; i++) {
      var m = new THREE.Mesh(
        new THREE.SphereGeometry(1.2 + Math.random() * 2.2, 8, 8),
        new THREE.MeshBasicMaterial({ color: Math.random() > 0.4 ? 0xff9940 : 0xffeeaa, transparent: true, opacity: 0.9 })
      );
      m.position.set(st.x + (Math.random() - 0.5) * 8, 6 + Math.random() * 16, st.z + (Math.random() - 0.5) * 8);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 28, 8 + Math.random() * 22, (Math.random() - 0.5) * 28);
      scene.add(m);
      boomBits.push(m);
    }
  }

  function stepCrash(dt) {
    crashT += dt;
    st.tiltX += st.wx * dt;
    st.tiltZ += st.wz * dt;
    var squash = clamp(1 - crashT * 0.35, 0.45, 1);
    ship.scale.set(1 + crashT * 0.15, squash, 1 + crashT * 0.12);
    flash = Math.max(0, flash - dt);
    for (var i = 0; i < boomBits.length; i++) {
      var b = boomBits[i];
      b.userData.v.y -= 18 * dt;
      b.position.addScaledVector(b.userData.v, dt);
      b.material.opacity = Math.max(0, 0.9 - crashT * 0.55);
      b.scale.multiplyScalar(1 + dt * 1.4);
    }
  }

  function stepLanded(dt) {
    settle = Math.max(0, settle - dt * 0.8);
    st.tiltX = lerp(st.tiltX, 0, 1 - Math.pow(0.08, dt));
    st.tiltZ = lerp(st.tiltZ, 0, 1 - Math.pow(0.08, dt));
    ac.throttle = 0;
  }

  function syncShip() {
    ship.position.set(st.x, st.y, st.z);
    ship.rotation.order = "ZXY";
    ship.rotation.z = st.tiltZ;
    ship.rotation.x = st.tiltX;
    var te = phase === "fly" ? throttleEff() : 0;
    for (var i = 0; i < plumes.length; i++) {
      var p = plumes[i];
      if (te > 0.05) {
        p.visible = true;
        p.scale.set(0.85 + te * 0.9, 0.55 + te * 1.7, 0.85 + te * 0.9);
        p.material.opacity = 0.32 + te * 0.72;
        p.material.color.setHSL(0.08 - te * 0.02, 1, 0.55 + te * 0.15);
      } else {
        p.visible = false;
        p.material.opacity = 0;
      }
    }
    exhaustLight.position.set(st.x, 4, st.z);
    exhaustLight.intensity = te * 110;
    flashLight.position.set(st.x, 10, st.z);
    flashLight.intensity = flash * 80;
    shadowDisc.position.x = st.x;
    shadowDisc.position.z = st.z;
    var sc = clamp(6 + last.alt * 0.03, 5, 40);
    shadowDisc.scale.set(sc, sc, 1);
    shadowDisc.material.opacity = clamp(0.45 - last.alt / 1800, 0.06, 0.4);
    impactPip.position.x = st.x;
    impactPip.position.z = st.z;
    impactPip.visible = phase === "fly";
  }

  function syncCam() {
    var back = 96 + clamp(last.alt * 0.018, 0, 36);
    var below = 8;
    var desired = new THREE.Vector3(st.x + st.tiltZ * 16, st.y + below, st.z - back);
    if (phase === "crash") desired.set(st.x - 30, 28, st.z - 50);
    camera.position.lerp(desired, phase === "menu" ? 1 : 0.08);
    camera.lookAt(st.x, st.y + 2, st.z);
  }

  function hud() {
    var alt = last.alt;
    setG("alt", Math.round(Math.max(0, alt)) + "", alt < 200 ? "warn" : "");
    var vs = last.vs;
    var vsCls = vs < -12 ? "bad" : vs < -6 ? "warn" : vs > 1 ? "ok" : "";
    setG("vs", (vs >= 0 ? "+" : "") + vs.toFixed(1), vsCls);
    var hs = last.hs;
    setG("hs", hs.toFixed(1), hs > 6 ? "bad" : hs > 3 ? "warn" : "");
    setG("tilt", last.tilt.toFixed(1), last.tilt > 18 ? "bad" : last.tilt > 8 ? "warn" : "");
    var lrDeg = st.tiltZ * 180 / Math.PI;
    var fbDeg = st.tiltX * 180 / Math.PI;
    var leanEl = document.getElementById("leanHud");
    if (leanEl) leanEl.textContent = "LEAN  L/R " + lrDeg.toFixed(0) + "°  F/B " + fbDeg.toFixed(0) + "°";
    var te = throttleEff();
    setG("thr", Math.round(ac.throttle * 100) + "", te > 0 ? "warn" : "");
    var ft = st.fuel / 1000;
    var fp = st.fuel / PROP0 * 100;
    setG("fuel", ft.toFixed(1), fp < 18 ? "bad" : fp < 35 ? "warn" : "");
    document.getElementById("fuel").nextElementSibling.textContent = fp.toFixed(0) + " %";
    setG("twr", last.twr.toFixed(2), last.twr > 1 ? "ok" : "");
    var cue = hoverSlamAlt();
    var showBurn = phase === "fly" && alt < cue && alt > 40 && -st.vy > 12;
    document.getElementById("burnFlag").classList.toggle("on", showBurn);
    document.getElementById("bestV").textContent = fmtBest(loadBest());
    updateThrUi();
  }

  function setG(id, val, cls) {
    var el = document.getElementById(id);
    el.textContent = val;
    el.parentNode.className = "gauge" + (cls ? " " + cls : "");
  }

  function updateThrUi() {
    var fill = document.getElementById("thr-fill");
    var knob = document.getElementById("thr-knob");
    var rail = document.getElementById("thr-rail");
    if (!fill || !knob || !rail) return;
    var t = clamp(ac.throttle, 0, 1);
    var h = rail.clientHeight || 260;
    var usable = Math.max(8, h - 14);
    fill.style.height = Math.round(t * usable) + "px";
    knob.style.bottom = Math.round(6 + t * usable - 25) + "px";
  }

  function setThrFromY(clientY) {
    var rail = document.getElementById("thr-rail");
    var rec = rail.getBoundingClientRect();
    var t = 1 - (clientY - rec.top) / rec.height;
    ac.throttle = clamp(t, 0, 1);
    updateThrUi();
  }

  function setTiltFromXY(cx, cy) {
    var pad = document.getElementById("tilt-pad");
    var rec = pad.getBoundingClientRect();
    var nx = (cx - (rec.left + rec.width / 2)) / (rec.width / 2);
    var ny = ((rec.top + rec.height / 2) - cy) / (rec.height / 2);
    nx = clamp(nx, -1, 1);
    ny = clamp(ny, -1, 1);
    var mag = Math.hypot(nx, ny);
    if (mag > 1) { nx /= mag; ny /= mag; mag = 1; }
    ac.yaw = -nx;
    ac.pitch = ny;
    setTiltKnob(nx * (rec.width / 2 - 26), -ny * (rec.height / 2 - 26));
  }

  function setThrFromScreenY(clientY) {
    var h = window.innerHeight || 1;
    ac.throttle = clamp(1 - clientY / h, 0, 1);
    updateThrUi();
  }

  function setTiltFromScreen(cx, cy) {
    var w = window.innerWidth || 1;
    var h = window.innerHeight || 1;
    var halfW = w * 0.5;
    var nx = (cx - halfW * 0.5) / Math.max(1, halfW * 0.5);
    var ny = (h * 0.5 - cy) / Math.max(1, h * 0.5);
    nx = clamp(nx, -1, 1);
    ny = clamp(ny, -1, 1);
    var mag = Math.hypot(nx, ny);
    if (mag > 1) { nx /= mag; ny /= mag; }
    ac.yaw = -nx;
    ac.pitch = ny;
    setTiltKnob(nx * 56, -ny * 56);
  }

  function setTiltKnob(dx, dy) {
    var k = document.getElementById("tilt-knob");
    if (k) k.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  function endTilt() {
    tiltPad.active = false;
    tiltPad.id = null;
    ac.pitch = 0;
    ac.yaw = 0;
    setTiltKnob(0, 0);
  }

  function bindPads() {
    var pad = document.getElementById("tilt-pad");
    var rail = document.getElementById("thr-rail");
    function touchById(list, id) {
      if (!list) return null;
      for (var i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i];
      return null;
    }
    function firstTouch(e) {
      return (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]) || null;
    }

    pad.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); enableTouchUi();
      tiltPad.active = true; tiltPad.id = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      setTiltFromXY(e.clientX, e.clientY);
    });
    pad.addEventListener("pointermove", function (e) {
      if (!tiltPad.active) return;
      if (e.pointerType !== "touch" && e.pointerId !== tiltPad.id) return;
      e.preventDefault();
      setTiltFromXY(e.clientX, e.clientY);
    });
    pad.addEventListener("pointerup", function (e) {
      if (e.pointerId === tiltPad.id) endTilt();
    });
    pad.addEventListener("touchstart", function (e) {
      e.preventDefault(); e.stopPropagation(); enableTouchUi();
      var t = firstTouch(e); if (!t) return;
      tiltPad.active = true; tiltPad.id = t.identifier;
      setTiltFromXY(t.clientX, t.clientY);
    }, { passive: false });
    pad.addEventListener("touchmove", function (e) {
