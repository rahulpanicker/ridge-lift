(function () {
  "use strict";
  if (typeof THREE === "undefined") {
    console.error("Three.js missing");
    return;
  }

  // ========== CONSTANTS ==========
  var MASS_COCKPIT = 800;
  var MASS_ENGINE = 600;
  var TETHER_LEN = 7.5;
  var TETHER_K = 14000;
  var TETHER_D = 900;
  var FMAX = 82000;
  var SPOOL_TAU = 0.28;
  var RHO = 1.2;
  var CD0 = 0.42;
  var AREA = 3.2;
  var HOVER_H = 1.2;
  var BOOST_MULT = 1.6;
  var BOOST_MAX = 3.2;
  var HEAT_RATE = 0.22;
  var COOL_RATE = 0.16;
  var LAPS = 3;
  var HALF_W = 18;
  var GRAV = 9.81;

  // ========== DOM ==========
  var canvas = document.getElementById("c");
  var elSpd = document.getElementById("spd");
  var elLap = document.getElementById("lap");
  var elPlc = document.getElementById("plc");
  var elMsg = document.getElementById("msg");
  var elHeat = document.getElementById("heatFill");
  var elHeatBar = document.getElementById("heatBar");
  var startOv = document.getElementById("startOv");
  var endOv = document.getElementById("endOv");
  var endKick = document.getElementById("endKick");
  var endTitle = document.getElementById("endTitle");
  var endResult = document.getElementById("endResult");
  var Lfill = document.getElementById("Lfill");
  var Rfill = document.getElementById("Rfill");
  var Lknob = document.getElementById("Lknob");
  var Rknob = document.getElementById("Rknob");
  var boostBtn = document.getElementById("boostBtn");
  var Lrail = document.getElementById("Lrail");
  var Rrail = document.getElementById("Rrail");
  var zoneL = document.getElementById("zoneL");
  var zoneR = document.getElementById("zoneR");

  // ========== RENDERER ==========
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x7ecfff);
  scene.fog = new THREE.Fog(0xb8d4ef, 180, 780);

  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 2000);
  camera.position.set(0, 8, 16);

  // Bright desert lighting
  scene.add(new THREE.HemisphereLight(0xffe6b0, 0x8b5a2b, 0.95));
  var sun = new THREE.DirectionalLight(0xfff0c8, 1.55);
  sun.position.set(80, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  scene.add(sun);
  scene.add(new THREE.DirectionalLight(0xa0c8ff, 0.35).translateX(-40).translateY(30).translateZ(-20));
  scene.add(new THREE.AmbientLight(0xffd9a0, 0.28));

  // ========== TRACK SPLINE ==========
  // Closed canyon loop: long straight, S-curves, hairpin, jump, arch
  var trackPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -80),
    new THREE.Vector3(10, 0, -160),
    new THREE.Vector3(40, 0, -230),
    new THREE.Vector3(90, 0, -260),
    new THREE.Vector3(140, 0, -240),
    new THREE.Vector3(170, 0, -180),
    new THREE.Vector3(175, 0, -110),
    new THREE.Vector3(150, 2, -50),
    new THREE.Vector3(110, 6, -10),
    new THREE.Vector3(70, 10, 20),
    new THREE.Vector3(30, 4, 50),
    new THREE.Vector3(-10, 0, 80),
    new THREE.Vector3(-50, 0, 100),
    new THREE.Vector3(-100, 0, 90),
    new THREE.Vector3(-140, 0, 50),
    new THREE.Vector3(-155, 0, 0),
    new THREE.Vector3(-145, 0, -50),
    new THREE.Vector3(-100, 0, -70),
    new THREE.Vector3(-50, 0, -40),
    new THREE.Vector3(-20, 0, -10)
  ];
  var curve = new THREE.CatmullRomCurve3(trackPts, true, "catmullrom", 0.35);
  var TRACK_LEN = curve.getLength();
  var NSEG = 220;
  var centerline = [];
  var tangents = [];
  var normals = [];
  var binormals = [];
  var widths = [];
  (function buildFrames() {
    var i, t, p, tan, up = new THREE.Vector3(0, 1, 0), n, b, w;
    for (i = 0; i <= NSEG; i++) {
      t = i / NSEG;
      p = curve.getPointAt(t);
      tan = curve.getTangentAt(t).normalize();
      b = new THREE.Vector3().crossVectors(tan, up).normalize();
      if (b.lengthSq() < 0.01) b.set(1, 0, 0);
      n = new THREE.Vector3().crossVectors(b, tan).normalize();
      // widen on straights-ish, keep recovery room
      w = HALF_W + 4 * Math.sin(t * Math.PI * 4) * Math.sin(t * Math.PI * 4);
      if (t > 0.42 && t < 0.55) w += 3; // jump zone wider
      if (t > 0.18 && t < 0.28) w -= 2; // hairpin tighter but still phone-ok
      centerline.push(p);
      tangents.push(tan);
      normals.push(n);
      binormals.push(b);
      widths.push(Math.max(14, w));
    }
  })();

  function nearestTrack(pos) {
    var best = 0, bestD = 1e12, i, d, p;
    // coarse then refine
    var step = 4;
    for (i = 0; i < NSEG; i += step) {
      d = pos.distanceToSquared(centerline[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    var lo = Math.max(0, best - step), hi = Math.min(NSEG, best + step);
    for (i = lo; i <= hi; i++) {
      d = pos.distanceToSquared(centerline[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function progressOf(pos) {
    return nearestTrack(pos) / NSEG;
  }

  // ========== CANYON MESH ==========
  function buildCanyon() {
    var i, j, p, b, n, w, hL, hR, v = [], idx = [], uvs = [], colors = [];
    var wallH = 28;
    function pushV(x, y, z, u, vv, r, g, bl) {
      v.push(x, y, z); uvs.push(u, vv); colors.push(r, g, bl);
    }
    for (i = 0; i < NSEG; i++) {
      p = centerline[i]; b = binormals[i]; n = normals[i]; w = widths[i];
      hL = wallH + 8 * Math.sin(i * 0.17) + 4 * Math.cos(i * 0.09);
      hR = wallH + 8 * Math.cos(i * 0.15) + 5 * Math.sin(i * 0.11);
      // floor left/right, wall tops
      var fl = p.clone().addScaledVector(b, -w);
      var fr = p.clone().addScaledVector(b, w);
      // slight floor dish
      fl.y = p.y - 0.2; fr.y = p.y - 0.2;
      var jumpBoost = (i / NSEG > 0.44 && i / NSEG < 0.52) ? 8 * Math.sin((i / NSEG - 0.44) / 0.08 * Math.PI) : 0;
      fl.y += jumpBoost; fr.y += jumpBoost; p = p.clone(); p.y += jumpBoost;
      centerline[i].y = p.y;
      var wl = fl.clone().addScaledVector(n, hL).addScaledVector(b, -6);
      var wr = fr.clone().addScaledVector(n, hR).addScaledVector(b, 6);
      // ochre / purple far
      var t = i / NSEG;
      var ochreR = 0.78, ochreG = 0.48, ochreB = 0.22;
      var purR = 0.45, purG = 0.32, purB = 0.55;
      pushV(fl.x, fl.y, fl.z, 0, t, ochreR, ochreG * 0.9, ochreB * 0.7);
      pushV(fr.x, fr.y, fr.z, 1, t, ochreR, ochreG, ochreB);
      pushV(wl.x, wl.y, wl.z, 0, t + 0.5, purR, purG, purB);
      pushV(wr.x, wr.y, wr.z, 1, t + 0.5, purR * 1.1, purG, purB * 0.9);
    }
    for (i = 0; i < NSEG; i++) {
      var a = i * 4;
      var c = ((i + 1) % NSEG) * 4;
      // floor
      idx.push(a, c, a + 1, a + 1, c, c + 1);
      // left wall
      idx.push(a, a + 2, c, c, a + 2, c + 2);
      // right wall
      idx.push(a + 1, c + 1, a + 3, a + 3, c + 1, c + 3);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    var mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0.05, flatShading: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);

    // sand floor ribbon (brighter)
    var floorShape = [];
    for (i = 0; i <= NSEG; i++) {
      var ii = i % NSEG;
      p = centerline[ii]; b = binormals[ii]; w = widths[ii] - 0.5;
      floorShape.push(p.clone().addScaledVector(b, -w * 0.98));
      floorShape.push(p.clone().addScaledVector(b, w * 0.98));
    }
    // arch / overhang tunnel near t~0.72
    var archT = 0.72;
    var ap = curve.getPointAt(archT);
    var atan = curve.getTangentAt(archT);
    var ab = new THREE.Vector3().crossVectors(atan, new THREE.Vector3(0, 1, 0)).normalize();
    var arch = new THREE.Mesh(
      new THREE.TorusGeometry(widths[Math.floor(archT * NSEG)] + 2, 3.5, 8, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xa86b3c, roughness: 0.9 })
    );
    arch.position.copy(ap).add(new THREE.Vector3(0, 10, 0));
    arch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), atan.clone().normalize());
    arch.rotateX(Math.PI / 2);
    scene.add(arch);

    // start gate
    var sp = centerline[0];
    var sb = binormals[0];
    var gateMat = new THREE.MeshStandardMaterial({ color: 0xffc65a, emissive: 0xaa6600, emissiveIntensity: 0.4 });
    var postL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 1.2), gateMat);
    var postR = postL.clone();
    postL.position.copy(sp).addScaledVector(sb, -widths[0] + 2).add(new THREE.Vector3(0, 7, 0));
    postR.position.copy(sp).addScaledVector(sb, widths[0] - 2).add(new THREE.Vector3(0, 7, 0));
    scene.add(postL, postR);
    var beam = new THREE.Mesh(new THREE.BoxGeometry(widths[0] * 2 - 2, 0.8, 0.8), gateMat);
    beam.position.copy(sp).add(new THREE.Vector3(0, 14, 0));
    scene.add(beam);

    // distant purple cliffs billboard boxes
    for (i = 0; i < 24; i++) {
      var ang = (i / 24) * Math.PI * 2;
      var rad = 420 + (i % 5) * 40;
      var cliff = new THREE.Mesh(
        new THREE.BoxGeometry(40 + (i % 3) * 20, 80 + (i % 4) * 30, 30),
        new THREE.MeshStandardMaterial({ color: 0x6a4a7a, roughness: 0.95 })
      );
      cliff.position.set(Math.cos(ang) * rad, 20, Math.sin(ang) * rad);
      scene.add(cliff);
    }

    // sky ground plane far
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshStandardMaterial({ color: 0xd4a45a, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    ground.receiveShadow = true;
    scene.add(ground);
  }
  buildCanyon();

  // checkpoints every ~1/8 lap
  var checkpoints = [];
  for (var ci = 0; ci < 8; ci++) checkpoints.push(ci / 8);

  // ========== POD ==========
  function makeEngineMesh(color) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 1.15, 5.5, 10),
      new THREE.MeshStandardMaterial({ color: color, metalness: 0.55, roughness: 0.35, emissive: color, emissiveIntensity: 0.15 })
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    g.add(body);
    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 10, 10),
