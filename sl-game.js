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
  var CD_BELLY = 3.2;
  var RHO0 = 1.225;
  var HSCALE = 8500;
  var MAX_TILT = 22 * Math.PI / 180;
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
  var crashT = 0, settle = 0, flash = 0;
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
    var steel = steelMat(0xc7cad0, 0.24, 0.94);
    var steelDark = steelMat(0x9aa0a6, 0.34, 0.9);
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
