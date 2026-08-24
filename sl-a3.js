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
    pad.addEventListener("pointercancel", function (e) { e.preventDefault(); });

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
      if (el.closest("#dir-pad")) return true;
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
      if (!leftHeld && dirHold.pitch === 0 && dirHold.yaw === 0) endTilt();
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


  function bindDirPad() {
    var spec = {
      "dir-fwd": { axis: "pitch", val: 1 },
      "dir-back": { axis: "pitch", val: -1 },
      "dir-left": { axis: "yaw", val: 1 },
      "dir-right": { axis: "yaw", val: -1 }
    };
    function hold(axis, val) {
      dirHold[axis] = val;
      tiltPad.active = true;
    }
    function release(axis) {
      dirHold[axis] = 0;
      if (dirHold.pitch === 0 && dirHold.yaw === 0) endTilt();
    }
    Object.keys(spec).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var s = spec[id];
      function down(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        enableTouchUi();
        hold(s.axis, s.val);
      }
      function up(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        release(s.axis);
      }
      function ignoreCancel(e) {
        if (e && e.preventDefault) e.preventDefault();
      }
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointerleave", up);
      el.addEventListener("touchstart", down, { passive: false });
      el.addEventListener("touchend", up, { passive: false });
      el.addEventListener("pointercancel", ignoreCancel);
      el.addEventListener("touchcancel", ignoreCancel, { passive: false });
    });
  }

  bindPads();
  bindDirPad();
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
    deviceTilt.use = true;
    requestTilt();
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
