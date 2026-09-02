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
  renderer.toneMappingExposure = 1.8;
  renderer.setClearColor(0x8ad8ff, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ad8ff);
  scene.fog = new THREE.Fog(0xcfe8ff, 320, 1400);

  var camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.4, 2000);
  camera.position.set(0, 8, 16);

  // Bright desert lighting (phone-readable)
  scene.add(new THREE.HemisphereLight(0xfff0d0, 0xb07040, 1.35));
  var sun = new THREE.DirectionalLight(0xfff4d8, 1.75);
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
  scene.add(new THREE.DirectionalLight(0xb0d8ff, 0.55).translateX(-40).translateY(30).translateZ(-20));
  scene.add(new THREE.AmbientLight(0xffe2b0, 0.55));

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
      // light sand floor vs warm ochre sandstone walls
      var t = i / NSEG;
      var sandR = 0.96, sandG = 0.88, sandB = 0.69; // 0xf5e0b0
      var wallR = 0.77, wallG = 0.54, wallB = 0.29; // 0xc48a4a
      pushV(fl.x, fl.y, fl.z, 0, t, sandR * 0.98, sandG * 0.96, sandB * 0.92);
      pushV(fr.x, fr.y, fr.z, 1, t, sandR, sandG, sandB);
      pushV(wl.x, wl.y, wl.z, 0, t + 0.5, wallR, wallG, wallB);
      pushV(wr.x, wr.y, wr.z, 1, t + 0.5, wallR * 1.08, wallG * 1.05, wallB * 0.95);
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
      vertexColors: true, roughness: 0.85, metalness: 0.04, flatShading: false,
      emissive: 0x221100, emissiveIntensity: 0.05
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);

    // bright sand floor stripe (contrasts vs ochre walls)
    var fv = [], fidx = [], fuv = [];
    for (i = 0; i < NSEG; i++) {
      p = centerline[i]; b = binormals[i]; w = Math.max(4, widths[i] * 0.55);
      var fl2 = p.clone().addScaledVector(b, -w); fl2.y = p.y + 0.08;
      var fr2 = p.clone().addScaledVector(b, w); fr2.y = p.y + 0.08;
      fv.push(fl2.x, fl2.y, fl2.z, fr2.x, fr2.y, fr2.z);
      fuv.push(0, i / NSEG, 1, i / NSEG);
    }
    for (i = 0; i < NSEG; i++) {
      var a0 = i * 2;
      var b0 = ((i + 1) % NSEG) * 2;
      fidx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
    var floorGeo = new THREE.BufferGeometry();
    floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(fv, 3));
    floorGeo.setAttribute("uv", new THREE.Float32BufferAttribute(fuv, 2));
    floorGeo.setIndex(fidx);
    floorGeo.computeVertexNormals();
    var floorMesh = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({
        color: 0xf5e0b0, roughness: 0.9, metalness: 0.02,
        emissive: 0x332200, emissiveIntensity: 0.08
      })
    );
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // dashed racing line / chevron markers along centerline
    var dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6d0 });
    var chevMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    for (i = 0; i < NSEG; i += 3) {
      p = centerline[i];
      var tan = tangents[i];
      var dash = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 2.4), dashMat);
      dash.position.copy(p).add(new THREE.Vector3(0, 0.18, 0));
      dash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.clone().normalize());
      scene.add(dash);
      if (i % 6 === 0) {
        var chev = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 3), chevMat);
        chev.position.copy(p).add(new THREE.Vector3(0, 0.22, 0));
        chev.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.clone().normalize());
        chev.rotateX(Math.PI / 2);
        scene.add(chev);
      }
    }

    // arch / overhang tunnel near t~0.72
    var archT = 0.72;
    var ap = curve.getPointAt(archT);
    var atan = curve.getTangentAt(archT);
    var ab = new THREE.Vector3().crossVectors(atan, new THREE.Vector3(0, 1, 0)).normalize();
    var arch = new THREE.Mesh(
      new THREE.TorusGeometry(widths[Math.floor(archT * NSEG)] + 2, 3.5, 8, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xc48a4a, roughness: 0.85, emissive: 0x221100, emissiveIntensity: 0.06 })
    );
    arch.position.copy(ap).add(new THREE.Vector3(0, 10, 0));
    arch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), atan.clone().normalize());
    arch.rotateX(Math.PI / 2);
    scene.add(arch);

    // start gate
    var sp = centerline[0];
    var sb = binormals[0];
    var gateMat = new THREE.MeshStandardMaterial({ color: 0xffd878, emissive: 0xff8800, emissiveIntensity: 0.85 });
