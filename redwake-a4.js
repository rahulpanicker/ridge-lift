      pos[i * 3 + 1] = Math.random() * 12 + 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: 0xf0d8a8, size: 2.2, transparent: true, opacity: 0.32, depthAttenuation: true });
    var pts = new THREE.Points(geo, mat);
    scene.add(pts);
    dust.push(pts);
  })();

  function placeGrid() {
    player.resetAt(2, 0);
    ai1.resetAt(0, -5);
    ai2.resetAt(0, 5);
  }
  placeGrid();

  function startRace() {
    startOv.classList.add("hidden");
    endOv.classList.add("hidden");
    placeGrid();
    state = "countdown";
    countdown = 3.2;
    raceTime = 0;
    elMsg.textContent = "3";
    setRailVisual("L", 0); setRailVisual("R", 0);
    unlockAudio();
  }
  function retryRace() { startRace(); }
  window.startRace = startRace;
  window.retryRace = retryRace;
  var btnStart = document.getElementById("btnStart");
  var btnRetry = document.getElementById("btnRetry");
  var btnRestart = document.getElementById("btnRestart");
  if (btnStart) btnStart.addEventListener("click", startRace);
  if (btnRetry) btnRetry.addEventListener("click", retryRace);
  if (btnRestart) btnRestart.addEventListener("click", startRace);

  function finishRace(dnf) {
    state = "done";
    endOv.classList.remove("hidden");
    if (dnf || !player.alive) {
      endKick.textContent = "DNF";
      endTitle.textContent = "WRECKED";
      endResult.textContent = "Hard wall hit. Differential discipline next time.";
    } else {
      var place = getPlace(player);
      endKick.textContent = "FINISH";
      endTitle.textContent = place === 1 ? "1ST" : place === 2 ? "2ND" : "3RD";
      endResult.textContent = "Time " + raceTime.toFixed(2) + "s · Lap best stored locally.";
      try {
        var best = parseFloat(localStorage.getItem("redwakeBest") || "9999");
        if (raceTime < best) localStorage.setItem("redwakeBest", String(raceTime.toFixed(2)));
      } catch (err) {}
    }
    elMsg.textContent = "";
  }

  function getPlace(pod) {
    var better = 0;
    for (var i = 0; i < pods.length; i++) {
      if (pods[i] === pod) continue;
      if (pods[i].finished && !pod.finished) { better++; continue; }
      if (pods[i].raceProg > pod.raceProg) better++;
    }
    return better + 1;
  }

  // AI: follow centerline with mild differential
  function updateAI(pod, dt) {
    if (!pod.alive || pod.finished || state !== "racing") return;
    var ti = nearestTrack(pod.pos);
    var look = centerline[Math.min(NSEG, ti + 8)];
    var to = look.clone().sub(pod.pos);
    to.y = 0;
    var desiredYaw = Math.atan2(to.x, to.z);
    var err = desiredYaw - pod.yaw;
    while (err > Math.PI) err -= Math.PI * 2;
    while (err < -Math.PI) err += Math.PI * 2;
    // more LEFT thrust turns RIGHT — to turn right (err>0), add left throttle
    var base = 0.72;
    var steer = THREE.MathUtils.clamp(err * 1.4, -0.55, 0.55);
    pod.throttleL = THREE.MathUtils.clamp(base + steer, 0.15, 1);
    pod.throttleR = THREE.MathUtils.clamp(base - steer, 0.15, 1);
    // hairpin slow
    var curv = 0;
    if (ti > 0 && ti < NSEG) {
      curv = 1 - Math.abs(tangents[ti].dot(tangents[Math.min(NSEG, ti + 3)]));
    }
    if (curv > 0.08) {
      pod.throttleL *= 0.7; pod.throttleR *= 0.7;
    }
    pod.boosting = pod.boost > 1.2 && curv < 0.04 && pod.vel.length() > 30;
  }

  // sparks
  var sparkGroup = new THREE.Group();
  scene.add(sparkGroup);
  var sparkPool = [];
  for (var si = 0; si < 40; si++) {
    var sp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 })
    );
    sp.visible = false;
    sparkGroup.add(sp);
    sparkPool.push({ m: sp, v: new THREE.Vector3(), life: 0 });
  }
  function emitSparks(pos, n) {
    for (var i = 0; i < sparkPool.length && n > 0; i++) {
      var s = sparkPool[i];
      if (s.life > 0) continue;
      s.life = 0.3 + Math.random() * 0.3;
      s.m.visible = true;
      s.m.position.copy(pos);
      s.v.set((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12);
      n--;
    }
  }

  // ========== LOOP ==========
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    applyKeyboardThrottles();

    if (state === "countdown") {
      countdown -= dt;
      if (countdown > 2) elMsg.textContent = "3";
      else if (countdown > 1) elMsg.textContent = "2";
      else if (countdown > 0) elMsg.textContent = "1";
      else { elMsg.textContent = "GO"; state = "racing"; }
      // freeze pods visually
      for (var i = 0; i < pods.length; i++) pods[i].syncVisual();
    } else if (state === "racing") {
      raceTime += dt;
      if (raceTime > 0.6) elMsg.textContent = "";
      player.throttleL = input.L;
      player.throttleR = input.R;
      player.boosting = input.boost && player.boost > 0;
      updateAI(ai1, dt);
      updateAI(ai2, dt);
      for (var j = 0; j < pods.length; j++) {
        pods[j].step(dt);
        if (pods[j].sparkT > 0) {
          pods[j].sparkT -= dt;
          emitSparks(pods[j].pos, 2);
        }
      }
      if (!player.alive) finishRace(true);
      else if (player.finished) finishRace(false);
      // if all AI finished and player not — still wait player
    } else if (state === "done") {
      for (var k = 0; k < pods.length; k++) {
        pods[k].throttleL *= 0.95; pods[k].throttleR *= 0.95;
        pods[k].step(dt);
      }
    }

    // sparks integrate
    for (var s = 0; s < sparkPool.length; s++) {
      var spk = sparkPool[s];
      if (spk.life <= 0) { spk.m.visible = false; continue; }
      spk.life -= dt;
      spk.v.y -= 20 * dt;
      spk.m.position.addScaledVector(spk.v, dt);
    }

    // camera chase
    var fwd = player.forward();
    var spd = player.vel.length();
    var back = 12 + Math.min(10, spd * 0.08);
    var up = 5 + Math.min(4, spd * 0.02);
    var desired = player.pos.clone().addScaledVector(fwd, -back).add(new THREE.Vector3(0, up, 0));
    camPos.lerp(desired, 1 - Math.exp(-4 * dt));
    camLook.lerp(player.pos.clone().addScaledVector(fwd, 14).add(new THREE.Vector3(0, 1.2, 0)), 1 - Math.exp(-5 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.fov = THREE.MathUtils.lerp(camera.fov, 58 + Math.min(22, spd * 0.12), 1 - Math.exp(-3 * dt));
    camera.updateProjectionMatrix();
    sun.target.position.copy(player.pos);
    sun.target.updateMatrixWorld();

    // HUD
    elSpd.textContent = String(Math.round(spd * 3.6)); // show as "feel" km/h-ish
    elLap.textContent = Math.min(LAPS, player.lap) + "/" + LAPS;
    elPlc.textContent = state === "title" ? "—" : String(getPlace(player));
    var heat = player.heat;
    elHeat.style.width = (heat * 100).toFixed(0) + "%";
    if (heat > 0.75) elHeatBar.classList.remove("ok"); else elHeatBar.classList.add("ok");
    setRailVisual("L", input.L);
    setRailVisual("R", input.R);
    updateAudio((player.spoolL + player.spoolR) * 0.5 * (player.boosting ? 1.3 : 1));

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener("resize", function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  });

  // prevent scroll / gesture theft
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.body.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
})();
