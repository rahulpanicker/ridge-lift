(function () {
  "use strict";
  if (typeof THREE === "undefined") {
    var f = document.getElementById("fail");
    f.style.display = "flex";
    f.textContent = "Three.js failed to load. Check the network and reload.";
    return;
  }

  var G0 = 9.81;
  var DRY = 120000;
  var PROP0 = 80000;
  var FMAX = 6.3e6;
  var ISP_SL = 327;
  var ISP_VAC = 350;
  var AREA = 180;
  var CD_AX = 1.6;
  var CD_BELLY = 4.4;
  var RHO0 = 1.225;
  var HSCALE = 8500;
  var MAX_TILT = 28 * Math.PI / 180;
  var PAD_R = 42;
  var LEGS = 24;
  var SHIP_R = 4.5;
  var START_ALT = 2050;
  var START_X = 40;
  var START_Z = 6;
  var START_VX = 4.6;
  var START_VY = -82;
  var START_VZ = -2.2;

  var canvas = document.getElementById("c");
  var renderer, scene, camera, ship, padGroup, ocean, tower;
  var plumes = [];
  var exhaustLight, sun, flashLight;
  var shadowDisc, impactPip;
  var boomBits = [];
  var clock = new THREE.Clock();

  var phase = "menu";
  var keys = Object.create(null);
  var ac = { throttle: 0, pitch: 0, yaw: 0 };
  var st = {
    x: START_X, y: START_ALT + LEGS, z: START_Z,
    vx: START_VX, vy: START_VY, vz: START_VZ,
    tiltX: -0.05, tiltZ: 0.14, wx: 0.02, wz: -0.03,
    fuel: PROP0, mass: DRY + PROP0, lit: false
  };
  var targetTiltX = 0, targetTiltZ = 0;
  var crashT = 0, settle = 0, flash = 0, contactGrace = 0;
  var last = { vs: 0, hs: 0, tilt: 0, fuel: PROP0, contact: 0, twr: 0, alt: START_ALT };

  var touchOn = false;
  var tiltPad = { active: false, id: null };
  var thrPad = { active: false, id: null };
  var deviceTilt = { granted: false, calibrated: false, calB: 0, calG: 0, bx: 0, bz: 0 };
  var audio = { ctx: null, muted: false, rumble: null, wind: null, gainR: null, gainW: null };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hypot2(x, z) { return Math.sqrt(x * x + z * z); }

  function bestKey() { return "sl-best-v"; }
  function loadBest() {
    var v = parseFloat(localStorage.getItem(bestKey()) || "");
    return isFinite(v) ? v : null;
  }
  function saveBest(v) {
    var b = loadBest();
    if (b == null || v < b) localStorage.setItem(bestKey(), String(v));
  }
  function fmtBest(v) { return v == null ? "—" : v.toFixed(2) + " m/s"; }

  function steelMat(col, rough, metal) {
    return new THREE.MeshStandardMaterial({
      color: col, metalness: metal == null ? 0.92 : metal,
      roughness: rough == null ? 0.26 : rough
    });
  }

  function buildStarship() {
    var g = new THREE.Group();
    var steel = steelMat(0xdde1e6, 0.18, 0.85);
    var steelDark = steelMat(0xb8bcc4, 0.28, 0.82);
    var ringM = steelMat(0x8b9096, 0.4, 0.88);
    var tile = steelMat(0x1a1c20, 0.55, 0.35);
    var copper = steelMat(0xb87333, 0.35, 0.85);
    var soot = steelMat(0x2a241c, 0.7, 0.4);
    var legM = steelMat(0xb8bcc0, 0.3, 0.9);

    var aft = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.55, 22, 32), steel);
    aft.position.y = -11;
    g.add(aft);
    var fwd = new THREE.Mesh(new THREE.CylinderGeometry(4.35, 4.5, 16, 32), steel);
    fwd.position.y = 8;
    g.add(fwd);
    var pts = [];
    for (var i = 0; i <= 10; i++) {
      var t = i / 10;
      pts.push(new THREE.Vector2(4.35 * (1 - t * t * 0.92), 16 + t * 14));
    }
    pts.push(new THREE.Vector2(0.15, 31.2));
    var nose = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), steel);
    g.add(nose);
    var tip = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 10), steelDark);
    tip.position.y = 31.8;
    g.add(tip);

    var shield = new THREE.Mesh(new THREE.CylinderGeometry(4.52, 4.57, 21.6, 24, 1, false, -0.2, Math.PI + 0.4), tile);
    shield.position.y = -11;
    g.add(shield);
    var shield2 = new THREE.Mesh(new THREE.CylinderGeometry(4.37, 4.52, 15.6, 24, 1, false, -0.2, Math.PI + 0.4), tile);
    shield2.position.y = 8;
    g.add(shield2);

    for (var r = 0; r < 7; r++) {
      var band = new THREE.Mesh(new THREE.TorusGeometry(4.52, 0.045, 6, 32), ringM);
      band.rotation.x = Math.PI / 2;
      band.position.y = -20 + r * 5.4;
      g.add(band);
    }
    var flange = new THREE.Mesh(new THREE.CylinderGeometry(4.62, 4.62, 0.45, 32), steelDark);
    flange.position.y = 0;
    g.add(flange);

    function flap(w, h, d, x, y, z, rx) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), steelDark);
      m.position.set(x, y, z);
      m.rotation.z = rx || 0;
      g.add(m);
      return m;
    }
    flap(0.35, 7.2, 2.8, -4.7, -14, 0, 0.18);
    flap(0.35, 7.2, 2.8, 4.7, -14, 0, -0.18);
    flap(0.28, 4.4, 1.8, -3.6, 14.5, 0, 0.35);
    flap(0.28, 4.4, 1.8, 3.6, 14.5, 0, -0.35);

    var bells = [{ x: 0, z: 1.55 }, { x: -1.35, z: -0.85 }, { x: 1.35, z: -0.85 }];
    for (var b = 0; b < 3; b++) {
      var bell = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.42, 2.6, 16, 1, true), copper);
      bell.position.set(bells[b].x, -23.4, bells[b].z);
      g.add(bell);
      var throat = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.7, 10), soot);
      throat.position.set(bells[b].x, -21.8, bells[b].z);
      g.add(throat);
      var plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.85, 8, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      plume.position.set(bells[b].x, -28.2, bells[b].z);
      plume.rotation.x = Math.PI;
      plume.visible = false;
      g.add(plume);
      plumes.push(plume);
    }

    for (var L = 0; L < 4; L++) {
      var ang = L * Math.PI / 2 + Math.PI / 4;
      var lg = new THREE.Group();
      var strut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7.2, 6), legM);
      strut.position.set(0, -3.2, 0);
      strut.rotation.z = 0.55;
      lg.add(strut);
      var foot = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.7), steelDark);
      foot.position.set(3.2, -6.5, 0);
      lg.add(foot);
      lg.position.set(Math.cos(ang) * 3.4, -16.2, Math.sin(ang) * 3.4);
      lg.rotation.y = -ang;
      g.add(lg);
    }

    return g;
  }

  function buildWorld() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6a8498);
    scene.fog = new THREE.Fog(0x8aa0b4, 400, 5000);
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x4a7aaa) },
        horizonColor: { value: new THREE.Color(0xe0c8a0) },
        bottomColor: { value: new THREE.Color(0x2a3840) }
      },
      vertexShader: [
        "varying vec3 vWorldPos;",
        "void main() {",
        "  vec4 wp = modelMatrix * vec4(position, 1.0);",
        "  vWorldPos = wp.xyz;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform vec3 topColor;",
        "uniform vec3 horizonColor;",
        "uniform vec3 bottomColor;",
        "varying vec3 vWorldPos;",
        "void main() {",
        "  float h = normalize(vWorldPos).y;",
        "  vec3 col = (h > 0.0)",
        "    ? mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.65))",
        "    : mix(horizonColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.85));",
        "  gl_FragColor = vec4(col, 1.0);",
        "}"
      ].join("\n"),
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: false
    });
    var sky = new THREE.Mesh(new THREE.SphereGeometry(4200, 32, 16), skyMat);
    scene.add(sky);

    var sunDir = new THREE.Vector3(200, 280, 80).normalize();
    var sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(110, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0xffe8b8, fog: false, toneMapped: false })
    );
    sunDisc.position.copy(sunDir.clone().multiplyScalar(3400));
    scene.add(sunDisc);
    var sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(220, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd090, transparent: true, opacity: 0.32, fog: false, depthWrite: false, toneMapped: false })
    );
    sunGlow.position.copy(sunDisc.position);
    scene.add(sunGlow);

    var hemi = new THREE.HemisphereLight(0xc8d8ee, 0x3a4038, 1.1);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffe2b0, 2.2);
    sun.position.set(200, 280, 80);
    scene.add(sun);
    var fill = new THREE.DirectionalLight(0xb0c4d8, 0.45);
    fill.position.set(-180, 90, -70);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x8899aa, 0.55));

    ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshStandardMaterial({ color: 0x1a3a48, metalness: 0.22, roughness: 0.35 })
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.4;
    scene.add(ocean);

    var shallows = new THREE.Mesh(
      new THREE.RingGeometry(260, 780, 48),
      new THREE.MeshStandardMaterial({ color: 0x2a5a58, roughness: 0.4, metalness: 0.18 })
    );
    shallows.rotation.x = -Math.PI / 2;
    shallows.position.y = -0.28;
    scene.add(shallows);

    var flat = new THREE.Mesh(
      new THREE.CircleGeometry(280, 48),
      new THREE.MeshStandardMaterial({ color: 0x6a6458, roughness: 0.88, metalness: 0.08 })
    );
    flat.rotation.x = -Math.PI / 2;
    flat.position.y = -0.15;
    scene.add(flat);

    padGroup = new THREE.Group();
    var pad = new THREE.Mesh(
      new THREE.CircleGeometry(PAD_R, 48),
      new THREE.MeshStandardMaterial({ color: 0x8a8680, roughness: 0.72, metalness: 0.12 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.05;
    padGroup.add(pad);
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(PAD_R - 1.4, PAD_R, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    padGroup.add(ring);
    var inner = new THREE.Mesh(
      new THREE.RingGeometry(18, 19.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.09;
    padGroup.add(inner);
    function stripe(w, h, x, z) {
      var s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      s.rotation.x = -Math.PI / 2;
      s.position.set(x, 0.1, z);
      padGroup.add(s);
    }
    stripe(3.6, PAD_R * 1.9, 0, 0);
    stripe(PAD_R * 1.9, 3.6, 0, 0);
    scene.add(padGroup);

    tower = new THREE.Group();
    var dark = steelMat(0x3a4048, 0.55, 0.45);
    var mast = new THREE.Mesh(new THREE.BoxGeometry(6, 146, 8), dark);
    mast.position.set(-78, 73, -36);
    tower.add(mast);
    var arm = new THREE.Mesh(new THREE.BoxGeometry(38, 3, 4), dark);
    arm.position.set(-56, 118, -36);
    tower.add(arm);
    var chop = new THREE.Mesh(new THREE.BoxGeometry(3, 52, 3), dark);
    chop.position.set(-40, 108, -33);
    tower.add(chop);
    var chop2 = chop.clone();
    chop2.position.set(-40, 108, -39);
    tower.add(chop2);
    scene.add(tower);

    for (var k = 0; k < 9; k++) {
      var pile = new THREE.Mesh(
        new THREE.BoxGeometry(4 + Math.random() * 8, 2 + Math.random() * 4, 6 + Math.random() * 10),
        steelMat(0x4a463c, 0.82, 0.12)
      );
      var ang = k * 0.7 + 1;
      pile.position.set(Math.cos(ang) * (160 + k * 30), 1, Math.sin(ang) * (140 + k * 24) - 40);
      scene.add(pile);
    }

    shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(5, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.12;
    scene.add(shadowDisc);

    impactPip = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 4.1, 20),
      new THREE.MeshBasicMaterial({ color: 0xe8a23a, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    impactPip.rotation.x = -Math.PI / 2;
    impactPip.position.y = 0.14;
    scene.add(impactPip);

    ship = buildStarship();
    scene.add(ship);

    exhaustLight = new THREE.PointLight(0xffc070, 0, 320, 1.35);
    scene.add(exhaustLight);
    flashLight = new THREE.PointLight(0xffeeaa, 0, 400, 1.2);
    scene.add(flashLight);

    camera = new THREE.PerspectiveCamera(54, 1, 0.5, 9000);
    camera.position.set(30, 40, -120);
  }

  function resetState() {
    st.x = START_X; st.y = START_ALT + LEGS; st.z = START_Z;
    st.vx = START_VX; st.vy = START_VY; st.vz = START_VZ;
    st.tiltX = -0.05; st.tiltZ = 0.14; st.wx = 0.02; st.wz = -0.03;
    st.fuel = PROP0; st.mass = DRY + PROP0; st.lit = false;
    ac.throttle = 0; ac.pitch = 0; ac.yaw = 0;
    targetTiltX = 0; targetTiltZ = 0;
    crashT = 0; settle = 0; flash = 0; contactGrace = 0;
    ship.scale.set(1, 1, 1);
    ship.rotation.set(0, 0, 0);
    ship.visible = true;
    for (var i = 0; i < boomBits.length; i++) {
      scene.remove(boomBits[i]);
    }
    boomBits.length = 0;
    updateThrUi();
    setTiltKnob(0, 0);
  }

  function startDrop(e) {
    if (e && e.preventDefault) {
      try { e.preventDefault(); } catch (err) {}
    }
    unlockAudio();
    requestTilt();
    resetState();
    phase = "fly";
    document.body.classList.add("phase-fly");
    document.body.classList.remove("phase-end");
    document.getElementById("start").classList.add("hide");
    document.getElementById("end").classList.remove("show");
    document.getElementById("hud").classList.add("on");
    enableTouchUi();
  }
  window.startDrop = startDrop;

  function enableTouchUi() {
    touchOn = true;
    document.body.classList.add("touch-on");
    document.getElementById("touch-ui").classList.add("on");
  }

  function massNow() { return DRY + st.fuel; }

  function throttleEff() {
    if (st.fuel <= 1) { st.lit = false; return 0; }
    var cmd = clamp(ac.throttle, 0, 1);
    if (cmd < 0.08) { st.lit = false; return 0; }
    st.lit = true;
    return clamp(cmd, 0.2, 1);
  }

  function hoverSlamAlt() {
    var m = massNow();
    var thr = FMAX * Math.max(throttleEff(), 0.85);
    var twr = thr / (m * G0);
    var v = Math.max(0, -st.vy);
    if (twr <= 1.08) return 1e9;
    return (v * v) / (2 * (twr - 1) * G0) * 2.7;
  }

  function applyControls(dt) {
    var px = 0, pz = 0;
    if (keys.KeyW || keys.ArrowUp) px += 1;
    if (keys.KeyS || keys.ArrowDown) px -= 1;
    if (keys.KeyA || keys.ArrowLeft) pz += 1;
    if (keys.KeyD || keys.ArrowRight) pz -= 1;
    if (keys.ShiftLeft || keys.ShiftRight) ac.throttle = clamp(ac.throttle + dt * 0.7, 0, 1);
    if (keys.ControlLeft || keys.ControlRight) ac.throttle = clamp(ac.throttle - dt * 0.7, 0, 1);

    if (tiltPad.active) {
      targetTiltX = ac.pitch * MAX_TILT;
      targetTiltZ = ac.yaw * MAX_TILT;
    } else if (deviceTilt.granted && (Math.abs(deviceTilt.bx) + Math.abs(deviceTilt.bz) > 0.02)) {
      targetTiltX = clamp(deviceTilt.bx, -1, 1) * MAX_TILT;
      targetTiltZ = clamp(deviceTilt.bz, -1, 1) * MAX_TILT;
    } else {
      targetTiltX = clamp(px, -1, 1) * MAX_TILT;
      targetTiltZ = clamp(pz, -1, 1) * MAX_TILT;
    }
  }

  function stepPhysics(dt) {
    if (dt <= 0 || dt > 0.05) dt = 0.016;
    applyControls(dt);
    st.mass = massNow();

    var I = st.mass * 180;
    var kP = 352000 * st.mass / 200000;
    var kD = 144000 * st.mass / 200000;
    var boost = 0.72 + throttleEff() * 1.35;
    var tx = ((targetTiltX - st.tiltX) * kP - st.wx * kD) * boost;
    var tz = ((targetTiltZ - st.tiltZ) * kP - st.wz * kD) * boost;
    st.wx += tx / I * dt;
    st.wz += tz / I * dt;
    st.wx *= 0.988;
    st.wz *= 0.988;
    st.tiltX = clamp(st.tiltX + st.wx * dt, -MAX_TILT, MAX_TILT);
    st.tiltZ = clamp(st.tiltZ + st.wz * dt, -MAX_TILT, MAX_TILT);

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
      if (!tiltPad.active) return;
      e.preventDefault();
      var t = touchById(e.touches, tiltPad.id) || firstTouch(e);
      if (t) setTiltFromXY(t.clientX, t.clientY);
    }, { passive: false });
    pad.addEventListener("touchend", function (e) {
      e.preventDefault();
      if (touchById(e.changedTouches, tiltPad.id) || !e.touches.length) endTilt();
    }, { passive: false });
    pad.addEventListener("touchcancel", function (e) { e.preventDefault(); }, { passive: false });

    rail.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation(); enableTouchUi();
      thrPad.active = true; thrPad.id = e.pointerId;
      try { rail.setPointerCapture(e.pointerId); } catch (err) {}
      setThrFromY(e.clientY);
    });
    rail.addEventListener("pointermove", function (e) {
      if (!thrPad.active) return;
      if (e.pointerType !== "touch" && e.pointerId !== thrPad.id) return;
      e.preventDefault();
      setThrFromY(e.clientY);
    });
    function thrUp(e) {
      if (e.pointerId !== thrPad.id) return;
      thrPad.active = false; thrPad.id = null;
    }
    rail.addEventListener("pointerup", thrUp);
    rail.addEventListener("pointercancel", function (e) {
      e.preventDefault();
    });
    rail.addEventListener("touchstart", function (e) {
      e.preventDefault(); e.stopPropagation(); enableTouchUi();
      var t = firstTouch(e); if (!t) return;
      thrPad.active = true; thrPad.id = t.identifier;
      setThrFromY(t.clientY);
    }, { passive: false });
    rail.addEventListener("touchmove", function (e) {
      if (!thrPad.active) return;
      e.preventDefault();
      var t = touchById(e.touches, thrPad.id) || firstTouch(e);
      if (t) setThrFromY(t.clientY);
    }, { passive: false });
    rail.addEventListener("touchend", function (e) {
      e.preventDefault();
      if (touchById(e.changedTouches, thrPad.id) || !e.touches.length) {
        thrPad.active = false; thrPad.id = null;
      }
    }, { passive: false });
    rail.addEventListener("touchcancel", function (e) { e.preventDefault(); }, { passive: false });

    var leftIds = Object.create(null);
    var rightIds = Object.create(null);
    function uiHit(target) {
      if (!target) return false;
      var el = target.nodeType === 1 ? target : target.parentElement;
      if (!el || !el.closest) return false;
      if (el.closest("button")) return true;
      if (el.closest(".panel")) return true;
      return false;
    }
    function playing() { return phase === "fly"; }
    function applyScreenTouch(t) {
      var w = window.innerWidth || 1;
      var x = t.clientX;
      if (x >= w * 0.62) {
        rightIds[t.identifier] = true;
        thrPad.active = true;
        thrPad.id = t.identifier;
        setThrFromScreenY(t.clientY);
        return true;
      }
      if (x <= w * 0.5) {
        leftIds[t.identifier] = true;
        tiltPad.active = true;
        tiltPad.id = t.identifier;
        setTiltFromScreen(t.clientX, t.clientY);
        return true;
      }
      return false;
    }
    function onDocTouchStart(e) {
      enableTouchUi();
      if (!playing()) return;
      var list = e.changedTouches || [];
      var hit = false;
      for (var i = 0; i < list.length; i++) {
        if (uiHit(list[i].target || e.target)) continue;
        if (applyScreenTouch(list[i])) hit = true;
      }
      if (hit) e.preventDefault();
    }
    function onDocTouchMove(e) {
      if (!playing()) return;
      var list = e.touches || [];
      var w = window.innerWidth || 1;
      var hit = false;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (rightIds[t.identifier] || t.clientX >= w * 0.62) {
          if (uiHit(t.target || e.target) && !rightIds[t.identifier]) continue;
          rightIds[t.identifier] = true;
          thrPad.active = true;
          thrPad.id = t.identifier;
          setThrFromScreenY(t.clientY);
          hit = true;
        } else if (leftIds[t.identifier] || t.clientX <= w * 0.5) {
          if (uiHit(t.target || e.target) && !leftIds[t.identifier]) continue;
          leftIds[t.identifier] = true;
          tiltPad.active = true;
          tiltPad.id = t.identifier;
          setTiltFromScreen(t.clientX, t.clientY);
          hit = true;
        }
      }
      if (hit) e.preventDefault();
    }
    function onDocTouchEnd(e) {
      var w = window.innerWidth || 1;
      var changed = e.changedTouches || [];
      for (var i = 0; i < changed.length; i++) {
        delete leftIds[changed[i].identifier];
        delete rightIds[changed[i].identifier];
      }
      var rem = e.touches || [];
      var leftHeld = false;
      var rightHeld = false;
      for (var j = 0; j < rem.length; j++) {
        if (leftIds[rem[j].identifier] || rem[j].clientX <= w * 0.5) leftHeld = true;
        if (rightIds[rem[j].identifier] || rem[j].clientX >= w * 0.62) rightHeld = true;
      }
      if (!leftHeld) endTilt();
      if (!rightHeld) {
        thrPad.active = false;
        thrPad.id = null;
      }
    }
    var touchOpts = { passive: false, capture: true };
    document.addEventListener("touchstart", onDocTouchStart, touchOpts);
    document.addEventListener("touchmove", onDocTouchMove, touchOpts);
    document.addEventListener("touchend", onDocTouchEnd, touchOpts);
    window.addEventListener("touchstart", onDocTouchStart, touchOpts);
    window.addEventListener("touchmove", onDocTouchMove, touchOpts);
    window.addEventListener("touchend", onDocTouchEnd, touchOpts);
  }

  function unlockAudio() {
    if (audio.ctx) {
      if (audio.ctx.state === "suspended") audio.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    var ctx = new AC();
    audio.ctx = ctx;
    var buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    function noise(gain) {
      var src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      var f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 180;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start();
      return { filter: f, gain: g };
    }
    var r = noise(0);
    r.filter.frequency.value = 140;
    audio.rumble = r; audio.gainR = r.gain;
    var w = noise(0);
    w.filter.frequency.value = 900;
    audio.wind = w; audio.gainW = w.gain;
    var osc = ctx.createOscillator();
    osc.type = "sawtooth"; osc.frequency.value = 42;
    var og = ctx.createGain(); og.gain.value = 0;
    osc.connect(og); og.connect(ctx.destination); osc.start();
    audio.oscG = og;
  }

  function tickAudio() {
    if (!audio.ctx || audio.muted) {
      if (audio.gainR) audio.gainR.gain.value = 0;
      if (audio.gainW) audio.gainW.gain.value = 0;
      if (audio.oscG) audio.oscG.gain.value = 0;
      return;
    }
    var te = phase === "fly" ? throttleEff() : (phase === "crash" ? Math.max(0, 0.8 - crashT) : 0);
    var spd = Math.sqrt(st.vx * st.vx + st.vy * st.vy + st.vz * st.vz);
    if (audio.gainR) audio.gainR.gain.value = te * 0.12;
    if (audio.gainW) audio.gainW.gain.value = clamp(spd / 140, 0, 1) * 0.05;
    if (audio.oscG) audio.oscG.gain.value = te * 0.04;
    if (audio.rumble) audio.rumble.filter.frequency.value = 90 + te * 80;
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    document.getElementById("mutebadge").classList.toggle("on", audio.muted);
    var b = document.getElementById("touch-mute");
    if (b) b.textContent = audio.muted ? "Unmute" : "Mute";
  }

  function requestTilt() {
    function onOri(e) {
      if (!deviceTilt.granted) return;
      var beta = e.beta || 0;
      var gamma = e.gamma || 0;
      if (!deviceTilt.calibrated) {
        deviceTilt.calB = beta;
        deviceTilt.calG = gamma;
        deviceTilt.calibrated = true;
      }
      deviceTilt.bx = clamp((beta - deviceTilt.calB) / 28, -1, 1);
      deviceTilt.bz = clamp(-(gamma - deviceTilt.calG) / 28, -1, 1);
    }
    function go() {
      deviceTilt.granted = true;
      window.addEventListener("deviceorientation", onOri);
      setTimeout(calibrateTilt, 200);
    }
    try {
      if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) {
        DeviceOrientationEvent.requestPermission().then(function (p) {
          if (p === "granted") go();
        }).catch(function () {});
      } else if (window.DeviceOrientationEvent) go();
    } catch (err) {}
  }

  function calibrateTilt() {
    deviceTilt.calibrated = false;
  }

  function onResize() {
    var w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    updateThrUi();
  }

  function loop() {
    requestAnimationFrame(loop);
    var dt = Math.min(0.033, clock.getDelta());
    if (phase === "fly") stepPhysics(dt);
    else if (phase === "crash") stepCrash(dt);
    else if (phase === "landed") stepLanded(dt);
    else {
      st.y = START_ALT + LEGS;
      last.alt = START_ALT;
    }
    syncShip();
    syncCam();
    hud();
    tickAudio();
    renderer.render(scene, camera);
  }

  function boot() {
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
      renderer.setClearColor(0x6a8498, 1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      if ("physicallyCorrectLights" in renderer) renderer.physicallyCorrectLights = true;
      if ("useLegacyLights" in renderer) renderer.useLegacyLights = false;
    } catch (e) {
      var fl = document.getElementById("fail");
      fl.style.display = "flex";
      fl.textContent = "WebGL is required.";
      return;
    }
    try {
      buildWorld();
      resetState();
      document.getElementById("bestV").textContent = fmtBest(loadBest());
      onResize();
      window.addEventListener("resize", onResize);
      clock.start();
      loop();
    } catch (err) {
      var fl2 = document.getElementById("fail");
      if (fl2) {
        fl2.style.display = "flex";
        fl2.textContent = "Renderer failed. Reload if the view is blank.";
      }
    }
  }

  function maybeStartFromMenu(e) {
    if (phase !== "menu") return;
    if (e) { e.preventDefault(); }
    startDrop();
  }

  bindPads();
  document.getElementById("flyBtn").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation(); startDrop();
  });
  document.getElementById("start").addEventListener("click", maybeStartFromMenu);
  document.getElementById("start").addEventListener("touchend", function (e) {
    if (phase !== "menu") return;
    e.preventDefault();
    startDrop();
  }, { passive: false });
  document.getElementById("reBtn").addEventListener("click", function (e) {
    e.preventDefault(); startDrop();
  });
  document.getElementById("touch-relaunch").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation(); startDrop();
  });
  document.getElementById("touch-mute").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation(); toggleMute();
  });
  document.getElementById("levelBtn").addEventListener("click", function (e) {
    e.preventDefault(); e.stopPropagation();
    calibrateTilt();
  });

  window.addEventListener("touchstart", function () { enableTouchUi(); }, { passive: true });
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("gesturechange", function (e) { e.preventDefault(); });

  window.addEventListener("keydown", function (e) {
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) >= 0) e.preventDefault();
    if (phase === "menu") startDrop();
    else if ((phase === "crash" || phase === "landed") && e.code === "Space") startDrop();
    if (e.code === "KeyM") toggleMute();
    if (e.code === "Space" && phase === "fly") startDrop();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = Object.create(null); });
  window.addEventListener("wheel", function (e) {
    if (phase !== "fly" && phase !== "menu") return;
    e.preventDefault();
    ac.throttle = clamp(ac.throttle - e.deltaY * 0.0012, 0, 1);
    updateThrUi();
  }, { passive: false });

  boot();
})();
