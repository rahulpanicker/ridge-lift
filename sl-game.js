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
