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
  var MAX_TILT = 42 * Math.PI / 180;
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
  var deviceTilt = { granted: false, calibrated: false, calB: 0, calG: 0, bx: 0, bz: 0, use: false };
  var dirHold = { pitch: 0, yaw: 0 };
  var leanCoastUntil = 0;
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
    dirHold.pitch = 0;
    dirHold.yaw = 0;
    leanCoastUntil = 0;
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

  function nowMs() {
