// ============ AVATARS FIXES : STAGE (FBX) + BACKSTAGE (GLB) ============
// Les deux avatars sont chargés au démarrage, cachés sous le sol,
// puis on les fait monter/descendre quand on en a besoin.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader }  from 'three/addons/loaders/FBXLoader.js';
import gsap from 'https://esm.sh/gsap@3';

// === CONFIG DE BASE : à adapter à ton projet ======================
const DEFAULT_CONFIG = {
  stage: {
    path: './models/me/waving.fbx',
    type: 'fbx',
    position: { x: -8, y: 0.8, z: -4.2 }, // position "par défaut" (vue scène)
    hiddenY: -5,
    rotationY: 0,
    scale: 0.06,

    // 🆕 Presets de position / rotation selon la vue
    // les noms de vues sont sans accent pour simplifier : 'accordeon', 'pupitre'
    viewPresets: {
  // vue "par défaut" = même chose que l’entrée
        default: {
          position: { x: 4, y: 0.2, z: -2.2 },
          rotationY: 0
        },

        // vue d'entrée
        entrance: {
          position: { x: 4, y: 0.2, z: -2.2 }, // même que default
          rotationY: 0
        },

        // vue accordéon : juste à droite et un peu derrière le pupitre
        accordion: {
          position: { x: 4.6, y: 0.2, z: -8.0 },
          rotationY: 0.3        // tourne un peu vers le public
        },

        // vue pupitre : un peu à gauche, plus loin derrière
        desk: {
          position: { x: 4.6, y: 0.2, z: -21.8 }, // tu peux raccourcir si c’est trop loin
          rotationY: 0.6
  }
}

  },

  backstage: {
    path: './models/me/idle.glb',
    type: 'gltf',
    position: { x: -11.23, y: 2.3, z: -15.64 },
    hiddenY: -5,
    rotationY: 2.1,
    scale: 0.0005
    // si tu veux aussi des positions par vue pour le backstage :
    // viewPresets: { ... } exactement sur le même modèle
  }
};

// === ÉTAT GLOBAL =======================================================
const state = {
  scene: null,
  avatars: {
    stage: {
      ...DEFAULT_CONFIG.stage,
      model: null,
      mixer: null,
      action: null,
      isLoaded: false,
      isVisible: false
    },
    backstage: {
      ...DEFAULT_CONFIG.backstage,
      model: null,
      mixer: null,
      action: null,
      isLoaded: false,
      isVisible: false
    }
  },
  loopStarted: false,
  clock: new THREE.Clock(),
  current: null,              // 'stage' | 'backstage' | null
  isTransitioning: false, 
  currentView: 'default'      // vue actuelle pour les presets | 'accordeon' | 'pupitre' | etc.
};

// === TOOLS : loaders selon type ========================================
function getLoader(type) {
  if (type === 'fbx') return new FBXLoader();
  return new GLTFLoader(); // 'gltf' ou par défaut
}

// Précharge un avatar (FBX ou GLB), le place sous le sol, et lance son animation
async function preloadAvatar(which) {
  const cfg = state.avatars[which];
  if (!cfg || cfg.isLoaded || !state.scene) return;

  const loader = getLoader(cfg.type);
  const obj = await new Promise((resolve, reject) => {
    loader.load(cfg.path, resolve, undefined, reject);
  });

  let model, animations;

  if (cfg.type === 'fbx') {
    model = obj;
    animations = obj.animations || [];
  } else {
    model = obj.scene;
    animations = obj.animations || [];
  }

  model.traverse((n) => {
    if (n.isMesh) {
      n.castShadow = true;
      n.receiveShadow = true;
    }
  });

  const s = cfg.scale ?? 1;
  model.scale.set(s, s, s);

  // position initiale : même X/Z mais sous le sol
    model.position.set(
    cfg.position.x,
    cfg.hiddenY ?? -5,
    cfg.position.z
  );
  model.rotation.set(0, cfg.rotationY || 0, 0);
  model.visible = false;

  // 🆕 métadonnées pour que le script principal puisse retrouver les avatars
  if (!model.userData) model.userData = {};
  model.userData.isAvatar = true;          // permettra de filtrer dans scene.traverse
  model.userData.kind = which;            // 'stage' ou 'backstage'
  model.userData.role = (which === 'stage') ? 'onStage' : 'backstage';

  state.scene.add(model);


  const mixer = new THREE.AnimationMixer(model);
  let action = null;
  if (animations.length > 0) {
    action = mixer.clipAction(animations[0]);
    action.loop = THREE.LoopRepeat;
    action.play();
    console.log(`▶️ Animation: ${animations[0].name}`);
  }

  cfg.model = model;
  cfg.mixer = mixer;
  cfg.action = action;
  cfg.isLoaded = true;
  cfg.isVisible = false;
  console.log(`✓ Avatar ${which} préchargé (${cfg.path})`);
}

// Boucle pour mettre à jour les mixers
function startLoop() {
  if (state.loopStarted) return;
  state.loopStarted = true;

  function loop() {
    const delta = state.clock.getDelta();
    if (state.avatars.stage.mixer)     state.avatars.stage.mixer.update(delta);
    if (state.avatars.backstage.mixer) state.avatars.backstage.mixer.update(delta);
    requestAnimationFrame(loop);
  }
  loop();
}

// === INIT PUBLIC =======================================================
/**
 * Initialise le système avatar
 * @param {THREE.Scene} scene
 * @param {object} configOptions  (optionnel : override des positions/paths)
 *   { stage: {...}, backstage: {...} }
 */
function initAvatarSystem(scene, configOptions = {}) {
  state.scene = scene;

  if (configOptions.stage) {
    Object.assign(state.avatars.stage, configOptions.stage);
  }
  if (configOptions.backstage) {
    Object.assign(state.avatars.backstage, configOptions.backstage);
  }

  // Précharge les deux avatars (stage + backstage)
  preloadAvatar('stage').catch(err => console.error('Erreur preload stage:', err));
  preloadAvatar('backstage').catch(err => console.error('Erreur preload backstage:', err));

  startLoop();

  console.log('✓ Avatar System initialized (stage + backstage préchargés)');
}

// === ANIMATIONS UP/DOWN ================================================
function hideAvatar(which, duration = 0.5) {
  const cfg = state.avatars[which];
  if (!cfg || !cfg.model || !cfg.isVisible) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.to(cfg.model.position, {
      y: cfg.hiddenY ?? -5,
      duration,
      ease: 'power2.in',
      onComplete: () => {
        cfg.isVisible = false;
        cfg.model.visible = false;
        if (state.current === which) state.current = null;
        resolve();
      }
    });
  });
}

async function showAvatar(which, options = {}) {
  const {
    duration = 1.2,
    easing = 'power2.out',
    rotationY = null,          // si tu veux imposer une rotation
    rotationDuration = null,   // sinon = duration
    force = false              // 🆕 si true -> on refait quand même la montée
  } = options;

  if (state.isTransitioning) {
    console.warn('⏳ Avatar transition en cours, ignore...');
    return;
  }
  state.isTransitioning = true;

  const cfg = state.avatars[which];
  if (!cfg) {
    console.warn(`Avatar inconnu: ${which}`);
    state.isTransitioning = false;
    return;
  }

  // 🛟 PETITE SÉCURITÉ : si déjà visible, on ne le refait pas remonter
  if (
    !force &&
    cfg.isLoaded &&
    cfg.model &&
    cfg.isVisible &&
    state.current === which
  ) {
    // On peut quand même ajuster la rotation si demandée
    if (rotationY !== null && rotationY !== undefined) {
      gsap.to(cfg.model.rotation, {
        y: rotationY,
        duration: rotationDuration ?? 0.4,
        ease: easing
      });
    }

    console.log(`↪ Avatar ${which} déjà visible, pas de montée.`);
    state.isTransitioning = false;
    return;
  }

  try {
    await preloadAvatar(which);

    // on cache l’autre avatar
    const other = which === 'stage' ? 'backstage' : 'stage';
    await hideAvatar(other, 0.6);

        // 🆕 On choisit la position/rotation en fonction de la vue courante
    const viewName = state.currentView || 'default';
    const preset = cfg.viewPresets && cfg.viewPresets[viewName];

    const basePos = cfg.position || { x: 0, y: 0, z: 0 };
    const finalPos = preset && preset.position
      ? {
          x: preset.position.x ?? basePos.x,
          y: preset.position.y ?? basePos.y,
          z: preset.position.z ?? basePos.z
        }
      : basePos;

    const model = cfg.model;
    const targetY = finalPos.y;
    const hiddenY = cfg.hiddenY ?? -5;

    // on part sous le sol, mais déjà au bon X/Z pour la vue
    model.position.set(finalPos.x, hiddenY, finalPos.z);
    model.visible = true;

    const presetRotY = preset && (preset.rotationY ?? preset.rotationY);
    const targetRotY =
      (rotationY !== null && rotationY !== undefined)
        ? rotationY
        : (presetRotY !== undefined && presetRotY !== null)
          ? presetRotY
          : (cfg.rotationY || 0);


    await new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve });
      tl.to(model.position, {
        y: targetY,
        duration,
        ease: easing
      }, 0);
      tl.to(model.rotation, {
        y: targetRotY,
        duration: rotationDuration ?? duration,
        ease: easing
      }, 0);
    });

    cfg.isVisible = true;
    state.current = which;
    console.log(`✓ Avatar ${which} visible à (${cfg.position.x}, ${targetY}, ${cfg.position.z})`);

  } catch (err) {
    console.error(`❌ Erreur showAvatar(${which}):`, err);
  } finally {
    state.isTransitioning = false;
  }
}


// Helpers publics
function showStageAvatar(options = {}) {
  return showAvatar('stage', options);
}
function showBackstageAvatar(options = {}) {
  return showAvatar('backstage', options);
}
function hideStageAvatar(duration) {
  return hideAvatar('stage', duration);
}
function hideBackstageAvatar(duration) {
  return hideAvatar('backstage', duration);
}

// === MOUVEMENT / ROTATION DE L’AVATAR COURANT ==========================

/**
 * Déplace l’avatar courant (ou un avatar précis)
 */
function moveAvatarTo(x, y, z, duration = 1, which = null) {
  const key = which || state.current;
  if (!key) return Promise.resolve();
  const cfg = state.avatars[key];
  if (!cfg || !cfg.model) return Promise.resolve();

  return new Promise((resolve) => {
    gsap.to(cfg.model.position, {
      x, y, z,
      duration,
      ease: 'power2.inOut',
      onComplete: resolve
    });
  });
}

/**
 * Rotate l’avatar courant
 * - si angle est un nombre → rotation Y
 * - si angle est un objet {x,y,z} → rotation complète
 */
function rotateAvatar(angle, options = {}) {
  const { duration = 1, easing = 'power2.inOut', which = null } = options;
  const key = which || state.current;
  if (!key) return Promise.resolve();
  const cfg = state.avatars[key];
  if (!cfg || !cfg.model) return Promise.resolve();

  const target = {};
  if (typeof angle === 'number') {
    target.y = angle;
  } else if (angle && typeof angle === 'object') {
    if (angle.x !== undefined) target.x = angle.x;
    if (angle.y !== undefined) target.y = angle.y;
    if (angle.z !== undefined) target.z = angle.z;
  } else {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    gsap.to(cfg.model.rotation, {
      ...target,
      duration,
      ease: easing,
      onComplete: resolve
    });
  });
}

/**
 * Change la "vue" courante (ex: 'accordeon', 'pupitre')
 * et repositionne l’avatar visible si un preset existe.
 */
function setAvatarView(viewName, options = {}) {
  state.currentView = viewName || 'default';

  const {
    duration = 0.8,
    easing = 'power2.inOut',
    which = null // 'stage' / 'backstage' / null -> avatar courant
  } = options;

  const key = which || state.current;
  if (!key) return Promise.resolve();

  const cfg = state.avatars[key];
  if (!cfg || !cfg.model || !cfg.isVisible) {
    // même si l’avatar n’est pas encore visible, on garde la vue pour plus tard
    return Promise.resolve();
  }

  const preset = cfg.viewPresets && cfg.viewPresets[viewName];
  if (!preset) {
    console.warn(`Pas de preset de vue "${viewName}" pour l’avatar ${key}`);
    return Promise.resolve();
  }

  const basePos = cfg.position || { x: 0, y: 0, z: 0 };
  const targetPos = preset.position
    ? {
        x: preset.position.x ?? basePos.x,
        y: preset.position.y ?? basePos.y,
        z: preset.position.z ?? basePos.z
      }
    : basePos;

  const targetRotY =
    (preset.rotationY !== undefined && preset.rotationY !== null)
      ? preset.rotationY
      : (cfg.rotationY || 0);

  return new Promise((resolve) => {
    const tl = gsap.timeline({ onComplete: resolve });
    tl.to(cfg.model.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration,
      ease: easing
    }, 0);
    tl.to(cfg.model.rotation, {
      y: targetRotY,
      duration,
      ease: easing
    }, 0);
  });
}



function getAvatarModels() {
  return {
    stage: state.avatars.stage.model || null,
    backstage: state.avatars.backstage.model || null,
    current: state.current            // 'stage' | 'backstage' | null
  };
}

// === EXPORTS PUBLICS ====================================================
export {
  initAvatarSystem,
  showStageAvatar,
  showBackstageAvatar,
  hideStageAvatar,
  hideBackstageAvatar,
  moveAvatarTo,
  rotateAvatar,
  getAvatarModels, 
  setAvatarView  
};
