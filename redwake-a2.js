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
        new THREE.MeshStandardMaterial({ color: 0x8a6a9a, roughness: 0.9, emissive: 0x110022, emissiveIntensity: 0.04 })
      );
      cliff.position.set(Math.cos(ang) * rad, 20, Math.sin(ang) * rad);
      scene.add(cliff);
    }

    // sky ground plane far
    var ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48),
      new THREE.MeshStandardMaterial({ color: 0xe8c878, roughness: 1, emissive: 0x221100, emissiveIntensity: 0.04 })
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
      new THREE.MeshStandardMaterial({ color: color, metalness: 0.45, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 })
    );
    body.rotation.z = Math.PI / 2;
    body.castShadow = true;
    g.add(body);
    // emissive rim so engine pops against rock
    var rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.25, 5.7, 10),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    var glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xffbb44, emissive: 0xff7700, emissiveIntensity: 1.8, transparent: true, opacity: 0.9 })
    );
    glow.position.x = -2.6;
    g.add(glow);
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.35, 4.6, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.75, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    cone.rotation.z = Math.PI / 2;
    cone.position.x = -4.8;
    g.add(cone);
    g.userData.glow = glow;
    g.userData.cone = cone;
    return g;
  }

  function makeCockpitMesh(color) {
    var g = new THREE.Group();
    var hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.7, 1.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: color, metalness: 0.35, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 })
    );
    hull.rotation.z = Math.PI / 2;
    hull.castShadow = true;
    g.add(hull);
    // soft emissive rim / outline against canyon rock
    var outline = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.92, 2.0, 4, 10),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    outline.rotation.z = Math.PI / 2;
    g.add(outline);
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xb8f0ff, metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.75,
        emissive: 0x44aaff, emissiveIntensity: 0.25
      })
    );
    canopy.position.y = 0.45;
    g.add(canopy);
    return g;
  }

  function makeTether() {
    var mat = new THREE.MeshBasicMaterial({ color: 0x88ffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 8), mat);
    return mesh;
  }

  function Pod(opts) {
    this.isPlayer = !!opts.isPlayer;
    this.name = opts.name || "Pod";
    this.color = opts.color || 0xff5533;
    this.soft = opts.soft || 1;
    this.group = new THREE.Group();
    this.cockpit = makeCockpitMesh(this.color);
    this.engL = makeEngineMesh(opts.engColor || 0xff8844);
    this.engR = makeEngineMesh(opts.engColor || 0xff8844);
    this.tetherL = makeTether();
    this.tetherR = makeTether();
    this.group.add(this.cockpit, this.engL, this.engR, this.tetherL, this.tetherR);
    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.yawRate = 0;
    this.roll = 0;
    this.throttleL = 0;
    this.throttleR = 0;
    this.spoolL = 0;
    this.spoolR = 0;
    this.boost = 0;
    this.boosting = false;
    this.heat = 0;
    this.alive = true;
    this.finished = false;
    this.lap = 1;
    this.cp = 0;
    this.progress = 0;
    this.raceProg = 0;
    this.finishTime = 0;
    this.sparkT = 0;
    this.engOffsetL = new THREE.Vector3(-TETHER_LEN, 0, 0);
    this.engOffsetR = new THREE.Vector3(TETHER_LEN, 0, 0);
    this.engVelL = new THREE.Vector3();
    this.engVelR = new THREE.Vector3();
  }

  Pod.prototype.resetAt = func