      new THREE.MeshStandardMaterial({ color: 0xffaa33, emissive: 0xff6600, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
    );
    glow.position.x = -2.6;
    g.add(glow);
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.9, 3.2, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.55, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    cone.rotation.z = Math.PI / 2;
    cone.position.x = -4.2;
    g.add(cone);
    g.userData.glow = glow;
    g.userData.cone = cone;
    return g;
  }

  function makeCockpitMesh(color) {
    var g = new THREE.Group();
    var hull = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.7, 1.8, 4, 10),
      new THREE.MeshStandardMaterial({ color: color, metalness: 0.4, roughness: 0.4, emissive: color, emissiveIntensity: 0.08 })
    );
    hull.rotation.z = Math.PI / 2;
    hull.castShadow = true;
    g.add(hull);
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      new THREE.MeshStandardMaterial({ color: 0x9fdfff, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.65 })
    );
    canopy.position.y = 0.45;
    g.add(canopy);
    return g;
  }

  function makeTether() {
    var mat = new THREE.MeshBasicMaterial({ color: 0x66eeff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    var mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), mat);
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

  Pod.prototype.resetAt = function (idx, lateral) {
    var p = centerline[idx].clone();
    var b = binormals[idx];
    var tan = tangents[idx];
    p.addScaledVector(b, lateral || 0);
    p.y += HOVER_H;
    this.pos.copy(p);
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(tan.x, tan.z);
    this.yawRate = 0;
    this.roll = 0;
    this.throttleL = this.throttleR = 0;
    this.spoolL = this.spoolR = 0;
    this.boost = BOOST_MAX;
    this.boosting = false;
    this.heat = 0;
    this.alive = true;
    this.finished = false;
    this.lap = 1;
    this.cp = 0;
    this.progress = idx / NSEG;
    this.raceProg = 0;
    this.engOffsetL.set(-TETHER_LEN, 0, 0);
    this.engOffsetR.set(TETHER_LEN, 0, 0);
    this.engVelL.set(0, 0, 0);
    this.engVelR.set(0, 0, 0);
    this.syncVisual();
  };

  Pod.prototype.forward = function () {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  };
  Pod.prototype.right = function () {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  };

  Pod.prototype.syncVisual = function () {
    var fwd = this.forward();
    var rgt = this.right();
    this.cockpit.position.copy(this.pos);
    this.cockpit.rotation.set(0, this.yaw, this.roll);
    var worldL = this.pos.clone().add(rgt.clone().multiplyScalar(this.engOffsetL.x)).add(new THREE.Vector3(0, this.engOffsetL.y, 0));
    var worldR = this.pos.clone().add(rgt.clone().multiplyScalar(this.engOffsetR.x)).add(new THREE.Vector3(0, this.engOffsetR.y, 0));
    // also allow slight fore-aft from engOffset z if any
    worldL.add(fwd.clone().multiplyScalar(this.engOffsetL.z || 0));
    worldR.add(fwd.clone().multiplyScalar(this.engOffsetR.z || 0));
    this.engL.position.copy(worldL);
    this.engR.position.copy(worldR);
    this.engL.rotation.set(0, this.yaw, this.roll * 0.5);
    this.engR.rotation.set(0, this.yaw, this.roll * 0.5);
    // tethers
    placeTether(this.tetherL, this.pos, worldL);
    placeTether(this.tetherR, this.pos, worldR);
    // afterburner
    var fl = 0.3 + this.spoolL * (this.boosting ? 1.4 : 1) * 1.2;
    var fr = 0.3 + this.spoolR * (this.boosting ? 1.4 : 1) * 1.2;
    this.engL.userData.cone.scale.set(1, 1, fl);
    this.engR.userData.cone.scale.set(1, 1, fr);
    this.engL.userData.cone.material.opacity = 0.25 + this.spoolL * 0.55;
    this.engR.userData.cone.material.opacity = 0.25 + this.spoolR * 0.55;
    this.engL.userData.glow.material.emissiveIntensity = 0.6 + this.spoolL * 1.4;
    this.engR.userData.glow.material.emissiveIntensity = 0.6 + this.spoolR * 1.4;
  };

  function placeTether(mesh, a, b) {
    var mid = a.clone().add(b).multiplyScalar(0.5);
    var dir = b.clone().sub(a);
    var len = dir.length();
    mesh.position.copy(mid);
    mesh.scale.set(1, len, 1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.material.opacity = 0.55 + Math.min(0.4, Math.abs(len - TETHER_LEN) * 0.15);
  }

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
      if (vLat * sign > 0) this.vel.addScaledVector(b, -vLat * 1.35);
      this.vel.multiplyScalar(0.72);
      this.yawRate += -sign * 1.5;
      this.sparkT = 0.35;
      this.heat = Math.min(1, this.heat + 0.08);
      if (pen > 4 || this.vel.length() < 4 && pen > 1.5) {
