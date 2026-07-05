/**
 * 3D tube-field background animation.
 *
 * Faithful port of the former public/scripts/animate3d.js, refactored so it:
 *   - binds to a canvas element we pass in (instead of appending its own to <body>)
 *   - can be started and fully torn down (returns a dispose fn)
 *
 * Depends on the globals set by the vendored libs in public/scripts/animate/
 * (THREE r100, SimplexNoise 2.4.0, chroma 2.0.3). The <ThreeBackground>
 * component loads those scripts on demand before calling this, so they are
 * guaranteed present here. All THREE references happen at call time (inside
 * createBackground), never at module-eval, so importing this module before the
 * libs are loaded is safe.
 */

export default function createBackground(canvas, conf) {
  const THREE = window.THREE;
  const chroma = window.chroma;
  const SimplexNoise = window.SimplexNoise;
  const simplex = new SimplexNoise();

  conf = {
    fov: 75,
    cameraZ: 180,
    background: 0x000000,
    tubeRadius: 3,
    resY: 10,
    resX: 4,
    noiseCoef: 45,
    timeCoef: 25,
    mouseCoef: 20,
    heightCoef: 20,
    ambientColor: 0xcccccc,
    lightIntensity: 1,
    light1Color: 0x24f59e,
    light2Color: 0xe15040,
    light3Color: 0x1b859e,
    light4Color: 0x4cb04b,
    ...conf,
  };

  let renderer, scene, camera;
  let width, height, wWidth, wHeight;
  const TMath = THREE.Math;

  let light1, light2, light3, light4;
  let objects;
  const noiseConf = {};
  let cscale; updateCScale(chroma('#d11f6c'));

  const smoothedMouse = new THREE.Vector2();

  let rafId = null;
  let colorInterval = null;

  /**
   * Custom curve
   */
  function CustomCurve(x, y, l, noise) {
    THREE.Curve.call(this);
    this.x = x; this.y = y; this.l = l;
    this.noise = noise;
    this.yn = this.y * this.noise.coef;
  }
  CustomCurve.prototype = Object.create(THREE.Curve.prototype);
  CustomCurve.prototype.constructor = CustomCurve;
  CustomCurve.prototype.getPoint = function (t) {
    let x = this.x + t * this.l;
    let xn = x * this.noise.coef;
    let noise1 = simplex.noise2D(xn + this.noise.time + this.noise.mouseX / 2, this.yn - this.noise.time + this.noise.mouseY / 2);
    let noise2 = simplex.noise2D(this.yn + this.noise.time, xn - this.noise.time);
    let z = noise2 * this.noise.height;
    let y = this.y + noise1 * this.noise.height;
    return new THREE.Vector3(x, y, z);
  };

  /**
   * Tube class
   */
  class Tube {
    constructor(x, y, l, segments, radius, color, noise) {
      this.segments = segments;
      this.radialSegments = 8;
      this.radius = radius;

      this.curve = new CustomCurve(x, y, l, noise);
      this.geometry = new THREE.TubeBufferGeometry(this.curve, segments, radius, this.radialSegments, false);
      this.material = new THREE.MeshStandardMaterial({ color, metalness: 1 });
      this.mesh = new THREE.Mesh(this.geometry, this.material);
    }
    update() {
      this.frames = this.curve.computeFrenetFrames(this.segments, false);
      this.geometry.tangents = this.frames.tangents;
      this.geometry.normals = this.frames.normals;
      this.geometry.binormals = this.frames.binormals;

      this.pArray = this.geometry.attributes.position.array;
      this.nArray = this.geometry.attributes.normal.array;
      this.P = new THREE.Vector3();
      this.normal = new THREE.Vector3();
      for (let i = 0; i < this.segments; i++) {
        this.updateSegment(i);
      }
      this.updateSegment(this.segments);

      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.normal.needsUpdate = true;
    }
    updateSegment(i) {
      this.P = this.curve.getPointAt(i / this.segments, this.P);
      const N = this.frames.normals[i];
      const B = this.frames.binormals[i];
      for (let j = 0; j <= this.radialSegments; j++) {
        let v = j / this.radialSegments * Math.PI * 2;
        let sin = Math.sin(v);
        let cos = -Math.cos(v);
        this.normal.x = (cos * N.x + sin * B.x);
        this.normal.y = (cos * N.y + sin * B.y);
        this.normal.z = (cos * N.z + sin * B.z);
        this.normal.normalize();
        let index = (i * (this.radialSegments + 1) + j) * 3;
        this.nArray[index] = this.normal.x;
        this.nArray[index + 1] = this.normal.y;
        this.nArray[index + 2] = this.normal.z;
        this.pArray[index] = this.P.x + this.radius * this.normal.x;
        this.pArray[index + 1] = this.P.y + this.radius * this.normal.y;
        this.pArray[index + 2] = this.P.z + this.radius * this.normal.z;
      }
    }
  }

  const onResize = () => updateSize();
  const onMouseMove = (e) => {
    const targetX = (e.clientX / width) * 2 - 1;
    const targetY = -(e.clientY / height) * 2 + 1;
    smoothedMouse.x += (targetX - smoothedMouse.x) * 0.05;
    smoothedMouse.y += (targetY - smoothedMouse.y) * 0.05;
  };

  init();

  function init() {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    camera = new THREE.PerspectiveCamera(conf.fov);
    camera.position.z = conf.cameraZ;

    updateSize();
    window.addEventListener('resize', onResize, false);

    if (!('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      document.addEventListener('mousemove', onMouseMove);
    }

    initScene();
    colorInterval = setInterval(updateColors, 3000);
    animate();
  }

  function initScene() {
    scene = new THREE.Scene();
    if (conf.background) scene.background = new THREE.Color(conf.background);
    initLights();
    initObjects();

    camera.position.z = 130;
  }

  function initLights() {
    scene.add(new THREE.AmbientLight(conf.ambientColor));

    const z = 50;
    const lightDistance = 500;
    light1 = new THREE.PointLight(conf.light1Color, conf.lightIntensity, lightDistance);
    light1.position.set(0, wHeight / 2, z);
    scene.add(light1);
    light2 = new THREE.PointLight(conf.light2Color, conf.lightIntensity, lightDistance);
    light2.position.set(0, -wHeight / 2, z);
    scene.add(light2);
    light3 = new THREE.PointLight(conf.light3Color, conf.lightIntensity, lightDistance);
    light3.position.set(wWidth / 2, 0, z);
    scene.add(light3);
    light4 = new THREE.PointLight(conf.light4Color, conf.lightIntensity, lightDistance);
    light4.position.set(-wWidth / 2, 0, z);
    scene.add(light4);
  }

  function initObjects() {
    updateNoise();
    const nx = Math.round(wWidth / conf.resX) + 1;
    const ny = Math.round(wHeight / conf.resY) + 1;
    objects = [];
    let tube, color;
    for (let j = 0; j < ny; j++) {
      color = cscale(TMath.randFloat(0, 1)).hex();
      tube = new Tube(-wWidth / 2, -wHeight / 2 + j * conf.resY, wWidth, nx, conf.tubeRadius, color, noiseConf);
      objects.push(tube);
      scene.add(tube.mesh);
    }
  }

  function updateNoise() {
    noiseConf.coef = conf.noiseCoef * 0.00012;
    noiseConf.height = conf.heightCoef;
    noiseConf.time = Date.now() * conf.timeCoef * 0.000002;
    noiseConf.mouseX = smoothedMouse.x / 2;
    noiseConf.mouseY = smoothedMouse.y / 2;
    noiseConf.mouse = smoothedMouse.x + smoothedMouse.y;
  }

  function updateColors() {
    const color = chroma.random();
    updateCScale(color);

    for (let i = 0; i < objects.length; i++) {
      const targetColor = new THREE.Color(cscale(TMath.randFloat(0, 1)).hex());
      objects[i].targetColor = targetColor;
    }

    light1.targetColor = new THREE.Color(chroma.random().hex());
    light2.targetColor = new THREE.Color(chroma.random().hex());
    light3.targetColor = new THREE.Color(chroma.random().hex());
    light4.targetColor = new THREE.Color(chroma.random().hex());
  }

  function updateCScale(color) {
    const colors = [
      color.set('hsl.s', TMath.randFloat(0, 1)).set('hsl.l', TMath.randFloat(0, 0.3)).hex(),
      color.set('hsl.s', TMath.randFloat(0, 1)).set('hsl.l', 0.3 + TMath.randFloat(0, 0.4)).hex(),
      color.set('hsl.s', TMath.randFloat(0, 1)).set('hsl.l', 0.7 + TMath.randFloat(0, 0.3)).hex(),
      0xffffff,
    ];
    cscale = chroma.scale(colors);
  }

  function animate() {
    rafId = requestAnimationFrame(animate);

    animateObjects();
    animateLights();

    for (let i = 0; i < objects.length; i++) {
      if (objects[i].targetColor) {
        objects[i].material.color.lerp(objects[i].targetColor, 0.05);
      }
    }

    [light1, light2, light3, light4].forEach(light => {
      if (light.targetColor) {
        light.color.lerp(light.targetColor, 0.05);
      }
    });

    renderer.render(scene, camera);
  }

  function animateObjects() {
    updateNoise();
    for (let i = 0; i < objects.length; i++) {
      objects[i].update();
    }
  }

  function animateLights() {
    const time = Date.now() * 0.001;
    const dx = wWidth / 2;
    const dy = wHeight / 2;
    light1.position.x = Math.sin(time * 0.1) * dx;
    light1.position.y = Math.cos(time * 0.2) * dy;
    light2.position.x = Math.cos(time * 0.3) * dx;
    light2.position.y = Math.sin(time * 0.4) * dy;
    light3.position.x = Math.sin(time * 0.5) * dx;
    light3.position.y = Math.sin(time * 0.6) * dy;
    light4.position.x = Math.sin(time * 0.7) * dx;
    light4.position.y = Math.cos(time * 0.8) * dy;
  }

  function updateSize() {
    width = window.innerWidth;
    height = window.innerHeight;

    if (renderer && camera) {
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();

      const wsize = getRendererSize();
      wWidth = wsize[0];
      wHeight = wsize[1];
    }
  }

  function getRendererSize() {
    const cam = new THREE.PerspectiveCamera(camera.fov, camera.aspect);
    const vFOV = (cam.fov * Math.PI) / 180;
    const h = 2 * Math.tan(vFOV / 2) * Math.abs(conf.cameraZ);
    const w = h * cam.aspect;
    return [w, h];
  }

  // Full teardown: stop loops, drop listeners, free GPU resources.
  return function dispose() {
    if (rafId != null) cancelAnimationFrame(rafId);
    if (colorInterval != null) clearInterval(colorInterval);
    window.removeEventListener('resize', onResize, false);
    document.removeEventListener('mousemove', onMouseMove);
    if (objects) {
      for (const o of objects) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    }
    if (renderer) renderer.dispose();
    objects = null;
    renderer = null;
    scene = null;
  };
}
