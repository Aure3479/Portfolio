import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import gsap  from 'https://esm.sh/gsap@3'
import {
  initAvatarSystem,
  showStageAvatar,
  showBackstageAvatar,
  hideStageAvatar,
  hideBackstageAvatar,
  moveAvatarTo,
  rotateAvatar,
  getAvatarModels,
  setAvatarView
} from './avatar-simple.js';

import { initializeAudioSystem, updateAudioFromFilters } from './audio-integration-v3_3.js';
import { initBackstageSystem } from './backstage-system-fix.js';

// === INITIALISATION SCÈNE DE BASE ==========================

const canvas = document.getElementById('cvs');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(0, 5, 15);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const PUPITRE_Z = -2.2;
// --- Fun facts pour le hover avatar -----------------------------
const FUN_FACTS = [
  { emoji: '💻', text: 'Intègre des capteurs Arduino dans Unity pour des projets IoT gaming' },
  { emoji: '🎲', text: 'Amateur de campagnes JDR — le game design narratif inspire mes interfaces' },
  { emoji: '🔬', text: 'Chercheur à l\'IFT De Vinci Lab en bio-optique et systèmes embarqués' },
  { emoji: '🎮', text: 'Débugge en speedrunning des jeux — l\'optimisation est partout' },
  { emoji: '🎵', text: 'Choriste — la coordination d\'équipe s\'apprend aussi en musique' },
  // bonus que j'ajoute
  { emoji: '🪗', text: 'A décroché un CEM d’accordéon et adore mixer code et musique' },
  { emoji: '🤖', text: 'Prototype une IA qui lit la posture et le mouvement en temps réel' },
  { emoji: '🐝', text: 'Imagine des systèmes IA pour les ruches autant que pour les labos' }
];

function getRandomFunFact() {
  return FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
}

// --- Références / état avatar & glow ----------------------------
let stageAvatarRoot = null;


let backstageAvatarRoot = null;

let stageAvatarDefaultPos = null;

let avatarGlowLight = null;
let avatarGlowEmissiveMats = [];
let avatarGlowEnabled = false;

function refreshAvatarRefs() {
  // 1) On demande directement au système d’avatar
  if (typeof getAvatarModels === 'function') {
    const models = getAvatarModels() || {};

    if (models.stage && models.stage !== stageAvatarRoot) {
      stageAvatarRoot = models.stage;
      stageAvatarRoot.name = 'avatarStage';
      if (!stageAvatarDefaultPos) {
        stageAvatarDefaultPos = stageAvatarRoot.position.clone();
      }
      ensureAvatarHitbox(stageAvatarRoot);
      console.log('✅ Avatar stage récupéré via getAvatarModels()', stageAvatarRoot);
    }

    if (models.backstage && models.backstage !== backstageAvatarRoot) {
      backstageAvatarRoot = models.backstage;
      backstageAvatarRoot.name = 'avatarBackstage';
      ensureAvatarHitbox(backstageAvatarRoot);
      console.log('✅ Avatar backstage récupéré via getAvatarModels()', backstageAvatarRoot);
    }
  }

  // Si on a déjà au moins un avatar, on peut s'arrêter là
  if (stageAvatarRoot || backstageAvatarRoot) return;

  // 2) Fallback : scan de la scène via userData (ancienne méthode)
  scene.traverse(obj => {
    if (!obj.userData) return;
    if (!obj.userData.isAvatar) return;

    console.log('🔍 refreshAvatarRefs found avatar via traverse: ', obj.userData);

    if (obj.userData.kind === 'stage' && !stageAvatarRoot) {
      stageAvatarRoot = obj;
      if (!stageAvatarDefaultPos) {
        stageAvatarDefaultPos = stageAvatarRoot.position.clone();
      }
      ensureAvatarHitbox(stageAvatarRoot);
    }
    if (obj.userData.kind === 'backstage' && !backstageAvatarRoot) {
      backstageAvatarRoot = obj;
      ensureAvatarHitbox(backstageAvatarRoot);
    }
  });
}


function ensureAvatarGlowSetup() {
  refreshAvatarRefs();
  if (!stageAvatarRoot || avatarGlowLight) return;

  avatarGlowLight = new THREE.PointLight(0x66ccff, 0, 5, 2);
  avatarGlowLight.position.set(0, 1.6, 0);
  stageAvatarRoot.add(avatarGlowLight);

  const mats = [];
  stageAvatarRoot.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const arr = Array.isArray(o.material) ? o.material : [o.material];
    arr.forEach(m => {
      if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhysicalMaterial)) return;
      if (!m.emissive) m.emissive = new THREE.Color(0x000000);
      if (m.emissiveIntensity == null) m.emissiveIntensity = 0;

      mats.push({
        mat: m,
        baseEmissive: m.emissive.clone(),
        baseIntensity: m.emissiveIntensity
      });
    });
  });
  avatarGlowEmissiveMats = mats;
}

function setAvatarGlow(enabled) {
  avatarGlowEnabled = enabled;
  ensureAvatarGlowSetup();
  if (!avatarGlowLight) return;

  const lightTarget = enabled ? 3.2 : 0;
  gsap.to(avatarGlowLight, {
    intensity: lightTarget,
    duration: 0.5,
    ease: 'sine.inOut'
  });

  avatarGlowEmissiveMats.forEach(({ mat, baseEmissive, baseIntensity }) => {
    const targetColor = enabled ? new THREE.Color(0x66ccff) : baseEmissive;
    const targetIntensity = enabled ? 0.9 : baseIntensity;

    gsap.to(mat.emissive, {
      r: targetColor.r, g: targetColor.g, b: targetColor.b,
      duration: 0.5,
      ease: 'sine.inOut'
    });
    gsap.to(mat, {
      emissiveIntensity: targetIntensity,
      duration: 0.5,
      ease: 'sine.inOut'
    });
  });
}

function ensureAvatarHitbox(root) {
  if (!root) return;
  if (root.getObjectByName('avatar-hitbox')) return; // déjà créé

  // Assure des matrices monde à jour
  root.updateWorldMatrix(true, true);

  // Bounding box en monde
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  // Si modèle vide ou tout petit, on évite les hitbox dégénérées
  if (!isFinite(size.x) || size.length() === 0) return;

  // On agrandit un peu la box pour être indulgent sur le clic
  size.multiplyScalar(1.2);

  const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false
  });

  const hit = new THREE.Mesh(geom, mat);
  hit.name = 'avatar-hitbox';
  hit.userData.isAvatarHitbox = true;

  // La box est en coordonnées monde → on convertit le centre en local
  root.worldToLocal(center);
  hit.position.copy(center);

  root.add(hit);
}



/* 
// --- position presets de l’avatar selon la vue ------------------
function getStageAvatarPosForView(viewName) {
  if (!stageAvatarDefaultPos) return null;

  // On garde la hauteur de référence (le perso reste posé correctement au sol)
  const baseY = stageAvatarDefaultPos.y;

  // --- Vue ACCORDÉON : juste derrière le pupitre ---
  if (viewName === 'accordion') {
    // légèrement à droite du pupitre (x = 0.6) et derrière lui (z plus négatif)
    return new THREE.Vector3(
      0.6,            // décalé un peu à droite
      baseY,          // même hauteur que d’habitude
      PUPITRE_Z - 0.8 // ~0.8m derrière le pupitre
    );
  }

  // --- Vue PUPITRE (desk) : encore plus loin derrière ---
  if (viewName === 'desk') {
    return new THREE.Vector3(
      -0.6,           // un peu à gauche
      baseY,
      PUPITRE_Z - 10.6 // encore plus loin derrière le pupitre
    );
  }

  // Pour les autres vues (entrance, etc.) → position d’origine sur la scène
  return stageAvatarDefaultPos.clone();
}

function moveStageAvatarForView(viewName) {
  refreshAvatarRefs();
  if (!stageAvatarRoot || !stageAvatarDefaultPos) return;

  const target = getStageAvatarPosForView(viewName);
  if (!target) return;

  gsap.to(stageAvatarRoot.position, {
    x: target.x,
    y: target.y,
    z: target.z,
    duration: 1.2,
    ease: 'power2.inOut'
  });
}
 */

// ===== LIMITES ORBIT CONTROL =====
// Altitude minimale (ne pas descendre sous la scène)
controls.minPolarAngle = Math.PI * 0.2;  // ≈ 36° (ne pas regarder trop bas)
controls.maxPolarAngle = Math.PI * 0.48; // ≈ 86° (ne pas regarder trop haut)

// Distance zoom (min/max)
//controls.minDistance = 2;   // Ne pas zoomer trop près
//controls.maxDistance = 50;  // Ne pas dézoomer trop loin

console.log('✓ OrbitControls limites appliquées');

// Clock pour animations / mixers / backstageSystem.update(delta)
const clock = new THREE.Clock();

// État pour tracker le mode
// --- Lumière de base
const hemiLight = new THREE.HemisphereLight(0x222233, 0x000000, 0.12);
// ciel légèrement bleuté, sol quasi noir
scene.add(hemiLight);
// --- Spot principal
renderer.toneMappingExposure = 0.9;

const spotLight = new THREE.SpotLight(0xffffff, 14);
spotLight.position.set(-8.4, 4.9, 10);
spotLight.angle = 0.52;
spotLight.penumbra = 1;
spotLight.decay = 0.15;
spotLight.distance = 43; // 0 pour infini
spotLight.castShadow = true;
spotLight.shadow.mapSize.set(2048, 2048); // tester 1024 1024 ?
spotLight.shadow.bias = -0.00005;
spotLight.shadow.normalBias = 0.0075;
scene.add(spotLight);
scene.add(spotLight.target);

// ===== STAGE LIGHTS REFERENCE =====
let stageLights = [];      // Toutes les lumières de scène
let backstageLights = [];  // Lumières du backstage
let currentLightMode = 'none'; // 'stage' ou 'backstage'

  // helpers / area visuals for backstage lights
let backstageHelpers = [];      // SpotLightHelper objects for spotlights
let backstageLightAreas = [];   // { light, mesh } cone meshes to show area of effect
let backstageSystem = null;
let backstageAvatarAnchor = null;

// Référence le spotLight principal pour le contrôle backstage
const stageSpotLight = spotLight;

console.log('✓ Variables lumières initialisées');

// --- Helpers (créés via THREE.*)
const spotHelper = new THREE.SpotLightHelper(spotLight);
scene.add(spotHelper);
spotHelper.visible = false; // désactivé par défaut
const shadowCamHelper = new THREE.CameraHelper(spotLight.shadow.camera);
scene.add(shadowCamHelper);
shadowCamHelper.visible = false; // désactivé par défaut
scene.fog = new THREE.Fog(0x050505, 15, 50);

// === BOTTOM MENU LIFTING ==========================

// ✅ remonte les boutons (pager + aide) au-dessus du bottom-menu quand il est ouvert
window.updateBottomMenuLift = function () {
  const bottomMenu = document.getElementById('bottom-menu');

  // hauteur réelle du drawer
  const h = bottomMenu.getBoundingClientRect().height;

  // ✅ marge “anti-trop-haut”, à ajuster à ton goût (ex: 40–80)
  const CORRECTION = 60;

  const lift = window.menuOpen ? Math.max(0, h - CORRECTION) : 0;
  document.documentElement.style.setProperty('--bottomMenuLift', `${lift}px`);
};

// bonus: si la fenêtre change (responsive)
window.addEventListener('resize', () => window.updateBottomMenuLift());
//queueMicrotask(() => window.updateBottomMenuLift());



function setUIForView(viewName) {
  const isBackstage = viewName === 'backstage';
  document.body.classList.toggle('view-backstage', isBackstage);

  if (isBackstage) {
    // on garde le bottom-menu accessible, mais on ferme les UIs projets
    window.__closeProjectDrawer?.();
    if (typeof closeProjectDetail === 'function') closeProjectDetail(false);
  }

  // Recalcule le lift et rafraîchit le label du bouton si setBottomMenuOpen existe
  if (typeof window.setBottomMenuOpen === 'function') {
    window.setBottomMenuOpen(!!window.menuOpen);
  } else {
    window.updateBottomMenuLift?.();
  }
}


// === AUTO-PLACEMENT AVATAR BACKSTAGE ==========================

function autoPlaceBackstageAvatar() {
  if (!backstageSystem || !backstageSystem.backstageGroup) {
    console.warn('autoPlaceBackstageAvatar : backstageSystem pas prêt');
    return;
  }

  // On calcule la boîte englobante du groupe backstage
  const box = new THREE.Box3().setFromObject(backstageSystem.backstageGroup);
  const center = new THREE.Vector3();
  box.getCenter(center);

  // Hauteur "sol" du backstage
  const floorY = box.min.y;

  // Position proposée : centré sur le backstage, à hauteur humaine
  const avatarPos = {
    x: center.x,
    y: floorY + 1.8,   // 1.8 ≈ hauteur d’un personnage debout
    z: center.z
  };

  // Petit offset optionnel : s’avancer un peu vers la scène (si nécessaire)
  // avatarPos.z += 0.5;  // tu peux ajuster ce +0.5 après test

  AVATAR_CONFIG.backstage.position = avatarPos;

  console.log('🎭 Avatar backstage auto-positionné :', AVATAR_CONFIG.backstage.position);
}
autoPlaceBackstageAvatar();
// ===== 🎭 AVATAR CONFIGURATION - EASY ACCESS =====
const AVATAR_CONFIG = {
  stage: {
    // Sur scène, juste derrière le pupitre, à hauteur humaine
    position: {x: -1, y: 0.5, z: -5 },
    scale: 1.0,
    model: './models/me/waving.glb'
  },
  backstage: {
    // Dans le backstage, au même “niveau” que la vue caméra backstage
    position: { x: -15, y: 1.8, z: -15 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 }, // tourne vers la scène
    scale: 3.0,
    model: './models/me/idle.glb'
  }
};



initAvatarSystem(scene, {
  stage: {
    path: './models/me/waving.fbx',
    type: 'fbx',
    position: { x: -4,    y: 0.2,  z: -4.2 },
    rotationY: 0,
    scale: 0.05
  },
  backstage: {
    path: './models/me/idle.glb',
    type: 'gltf',
    position: { x: -17.2346, y: 0.9, z: -14.6436 },
    rotationY: 2.1,
    scale: 2
  }
});
// 🔧 Ajoute cette ligne
refreshAvatarRefs();

// === GUIDED TOUR SYSTEME ==========================
class GuidedTour {
  constructor(scene, camera, renderer, controls) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.controls = controls;
    this.currentStep = 0;
    this.isActive = false;
    this.highlightedObject = null;
    this.uiHighlighted = [];

    this._reflow = null;

    this.tourPanel = this.createTourPanel();
  }

  createTourPanel() {
    const panel = document.createElement('div');
    panel.id = 'tour-panel';
    panel.style.cssText = `
      position: fixed;
      left: 40px;
      top: 40px;
      background: rgba(0, 0, 0, 0.92);
      color: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 380px;
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      display: none;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
      will-change: left, top;
    `;
    document.body.appendChild(panel);
    return panel;
  }

  highlightUI(selectors) {
    this.clearUIHighlight();
    const list = Array.isArray(selectors) ? selectors : [selectors];
    list.forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      this.uiHighlighted.push({ el, prev: el.style.cssText });
      el.style.outline = '2px solid #0ea5e9';
      el.style.boxShadow = '0 0 0 4px rgba(14,165,233,.25), 0 10px 30px rgba(0,0,0,.4)';
      el.style.borderRadius = el.style.borderRadius || '12px';
      // monte au-dessus si nécessaire
      if (!el.style.zIndex) el.style.zIndex = '10001';
      if (!el.style.position) el.style.position = 'relative';
    });
  }

  clearUIHighlight() {
    this.uiHighlighted.forEach(({ el, prev }) => { el.style.cssText = prev; });
    this.uiHighlighted = [];
  }

  // ---------- NEW: anchor-based positioning ----------

  getAnchorElement(step) {
    const pick = (selOrEl) => {
      if (!selOrEl) return null;
      if (selOrEl instanceof Element) return selOrEl;
      if (typeof selOrEl === 'string') return document.querySelector(selOrEl);
      return null;
    };

    // 1) step.anchor (priority)
    let el = pick(step.anchor);
    if (el) return el;

    // 2) fallback to step.ui (string or array)
    const ui = step.ui;
    if (!ui) return null;

    if (Array.isArray(ui)) {
      for (const s of ui) {
        el = pick(s);
        if (el) return el;
      }
      return null;
    }

    return pick(ui);
  }

  clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  positionPanelNearElement(el, placement = 'auto') {
    if (!el) return;

    const margin = 12;
    const r = el.getBoundingClientRect();

    // Must be visible to measure size correctly
    this.tourPanel.style.display = 'block';
    this.tourPanel.style.visibility = 'hidden';
    this.tourPanel.style.left = '0px';
    this.tourPanel.style.top = '0px';

    const panelRect = this.tourPanel.getBoundingClientRect();
    const pw = panelRect.width;
    const ph = panelRect.height;

    const fitsRight  = r.right + margin + pw <= window.innerWidth;
    const fitsLeft   = r.left  - margin - pw >= 0;
    const fitsBottom = r.bottom + margin + ph <= window.innerHeight;
    const fitsTop    = r.top    - margin - ph >= 0;

    let place = placement;
    if (place === 'auto') {
      if (fitsRight) place = 'right';
      else if (fitsLeft) place = 'left';
      else if (fitsBottom) place = 'bottom';
      else place = 'top';
    }

    let x = 0, y = 0;

    if (place === 'right') {
      x = r.right + margin;
      y = r.top + (r.height - ph) / 2;
    } else if (place === 'left') {
      x = r.left - margin - pw;
      y = r.top + (r.height - ph) / 2;
    } else if (place === 'bottom') {
      x = r.left + (r.width - pw) / 2;
      y = r.bottom + margin;
    } else { // top
      x = r.left + (r.width - pw) / 2;
      y = r.top - margin - ph;
    }

    // keep inside viewport
    x = this.clamp(x, 8, window.innerWidth - pw - 8);
    y = this.clamp(y, 8, window.innerHeight - ph - 8);

    this.tourPanel.style.left = `${x}px`;
    this.tourPanel.style.top  = `${y}px`;
    this.tourPanel.style.visibility = 'visible';
  }

  positionTourPanel(step) {
    const anchorEl = this.getAnchorElement(step);
    if (anchorEl) {
      this.positionPanelNearElement(anchorEl, step.placement || 'auto');
      return;
    }

    // fallback: safe corner
    this.tourPanel.style.display = 'block';
    const x = Math.max(8, window.innerWidth - 420);
    const y = Math.max(8, window.innerHeight - 260);
    this.tourPanel.style.left = `${x}px`;
    this.tourPanel.style.top  = `${y}px`;
  }

  // --------------------------------------------------

  start() {
    this.isActive = true;
    this.currentStep = 0;

    this._reflow = () => {
      if (!this.isActive) return;
      const steps = this.getTourSteps();
      const step = steps[this.currentStep];
      if (!step) return;
      this.positionTourPanel(step);
    };

    window.addEventListener('resize', this._reflow);
    window.addEventListener('scroll', this._reflow, true);

    this.showStep();
  }

  showStep() {
    const steps = this.getTourSteps();

    if (this.currentStep >= steps.length) {
      this.finish();
      return;
    }

    const step = steps[this.currentStep];

    // Action (ouvrir drawer, changer de vue, etc.)
    try { step.onEnter?.(); } catch (e) { console.warn('tour onEnter error', e); }

    this.updatePanel(step);

    // NEW: place the panel near the relevant UI element (next frame, after DOM updates)
    requestAnimationFrame(() => this.positionTourPanel(step));

    // Highlight 3D
    if (step.objectName) this.highlightObject(step.objectName);
    else this.clearHighlight();

    // Highlight UI
    if (step.ui) this.highlightUI(step.ui);
    else this.clearUIHighlight();

    // Camera (if not handled by switchToView)
    if (step.cameraPosition && step.cameraTarget) {
      this.moveCamera(step.cameraPosition, step.cameraTarget);
    }
  }

  updatePanel(step) {
    const stepNum = this.currentStep + 1;
    const totalSteps = this.getTourSteps().length;
    const isLast = this.currentStep === totalSteps - 1;

    this.tourPanel.innerHTML = `
      <div style="margin-bottom: 12px; font-size: 12px; color: #0ea5e9;">
        Étape ${stepNum} / ${totalSteps}
      </div>
      <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">
        ${step.title}
      </h3>
      <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.5; color: #ddd; white-space: pre-line;">
        ${step.description}
      </p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        ${this.currentStep > 0 ? `
          <button class="tour-btn-prev" style="
            padding: 8px 16px;
            background: rgba(102, 102, 102, 0.6);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
          ">
            ← Précédent
          </button>
        ` : ''}
        <button class="tour-btn-next" style="
          padding: 8px 16px;
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        ">
         ${isLast ? 'Terminer' : 'Suivant →'}
        </button>
        <button class="tour-btn-close" style="
          padding: 8px 16px;
          background: rgba(102, 102, 102, 0.6);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        ">
          ✕ Ignorer
        </button>
      </div>
    `;

    const btnNext = this.tourPanel.querySelector('.tour-btn-next');
    const btnPrev = this.tourPanel.querySelector('.tour-btn-prev');
    const btnClose = this.tourPanel.querySelector('.tour-btn-close');

    btnNext.onclick = () => (isLast ? this.finish() : this.next());
    if (btnPrev) btnPrev.onclick = () => this.prev();
    btnClose.onclick = () => this.stop();

    this.tourPanel.style.display = 'block';
  }

  highlightObject(objectName) {
    let targetObject = null;

    this.scene.traverse(obj => {
      if (obj.name === objectName) targetObject = obj;
    });

    if (targetObject) {
      this.clearHighlight();
      if (typeof setGlowState === 'function') {
        setGlowState(targetObject, true);
      }
      this.highlightedObject = targetObject;
    }
  }

  clearHighlight() {
    if (this.highlightedObject && typeof setGlowState === 'function') {
      setGlowState(this.highlightedObject, false);
    }
    this.highlightedObject = null;
  }

  moveCamera(targetPos, targetLook) {
    if (typeof gsap !== 'undefined') {
      gsap.to(this.camera.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 1.5,
        ease: "power2.inOut",
        onUpdate: () => {
          this.camera.lookAt(targetLook.x, targetLook.y, targetLook.z);
        }
      });

      if (this.controls && this.controls.target) {
        gsap.to(this.controls.target, {
          x: targetLook.x,
          y: targetLook.y,
          z: targetLook.z,
          duration: 1.5,
          ease: "power2.inOut"
        });
      }
    }
  }

  getTourSteps() {
    const V = CAMERA_VIEWS;

    return [
      {
        title: "Bienvenue 👋",
        description:
          "Petit tour des commandes : caméra, vues, projets, filtres (et sons), puis backstage.\nTu peux à tout moment quitter avec “Ignorer”.",
        //ui: ['#view-cycle-btn', '#restart-tour-btn'],
        //anchor: '#view-cycle-btn',
        placement: 'center',
        onEnter: () => {
          window.setBottomMenuOpen?.(false);
          window.__closeProjectDrawer?.();
          if (typeof closeProjectDetail === 'function') closeProjectDetail(false);
          if (typeof switchToView === 'function') switchToView('entrance');
        },
        cameraPosition: V.entrance.position,
        cameraTarget: V.entrance.target
      },

      {
        title: "Drag & See 🖱️",
        description:
          "Clic-gauche + drag : tourne autour de la scène.\nMolette : zoom.\n(OrbitControls)",
        cameraPosition: null,
        cameraTarget: null
      },

      {
        title: "Changer de vue 🎬",
        description:
          "Bouton en haut à droite (ou touche V) : Entrée → Accordéon → Pupitre → Backstage.",
        ui: '#view-cycle-btn',
        anchor: '#view-cycle-btn',
        placement: 'center',
        cameraPosition: null,
        cameraTarget: null
      },

      {
        title: "Accordéon = musique 🪗",
        description:
          "Clique l’accordéon : il joue un accord.\nC’est un objet interactif (audio).",
        objectName: "accordionModel",
        onEnter: () => switchToView('accordion'),
        cameraPosition: V.accordion.position,
        cameraTarget: V.accordion.target
      },

      {
        title: "Pupitre : projets 📚",
        description:
          "Les pages du pupitre affichent les projets.\nClique une page → fiche détail sur le côté.",
        objectName: "leftPage",
        onEnter: () => {
          switchToView('desk');
          window.__closeProjectDrawer?.();
        },
        cameraPosition: V.desk.position,
        cameraTarget: V.desk.target
      },

      {
        title: "Changer de projet ◀ ▶",
        description:
          "Utilise les boutons Précédent/Suivant (ou flèches clavier) pour tourner les pages.",
        // NOTE: ton conteneur s'appelle #pager dans ton code (pas #pager-floating)
        ui: ['#pager', '#prevPage', '#nextPage'],
        anchor: '#pager',
        placement: 'center',
        cameraPosition: V.desk.position,
        cameraTarget: V.desk.target
      },

      {
        title: "Filtres (et sons) 🎛️",
        description:
          "Ouvre le drawer du bas “Filtres & Contrôles”, active un filtre :\nça filtre les projets ET ça active des sons (notes en orbite).",
        ui: ['#menu-toggle-btn', '#bottom-menu', '#filters-container'],
        anchor: '#filters-container',
        placement: 'top',
        onEnter: () => window.setBottomMenuOpen?.(true),
        cameraPosition: V.desk.position,
        cameraTarget: V.desk.target
      },

      {
        title: "Audio 🔊",
        description:
          "Bouton audio : coupe/remet le son quand tu veux.",
        ui: '#audio-mute-btn',
        anchor: '#audio-mute-btn',
        placement: 'left',
        cameraPosition: null,
        cameraTarget: null
      },

      {
        title: "Liste projets (drawer gauche) ≡",
        description:
          "Le bouton ≡ à gauche ouvre la liste complète :\naccès rapide à un projet + ouverture de la fiche.",
        ui: ['#toggleListBtn', '#projDrawer'],
        anchor: '#toggleListBtn',
        placement: 'right',
        onEnter: () => window.__openProjectDrawer?.(),
        cameraPosition: V.desk.position,
        cameraTarget: V.desk.target
      },



      {
        title: "Backstage 🎭",
        description:
          "Passe backstage : certains objets se survolent et se cliquent\npour obtenir plus d’infos (focus lumière / détails).",
        onEnter: () => {
          window.setBottomMenuOpen?.(false);
          switchToView('backstage');
        },
        cameraPosition: V.backstage.position,
        cameraTarget: V.backstage.target
      },
            {
        title: "CV / À propos 📄",
        description:
          "Optionnel : clique le livre “ CV” au centre de la scène pour voir mon profil et mes infos.",
        objectName: "aboutMePanel",
        //onEnter: () => switchToView('entrance'),
        cameraPosition: V.backstage.position,
        cameraTarget: V.backstage.target
      },

      {
        title: "Avatar backstage 😄",
        description:
          "Survole l’avatar : fun fact.\nClique : changement de scène (et en backstage, clic → retour accordéon).",
        objectName: "avatarBackstage",
        cameraPosition: V.backstage.position,
        cameraTarget: V.backstage.target
      },

      {
        title: "C’est à toi ! 🚀",
        description:
          "Tu peux relancer ce tutoriel via le bouton “🎓 Tutoriel”.\nBon parcours !",
        ui: '#restart-tour-btn',
        anchor: '#restart-tour-btn',
        placement: 'left',
        onEnter: () => {
          window.setBottomMenuOpen?.(false);
          window.__closeProjectDrawer?.();
        },
        cameraPosition: null,
        cameraTarget: null
      }
    ];
  }

  next() {
    this.currentStep++;
    this.showStep();
  }

  prev() {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.showStep();
    }
  }

  stop() {
    this.end({ goHome: false, markSeen: false });
  }

  finish() {
    this.end({ goHome: true, markSeen: true });
  }

  end({ goHome = true, markSeen = true } = {}) {
    this.isActive = false;
    this.tourPanel.style.display = 'none';
    this.clearHighlight();
    this.clearUIHighlight();

    window.removeEventListener('resize', this._reflow);
    window.removeEventListener('scroll', this._reflow, true);

    if (goHome && typeof switchToView === 'function') {
      switchToView('entrance');
    }

    if (markSeen) {
      localStorage.setItem('portfolioTourSeen', 'true');
    }

    console.log('Tour terminé !');
  }
}



// ==== LIGHTING SYSTEM (stage + backstage + IBL sombre) ===================

function createLightingSystem(scene, renderer, options = {}) {
  const {
    mainStageSpot = null,
    dimEnvIntensity = 0.03,
    normalEnvIntensity = 0.08
  } = options;

  // --- IBL sombre
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envState = {
    intensity: normalEnvIntensity, // intensité "normale"
    hue: 0.66,
    sat: 0.2,
    val: 0.02
  };
  let envRT = null;

  function applyDarkIBL() {
    const envScene = new THREE.Scene();
    const col = new THREE.Color().setHSL(envState.hue, envState.sat, envState.val);
    envScene.background = col;
    envScene.add(new THREE.AmbientLight(col.getHex(), 1.0));

    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;

    scene.traverse((o) => {
      if (o.isMesh && o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          m.envMapIntensity = envState.intensity;
          m.needsUpdate = true;
        });
      }
    });
  }

  function setEnvironmentDimmed(dim) {
    const targetIntensity = dim ? dimEnvIntensity : normalEnvIntensity;
    gsap.to(envState, {
      intensity: targetIntensity,
      duration: 0.4,
      ease: 'power2.inOut',
      onUpdate: applyDarkIBL
    });
  }

  // --- listes de lumières
  const stageLights = [];
  const backstageLights = [];
  let currentMode = 'stage';

  function initStageLights() {
    // On prend toutes les lights présentes AU DÉBUT comme "stage"
    scene.traverse((o) => {
      if (o.isLight) {
        if (o !== null) {
          if (o.userData.originalIntensity == null && typeof o.intensity === 'number') {
            o.userData.originalIntensity = o.intensity;
          }
          stageLights.push(o);
        }
      }
    });

    console.log(`💡 StageLights init: ${stageLights.length} lights`);
  }

  function registerBackstageLights(backstageLightsObject) {
    if (!backstageLightsObject) {
      console.warn('registerBackstageLights: rien reçu');
      return;
    }

    const bsSpot = backstageLightsObject.spotlight;
    const bsAmbient = backstageLightsObject.ambient || backstageLightsObject.ambientLight;

    if (bsSpot) {
      if (bsSpot.userData.targetIntensity == null && typeof bsSpot.intensity === 'number') {
        bsSpot.userData.targetIntensity = bsSpot.intensity;
      }
      bsSpot.visible = false;
      backstageLights.push(bsSpot);
    }

    if (bsAmbient) {
      if (bsAmbient.userData.targetIntensity == null && typeof bsAmbient.intensity === 'number') {
        bsAmbient.userData.targetIntensity = bsAmbient.intensity;
      }
      bsAmbient.visible = false;
      backstageLights.push(bsAmbient);
    }

    console.log(`🎭 BackstageLights enregistrées: ${backstageLights.length}`);
  }

  function setMode(newMode) {
    if (newMode !== 'stage' && newMode !== 'backstage') return;
    if (currentMode === newMode) return;

    currentMode = newMode;
    console.log(`💡 Lighting mode -> ${currentMode}`);

    if (currentMode === 'stage') {
      // On rallume la scène, on éteint le backstage
      stageLights.forEach((light) => {
        const targetI = light.userData.originalIntensity ?? light.intensity ?? 1;
        light.visible = true;
        gsap.to(light, {
          intensity: targetI,
          duration: 0.5,
          ease: 'power2.inOut'
        });
      });

      backstageLights.forEach((light) => {
        gsap.to(light, {
          intensity: 0,
          duration: 0.5,
          ease: 'power2.inOut',
          onComplete: () => { light.visible = false; }
        });
      });

      setEnvironmentDimmed(false);

    } else {
      // BACKSTAGE : on coupe la scène, on allume les lumières backstage
      stageLights.forEach((light) => {
        if (typeof light.intensity === 'number') {
          light.userData.originalIntensity = light.intensity;
        }
        gsap.to(light, {
          intensity: 0,
          duration: 0.5,
          ease: 'power2.inOut',
          onComplete: () => { light.visible = false; }
        });
      });

      backstageLights.forEach((light) => {
        const targetI = light.userData.targetIntensity ?? light.intensity ?? 1;
        light.visible = true;
        gsap.to(light, {
          intensity: targetI,
          duration: 0.5,
          ease: 'power2.inOut'
        });
      });

      // l’IBL sera dimmée au moment du focus (onFocusStart)
    }
  }

  function toggleMode() {
    setMode(currentMode === 'stage' ? 'backstage' : 'stage');
  }

  function handleBackstageFocusStart() {
    if (currentMode === 'backstage') {
      setEnvironmentDimmed(true);
    }
  }

  function handleBackstageFocusEnd() {
    if (currentMode === 'backstage') {
      setEnvironmentDimmed(false);
    }
  }

  // --- init
  applyDarkIBL();
  scene.background = new THREE.Color(0x111111);
  initStageLights();

  return {
    setMode,
    toggleMode,
    getMode: () => currentMode,
    registerBackstageLights,
    handleBackstageFocusStart,
    handleBackstageFocusEnd,
    envState,
    applyDarkIBL
  };
}

// Création du système de lumière après les lights de base
const lighting = createLightingSystem(scene, renderer, {
  mainStageSpot: spotLight,
  dimEnvIntensity: 0.03,
  normalEnvIntensity: 0.08
});
const { envState, applyDarkIBL } = lighting;
// ===== END BACKSTAGE LIGHTING SYSTEM =====


// ===== MODIFICATIONS À AJOUTER AU FICHIER paste.txt =====

// 1️⃣ AJOUTER après la déclaration de `incrementLoadCounter()` (vers ligne 30) :
// Remplacer la section "LOADING SCREEN SYSTEM" par celle-ci :

// ===== LOADING SCREEN SYSTEM =====
const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const stlLoader  = new STLLoader();
let loadingComplete = false;
let assetsToLoad = 0;
let assetsLoaded = 0;

function incrementLoadCounter() {
  assetsToLoad++;
}

function incrementLoadProgress() {
  assetsLoaded++;
  updateLoadingProgress();
  if (assetsLoaded >= assetsToLoad) {
    finishLoading();
  }
}

function getLoadingMessage(progress) {
  if (progress < 10) {
    return 'Chargement de la scène – réveil des circuits…';
  } else if (progress < 25) {
    return 'Chargement de la scène – accordage des instruments virtuels…';
  } else if (progress < 40) {
    return 'Chargement de la scène – calibration des micros et capteurs…';
  } else if (progress < 60) {
    return 'Chargement de la scène – routage audio et bus d’effets…';
  } else if (progress < 80) {
    return 'Chargement de la scène – synchronisation moteur 3D et tempo…';
  } else if (progress < 100) {
    return 'Chargement de la scène – derniers tests de sécurité…';
  } else {
    return 'Scène prête – ouverture du rideau !';
  }
}


function updateLoadingProgress() {
  const progress = assetsToLoad > 0 ? (assetsLoaded / assetsToLoad) * 100 : 0;
  const progressBar   = document.getElementById('loading-progress-bar');
  const progressText  = document.getElementById('loading-progress-text');
  const loadingTitle  = document.querySelector('.loading-text');

  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }

  if (progressText) {
    progressText.textContent = `${Math.round(progress)}%`;
  }

  if (loadingTitle) {
    loadingTitle.textContent = getLoadingMessage(progress);
  }
}


function finishLoading() {
  if (loadingComplete) return;
  loadingComplete = true;
  
  console.log('✓ Tous les assets chargés, ouverture des rideaux...');
  
  // Petite attente puis ouverture des rideaux d'intro
  setTimeout(() => {
    openCurtains(2.5); // Ouvre les rideaux de scène
    console.log('🎭 Rideaux ouverts');
    // Masque l'écran de chargement
    setTimeout(() => {
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        console.log('🌕 Fondu de l\'écran de chargement');
        setTimeout(() => {
          loadingScreen.style.display = 'none';
          console.log('🚪 Écran de chargement masqué');
          // ✅ START GUIDED TOUR ONLY AFTER EVERYTHING IS LOADED & DISPLAYED
         if (!localStorage.getItem('portfolioTourSeen')) {
          console.log('▶ Démarrage du tutoriel guidé');
           guidedTour.start();
         }
        }, 1000);
      }
    }, 1500);
  }, 500);
}

// 2️⃣ REMPLACER les chargements de textures/modèles pour utiliser incrementLoadCounter/Progress
// Exemple avec le sol (ligne ~75):

incrementLoadCounter(); // Sol texture
(async () => {
  const woodFloor = await new Promise((res, rej) => texLoader.load('./texture/wood_floor/textures/wood_floor_diff_4k.jpg', res, undefined, rej));
  woodFloor.colorSpace = THREE.SRGBColorSpace;
  woodFloor.wrapS = woodFloor.wrapT = THREE.RepeatWrapping;
  woodFloor.repeat.set(50, 50);
  woodFloor.anisotropy = renderer.capabilities.getMaxAnisotropy();

  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ map: woodFloor, roughness: 0.6, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  incrementLoadProgress(); // ✅ AJOUTER
})();

// 3️⃣ AJOUTER incrementLoadCounter/Progress pour CHAISE (ligne ~230):
incrementLoadCounter(); // Wood texture
texLoader.load('./texture/dark_wood/textures/dark_wood_diff_4k.jpg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  woodChairTex = t;
  applyWoodToChair();
  incrementLoadProgress(); // ✅ AJOUTER
});

incrementLoadCounter(); // Chair model
(async () => {
  const gltf = await new Promise((res, rej) => gltfLoader.load('./models/Chair26_gltf.gltf', res, undefined, rej));
  const chair = gltf.scene;
  chairRef = chair;
  placeAccordionOnChair();

  chair.position.set(-2.5, 0.0025, -1);
  chair.scale.set(2, 2, 2);

  chair.traverse((ch) => {
    if (!ch.isMesh) return;
    ch.castShadow = true;
    ch.receiveShadow = true;
    const setMat = (m) => {
      if (!m) return;
      if (Array.isArray(m)) return m.forEach(setMat);
      if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhysicalMaterial)) {
        const nm = new THREE.MeshStandardMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(nm, m);
        ch.material = nm; m = nm;
      }
      m.color?.set(0xffffff);
      m.metalness = 0.0; m.roughness = 0.75;
      if (woodChairTex) { m.map = woodChairTex; m.map.needsUpdate = true; }
      m.envMapIntensity = envState.intensity;
      m.needsUpdate = true;
    };
    setMat(ch.material);
  });

  scene.add(chair);
  spotLight.target.position.copy(chair.position);
  spotLight.target.updateMatrixWorld();
  spotHelper.update();
  incrementLoadProgress(); // ✅ AJOUTER
})();

// 4️⃣ MODIFIER la fonction loadAccordion() (ligne ~265):
incrementLoadCounter(); // Accordion model
async function loadAccordion() {
  return new Promise((resolve, reject) => {
    gltfLoader.load('./models/accordion_real/real_accordion.gltf', (gltf) => {
      const accordion = gltf.scene;
      accordionModel = accordion;
      accordion.name = 'accordionModel';

      accordion.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true;
          node.receiveShadow = true;
          node.visible = true; // Force visibilité
        }
      });

      accordion.position.set(0, 0.02, 0);
      accordion.scale.set(1,1, 1);
      accordion.visible = true;

      if (gltf.animations.length > 0) {
        accordionMixer = new THREE.AnimationMixer(accordion);
        const action = accordionMixer.clipAction(gltf.animations[0]);
        action.play();
      }

      accRef = accordion;
      scene.add(accordion);
      placeAccordionOnChair();

      console.log('✓ Accordéon glTF chargé');
      incrementLoadProgress(); // ✅ AJOUTER
      resolve(accordion);

    }, undefined, (error) => {
      console.error('❌ Accordéon glTF error:', error);
      incrementLoadProgress(); // ✅ Compte quand même
      reject(error);
    });
  });
}



// ===== CAMERA VIEW SYSTEM =====// ===== CAMERA VIEWS CONFIGURATION =====
const CAMERA_VIEWS = {
  entrance: {
    name: '🎬 Vue d\'entrée',
    position: { x: 0.00, y: 3.04, z: 5.38 },
    target:   { x: 0, y: 2, z: 0 }
  },
  accordion: {
    name: '🪗 Accordéon',
    position: { x: 0, y: 2.5, z: 3 },
    target:   { x: 0, y: 1.5, z: -1 }
  },
  desk: {
    name: '📚 Pupitre',
    position: { x: 0, y: 3, z: 0 },
    target:   { x: 0, y: 1.5, z: -2.2 }
  },
  backstage: {
    name: '🎭 Backstage',
    position: { x: -8.39, y: 5.02,  z: -18.23 },
    target:   {  x: -13, y: 0.5, z: -15  }
  }
};

let currentViewIndex = 0;
const viewKeys = Object.keys(CAMERA_VIEWS);

function switchToView(viewName) {
    const view = CAMERA_VIEWS[viewName];
  if (!view) return;

  // 🔧 NOUVEAU : synchroniser l’index interne avec la vue demandée
  const idx = viewKeys.indexOf(viewName);
  if (idx !== -1) {
    currentViewIndex = idx;
  }

  // ➜ dit au système d'avatar : "on est en 'entrance' / 'accordion' / 'desk' / 'backstage'"
  setAvatarView(viewName);

  // Tween de la caméra
  gsap.to(camera.position, {
    duration: 1.2,
    x: view.position.x,
    y: view.position.y,
    z: view.position.z,
    ease: 'power2.inOut'
  });

  gsap.to(controls.target, {
    duration: 1.2,
    x: view.target.x,
    y: view.target.y,
    z: view.target.z,
    ease: 'power2.inOut'
  });

  if (viewName === 'backstage') {
    showBackstageAvatar();
    lighting.setMode('backstage');
    setAvatarGlow(false);
  } else {
    showStageAvatar();
    lighting.setMode('stage');

    if (viewName === 'accordion' || viewName === 'desk') {
      setAvatarGlow(true);
    } else {
      setAvatarGlow(false);
    }
  }

  updateViewButtonText();
  setUIForView(viewName);

}


function cycleView() {
  currentViewIndex = (currentViewIndex + 1) % viewKeys.length;
  switchToView(viewKeys[currentViewIndex]);
}

function updateViewButtonText() {
  const btn = document.getElementById('view-cycle-btn');
  if (!btn) return;
  const view = CAMERA_VIEWS[viewKeys[currentViewIndex]];
  btn.textContent = view.name;
}

// Bouton HTML (en haut à droite)
const viewBtn = document.getElementById('view-cycle-btn');
if (viewBtn) {
  viewBtn.addEventListener('click', () => {
    cycleView();
  });
}

// Vue initiale
switchToView('entrance');

// 7️⃣ AJOUTER le raccourci clavier 'v' dans la section keydown (ligne ~520):
// Dans le switch (e.key.toLowerCase()), AJOUTER:




// --- Sol

let floor;
(async () => {
  const woodFloor = await new Promise((res, rej) => texLoader.load('./texture/wood_floor/textures/wood_floor_diff_4k.jpg', res, undefined, rej));
  woodFloor.colorSpace = THREE.SRGBColorSpace;
  woodFloor.wrapS = woodFloor.wrapT = THREE.RepeatWrapping;
  woodFloor.repeat.set(50, 50);
  woodFloor.anisotropy = renderer.capabilities.getMaxAnisotropy();

  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ map: woodFloor, roughness: 0.6, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
})();

// --- IBL SOMBRE “sans .hdr” : PMREM depuis une scène noire


// ===== BACKSTAGE LIGHTING SYSTEM =====

function setupLighting() {
  // On capture les lumières déjà présentes dans la scène (stage, hemi, etc.)
  const existingLights = scene.children.filter(child => child.isLight);
  stageLights = existingLights;

  console.log(`📍 ${stageLights.length} lumières de scène trouvées (hors backstage)`);

  // ⚠️ On NE crée PLUS ici de lumières backstage :
  // elles viennent désormais du BackstageSystem.
}

function registerBackstageLightsFromSystem(system) {
  if (!system || !system.backstageLights) {
    console.warn('registerBackstageLightsFromSystem : pas de lumières disponibles');
    return;
  }

  const backstageSpotLight = system.backstageLights.spotlight;
  const backstageAmbient   = system.backstageLights.ambient;

  if (backstageSpotLight) {
    backstageSpotLight.visible = false;
    backstageLights.push(backstageSpotLight);

    // helpers / zones (reprend ton ancien code)
    try {
      const spHelper = new THREE.SpotLightHelper(backstageSpotLight);
      spHelper.visible = false;
      scene.add(spHelper);
      backstageHelpers.push(spHelper);

      const coneGeo = new THREE.ConeGeometry(1, 1, 32, 1, true);
      const coneMat = new THREE.MeshBasicMaterial({
        color: 0x00aaff,
        transparent: true,
        opacity: 0.12,
        depthWrite: false
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.visible = false;
      scene.add(coneMesh);
      backstageLightAreas.push({ light: backstageSpotLight, mesh: coneMesh });
    } catch (e) {
      console.warn('Backstage helper creation failed:', e);
    }
  }

  if (backstageAmbient) {
    backstageAmbient.visible = false;
    backstageLights.push(backstageAmbient);
  }

  console.log(`🎬 ${backstageLights.length} lumières backstage enregistrées depuis BackstageSystem`);
}


function switchToStageLighting() {
  if (currentLightMode === 'stage') return;
  
  currentLightMode = 'stage';
  console.log('💡 Switch vers STAGE lighting');
  
  // Allume les lumières de scène
  stageLights.forEach(light => {
    gsap.to(light, {
      intensity: light.userData.originalIntensity || 1,
      duration: 0.5,
      ease: 'power2.inOut'
    });
    light.visible = true;
  });
  
  // Éteint les lumières backstage
  backstageLights.forEach(light => {
    gsap.to(light, {
      intensity: 0,
      duration: 0.5,
      ease: 'power2.inOut',
      onComplete: () => { light.visible = false; }
    });
  });
}

function switchToBackstageLighting() {
  if (currentLightMode === 'backstage') return;
  
  currentLightMode = 'backstage';
  console.log('🎬 Switch vers BACKSTAGE lighting');
  
  // Éteint les lumières de scène
  stageLights.forEach(light => {
    light.userData.originalIntensity = light.intensity;
    gsap.to(light, {
      intensity: 0,
      duration: 0.5,
      ease: 'power2.inOut',
      onComplete: () => { light.visible = false; }
    });
  });
  
  // Allume les lumières backstage
  backstageLights.forEach(light => {
    light.visible = true;
    gsap.to(light, {
      intensity: light.userData.targetIntensity || 1,
      duration: 0.5,
      ease: 'power2.inOut'
    });
  });
}

function updateBackstageHelpers() {
  // update spot helpers
  backstageHelpers.forEach(h => {
    try { h.update(); } catch (e) { /* ignore */ }
  });

  // update cone meshes to match light angle/distance/orientation
  backstageLightAreas.forEach(item => {
    const light = item.light;
    const mesh = item.mesh;
    if (!light || !mesh) return;
    // compute direction toward target
    const dir = new THREE.Vector3().copy(light.target.position).sub(light.position).normalize();
    // distance to visualize (use light.distance if > 0 else fallback)
    const dist = (light.distance && light.distance > 0) ? light.distance : 20;
    const radius = Math.tan(light.angle) * dist;
    // orient cone so its local +Y points along dir
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    // position the cone so it's centered along the light direction
    mesh.position.copy(light.position).add(dir.clone().multiplyScalar(dist * 0.5));
    // scale cone: height = dist, radius = radius
    mesh.scale.set(radius, dist, radius);
    mesh.updateMatrixWorld();
  });
}

// ===== END BACKSTAGE LIGHTING SYSTEM =====



scene.background = new THREE.Color(0x111111); // fond très sombre




// --- CHAISE + texture bois

let woodChairTex = null;   

let chairRef = null;
let accRef = null;        
function placeAccordionOnChair(){
  if (!chairRef || !accRef) return;

  // parentage: l'accordéon devient enfant de la chaise
  chairRef.add(accRef);

  // remet l'orientation droite (nien couchée)
  accRef.rotation.set(-0.34, 2.12, 0.75);

    // pose sur l'assise (valeurs à ajuster finement selon ton modèle)

  accRef.position.set(0.22, 0.76, -0.06); // ajuste finement si besoin

  accRef.scale.set(1, 1, 1);

  // matériau blanc propre
  if (accRef.material) {
    accRef.material.color.set(0xffffff);
    accRef.material.roughness = 0.35;
    accRef.material.metalness = 0.0;
    accRef.material.needsUpdate = true;
  }
}

function applyWoodToChair(){
  if (!chairRef || !woodChairTex) return;
  chairRef.traverse((ch) => {
    if (!ch.isMesh) return;
    const setMat = (m) => {
      if (!m) return;
      if (Array.isArray(m)) return m.forEach(setMat);
      if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhysicalMaterial)) {
        const nm = new THREE.MeshStandardMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(nm, m);
        ch.material = nm; m = nm;
      }
      m.color?.set(0xffffff);
      m.metalness = 0.0; m.roughness = 0.7;
      m.map = woodChairTex;
      m.map.needsUpdate = true;
      m.envMapIntensity = envState.intensity;
      m.needsUpdate = true;
    };
    setMat(ch.material);
  });
}

texLoader.load('./texture/dark_wood/textures/dark_wood_diff_4k.jpg', (t) => {
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  woodChairTex = t;
  applyWoodToChair();   // <— réapplique si la chaise est déjà chargée

});

(async () => {
  const gltf = await new Promise((res, rej) => gltfLoader.load('./models/Chair26_gltf.gltf', res, undefined, rej));
  const chair = gltf.scene;
  chairRef = chair;     // <— on garde une ref pour (ré)appliquer la texture
  placeAccordionOnChair(); // posera l'accordéon si déjà chargé

  chair.position.set(-2.5, 0.0025, -1);
  chair.scale.set(2, 2, 2);

  chair.traverse((ch) => {
    if (!ch.isMesh) return;
    ch.castShadow = true;
    ch.receiveShadow = true;
    const setMat = (m) => {
      if (!m) return;
      if (Array.isArray(m)) return m.forEach(setMat);
      if (!(m instanceof THREE.MeshStandardMaterial) && !(m instanceof THREE.MeshPhysicalMaterial)) {
        const nm = new THREE.MeshStandardMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(nm, m);
        ch.material = nm; m = nm;
      }
      m.color?.set(0xffffff);
      m.metalness = 0.0; m.roughness = 0.5;
      if (woodChairTex) { m.map = woodChairTex; m.map.needsUpdate = true; }
      m.envMapIntensity = envState.intensity;
      m.needsUpdate = true;
    };
    setMat(ch.material);
  });

  scene.add(chair);
  spotLight.target.position.copy(chair.position);
  spotLight.target.updateMatrixWorld();
  spotHelper.update();
})();

// --- ACCORDÉON STL
// --- ACCORDÉON GLTF (remplace le STL)

let accordionModel = null;
let accordionMixer = null;



const accordionState = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  animationPlay: false
};



function updateAccordionTransform() {
  if (!accordionModel) return;
  accordionModel.rotation.set(
    accordionState.rotationX,
    accordionState.rotationY,
    accordionState.rotationZ
  );
  accordionModel.scale.set(
    accordionState.scaleX,
    accordionState.scaleY,
    accordionState.scaleZ
  );
}

function resetAccordionTransform() {
  accordionState.rotationX = 0;
  accordionState.rotationY = 0;
  accordionState.rotationZ = 0;
  accordionState.scaleX = 1;
  accordionState.scaleY = 1;
  accordionState.scaleZ = 1;
  updateAccordionTransform();
}

// Appelle au démarrage
loadAccordion();


/* 
// --- HUD Caméra (position + target)
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;left:8px;top:8px;color:#0f0;font:12px/1.35 monospace;background:rgba(0,0,0,.4);padding:6px 8px;border-radius:6px;z-index:10';
document.body.appendChild(hud);
 */
/*
 // --- GUI Debug (lil-gui)
const gui = new GUI({ title: 'Debug', width: 320 });
const params = {
  showHelpers: true,
  exposure: renderer.toneMappingExposure,
  // Spot
  intensity: spotLight.intensity,
  angle: spotLight.angle,
  penumbra: spotLight.penumbra,
  decay: spotLight.decay,
  distance: spotLight.distance,
  sx: spotLight.position.x, sy: spotLight.position.y, sz: spotLight.position.z,
  // IBL sombre
  envIntensity: envState.intensity,
  envHue: envState.hue,
  envSat: envState.sat,
  envVal: envState.val,
  // Ombres
  shadows: true,
};

gui.add(params, 'exposure', 0.2, 3.0, 0.05).name('Exposure').onChange(v => renderer.toneMappingExposure = v);

const gSpot = gui.addFolder('SpotLight');
gSpot.add(params, 'intensity', 0, 20, 0.5).onChange(v => spotLight.intensity = v);
gSpot.add(params, 'angle', 0.05, Math.PI/2, 0.01).onChange(v => { spotLight.angle = v; spotHelper.update(); });
gSpot.add(params, 'penumbra', 0, 1, 0.01).onChange(v => { spotLight.penumbra = v; spotHelper.update(); });
gSpot.add(params, 'decay', 0, 2, 0.05).onChange(v => spotLight.decay = v);
gSpot.add(params, 'distance', 0, 200, 1).onChange(v => spotLight.distance = v);
gSpot.add(params, 'sx', -20, 20, 0.1).name('pos.x').onChange(v => { spotLight.position.x = v; spotHelper.update(); shadowCamHelper.update(); });
gSpot.add(params, 'sy', 0, 30, 0.1).name('pos.y').onChange(v => { spotLight.position.y = v; spotHelper.update(); shadowCamHelper.update(); });
gSpot.add(params, 'sz', -20, 20, 0.1).name('pos.z').onChange(v => { spotLight.position.z = v; spotHelper.update(); shadowCamHelper.update(); });

const gIBL = gui.addFolder('IBL sombre');
gIBL.add(params, 'envIntensity', 0, 2, 0.05).name('intensité').onChange(v => { envState.intensity = v; applyDarkIBL(); });
gIBL.add(params, 'envHue', 0, 1, 0.01).name('teinte(H)').onChange(v => { envState.hue = v; applyDarkIBL(); });
gIBL.add(params, 'envSat', 0, 1, 0.01).name('saturation').onChange(v => { envState.sat = v; applyDarkIBL(); });
gIBL.add(params, 'envVal', 0, 0.2, 0.005).name('luminosité').onChange(v => { envState.val = v; applyDarkIBL(); });

gui.add(params, 'shadows').name('Shadows ON/OFF').onChange(v => {
  renderer.shadowMap.enabled = v;
  spotLight.castShadow = v;
  shadowCamHelper.visible = v && params.showHelpers;
});
gui.add(params, 'showHelpers').name('Helpers ON/OFF').onChange(v => {
  spotHelper.visible = v;
  shadowCamHelper.visible = v && params.shadows;
});


gui.add(spotLight, 'visible').name('Spotlight ON/OFF');
gui.add(params, 'shadows').name('Shadows ON/OFF').onChange(v => {
  renderer.shadowMap.enabled = v;
  spotLight.castShadow = v;
  shadowCamHelper.visible = v && params.showHelpers;
});

gui.add({ showBackstage() {

  if (!backstageSystem || !backstageSystem.backstageGroup) {
    console.warn('Backstage system not ready yet.');
    return;
  }
  const helper = new THREE.BoxHelper(backstageSystem.backstageGroup, 0x00ff00);
  scene.add(helper);
}}, 'showBackstage').name('🔍 Show Backstage Bounds');
// === ACCORDION CONTROLS ===
const gAcc = gui.addFolder('Accordéon');

const accRotate = gAcc.addFolder('Rotation');
accRotate.add(accordionState, 'rotationX', -Math.PI, Math.PI, 0.01)
.name('Rot X').onChange(updateAccordionTransform);
accRotate.add(accordionState, 'rotationY', -Math.PI, Math.PI, 0.01)
.name('Rot Y').onChange(updateAccordionTransform);
accRotate.add(accordionState, 'rotationZ', -Math.PI, Math.PI, 0.01)
.name('Rot Z').onChange(updateAccordionTransform);

const accScale = gAcc.addFolder('Scale');
accScale.add(accordionState, 'scaleX', 0.1, 3, 0.05)
.name('Scale X').onChange(updateAccordionTransform);
accScale.add(accordionState, 'scaleY', 0.1, 3, 0.05)
.name('Scale Y').onChange(updateAccordionTransform);
accScale.add(accordionState, 'scaleZ', 0.1, 3, 0.05)
.name('Scale Z').onChange(updateAccordionTransform);

gAcc.add({ reset: resetAccordionTransform }, 'reset')
.name('🔄 Reset accord.');

// after GUI setup (near other GUI folders) add backstage GUI toggles
params.showBackstageLights = false;
params.showBackstageAreas = false;
const gBack = gui.addFolder('Backstage Lights');
gBack.add(params, 'showBackstageLights').name('Show Backstage Lights').onChange((v) => {
  // toggle actual lights + their helpers
  backstageLights.forEach(light => { light.visible = v; });
  backstageHelpers.forEach(h => { h.visible = v; });
});
gBack.add(params, 'showBackstageAreas').name('Show Areas of Effect').onChange((v) => {
  backstageLightAreas.forEach(a => { a.mesh.visible = v; });
});
gBack.open();

// end lil-gui setup 
// */ 


// --- init avatar system
//initAvatarSystem(scene);
// L'avatar sort du sol et arrive à la position (0, 2, -3)



// --- Raccourcis clavier
window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case '1': 
      renderer.toneMappingExposure = Math.max(0.2, renderer.toneMappingExposure - 0.2); 
      params.exposure = renderer.toneMappingExposure; 
      //gui.controllers[0].updateDisplay(); 
      break;
    case '2': 
      renderer.toneMappingExposure += 0.2; 
      params.exposure = renderer.toneMappingExposure; 
      //gui.controllers[0].updateDisplay(); 
      break;
    case 'c': 
      spotLight.intensity = Math.max(0, spotLight.intensity - 1); 
      params.intensity = spotLight.intensity; 
      gSpot.controllers[0].updateDisplay(); 
      break;
    case 'v': 
      //spotLight.intensity += 1; 
      //params.intensity = spotLight.intensity; 
      //gSpot.controllers[0].updateDisplay(); 
      cycleView();
      break;
    case 'z': 
      spotLight.angle = Math.max(0.05, spotLight.angle - 0.05); 
      params.angle = spotLight.angle; 
      gSpot.controllers[1].updateDisplay(); 
      spotHelper.update(); 
      break;
    case 'x': 
      spotLight.angle = Math.min(Math.PI/2, spotLight.angle + 0.05); 
      params.angle = spotLight.angle; 
      gSpot.controllers[1].updateDisplay(); 
      spotHelper.update(); 
      break;
    
    case 'l': // Toggle Spotlight ON/OFF
      spotLight.visible = !spotLight.visible;
      spotHelper.visible = spotLight.visible && params.showHelpers;
      console.log(spotLight.visible ? '💡 Spotlight ON' : '🌑 Spotlight OFF');
      break;
    
    case 'b': // Toggle Backstage
    lighting.toggleMode();
      /* if (currentLightMode === 'backstage') {
        switchToStageLighting();
      } else {
        switchToBackstageLighting();
      }
      break; */
    
    case 'j': // Helpers
      params.showHelpers = !params.showHelpers;
      spotHelper.visible = params.showHelpers && spotLight.visible;
      shadowCamHelper.visible = params.showHelpers && params.shadows;
      break;
    case 'h': // GUI
     // gui._hidden ? gui.show() : gui.hide();
      break;
  }
  
});

// Initialise le système de lumière backstage
//setupLighting();

// === CONFIG SAVE/LOAD ==============================================

// Récupère tous les réglages utiles
function getConfig() {
  const t = spotLight.target.position;
  return {
    meta: { when: new Date().toISOString(), note: "Three.js debug config" },
    exposure: renderer.toneMappingExposure,
    shadows: renderer.shadowMap.enabled,
    helpers: params?.showHelpers ?? true,
    env: { ...envState }, // {intensity, hue, sat, val}
    camera: {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    },
    target: { x: t.x, y: t.y, z: t.z },
    spot: {
      intensity: spotLight.intensity,
      angle: spotLight.angle,
      penumbra: spotLight.penumbra,
      decay: spotLight.decay,
      distance: spotLight.distance,
      position: {
        x: spotLight.position.x, y: spotLight.position.y, z: spotLight.position.z
      }
    }
  };
}


// --- hash deterministe (FNV-1a 32-bit)
function hash32FNV1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// --- couleur stable depuis une string -> "#RRGGBB"
// (HSL => jolie palette, pas trop sombre)
function stableColorFromKey(key, { s = 0.62, l = 0.48 } = {}) {
  const h32 = hash32FNV1a(String(key));
  const hue = h32 % 360;

  // Utilise THREE.Color pour convertir HSL -> hex
  const c = new THREE.Color().setHSL(hue / 360, s, l);
  return `#${c.getHexString()}`;
}


// --- i18n helpers pour les projets (Sprint 2.1) ---
function getPortfolioLangForProjects() {
  try {
    if (window.portfolioI18n && typeof window.portfolioI18n.getLang === 'function') {
      const lang = window.portfolioI18n.getLang();
      return lang === 'en' ? 'en' : 'fr';
    }
  } catch (_) {}
  const htmlLang = document.documentElement?.dataset?.lang || document.documentElement?.lang || 'fr';
  return String(htmlLang).toLowerCase().startsWith('en') ? 'en' : 'fr';
}

function getProjectField(p, baseKey, fallback = '') {
  if (!p) return fallback;
  const lang = getPortfolioLangForProjects();

  const langKey = `${baseKey}_${lang}`;
  const altLangKey = `${baseKey}${lang === 'en' ? 'En' : 'Fr'}`;
  const otherLangKey = `${baseKey}_${lang === 'en' ? 'fr' : 'en'}`;

  const val =
    p?.[langKey] ??
    p?.[altLangKey] ??
    p?.[baseKey] ??
    p?.[otherLangKey];

  if (val == null || val === '') return fallback;
  return val;
}

function getProjectKeywordsLocalized(p) {
  if (!p) return [];
  const lang = getPortfolioLangForProjects();

  const candidates = [
    p?.[`keywords_${lang}`],
    p?.[`key-words_${lang}`],
    p?.[lang === 'en' ? 'keywordsEn' : 'keywordsFr'],
    p?.[lang === 'en' ? 'keyWordsEn' : 'keyWordsFr'],
    p?.keywords,
    p?.['key-words'],
    p?.tags,
    p?.[`keywords_${lang === 'en' ? 'fr' : 'en'}`],
    p?.[`key-words_${lang === 'en' ? 'fr' : 'en'}`]
  ];

  for (const arr of candidates) {
    if (Array.isArray(arr)) return arr.map(String);
  }
  return [];
}

// Normalisation d'un projet (sans récursion)
// Normalisation d'un projet (sans récursion)
function normalizeProject(p, idx = 0){
  const titleFr = String(p?.title_fr ?? p?.titleFr ?? p?.title ?? p?.title_en ?? p?.titleEn ?? 'Sans titre');
  const titleEn = String(p?.title_en ?? p?.titleEn ?? p?.title ?? p?.title_fr ?? p?.titleFr ?? 'Untitled');
  const subtitleFr = String(p?.subtitle_fr ?? p?.subtitleFr ?? p?.subtitle ?? p?.subtitle_en ?? p?.subtitleEn ?? '');
  const subtitleEn = String(p?.subtitle_en ?? p?.subtitleEn ?? p?.subtitle ?? p?.subtitle_fr ?? p?.subtitleFr ?? '');

  const title = titleFr || titleEn || 'Sans titre';
  const subtitle = subtitleFr || subtitleEn || '';

  // clé la plus stable possible :
  // - si tu as un "id" dans projects.json => TOP
  // - sinon fallback title|subtitle (et idx en dernier recours)
  const key =
    p?.id ??
    p?.slug ??
    (subtitle ? `${title}|${subtitle}` : title) ??
    `project-${idx}`;

  const autoColor = stableColorFromKey(`project:${key}`);

  const descriptionFr = p?.description_fr ?? p?.descriptionFr ?? p?.description ?? p?.description_en ?? p?.descriptionEn ?? '';
  const descriptionEn = p?.description_en ?? p?.descriptionEn ?? p?.description ?? p?.description_fr ?? p?.descriptionFr ?? '';
  const detailsFr = p?.details_fr ?? p?.detailsFr ?? p?.longDescription_fr ?? p?.longDescriptionFr ?? p?.details ?? p?.longDescription ?? descriptionFr;
  const detailsEn = p?.details_en ?? p?.detailsEn ?? p?.longDescription_en ?? p?.longDescriptionEn ?? p?.details ?? p?.longDescription ?? descriptionEn;

  const keywordsFr = getProjectKeywordsLocalized({
    ...p,
    keywords: p?.keywords_fr ?? p?.keywordsFr ?? p?.keywords ?? p?.['key-words_fr'] ?? p?.['key-words'],
    'key-words': p?.['key-words_fr'] ?? p?.['key-words'] ?? p?.keywords_fr ?? p?.keywords
  });
  const keywordsEn = getProjectKeywordsLocalized({
    ...p,
    keywords: p?.keywords_en ?? p?.keywordsEn ?? p?.keywords ?? p?.['key-words_en'] ?? p?.['key-words'],
    'key-words': p?.['key-words_en'] ?? p?.['key-words'] ?? p?.keywords_en ?? p?.keywords
  });
  const keywordsDefault = ((p && (p['key-words'] || p.keywords || p.tags)) || []).map(String);

  return {
    id: p?.id ?? null,
    slug: p?.slug ?? null,

    // Champs legacy (compat)
    title,
    subtitle,
    description: descriptionFr || descriptionEn || '',
    details: detailsFr || detailsEn || descriptionFr || descriptionEn || '',
    caption: p?.caption_fr ?? p?.captionFr ?? p?.caption ?? p?.caption_en ?? p?.captionEn ?? '',
    linkLabel: p?.linkLabel_fr ?? p?.linkLabelFr ?? p?.linkLabel ?? p?.linkLabel_en ?? p?.linkLabelEn ?? 'Ouvrir le projet',
    keywords: keywordsDefault.length ? keywordsDefault : (keywordsFr.length ? keywordsFr : keywordsEn),

    // Champs i18n (Sprint 2.1)
    title_fr: titleFr,
    title_en: titleEn,
    subtitle_fr: subtitleFr,
    subtitle_en: subtitleEn,
    description_fr: descriptionFr,
    description_en: descriptionEn,
    details_fr: detailsFr,
    details_en: detailsEn,
    caption_fr: p?.caption_fr ?? p?.captionFr ?? p?.caption ?? '',
    caption_en: p?.caption_en ?? p?.captionEn ?? p?.caption ?? p?.caption_fr ?? p?.captionFr ?? '',
    linkLabel_fr: p?.linkLabel_fr ?? p?.linkLabelFr ?? p?.linkLabel ?? 'Voir le projet',
    linkLabel_en: p?.linkLabel_en ?? p?.linkLabelEn ?? p?.linkLabel ?? p?.linkLabel_fr ?? p?.linkLabelFr ?? 'Open project',
    keywords_fr: keywordsFr.length ? keywordsFr : keywordsDefault,
    keywords_en: keywordsEn.length ? keywordsEn : keywordsDefault,

    // Champs communs
    color: p?.color || autoColor,
    bg: p?.bg || '#fff',
    image: p?.image || null,
    link: p?.link || p?.url || ''
  };
}



// Applique une config lue depuis un fichier
function applyConfig(cfg) {
  try {
    if (cfg.exposure !== undefined) renderer.toneMappingExposure = cfg.exposure;

    if (cfg.env) {
    Object.assign(envState, cfg.env); // on modifie l'objet, pas la référence
    applyDarkIBL();
    } 


    if (cfg.camera?.position) {
      const p = cfg.camera.position;
      camera.position.set(p.x, p.y, p.z);
      camera.updateProjectionMatrix();
    }

    if (cfg.target) {
      spotLight.target.position.set(cfg.target.x, cfg.target.y, cfg.target.z);
      spotLight.target.updateMatrixWorld();
    }

    if (cfg.spot) {
      const s = cfg.spot;
      if (s.intensity !== undefined) spotLight.intensity = s.intensity;
      if (s.angle !== undefined)     spotLight.angle     = s.angle;
      if (s.penumbra !== undefined)  spotLight.penumbra  = s.penumbra;
      if (s.decay !== undefined)     spotLight.decay     = s.decay;
      if (s.distance !== undefined)  spotLight.distance  = s.distance;
      if (s.position) spotLight.position.set(s.position.x, s.position.y, s.position.z);
      spotHelper.update(); shadowCamHelper.update();
    }

    if (cfg.shadows !== undefined) {
      renderer.shadowMap.enabled = cfg.shadows;
      spotLight.castShadow = cfg.shadows;
      shadowCamHelper.visible = (cfg.shadows && (cfg.helpers ?? params?.showHelpers ?? true));
    }

    if (cfg.helpers !== undefined) {
      const on = cfg.helpers;
      if (typeof params?.showHelpers === 'boolean') params.showHelpers = on;
      spotHelper.visible = on;
      shadowCamHelper.visible = on && renderer.shadowMap.enabled;
    }

  /*   // sync GUI si présent
    if (typeof gui !== 'undefined') {
      // met à jour les controllers visibles sans tout recâbler
      (gui.controllers ?? []).forEach(c => c.updateDisplay?.());
      // dossiers spot/IBL si tu as gardé leur ref
    } */
  } catch (e) {
    console.error('Erreur applyConfig:', e);
  }
}

// Télécharge un fichier .json avec la config courante
function downloadConfig() {
  const cfg = getConfig();
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `three-config-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Charge un fichier choisi par l’utilisateur
function openConfigFile() {
  document.getElementById('loadConfig').click();
}

// input file → lecture + apply
document.getElementById('loadConfig').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const json = JSON.parse(text);
    applyConfig(json);
  } catch (err) {
    console.error('Config invalide:', err);
  } finally {
    e.target.value = ''; // reset
  }
});

/* 
// Bouton flottant
const saveBtn = document.getElementById('saveConfig');
saveBtn.addEventListener('click', downloadConfig);
 */
/* 
// Ajoute des actions dans le GUI (si lil-gui est présent)
if (typeof GUI !== 'undefined' && typeof gui !== 'undefined') {
  const actions = {
    '💾 Save to file': downloadConfig,
    '📂 Load from file': openConfigFile
  };
  gui.add(actions, '💾 Save to file');
  gui.add(actions, '📂 Load from file');
} 
  */

// Toggle pour masquer/afficher le bouton flottant : touche K
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'k') {
    saveBtn.classList.toggle('hidden');
  }
});

// --- Raycaster pour l’avatar (clic) -----------------------------
const avatarRaycaster = new THREE.Raycaster();
const avatarMouse = new THREE.Vector2();

function handleAvatarClick() {
  console.log('Avatar cliqué, currentViewIndex  =', currentViewIndex, 'view =', viewKeys[currentViewIndex]);
  

  const currentViewName = viewKeys[currentViewIndex];

  // Si on est en vue backstage → retour direct à l’accordéon
  if (currentViewName === 'backstage') {
    switchToView('accordion');
    return;
  }

  // Sinon, on fait comme la touche "v" : cycle des vues
  cycleView();
}


/* ========================== PUPITRE / PAGES PROJETS ========================== */
/* Dépose ce bloc à la fin de script.js — aucune modif ailleurs n'est requise.  */

// --- Dimensions et matériau "papier"
const A4_RATIO = Math.SQRT2;             // ≈ 1.414 (A4 H/L)
const PAGE_W   =  1.2;                     // largeur d'une feuille (en "m")
const PAGE_H   = PAGE_W * A4_RATIO;       // hauteur
const PAGE_GAP = 0.1;                    // espace entre les deux feuilles
// colle la feuille contre le plateau (négatif = vers l'arrière de la scène)
const PAGE_Z = -2.235;

const PAPER_MAT = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.9, transmission: 0, thickness: 0.01,
  clearcoat: 0.0, side: THREE.FrontSide
});

// --- Génère une texture de page depuis un canvas (texte + image éventuelle)
async function makeProjectTexture(p) {
  const CAN_W = 1024, CAN_H = Math.round(1024 * A4_RATIO);
  const c = document.createElement('canvas'); c.width = CAN_W; c.height = CAN_H;
  const g = c.getContext('2d');

  // fond
  g.fillStyle = p.bg || '#fff';
  g.fillRect(0, 0, CAN_W, CAN_H);

  const pTitle = String(getProjectField(p, 'title', 'Sans titre'));
  const pSubtitle = String(getProjectField(p, 'subtitle', ''));
  const pCaption = String(getProjectField(p, 'caption', ''));
  const pDescription = String(getProjectField(p, 'description', ''));

  // bandeau titre
  g.fillStyle = p.color || '#222';
  g.fillRect(0, 0, CAN_W, 160);
  g.fillStyle = '#fff';
  g.font = 'bold 60px system-ui, Helvetica, Arial'; g.textBaseline = 'middle';
  g.fillText(pTitle, 48, 80);
  if (pSubtitle) { g.font = '32px system-ui, Helvetica, Arial'; g.fillText(pSubtitle, 48, 140); }

  // image (si URL fournie)
  let yAfterImage = 220;
  if (p.image) {
    const img = await new Promise((resolve) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => resolve(im); im.onerror = () => resolve(null);
      im.src = p.image;
    });
    if (img) {
      const pad = 48, iw = CAN_W - pad*2, ih = Math.round(iw * 9/16);
      g.fillStyle = '#f1f1f1'; g.fillRect(pad, 220, iw, ih);
      g.drawImage(img, pad, 220, iw, ih);
      if (pCaption) { g.fillStyle = '#555'; g.font = '24px system-ui'; g.fillText(pCaption, pad, 220 + ih + 36); }
      yAfterImage = 220 + ih + 84;
    }
  }

  // description
  g.fillStyle = '#222'; g.font = '26px system-ui, Helvetica, Arial';
  const pad = 48, maxW = CAN_W - pad*2, lineH = 36;
  const words = pDescription.split(/\s+/);
  let line = '', y = yAfterImage;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > maxW) { g.fillText(line, pad, y); line = w; y += lineH; }
    else line = test;
  }
  if (line) g.fillText(line, pad, y);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

async function setPageTexture(mesh, proj) {
  const tex = await makeProjectTexture(proj);

  const oldMat = mesh.material;
  const oldMap = oldMat?.map;

  const newMat = PAPER_MAT.clone();
  newMat.map = tex;
  newMat.needsUpdate = true;

  mesh.material = newMat;

  if (oldMap) oldMap.dispose();
  if (oldMat) oldMat.dispose();
}

// --- Pupitre simple (pied + plateau incliné)
function createPupitre(){
  const grp = new THREE.Group();

  // fût plus fin
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.5, 20),
    new THREE.MeshStandardMaterial({color:0x222222, roughness:0.7})
  );
  stem.position.y = 0.5;
  stem.castShadow = stem.receiveShadow = true;
  grp.add(stem);

  // base un peu réduite
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.05, 28),
    new THREE.MeshStandardMaterial({color:0x111111, roughness:0.8})
  );
  base.castShadow = base.receiveShadow = true;
  grp.add(base);

  // plateau rectangulaire ultra fin (BoxGeometry pour voir le “dos”)
  const trayThickness = 0.02; // ultra fin
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(PAGE_W*2 + PAGE_GAP*2, PAGE_H + 0.12, trayThickness),
    new THREE.MeshStandardMaterial({color:0x1a1a1a, roughness:0.85, metalness:0.0})
  );
  tray.position.set(0, 1.45, -0.05 - trayThickness*0.5);
  tray.rotation.x = -Math.PI/10;
  tray.castShadow = true;
  tray.receiveShadow = false;
  grp.add(tray);

  grp.position.set(0, 0, -2.2);
  scene.add(grp);
  return grp;
}

const pupitre = createPupitre();

// --- Pages fixes (gauche/droite) + groupe "flip" pour l'animation
function pageMesh(material){
  const geom = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 1, 1);
  const mesh = new THREE.Mesh(geom, material ?? PAPER_MAT.clone());
  mesh.castShadow = true; mesh.receiveShadow = false;
  mesh.rotation.x = -Math.PI/10; // incline comme le plateau
  mesh.position.y = 1.5;
  return mesh;
}
const leftPage  = pageMesh(); leftPage.position.x  = -PAGE_W/2 - PAGE_GAP/2;
const rightPage = pageMesh(); rightPage.position.x =  PAGE_W/2 + PAGE_GAP/2;

leftPage.name = 'leftPage';
rightPage.name = 'rightPage';


// --- ZOOM AU CLIC SUR LES FEUILLES (raycaster)
const pageRaycaster = new THREE.Raycaster();
const pageMouse = new THREE.Vector2();

window.addEventListener('click', (e) => {
  // on ne réagit qu'aux clics sur le canvas 3D
  if (e.target !== canvas && e.target !== renderer.domElement) return;

  const rect = canvas.getBoundingClientRect();
  const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  // 0) Clic sur l’accordéon ?
  if (accordionModel) {
    const accMouse = new THREE.Vector2(ndcX, ndcY);
    const accRay = new THREE.Raycaster();
    accRay.setFromCamera(accMouse, camera);
    const accHits = accRay.intersectObject(accordionModel, true);
    if (accHits.length) {
      handleAccordionClick();
      e.stopPropagation();
      return;
    }
  }

    // 1) Clic sur l’avatar ?
  let avatarTargets = [];

  if (typeof getAvatarModels === 'function') {
    const { stage, backstage, current } = getAvatarModels() || {};

    // priorité à l’avatar actuellement "actif"
    if (current === 'stage' && stage) {
      avatarTargets.push(stage);
    } else if (current === 'backstage' && backstage) {
      avatarTargets.push(backstage);
    } else {
      // fallback : on prend tout ce qu’on a
      if (stage) avatarTargets.push(stage);
      if (backstage) avatarTargets.push(backstage);
    }
  } else {
    // vieux fallback basé sur refreshAvatarRefs
    refreshAvatarRefs();
    if (stageAvatarRoot) avatarTargets.push(stageAvatarRoot);
    if (backstageAvatarRoot) avatarTargets.push(backstageAvatarRoot);
  }

  if (avatarTargets.length) {
    avatarMouse.set(ndcX, ndcY);
    avatarRaycaster.setFromCamera(avatarMouse, camera);
    // s’assure qu’on teste les mêmes layers que la caméra
    avatarRaycaster.layers.mask = camera.layers.mask;

    const avatarHits = avatarRaycaster.intersectObjects(avatarTargets, true);
    if (avatarHits.length) {
      console.log('🎯 Avatar hit détecté:', avatarHits[0]);
      handleAvatarClick();
      e.stopPropagation();
      return;
    }
  }

  // 2) Sinon, comportement existant sur les feuilles du pupitre
  pageMouse.x = ndcX;
  pageMouse.y = ndcY;

  pageRaycaster.setFromCamera(pageMouse, camera);
  const hitList = pageRaycaster.intersectObjects(
    [leftPage, rightPage].filter(p => p.visible),
    true
  );
  if (!hitList.length) return;

  const hitMesh = hitList[0].object === leftPage || hitList[0].object.parent === leftPage
    ? leftPage
    : rightPage;

  const visible = typeof getVisibleProjects === 'function'
    ? getVisibleProjects()
    : projects;

  let proj = null;
  if (hitMesh === leftPage) {
    proj = visible[indexLeft];
  } else {
    proj = visible[indexLeft + 1];
  }
  if (!proj) return;

  openProjectDetail(proj, hitMesh);
});


// colle au pupitre
leftPage.position.z  = PAGE_Z;
rightPage.position.z = PAGE_Z;

scene.add(leftPage, rightPage);

function makeFlipPage(frontTex, backTex){
  const group = new THREE.Group();
  const g = new THREE.PlaneGeometry(PAGE_W, PAGE_H, 1, 1);
  const matFront = PAPER_MAT.clone(); matFront.map = frontTex; matFront.needsUpdate = true;
  const matBack  = PAPER_MAT.clone(); matBack.map  = backTex;  matBack.needsUpdate  = true;

  const front = new THREE.Mesh(g, matFront); front.castShadow = true;
  const back  = new THREE.Mesh(g, matBack);  back.castShadow = true; back.material.side = THREE.BackSide;

  group.add(front); group.add(back);

  group.rotation.x = -Math.PI/10;
  group.position.set(PAGE_W/2 + PAGE_GAP/2, 1.5, PAGE_Z + 0.001); // ~collé
return group;
}
let flipGroup = null;


function disposeObject3D(obj){
  obj.traverse(o=>{
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m=>{
        if (m.map) m.map.dispose();
        m.dispose?.();
      });
    }
  });
}

flipGroup?.removeFromParent();
if (flipGroup) disposeObject3D(flipGroup);
flipGroup = null;

// --- Données & API
const projects = [];     // éléments: {title, subtitle?, color?, bg?, description?, image?, caption?}
let indexLeft = 0;



async function loadProjectsFromJSON(source){
  let arr;
  if (typeof source === 'string') {
    const res = await fetch(source, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    arr = Array.isArray(json) ? json : json.projects;
  } else {
    arr = Array.isArray(source) ? source : source.projects;
  }
  if (!Array.isArray(arr)) throw new Error('Format attendu: array ou { projects: [...] }');

  projects.length = 0;
  arr.forEach((p, i) => projects.push(normalizeProject(p, i)));

  indexLeft = 0;

  // 🆕 Recalcule les filtres à partir des keywords du JSON
  rebuildSkillsFromProjects();
  updateFilteredView();
}



function addProject(p){ projects.push(normalizeProject(p)); rebuildPages(); }
function addProjects(list){ list.forEach(addProject); }

async function rebuildPages(){
  const visible = getVisibleProjects();
  if (visible.length === 0) {
    // aucune page visible → masque
    leftPage.visible = rightPage.visible = false;
    return;
  }
  // clamp de l'index si nécessaire
  if (indexLeft >= visible.length) indexLeft = Math.max(0, visible.length - 1);

  leftPage.visible = true;
  await setPageTexture(leftPage, visible[indexLeft]);

  const hasRight = indexLeft + 1 < visible.length;
  rightPage.visible = hasRight;
  if (hasRight) await setPageTexture(rightPage, visible[indexLeft + 1]);
}


// --- Animation "tourner la page"
let turning = false;

// --- 7) Redéfinition des flips pour s’appuyer sur la liste filtrée
async function turnRight(){
  const visible = getVisibleProjects();
  if (turning) return;
  if (indexLeft + 1 >= visible.length) return;

  const [curRight, nextLeft] = await Promise.all([
    makeProjectTexture(visible[indexLeft+1]),
    makeProjectTexture(visible[indexLeft+2] ?? visible[indexLeft+1])
  ]);

  flipGroup?.removeFromParent();
  flipGroup = makeFlipPage(curRight, nextLeft);
  scene.add(flipGroup);

  turning = true;
  const spineX = PAGE_GAP/2;
  flipGroup.position.x = spineX; flipGroup.position.z = 0.001;

  const D = 420, t0 = performance.now();
  (function anim(){
    if (!flipGroup) return;
    const t = Math.min(1, (performance.now() - t0)/D);
    const k = t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
    flipGroup.rotation.y = -Math.PI * k;
    if (t < 1) requestAnimationFrame(anim);
    else {
      indexLeft = Math.min(indexLeft + 1, visible.length-1);
      rebuildPages(); flipGroup.removeFromParent(); flipGroup = null; turning = false;
    }
  })();
}

async function turnLeft(){
  const visible = getVisibleProjects();
  if (turning) return;
  if (indexLeft <= 0) return;

  const [curLeft, prevLeft] = await Promise.all([
    makeProjectTexture(visible[indexLeft]),
    makeProjectTexture(visible[indexLeft-1])
  ]);

  flipGroup?.removeFromParent();
  flipGroup = makeFlipPage(curLeft, prevLeft);
  scene.add(flipGroup);

  turning = true;
  const spineX = -PAGE_GAP/2;
  flipGroup.position.x = spineX; flipGroup.rotation.y = Math.PI;

  const D = 420, t0 = performance.now();
  (function anim(){
    if (!flipGroup) return;
    const t = Math.min(1, (performance.now() - t0)/D);
    const k = t<.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
    flipGroup.rotation.y = Math.PI - Math.PI * k;
    if (t < 1) requestAnimationFrame(anim);
    else {
      indexLeft = Math.max(indexLeft - 1, 0);
      rebuildPages(); flipGroup.removeFromParent(); flipGroup = null; turning = false;
    }
  })();
}


// --- Charge un JSON local via un bouton (optionnel)
const btnLoadProjects = document.getElementById('loadProjectsBtn');
const inputLoadProjects = document.getElementById('loadProjectsFile');

btnLoadProjects && btnLoadProjects.addEventListener('click', () => inputLoadProjects?.click());
inputLoadProjects && inputLoadProjects.addEventListener('change', async (e) => {
  const f = e.target.files?.[0]; if (!f) return;
  try {
    const text = await f.text();
    const json = JSON.parse(text);
    await loadProjectsFromJSON(json);
  } catch (err) {
    console.error('Projet JSON invalide:', err);
  } finally {
    e.target.value = '';
  }
});

// --- Chargement initial depuis ./projects.json (si présent sur le serveur)
loadProjectsFromJSON('./projects.json').catch(err => {
  console.warn('projects.json non chargé (facultatif):', err);
  console.log('Utilisation de projets de démo intégrés.');
  // Démo fallback si aucun JSON n'est dispo :
  addProjects([
    { title:'Projet A', subtitle:'Prototype', color:'#8a2be2', description:'Pitch court du Projet A. Objectifs, étapes, livrables.' },
    { title:'Projet B', subtitle:'Leather upcycle', color:'#0ea5e9', description:'Couvre-verres en cuir. Coûts, fournisseurs, ratio…' },
    { title:'Projet C', subtitle:'ESP32 WS', color:'#22c55e', description:'Serveur WebSocket + contrôle HTML des IO.' },
    { title:'Projet D', subtitle:'ActionTypes POC', color:'#f59e0b', description:'Protocole d’analyse posturale + vision par ordi.' }
  ]);
   // 🆕 même comportement qu’avec un vrai JSON
  rebuildSkillsFromProjects();
  updateFilteredView();
});
/* ======================== FIN PUPITRE / PAGES PROJETS ======================== */


/* ====================== ZOOM PROJET – PANNEAU UI ====================== */

let projDetailPanel = null;
let projDetailOverlay = null;
let projDetailTitle = null;
let projDetailSubtitle = null;
let projDetailShort = null;
let projDetailLong = null;
let projDetailKeywords = null;
let projDetailLink = null;
let projDetailColorBar = null;
let projDetailCurrentMesh = null;
let projDetailCurrentProject = null;

// Création lazy du panneau et de l'overlay
function ensureProjectDetailUI() {
  if (projDetailPanel) return;

  // overlay
  projDetailOverlay = document.createElement('div');
  projDetailOverlay.id = 'projDetailOverlay';
  projDetailOverlay.style.cssText = `
    position:fixed; inset:0;
    background:rgba(0,0,0,.45);
    opacity:0; pointer-events:none;
    z-index:60; transition:opacity .2s ease;
  `;
  document.body.appendChild(projDetailOverlay);

  // panneau
  projDetailPanel = document.createElement('aside');
  projDetailPanel.id = 'projDetailPanel';
  projDetailPanel.setAttribute('role', 'dialog');
  projDetailPanel.setAttribute('aria-modal', 'true');
  projDetailPanel.style.cssText = `
    position:fixed;
    width:380px; max-width:94vw;
    background:#020617;
    color:#e5e7eb;
    border-radius:14px;
    box-shadow:0 18px 40px rgba(0,0,0,.6);
    padding:14px 16px 16px 16px;
    z-index:61;
    transform-origin:left center;
    opacity:0;
  `;

  projDetailPanel.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
      <div data-role="colorBar" style="
        width:4px;height:32px;border-radius:999px;
        background:#0ea5e9;flex:0 0 auto;"></div>
      <div style="flex:1;min-width:0;">
        <div data-role="title"
          style="font:600 15px system-ui,Segoe UI,Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        </div>
        <div data-role="subtitle"
          style="font:12px system-ui;opacity:.75;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        </div>
      </div>
      <button type="button" data-role="close"
        aria-label="Fermer la fiche projet"
        style="
          border:0;border-radius:999px;padding:4px 6px;cursor:pointer;
          background:#111827;color:#e5e7eb;font-size:13px;flex:0 0 auto;">
        ✕
      </button>
    </div>

    <div data-role="short"
      style="font:12px/1.35 system-ui;opacity:.9;margin-bottom:6px;">
    </div>

    <div data-role="long"
      style="font:12px/1.4 system-ui;margin-bottom:10px;white-space:pre-line;max-height:220px;overflow:auto;">
    </div>

    <div data-role="keywords"
      style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
    </div>

    <a data-role="link" target="_blank" rel="noopener"
      style="
        display:none;align-items:center;justify-content:center;
        font:12px system-ui;font-weight:500;
        background:#0f766e;color:#ecfeff;padding:7px 10px;
        border-radius:999px;text-decoration:none;
        margin-top:2px;">
    </a>
  `;
  document.body.appendChild(projDetailPanel);

  // références
  projDetailTitle = projDetailPanel.querySelector('[data-role="title"]');
  projDetailSubtitle = projDetailPanel.querySelector('[data-role="subtitle"]');
  projDetailShort = projDetailPanel.querySelector('[data-role="short"]');
  projDetailLong = projDetailPanel.querySelector('[data-role="long"]');
  projDetailKeywords = projDetailPanel.querySelector('[data-role="keywords"]');
  projDetailLink = projDetailPanel.querySelector('[data-role="link"]');
  projDetailColorBar = projDetailPanel.querySelector('[data-role="colorBar"]');

  const closeBtn = projDetailPanel.querySelector('[data-role="close"]');
  closeBtn.addEventListener('click', () => closeProjectDetail(true));
  projDetailOverlay.addEventListener('click', () => closeProjectDetail(true));

  // ESC pour fermer
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeProjectDetail(true);
  });
}

// Ouvre le panneau détaillé pour un projet donné
function openProjectDetail(project, pageMesh) {
  ensureProjectDetailUI();
  projDetailCurrentMesh = pageMesh || null;
  projDetailCurrentProject = project || null;

  const p = project || {};
  const pTitle = getProjectField(p, 'title', 'Sans titre');
  const pSubtitle = getProjectField(p, 'subtitle', '');
  const pDescription = getProjectField(p, 'description', '');
  const pDetails = getProjectField(p, 'details', pDescription);
  const pLinkLabel = getProjectField(
    p,
    'linkLabel',
    getPortfolioLangForProjects() === 'en' ? 'Open project' : 'Ouvrir le projet'
  );

  projDetailTitle.textContent = pTitle;
  projDetailSubtitle.textContent = pSubtitle;
  projDetailShort.textContent = pDescription;
  projDetailLong.textContent = pDetails;

  // couleur
  const col = p.color || '#0ea5e9';
  projDetailColorBar.style.background = col;

  // mots-clés
  projDetailKeywords.innerHTML = '';
  getProjectKeywordsLocalized(p).forEach(k => {
    const chip = document.createElement('span');
    chip.textContent = k;
    chip.style.cssText = `
      font:11px system-ui;
      padding:3px 8px;border-radius:999px;
      background:#1f2937;color:#e5e7eb;
    `;
    projDetailKeywords.appendChild(chip);
  });

  // lien
  if (p.link) {
    projDetailLink.style.display = 'flex';
    projDetailLink.href = p.link;
    projDetailLink.textContent = pLinkLabel;
  } else {
    projDetailLink.style.display = 'none';
  }

  // position de départ = centre de la page cliquée (si fourni)
  let startX = innerWidth * 0.5;
  let startY = innerHeight * 0.5;
  if (pageMesh) {
    const wp = new THREE.Vector3();
    pageMesh.getWorldPosition(wp);
    const sp = wp.clone().project(camera);
    startX = (sp.x * 0.5 + 0.5) * innerWidth;
    startY = (-sp.y * 0.5 + 0.5) * innerHeight;
  }

  // position finale (bord droit)
  const panelWidth = 380;
  // place à gauche (marge 20px) — centre vertical approximatif via finalTop
  //const finalLeft = innerWidth - panelWidth - 20;

  const finalLeft = 20;
  const finalTop = innerHeight * 0.18;

  // overlay
  projDetailOverlay.style.pointerEvents = 'auto';
  projDetailOverlay.style.opacity = '1';

  // animation avec GSAP
  gsap.set(projDetailPanel, {
    left: startX,
    top: startY,
    scale: 0.3,
    opacity: 0
  });

  gsap.to(projDetailPanel, {
    duration: 0.45,
    left: finalLeft,
    top: finalTop,
    scale: 1,
    opacity: 1,
    ease: 'power3.out'
  });
}

// Ferme le panneau (et éventuellement anime le retour vers la feuille)
function closeProjectDetail(animateBack) {
  if (!projDetailPanel || projDetailPanel.style.opacity === '0') return;

  let endX = innerWidth * 0.5;
  let endY = innerHeight * 0.5;

  if (animateBack && projDetailCurrentMesh) {
    const wp = new THREE.Vector3();
    projDetailCurrentMesh.getWorldPosition(wp);
    const sp = wp.clone().project(camera);
    endX = (sp.x * 0.5 + 0.5) * innerWidth;
    endY = (-sp.y * 0.5 + 0.5) * innerHeight;
  }

  gsap.to(projDetailPanel, {
    duration: 0.35,
    left: endX,
    top: endY,
    scale: 0.25,
    opacity: 0,
    ease: 'power3.in',
    onComplete: () => {
      projDetailOverlay.style.opacity = '0';
      projDetailOverlay.style.pointerEvents = 'none';
      projDetailCurrentMesh = null;
      projDetailCurrentProject = null;
    }
  });
}

function refreshProjectDetailLanguage() {
  if (!projDetailPanel || !projDetailCurrentProject) return;
  if (projDetailPanel.style.opacity === '0') return;

  const p = projDetailCurrentProject;
  const pTitle = getProjectField(p, 'title', 'Sans titre');
  const pSubtitle = getProjectField(p, 'subtitle', '');
  const pDescription = getProjectField(p, 'description', '');
  const pDetails = getProjectField(p, 'details', pDescription);
  const pLinkLabel = getProjectField(
    p,
    'linkLabel',
    getPortfolioLangForProjects() === 'en' ? 'Open project' : 'Ouvrir le projet'
  );

  if (projDetailTitle) projDetailTitle.textContent = pTitle;
  if (projDetailSubtitle) projDetailSubtitle.textContent = pSubtitle;
  if (projDetailShort) projDetailShort.textContent = pDescription;
  if (projDetailLong) projDetailLong.textContent = pDetails;
  if (projDetailLink && p.link) projDetailLink.textContent = pLinkLabel;

  if (projDetailKeywords) {
    projDetailKeywords.innerHTML = '';
    getProjectKeywordsLocalized(p).forEach(k => {
      const chip = document.createElement('span');
      chip.textContent = k;
      chip.style.cssText = `
      font:11px system-ui;
      padding:3px 8px;border-radius:999px;
      background:#1f2937;color:#e5e7eb;
    `;
      projDetailKeywords.appendChild(chip);
    });
  }
}

/* =================== FIN ZOOM PROJET – PANNEAU UI =================== */



/* ===================== FILTRE COMPÉTENCES (POC – 3 boutons) ===================== */
/* Ajoute ce bloc tel quel en bas du fichier. Il crée l'UI et le filtrage par mots-clés. */

/* ===================== FILTRE COMPÉTENCES (dynamique via projects.json) ===================== */

// --- 1) état des filtres
let AVAILABLE_SKILLS = [];            // sera calculé à partir des projets
const activeFilters = new Set();      // Set<string>

const SKILL_COLLATOR = new Intl.Collator('fr', {
  sensitivity: 'base', // ignore accents/majuscules (é ≈ e, A ≈ a)
  numeric: true        // "Skill 2" avant "Skill 10"
});

function computeSkillsFromProjects() {
  const set = new Set();

  for (const p of projects) {
    const kws = getProjectKeywordsLocalized(p);
    kws.forEach(k => {
      const s = String(k ?? '').trim();
      if (s) set.add(s);
    });
  }

  return [...set].sort((a, b) => SKILL_COLLATOR.compare(a, b));
}


// (re)construit la barre de boutons de filtre à partir d’AVAILABLE_SKILLS
function rebuildSkillsFromProjects() {
  AVAILABLE_SKILLS = computeSkillsFromProjects();

  // On utilise ton conteneur dans le menu du bas
  const container = document.getElementById('filters-container');
  if (!container) return;

  container.innerHTML = '';

  // Si aucune compétence, on masque juste les boutons
  if (AVAILABLE_SKILLS.length === 0) {
    const info = document.createElement('div');
    info.textContent = 'Aucun mot-clé détecté dans projects.json';
    info.style.opacity = '0.6';
    info.style.fontSize = '12px';
    container.appendChild(info);
    return;
  }

  // Si la fonction HTML existe, on l’utilise pour créer les boutons
  if (window.createFilterButtons) {
    window.createFilterButtons(AVAILABLE_SKILLS);
  } else {
    // fallback : on crée nous-mêmes les boutons
    AVAILABLE_SKILLS.forEach(skill => {
      const btn = document.createElement('button');
      btn.className = 'menu-btn filter-btn';
      btn.textContent = skill;
      btn.dataset.skill = skill;
      btn.setAttribute('aria-pressed', 'false');
      container.appendChild(btn);
    });
  }

  // On attache le comportement aux boutons créés
  container.querySelectorAll('.filter-btn').forEach(btn => {
    const skill = btn.dataset.skill || btn.textContent.trim();
    btn.onclick = () => toggleSkill(skill, btn);

    // si un filtre est déjà actif, on reflète l’état
    if (activeFilters.has(skill)) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
    }
  });
}


// Toggle d’un skill (appelé par les boutons)
function toggleSkill(skill, btnEl) {
  const isActive = activeFilters.has(skill);

  if (isActive) {
    activeFilters.delete(skill);
    btnEl.classList.remove('active');
    btnEl.setAttribute('aria-pressed', 'false');
  } else {
    activeFilters.add(skill);
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-pressed', 'true');
  }

  updateFilteredView();
  updateAudioFromFilters(activeFilters); // système audio
}


// Récupère les keywords d’un projet (utile ailleurs)
function getKeywords(proj){
  return getProjectKeywordsLocalized(proj);
}

// Liste des projets visibles selon les filtres actifs
function getVisibleProjects(){
  if (activeFilters.size === 0) return projects;

  const norm = (s) => String(s).toLowerCase().trim();
  const active = new Set([...activeFilters].map(norm));

  return projects.filter(p => {
    const kws = getKeywords(p).map(norm);
    return kws.some(kw => active.has(kw));
  });
}

// Met à jour ce qui est affiché sur le pupitre en fonction du filtre
function updateFilteredView(){
  // on supprime un éventuel flip en cours
  if (typeof flipGroup !== 'undefined' && flipGroup) {
    flipGroup.removeFromParent();
    flipGroup = null;
    if (typeof turning !== 'undefined') turning = false;
  }

  const visible = getVisibleProjects();

  if (visible.length === 0) {
    leftPage.visible = rightPage.visible = false;
    indexLeft = 0;
    return;
  }

  indexLeft = Math.min(indexLeft, visible.length - 1);
  if (indexLeft < 0) indexLeft = 0;

  // rebuildPages() utilise maintenant getVisibleProjects() en interne
  if (typeof rebuildPages === 'function') rebuildPages();

  // (facultatif) debug console
  console.debug('[filter] visibles:', visible.map(p => p.title));
}



// Ajout d’info filtres dans le HUD (sans casser ton affichage existant)
/* (function extendHUD(){
  if (!window.__hudFilterInjected) {
    window.__hudFilterInjected = true;
    const _raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => _raf((t)=>{

      const visible = getVisibleProjects().length;
      const total   = projects.length;
      const targ = spotLight.target.position;

      hud.textContent =
        `cam  : x=${camera.position.x.toFixed(2)} y=${camera.position.y.toFixed(2)} z=${camera.position.z.toFixed(2)}
target: x=${targ.x.toFixed(2)} y=${targ.y.toFixed(2)} z=${targ.z.toFixed(2)}
expo=${renderer.toneMappingExposure.toFixed(2)} spotI=${spotLight.intensity.toFixed(2)} angle=${(spotLight.angle*57.3).toFixed(0)}°
filter: ${visible}/${total} visible  [${[...activeFilters].join(', ')||'—'}]`;

      cb(t);
    });
  }
})(); */


// ========================= FIN FILTRE COMPÉTENCES ========================= */

/* ======================= BOUTONS NAVIGATION ◀ ▶ ======================= */

// Récupère les boutons existants du DOM (créés dans index.html)
const btnPrev_proj = document.getElementById('prevPage');
const btnNext_proj = document.getElementById('nextPage');

// S'ils existent déjà, on les utilise directement
if (btnPrev_proj && btnNext_proj) {
  btnPrev_proj.addEventListener('click', () => { turnLeft();  updatePagerState(); });
  btnNext_proj.addEventListener('click', () => { turnRight(); updatePagerState(); });

  // Stocke les références globales
  window.__pagerPrev = btnPrev_proj;
  window.__pagerNext = btnNext_proj;

  console.log('✓ Boutons navigation trouvés dans le DOM');
} else {
  console.warn('⚠️ Boutons #prevPage ou #nextPage non trouvés dans le DOM');
}

// met à jour l'état activé/désactivé des boutons selon la liste filtrée
function updatePagerState(){
  if (!window.__pagerPrev || !window.__pagerNext) return;
  const visible = (typeof getVisibleProjects === 'function') ? getVisibleProjects() : [];
  const canLeft  = indexLeft > 0;
  const canRight = indexLeft + 1 < visible.length;

  __pagerPrev.disabled = !canLeft;
  __pagerNext.disabled = !canRight;
  __pagerPrev.style.opacity = canLeft  ? '1' : '.4';
  __pagerNext.style.opacity = canRight ? '1' : '.4';
}

// petite mise à jour périodique (au cas où l'état change pendant une anim/filtre)
setInterval(updatePagerState, 200);

// raccourcis clavier
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft'  || e.key === 'PageUp')   { turnLeft();  updatePagerState(); }
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { turnRight(); updatePagerState(); }
});

/* =================== FIN BOUTONS NAVIGATION ◀ ▶ =================== */
/* ======================= PANNEAU LATÉRAL – LISTE PROJETS ======================= */

// --- helpers
function setMouseNDCFromEvent(e){
  const r = renderer.domElement.getBoundingClientRect();
  mouseNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouseNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
}


function snippet(txt, n = 140) {
  const s = String(txt || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function clearFiltersUI() {
  // vide les filtres actifs et remet le style des boutons (s’ils existent)
  if (typeof activeFilters !== 'undefined') {
    activeFilters.clear();
    document.querySelectorAll('#filters-container .filter-btn[aria-pressed="true"]')
  .forEach(b => {
    b.setAttribute('aria-pressed', 'false');
    b.classList.remove('active');
  });
 if (typeof updateFilteredView === 'function') updateFilteredView();
  }
}

// --- création du panneau si absent
(function createProjectDrawer(){
  if (document.getElementById('projDrawer')) return;

  // conteneur off-canvas
  const drawer = document.createElement('aside');
  drawer.id = 'projDrawer';
  drawer.style.cssText = `
    position:fixed; left:0; top:0; height:100vh; width:360px; max-width:91vw;
    transform: translateX(-100%); transition: transform .28s ease;
    background:#0f0f10; color:#eaeaea; z-index:40; box-shadow: 8px 0 24px rgba(0,0,0,.45);
    display:flex; flex-direction:column; border-right:1px solid #262626;
  `;

  // entête
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #262626';
  header.innerHTML = `
    <strong style="font:600 14px system-ui,Segoe UI,Arial">📚 Projets</strong>
    <span id="pdCount" style="margin-left:auto;font:12px/1 monospace;opacity:.8"></span>
    <button id="pdClose" title="Fermer (L)" style="
      margin-left:6px;width:28px;height:28px;border:0;border-radius:6px;cursor:pointer;
      background:#1f1f22;color:#ddd;">✕</button>
  `;
  drawer.appendChild(header);

  // barre options
  const opts = document.createElement('div');
  opts.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #1e1e1e';
  opts.innerHTML = `
    <label style="display:flex;gap:8px;align-items:center;font:12px system-ui">
      <input id="pdOnlyFiltered" type="checkbox">
      <span>Afficher uniquement la sélection filtrée</span>
    </label>
  `;
  drawer.appendChild(opts);

  // liste
  const list = document.createElement('div');
  list.id = 'pdList';
  list.style.cssText = 'overflow:auto; padding:8px 6px 18px 6px; flex:1; scrollbar-gutter: stable;';
  drawer.appendChild(list);

  // bouton d’ouverture (onglet latéral)
  const toggle = document.createElement('button');
  toggle.id = 'toggleListBtn';
  toggle.title = 'Liste des projets (L)';
  toggle.textContent = '≡';
  toggle.style.cssText = `
    position:fixed; left:6px; top:50%; transform:translateY(-50%);
    width:36px;height:56px;border:0;border-radius:8px;cursor:pointer;
    background:#111; color:#fff; z-index:39; box-shadow:0 6px 16px rgba(0,0,0,.35);
  `;

  document.body.appendChild(drawer);
  document.body.appendChild(toggle);

  // ombre/overlay (clic pour fermer)
  const overlay = document.createElement('div');
  overlay.id = 'pdOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:35;
    opacity:0; pointer-events:none; transition:opacity .28s ease;
  `;
  document.body.appendChild(overlay);

  function isOpen(){ return drawer.style.transform === 'translateX(0px)'; }
  function openDrawer(){
    drawer.style.transform = 'translateX(0)'; 
    overlay.style.opacity = '1'; overlay.style.pointerEvents = 'auto';
    refreshProjectDrawer();
  }
  function closeDrawer(){
    drawer.style.transform = 'translateX(-100%)';
    overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none';
  }
  function toggleDrawer(){ isOpen() ? closeDrawer() : openDrawer(); }

  // events
  document.getElementById('pdClose').onclick = closeDrawer;
  overlay.onclick = closeDrawer;
  toggle.onclick = toggleDrawer;
  document.getElementById('pdOnlyFiltered').onchange = () => refreshProjectDrawer();

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'l') toggleDrawer();
  });

  // expose pour rafraîchir au besoin
  window.__openProjectDrawer  = openDrawer;
  window.__closeProjectDrawer = closeDrawer;
  window.__refreshProjectDrawer = refreshProjectDrawer;

  // 1er build
  refreshProjectDrawer();
})();

// --- fabrique/rafraîchit la liste
function refreshProjectDrawer(){
  const list = document.getElementById('pdList');
  const counter = document.getElementById('pdCount');
  const onlyFiltered = document.getElementById('pdOnlyFiltered')?.checked;

  if (!list) return;

  const source = (onlyFiltered && typeof getVisibleProjects === 'function')
    ? getVisibleProjects()
    : projects;

  list.innerHTML = ''; // reset
  counter && (counter.textContent = `${source.length}/${projects.length}`);

  source.forEach((p, idxInSource) => {
    // index réel dans projects (utile si source === getVisibleProjects())
    const realIndex = projects.indexOf(p);

    const card = document.createElement('button');
    card.className = 'pd-card';
    card.style.cssText = `
      display:flex; gap:10px; width:100%; text-align:left; cursor:pointer;
      background:#141416; color:#ddd; border:1px solid #222; border-radius:10px;
      padding:10px; margin:6px 8px; box-shadow:0 2px 10px rgba(0,0,0,.25);
    `;

    // vignette image (si présente)
    const thumb = document.createElement('div');
    thumb.style.cssText = 'width:72px;height:72px;flex:0 0 72px;background:#222;border-radius:8px;overflow:hidden';
    if (p.image) {
      const img = new Image(); img.src = p.image; img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      thumb.appendChild(img);
    }
    card.appendChild(thumb);

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px';
    const title = document.createElement('div');
    const pTitle = getProjectField(p, 'title', 'Sans titre');
    const pSubtitle = getProjectField(p, 'subtitle', '');
    const pDescription = getProjectField(p, 'description', '');
    title.innerHTML = `<strong style="font:600 14px system-ui">${pTitle}</strong>
                       <span style="opacity:.7;margin-left:6px;font:12px system-ui">${pSubtitle||''}</span>`;
    const desc = document.createElement('div');
    desc.style.cssText = 'font:12px/1.35 system-ui;opacity:.85';
    desc.textContent = snippet(pDescription, 140);

    // mots-clés
    const kw = document.createElement('div');
    kw.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    getProjectKeywordsLocalized(p).forEach(k => {
      const b = document.createElement('span');
      b.textContent = k;
      b.style.cssText =
        'font:11px system-ui;background:#1f2937;color:#cbd5e1;padding:3px 6px;border-radius:999px';
      kw.appendChild(b);
    });

    body.appendChild(title);
    body.appendChild(desc);
    body.appendChild(kw);
    card.appendChild(body);

    // clic: on affiche ce projet sur le pupitre
    card.onclick = () => {
      const inFiltered = (typeof getVisibleProjects === 'function')
        ? getVisibleProjects().includes(p)
        : true;

      if (!inFiltered) clearFiltersUI();

      indexLeft = Math.max(0, realIndex);
      if (typeof rebuildPages === 'function') rebuildPages();

      if (typeof window.__closeProjectDrawer === 'function') {
        window.__closeProjectDrawer();
      }

      // ouvre le panneau détaillé (sans animation depuis la feuille → on laisse pageMesh null)
      openProjectDetail(p, null);
    };


    list.appendChild(card);
  });
}

// --- hook: quand la liste visible cha

/* ======================= FIN BOUTONS NAVIGATION ◀ ▶ ======================= */

/* ===================== NOTES FLOTTANTES PAR COMPÉTENCE ===================== */

// groupe pour toutes les notes
const notesGroup = new THREE.Group();
scene.add(notesGroup);

// petite palette par skill (facultatif)
const SKILL_COLORS = {
  '3D':      0x7dd3fc, // bleu clair
  'Design':  0xfca5a5, // rouge clair
  'Hardware':0xa7f3d0  // vert clair
};

// origine: l’accordéon est autour de (0, 0.02, 0)
const NOTE_ORIGIN = new THREE.Vector3(0, 0.2, 0);
// centre d’orbite autour du pupitre (légèrement au-dessus du plateau)
const ORBIT_CENTER = new THREE.Vector3(0, 1.55, -2.2);

// fabrique une “croche” simple (tête + hampe + petit drapeau)
function makeNoteMesh(colorHex = 0xffffff) {
  const g = new THREE.Group();

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 24, 16),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.05, emissive: colorHex, emissiveIntensity: 0.15 })
  );
  head.position.set(0, 0, 0);
  head.castShadow = true; head.receiveShadow = false;
  g.add(head);

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.26, 12),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.05, emissive: colorHex, emissiveIntensity: 0.15 })
  );
  stem.position.set(0.07, 0.13, 0);
  stem.rotation.z = -Math.PI * 0.06;
  stem.castShadow = true;
  g.add(stem);

  const flag = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.05, 0.005),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.05, emissive: colorHex, emissiveIntensity: 0.15 })
  );
  flag.position.set(0.07, 0.26, 0.0);
  flag.rotation.z = -Math.PI * 0.4;
  g.add(flag);

  // une zone “hit” un peu plus large pour le survol
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0.0, transparent: true })
  );
  hit.name = 'note-hit';
  g.add(hit);

  return g;
}

function handleAccordionClick() {
  if (window.audioManager && typeof window.audioManager.playHitChord === 'function') {
    window.audioManager.playHitChord();
  }
}


// création / suppression par skill
function createNoteForSkill(skill){
  // évite doublons
  if (notesGroup.children.find(n => n.userData?.skill === skill)) return;

  //const col = SKILL_COLORS[skill] ?? 0xffffff;
  const hex = stableColorFromKey(`skill:${skill}`, { s: 0.55, l: 0.62 }); // un peu plus lumineux
  const col = parseInt(hex.slice(1), 16);

  const note = makeNoteMesh(col);
  note.userData = {
    skill,
    tSpawn: performance.now(),
    // orbite aléatoire
    radius: 0.9 + Math.random() * 0.6,
    speed:  0.5 + Math.random() * 0.7,   // tours/seconde
    phase:  Math.random() * Math.PI * 2
  };
  // départ : depuis l’accordéon
  note.position.copy(NOTE_ORIGIN);
  notesGroup.add(note);
}

function removeNoteForSkill(skill){
  const n = notesGroup.children.find(n => n.userData?.skill === skill);
  if (!n) return;
  n.removeFromParent();
  n.traverse(o => o.geometry?.dispose?.());
}

// écoute les clics sur les boutons de filtre (après leur propre gestion)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#filters-container .filter-btn');
  if (!btn) return;
  const skill = btn.textContent.trim();
  setTimeout(() => {
    const on = btn.getAttribute('aria-pressed') === 'true';
    if (on) createNoteForSkill(skill);
    else    removeNoteForSkill(skill);
  }, 0);
});


// --- tooltip DOM pour hover sur une note
const noteTip = document.createElement('div');
noteTip.style.cssText = `
  position:fixed; padding:6px 8px; font:12px/1 system-ui; color:#111;
  background:#fef08a; border:1px solid #eab308; border-radius:6px;
  pointer-events:none; transform:translate(-50%,-140%); z-index:45; display:none;
  box-shadow:0 6px 16px rgba(0,0,0,.25);
`;
document.body.appendChild(noteTip);
// Tooltip pour l’avatar (fun facts)
const avatarTip = document.createElement('div');
avatarTip.style.cssText = `
  position:fixed; padding:8px 10px;
  font:12px/1.4 system-ui;
  color:#0f172a;
  background:#e0f2fe;
  border:1px solid #38bdf8;
  border-radius:8px;
  pointer-events:none;
  transform:translate(-50%,-140%);
  z-index:46;
  display:none;
  max-width:260px;
  box-shadow:0 8px 20px rgba(15,23,42,.35);
`;
document.body.appendChild(avatarTip);

let avatarHoverState = {
  hovering: false,
  currentFact: null
};

function showAvatarTip(worldPos) {
  if (!avatarHoverState.currentFact) {
    avatarHoverState.currentFact = getRandomFunFact();
  }
  const { emoji, text } = avatarHoverState.currentFact;
  avatarTip.innerHTML = `<strong style="margin-right:4px">${emoji}</strong>${text}`;

  const p = worldPos.clone().project(camera);
  const x = (p.x * 0.5 + 0.5) * innerWidth;
  const y = (-p.y * 0.5 + 0.5) * innerHeight;

  avatarTip.style.left = `${x}px`;
  avatarTip.style.top  = `${y}px`;
  avatarTip.style.display = 'block';
}

function hideAvatarTip() {
  avatarTip.style.display = 'none';
  avatarHoverState.hovering = false;
  avatarHoverState.currentFact = null;
}


// raycaster “hover”
const noteRay = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();

// on suit la souris
renderer.domElement.addEventListener('pointermove', setMouseNDCFromEvent);

/* window.addEventListener('mousemove', (e) => {
  mouseNDC.x =  (e.clientX / innerWidth)  * 2 - 1;
  mouseNDC.y = -(e.clientY / innerHeight) * 2 + 1;
}); */

// utilitaire: place le tooltip au-dessus d’un point monde
function placeTooltip(worldPos, text){
  const p = worldPos.clone().project(camera);
  const x = (p.x * 0.5 + 0.5) * innerWidth;
  const y = ( -p.y * 0.5 + 0.5) * innerHeight;
  noteTip.textContent = text;
  noteTip.style.left = `${x}px`;
  noteTip.style.top  = `${y}px`;
  noteTip.style.display = 'block';
}

/* // animation des notes + détection hover (hook RAF, comme pour le HUD)
(function hookRAFForNotes(){
  if (window.__notesHooked) return;
  window.__notesHooked = true;

  const _raf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => _raf((t) => {
    // 1) animer les notes
    const now = performance.now();
    notesGroup.children.forEach(n => {
      const u = n.userData;
      const life = Math.min(1, (now - u.tSpawn) / 900); // 0→1 en 0.9 s (éloignement depuis l’accordéon)
      const ang  = u.phase + (now * 0.001 * Math.PI * 2 * u.speed * 0.16);
      const r    = u.radius;
      const bob  = Math.sin(now * 0.003 + u.phase) * 0.06;

      // cible d’orbite
      const ox = ORBIT_CENTER.x + Math.cos(ang) * r;
      const oy = ORBIT_CENTER.y + bob;
      const oz = ORBIT_CENTER.z + Math.sin(ang) * r;

      // interpolation depuis l’origine (spawn)
      n.position.lerpVectors(NOTE_ORIGIN, new THREE.Vector3(ox, oy, oz), life);
      n.lookAt(ORBIT_CENTER.x, ORBIT_CENTER.y, ORBIT_CENTER.z);
    });

    // 2) raycast hover
      noteRay.setFromCamera(mouseNDC, camera);

  // --- Hover notes ------------------------------------------------
  const hits = noteRay.intersectObjects(notesGroup.children, true);
  const noteHit = hits.find(h => h.object.name === 'note-hit');
  if (noteHit) {
    const root = noteHit.object.parent; // le group note
    placeTooltip(root.position, root.userData.skill);
  } else {
    noteTip.style.display = 'none';
  }

  // --- Hover avatar + fun facts -----------------------------------
  let avatarTargets = [];

  if (typeof getAvatarModels === 'function') {
    const { stage, backstage, current } = getAvatarModels() || {};

    if (current === 'stage' && stage) {
      avatarTargets.push(stage);
    } else if (current === 'backstage' && backstage) {
      avatarTargets.push(backstage);
    } else {
      if (stage) avatarTargets.push(stage);
      if (backstage) avatarTargets.push(backstage);
    }
  } else {
    refreshAvatarRefs();
    if (stageAvatarRoot) avatarTargets.push(stageAvatarRoot);
    if (backstageAvatarRoot) avatarTargets.push(backstageAvatarRoot);
  }

  if (avatarTargets.length) {
    // même layers que la caméra, pour éviter les surprises
    noteRay.layers.mask = camera.layers.mask;

    const avatarHits = noteRay.intersectObjects(avatarTargets, true);
    if (avatarHits.length) {
      // remonte jusqu’au group avatar qui porte userData.isAvatar
      let avatarRoot = avatarHits[0].object;
      while (avatarRoot.parent && !avatarRoot.userData?.isAvatar) {
        avatarRoot = avatarRoot.parent;
      }
      const worldPos = new THREE.Vector3();
      avatarRoot.getWorldPosition(worldPos);

      if (!avatarHoverState.hovering) {
        avatarHoverState.hovering = true;
        avatarHoverState.currentFact = getRandomFunFact();
      }
      showAvatarTip(worldPos);
    } else if (avatarHoverState.hovering) {
      hideAvatarTip();
    }
  } else if (avatarHoverState.hovering) {
    hideAvatarTip();
  }


  cb(t);


  });
})(); */
/* =================== RAF HACKS (replaces extendHUD and hookRAFForNotes) =================== */

function updateHUD() {
  const visible = (typeof getVisibleProjects === 'function') ? getVisibleProjects().length : 0;
  const total   = projects?.length ?? 0;
  const targ = spotLight.target.position;


  //hud = document.getElementById('hud');
/*   hud.textContent =
`cam  : x=${camera.position.x.toFixed(2)} y=${camera.position.y.toFixed(2)} z=${camera.position.z.toFixed(2)}
target: x=${targ.x.toFixed(2)} y=${targ.y.toFixed(2)} z=${targ.z.toFixed(2)}
expo=${renderer.toneMappingExposure.toFixed(2)} spotI=${spotLight.intensity.toFixed(2)} angle=${(spotLight.angle*57.3).toFixed(0)}°
filter: ${visible}/${total} visible  [${[...activeFilters].join(', ')||'—'}]`;
 */
}

function updateNotes(now) {
  notesGroup.children.forEach(n => {
    const u = n.userData;
    const life = Math.min(1, (now - u.tSpawn) / 900);
    const ang  = u.phase + (now * 0.001 * Math.PI * 2 * u.speed * 0.16);
    const r    = u.radius;
    const bob  = Math.sin(now * 0.003 + u.phase) * 0.06;

    const ox = ORBIT_CENTER.x + Math.cos(ang) * r;
    const oy = ORBIT_CENTER.y + bob;
    const oz = ORBIT_CENTER.z + Math.sin(ang) * r;

    n.position.lerpVectors(NOTE_ORIGIN, new THREE.Vector3(ox, oy, oz), life);
    n.lookAt(ORBIT_CENTER);
  });
}

function updateHover() {
  noteRay.setFromCamera(mouseNDC, camera);

  // --- Hover notes
  const hits = noteRay.intersectObjects(notesGroup.children, true);
  const noteHit = hits.find(h => h.object.name === 'note-hit');
  if (noteHit) {
    const root = noteHit.object.parent;
    placeTooltip(root.position, root.userData.skill);
  } else {
    noteTip.style.display = 'none';
  }

  // --- Hover avatar (same as your block)
  let avatarTargets = [];
  if (typeof getAvatarModels === 'function') {
    const { stage, backstage, current } = getAvatarModels() || {};
    if (current === 'stage' && stage) avatarTargets.push(stage);
    else if (current === 'backstage' && backstage) avatarTargets.push(backstage);
    else { if (stage) avatarTargets.push(stage); if (backstage) avatarTargets.push(backstage); }
  } else {
    refreshAvatarRefs();
    if (stageAvatarRoot) avatarTargets.push(stageAvatarRoot);
    if (backstageAvatarRoot) avatarTargets.push(backstageAvatarRoot);
  }

  if (avatarTargets.length) {
    noteRay.layers.mask = camera.layers.mask;
    const avatarHits = noteRay.intersectObjects(avatarTargets, true);
    if (avatarHits.length) {
      let avatarRoot = avatarHits[0].object;
      while (avatarRoot.parent && !avatarRoot.userData?.isAvatar) avatarRoot = avatarRoot.parent;

      const worldPos = new THREE.Vector3();
      avatarRoot.getWorldPosition(worldPos);

      if (!avatarHoverState.hovering) {
        avatarHoverState.hovering = true;
        avatarHoverState.currentFact = getRandomFunFact();
      }
      showAvatarTip(worldPos);
    } else if (avatarHoverState.hovering) {
      hideAvatarTip();
    }
  } else if (avatarHoverState.hovering) {
    hideAvatarTip();
  }
}

/* =================== FIN NOTES FLOTTANTES PAR COMPÉTENCE =================== */



// ===== ADVANCED CURTAINS SYSTEM (FIXED) =====

var curtains = null;
var curtainState = 'closed';
var curtainPanels = [];


// Configuration des rideaux - CALCULÉE AUTOMATIQUEMENT
const CURTAIN_CONFIG = {
  stageWidth: 10,              // Largeur totale du stage à couvrir
  centerGap: 5,                // Espacement au centre (min)
  panelWidth: 2,           // Largeur d'UN rideau
  overlap: 0.2,                // Chevauchement quand ouverts (0.3 = 30% de overlap)
  spacing: 0.3,                // Espacement entre rideaux
  spacing_Z: 0.4,             // Espacement vertical entre rideaux (pour effet escalier)
  panelScaleY: 5,            // Hauteur du rideau (appliqué via scale)
  panelScaleZ: 10,            // Profondeur du rideau (appliqué via scale)
  panelScaleX: 5,            // Échelle X (1 = normal, -1 = miroir)
};

// Calcule le nombre de rideaux nécessaires et les positions
function calculateCurtainPositions() {
  const { stageWidth, centerGap, panelWidth, overlap, spacing , spacing_Z} = CURTAIN_CONFIG;
  
  // Demi-largeur couverable (avant le centre)
  const halfWidth = (stageWidth - centerGap) / 2;
  
  // Nombre de rideaux mobiles par côté (arrondi vers le haut)
  const rideauCount = Math.ceil(halfWidth / (panelWidth * (1 - overlap)));
  
  console.log(`📐 Config rideaux:`);
  console.log(`   - Stage width: ${stageWidth}`);
  console.log(`   - Half width à couvrir: ${halfWidth}`);
  console.log(`   - Panel width: ${panelWidth}`);
  console.log(`   - Rideau count par côté: ${rideauCount}`);
  
  CURTAIN_CONFIG.leftCount = rideauCount;
  CURTAIN_CONFIG.rightCount = rideauCount;
  
  return rideauCount;
}

// Charge le modèle GLTF des rideaux
function loadCurtains() {
  const gltfLoader = new GLTFLoader();

  gltfLoader.load('./models/curtains/scene.gltf', (gltf) => {
    const curtainTemplate = gltf.scene.children[0];
    if (!curtainTemplate) {
      console.error('❌ Pas d\'enfant dans la scène GLTF !');
      return;
    }

    // Calcule les positions
    calculateCurtainPositions();

    curtains = new THREE.Group();
    curtains.position.set(0, 0, -6);
    scene.add(curtains);

    const helper = new THREE.BoxHelper(curtains, 0xff0000);
    scene.add(helper);
    console.log('✓ Curtains box helper ajouté');

    createLeftCurtains(curtainTemplate);
    createRightCurtains(curtainTemplate);

    console.log(`✓ Système de rideaux chargé (${curtainPanels.length} panneaux totaux)`);

    // Si l'écran de chargement est déjà terminé, on ouvre les rideaux maintenant
    if (loadingComplete && curtainState !== 'open') {
      openCurtains(2.5);
    }

  },
  undefined,
  (error) => {
    console.error('Erreur chargement rideaux :', error);
  });
}

// Crée les rideaux du côté gauche
function createLeftCurtains(template) {
  const { leftCount, panelWidth, spacing,spacing_Z, overlap, centerGap, panelScaleY, panelScaleZ, panelScaleX } = CURTAIN_CONFIG;
  
  const halfWidth = (30 - centerGap) / 2; // 30 = stageWidth
  const effectiveWidth = panelWidth * (1 - overlap); // Largeur "effective" de chaque rideau

  // Rideau fixe (extrémité gauche - ne bouge pas)
  const fixedLeft = createCurtainPanel(template, 0);
  fixedLeft.position.x = -(halfWidth + panelWidth + spacing);
  fixedLeft.userData.isFixed = true;
  fixedLeft.userData.side = 'left';
  fixedLeft.userData.isMovable = false;
  fixedLeft.scale.y = panelScaleY;
  fixedLeft.scale.z = panelScaleZ;
  fixedLeft.scale.x = panelScaleX; // Normal ou miroir
  curtains.add(fixedLeft);
  curtainPanels.push(fixedLeft);

  console.log(`🎭 Fixed rideau gauche à X: ${fixedLeft.position.x.toFixed(2)}`);

  // Rideaux mobiles (gauche)
  for (let i = 0; i < leftCount; i++) {
    const panel = createCurtainPanel(template, i);
    panel.position.z = i * spacing_Z; // Effet escalier
    // Position FERMÉE : recouvre la moitié gauche (du centre jusqu'à l'extrémité)
    // Les rideaux se superposent légèrement
    const closedX = -centerGap / 2 - effectiveWidth * (i + 1) + (effectiveWidth * overlap * i);
    
    // Position OUVERTE : s'accumulent aux extrémités, superposés avec petit espacement
    const openX = -(halfWidth + panelWidth + spacing + (effectiveWidth  * (1 - overlap)));

    panel.userData.closedX = closedX;
    panel.userData.openX = openX;
    panel.userData.side = 'left';
    panel.userData.isMovable = true;
    panel.userData.isFixed = false;
    panel.position.x = closedX;
    panel.scale.y = panelScaleY;
    panel.scale.z = panelScaleZ;
    panel.scale.x = panelScaleX; // Normal ou miroir
    curtains.add(panel);
    curtainPanels.push(panel);

    console.log(`🎭 Rideau gauche ${i}: fermé=${closedX.toFixed(2)}, ouvert=${openX.toFixed(2)}`);
  }
}

// Crée les rideaux du côté droit
function createRightCurtains(template) {
  const { rightCount, panelWidth, spacing,spacing_Z, overlap, centerGap, panelScaleY ,panelScaleZ, panelScaleX} = CURTAIN_CONFIG;
  
  const halfWidth = (30 - centerGap) / 2;
  const effectiveWidth = panelWidth * (1 - overlap);

  // Rideau fixe (extrémité droite - ne bouge pas)
  const fixedRight = createCurtainPanel(template, 0);
  fixedRight.position.x = halfWidth + panelWidth + spacing;
  fixedRight.userData.isFixed = true;
  fixedRight.userData.side = 'right';
  fixedRight.userData.isMovable = false;
  fixedRight.scale.x = -1; // Flip horizontal
  fixedRight.scale.y = panelScaleY;
  fixedRight.scale.z = panelScaleZ;
  fixedRight.scale.x *= panelScaleX; // Normal ou miroir
  curtains.add(fixedRight);
  curtainPanels.push(fixedRight);

  console.log(`🎭 Fixed rideau droit à X: ${fixedRight.position.x.toFixed(2)}`);

  // Rideaux mobiles (droite)
  for (let i = 0; i < rightCount; i++) {
    const panel = createCurtainPanel(template, i);
    panel.position.z = i * spacing_Z; // Effet escalier
    // Position FERMÉE : recouvre la moitié droite
    const closedX = centerGap / 2 + effectiveWidth * (i + 1) - (effectiveWidth * overlap * i);
    
    // Position OUVERTE : s'accumulent aux extrémités, superposés
   // Position OUVERTE : s'accumulent aux extrémités, superposés (à l'envers pour la droite)
    const openX = halfWidth + panelWidth + spacing + (effectiveWidth  * (1 - overlap));


    panel.userData.closedX = closedX;
    panel.userData.openX = openX;
    panel.userData.side = 'right';
    panel.userData.isMovable = true;
    panel.userData.isFixed = false;
    panel.position.x = closedX;
    panel.scale.x = -1;
    panel.scale.y = panelScaleY;
    panel.scale.z = panelScaleZ;
    panel.scale.x *= panelScaleX; // Normal ou miroir
    curtains.add(panel);
    curtainPanels.push(panel);

    console.log(`🎭 Rideau droit ${i}: fermé=${closedX.toFixed(2)}, ouvert=${openX.toFixed(2)}`);
  }
}

// Crée un panneau de rideau individuel
function createCurtainPanel(template, index) {
  const panel = template.clone();
  
  panel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  panel.userData.panelIndex = index;
  return panel;
}



// Ouvre tous les rideaux
function openCurtains(duration = 4) {
  // ✅ Si les rideaux ne sont pas encore chargés, on ne change PAS l'état
  if (!curtainPanels.length) {
    console.warn('openCurtains() : rideaux pas encore chargés, on réessaiera plus tard.');
    return;
  }

  if (curtainState === 'open' || curtainState === 'opening') return;
  curtainState = 'opening';

  curtainPanels.forEach((panel) => {
    if (!panel.userData.isMovable) return;

    gsap.to(panel.position, {
      x: panel.userData.openX,
      duration: duration,
      ease: 'power2.inOut',
      onComplete: () => {
        if (panel === curtainPanels[curtainPanels.length - 1]) {
          curtainState = 'open';
          console.log('✓ Rideaux ouverts');
        }
      }
    });
  });
}

// Ferme tous les rideaux
function closeCurtains(duration = 4) {
  if (curtainState === 'closed' || curtainState === 'closing') return;
  curtainState = 'closing';

  curtainPanels.forEach((panel) => {
    if (!panel.userData.isMovable) return;

    gsap.to(panel.position, {
      x: panel.userData.closedX,
      duration: duration,
      ease: 'power2.inOut',
      onComplete: () => {
        if (panel === curtainPanels[curtainPanels.length - 1]) {
          curtainState = 'closed';
          console.log('✓ Rideaux fermés');
        }
      }
    });
  });
}

// Toggle ouvert/fermé
function toggleCurtains() {
  if (curtainState === 'open' || curtainState === 'opening') {
    closeCurtains(3);
  } else if (curtainState === 'closed' || curtainState === 'closing') {
    openCurtains(3);
  }
}


// ===== END ADVANCED CURTAINS SYSTEM =====



function setupCurtainButtons() {
  const openBtn = document.getElementById('curtain-open-btn');
  if (openBtn) openBtn.addEventListener('click', () => openCurtains(4));

  const closeBtn = document.getElementById('curtain-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => closeCurtains(4));

  const toggleBtn = document.getElementById('curtain-toggle-btn');
  if (toggleBtn) toggleBtn.addEventListener('click', () => toggleCurtains());
}


// Appelé dans ton init principal de scène
function initCurtains() {
  loadCurtains();
  // Configure les boutons une fois la page chargée
  setTimeout(() => {
    setupCurtainButtons();
  }, 500);
  
}

(async () => {
  // Initialise le système backstage AVEC callbacks qui pilotent l'IBL sombre
  backstageSystem = await initBackstageSystem(scene, camera, renderer, {
    controls: controls,
    onFocusStart: () => lighting.handleBackstageFocusStart(),
    onFocusEnd: () => lighting.handleBackstageFocusEnd()
  });

  console.log('✓ Système backstage prêt !');

  // On enregistre ses lumières dans le système de lights global
  if (backstageSystem && backstageSystem.backstageLights) {
    lighting.registerBackstageLights(backstageSystem.backstageLights);
  } else {
    console.warn('⚠️ BackstageSystem ne fournit pas "backstageLights"');
  }

  // Anchor avatar backstage
  backstageAvatarAnchor = new THREE.Object3D();
  if (backstageSystem && backstageSystem.backstageGroup) {
    backstageSystem.backstageGroup.add(backstageAvatarAnchor);
    backstageAvatarAnchor.position.set(0, 1.8, 1);
  } else {
    scene.add(backstageAvatarAnchor);
    backstageAvatarAnchor.position.set(0, 1.8, -10);
  }

  console.log('🎭 Anchor avatar backstage créé');
})();

// Dans script.js, après que backstageSystem soit initialisé
const guidedTour = new GuidedTour(scene, camera, renderer, controls);
window.guidedTour = guidedTour; // Pour y accéder globalement
document.getElementById('restart-tour-btn')?.addEventListener('click', () => {
  localStorage.removeItem('portfolioTourSeen');
  guidedTour.start();
});



initCurtains();
// ===== UTILISATION =====
// Ajoute ces boutons dans ton HTML :
/*
<button id="curtain-open-btn">Ouvrir Rideaux</button>
<button id="curtain-close-btn">Fermer Rideaux</button>
<button id="curtain-toggle-btn">Toggle Rideaux</button>
*/

// Appelle initCurtains() dans ta fonction d'initialisation globale, après avoir créé la scène et la caméra
// Exemple :
// initScene(); // ta fonction perso
// initCurtains(); // charge et active rideaux

// ==================


/* ======================== AIDE RAPIDE / TUTORIEL ======================== */

// ...existing code...
// Insert improved quick-help setup here (runs after all other UI created)
(function setupQuickHelpAtEnd() {
  // If full set exists, do nothing
  const btn = document.getElementById('quickHelpBtn');
  const panel = document.getElementById('quickHelpPanel');
  const overlay = document.getElementById('quickHelpOverlay');
  if (btn && panel && overlay) {
    console.log('quickHelp: already present');
    return;
  }

  // Remove any partial/stale elements so we recreate a clean UI
  if (btn && (!panel || !overlay)) { console.warn('quickHelp: removing stale button'); btn.remove(); }
  if (panel && (!btn || !overlay)) { console.warn('quickHelp: removing stale panel'); panel.remove(); }
  if (overlay && (!btn || !panel)) { console.warn('quickHelp: removing stale overlay'); overlay.remove(); }

  // --- Floating help button ---
  const helpBtn = document.createElement('button');
  helpBtn.id = 'quickHelpBtn';
  helpBtn.type = 'button';
  helpBtn.textContent = '?';
  helpBtn.title = 'Afficher le guide rapide';
  helpBtn.setAttribute('aria-label', 'Afficher le guide rapide');
  helpBtn.style.cssText = `
    position:fixed;
    left:120px;
    bottom:12px;
    width:40px;height:40px;border-radius:999px;border:0;cursor:pointer;
    z-index:10005;background:#111827;color:#e5e7eb;font:20px/40px system-ui;
    text-align:center;box-shadow:0 8px 28px rgba(0,0,0,.65);
  `;
  document.body.appendChild(helpBtn);

  // --- Overlay + panel ---
  const ov = document.createElement('div');
  ov.id = 'quickHelpOverlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10001;display:none;pointer-events:auto;';
  const pn = document.createElement('section');
  pn.id = 'quickHelpPanel';
  pn.setAttribute('role','dialog'); pn.setAttribute('aria-modal','true'); pn.setAttribute('aria-label','Guide rapide de navigation');
  pn.style.cssText = `
    position:fixed; right:16px; top:16px; width:380px; max-width:94vw; max-height:80vh; overflow:auto;
    background:#020617; color:#e5e7eb; border-radius:14px; box-shadow:0 28px 60px rgba(0,0,0,.75);
    padding:14px 16px 16px 16px; z-index:10002; font:12px/1.45 system-ui; display:none;
  `;
  pn.innerHTML = `
    <header style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <div style="font-size:16px;">🎭 Guide express</div>
      <button type="button" id="quickHelpClose" aria-label="Fermer le guide"
              style="margin-left:auto;width:26px;height:26px;border-radius:999px;border:0;cursor:pointer;background:#111827;color:#e5e7eb;font-size:14px;">✕</button>
    </header>
    <div style="font-size:11px;opacity:.85;margin-bottom:6px;">Quelques repères pour explorer la scène et les projets.</div>
    <ol style="padding-left:18px;margin:0;">
      <li style="margin-bottom:6px;"><strong>Caméra</strong> : clic gauche + souris pour tourner, molette pour zoomer.</li>
      <li style="margin-bottom:6px;"><strong>Changer de vue</strong> : bouton en haut à droite ou touche <b>V</b>.</li>
      <li style="margin-bottom:6px;"><strong>Avatar</strong> : survol = fun fact, clic = changer de vue.</li>
      <li style="margin-bottom:6px;"><strong>Pupitre &amp; projets</strong> : clic sur une page =&gt; fiche détaillée.</li>
      <li style="margin-bottom:6px;"><strong>Filtres compétences</strong> : boutons en bas filtrent les projets.</li>
      <li style="margin-bottom:0;"><strong>Liste complète</strong> : bouton <b>≡</b> à gauche ouvre la liste.</li>
    </ol>
    <div style="margin-top:10px;font-size:11px;opacity:.7;">Astuce : commence par Entrée → Pupitre → Backstage.</div>
  `;
  document.body.appendChild(ov);
  document.body.appendChild(pn);

  function openHelp() { ov.style.display = 'block'; pn.style.display = 'block'; }
  function closeHelp() { ov.style.display = 'none'; pn.style.display = 'none'; }
  function toggleHelp() { const vis = pn.style.display === 'block'; vis ? closeHelp() : openHelp(); }

  helpBtn.addEventListener('click', () => { console.log('quickHelp: helpBtn clicked'); toggleHelp(); });
  const closeBtn = document.getElementById('quickHelpClose');
  if (closeBtn) closeBtn.addEventListener('click', closeHelp);
  ov.addEventListener('click', closeHelp);

  // Auto-show once
  const HELP_KEY = 'quickHelp_seen_v1';
  if (!localStorage.getItem(HELP_KEY)) { openHelp(); localStorage.setItem(HELP_KEY, '1'); }

  console.log('quickHelp: initialized at end of script');
})();




/* ==================== FIN AIDE RAPIDE / TUTORIEL ==================== */


// ============ fin curtains system ==================


(async () => {
  await initializeAudioSystem(camera);  // ✅ Ajouter (camera)
  console.log('✓ Système audio accordéon prêt (version anti-dissonance)');
  console.log('✓ Audio V2 prêt');
})();


const muteBtn = document.getElementById('audio-mute-btn');
if (muteBtn) {
  muteBtn.addEventListener('click', () => {
    if (!window.audioManager) return;
    const newMuted = !window.audioManager.isMuted;
    window.audioManager.setMuted(newMuted);
    muteBtn.textContent = newMuted ? '🔇 Audio OFF' : '🔊 Audio ON';
    muteBtn.setAttribute('aria-pressed', newMuted ? 'true' : 'false');
  });
}




// --- HUD update + render loop
function animate() {
const delta = clock.getDelta();
const now = performance.now();
//console.log('delta',delta);

  // --- le reste de ta fonction animate inchangé ---
  if (backstageSystem) {
    backstageSystem.update(delta);
  }
  if (accordionMixer) {
    accordionMixer.update(delta);
  }

  updateBackstageHelpers();
  updateNotes(now);
  updateHover();
  updateHUD();

  
  controls.update();

  /* const t = spotLight.target.position;
  hud.textContent =
    `cam  : x=${camera.position.x.toFixed(2)} y=${camera.position.y.toFixed(2)} z=${camera.position.z.toFixed(2)}
target: x=${t.x.toFixed(2)} y=${t.y.toFixed(2)} z=${t.z.toFixed(2)}
expo=${renderer.toneMappingExposure.toFixed(2)} spotI=${spotLight.intensity.toFixed(2)} angle=${(spotLight.angle*57.3).toFixed(0)}°`;
 */
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}


animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* // Attends que tout soit chargé
setTimeout(() => {
  if (!localStorage.getItem('portfolioTourSeen')) {
    guidedTour.start();
  }
}, 1500); */



/* ===== SPRINT 2 — i18n deep texts (script.js) ===== */
(function setupSprint2ScriptI18n() {
  const PF_S2 = {
    getLang() {
      try {
        if (window.portfolioI18n && typeof window.portfolioI18n.getLang === 'function') {
          return window.portfolioI18n.getLang() || 'fr';
        }
      } catch (_) {}
      const htmlLang = document.documentElement?.dataset?.lang || document.documentElement?.lang || '';
      return (String(htmlLang).toLowerCase().startsWith('en')) ? 'en' : 'fr';
    },
    txt() {
      const lang = this.getLang();
      return this.copy[lang] || this.copy.fr;
    },
    copy: {
      fr: {
        funFacts: [
          { emoji: '💻', text: 'Intègre des capteurs Arduino dans Unity pour des projets IoT gaming' },
          { emoji: '🎲', text: 'Amateur de campagnes JDR — le game design narratif inspire mes interfaces' },
          { emoji: '🔬', text: 'Chercheur à l’IFT De Vinci Lab en bio-optique et systèmes embarqués' },
          { emoji: '🎮', text: 'Débugge en speedrunning des jeux — l’optimisation est partout' },
          { emoji: '🎵', text: 'Choriste — la coordination d’équipe s’apprend aussi en musique' },
          { emoji: '🪗', text: 'A décroché un CEM d’accordéon et adore mixer code et musique' },
          { emoji: '🤖', text: 'Prototype une IA qui lit la posture et le mouvement en temps réel' },
          { emoji: '🐝', text: 'Imagine des systèmes IA pour les ruches autant que pour les labos' }
        ],
        loading: [
          'Chargement de la scène – réveil des circuits…',
          'Chargement de la scène – accordage des instruments virtuels…',
          'Chargement de la scène – calibration des micros et capteurs…',
          'Chargement de la scène – routage audio et bus d’effets…',
          'Chargement de la scène – synchronisation moteur 3D et tempo…',
          'Chargement de la scène – derniers tests de sécurité…',
          'Scène prête – ouverture du rideau !'
        ],
        tour: {
          stepLabel: 'Étape',
          prev: '← Précédent',
          next: 'Suivant →',
          finish: 'Terminer',
          skip: '✕ Ignorer',
          steps: {
            welcomeTitle: 'Bienvenue 👋',
            welcomeDesc: 'Petit tour des commandes : caméra, vues, projets, filtres (et sons), puis backstage.\nTu peux à tout moment quitter avec “Ignorer”.',
            dragTitle: 'Drag & See 🖱️',
            dragDesc: 'Clic-gauche + drag : tourne autour de la scène.\nMolette : zoom.\n(OrbitControls)',
            changeViewTitle: 'Changer de vue 🎬',
            changeViewDesc: 'Bouton en haut à droite (ou touche V) : Entrée → Accordéon → Pupitre → Backstage.',
            accTitle: 'Accordéon = musique 🪗',
            accDesc: 'Clique l’accordéon : il joue un accord.\nC’est un objet interactif (audio).',
            deskTitle: 'Pupitre : projets 📚',
            deskDesc: 'Les pages du pupitre affichent les projets.\nClique une page → fiche détail sur le côté.',
            pagerTitle: 'Changer de projet ◀ ▶',
            pagerDesc: 'Utilise les boutons Précédent/Suivant (ou flèches clavier) pour tourner les pages.',
            filtersTitle: 'Filtres (et sons) 🎛️',
            filtersDesc: 'Ouvre le drawer du bas “Filtres & Contrôles”, active un filtre :\nça filtre les projets ET ça active des sons (notes en orbite).',
            audioTitle: 'Audio 🔊',
            audioDesc: 'Bouton audio : coupe/remet le son quand tu veux.',
            listTitle: 'Liste projets (drawer gauche) ≡',
            listDesc: 'Le bouton ≡ à gauche ouvre la liste complète :\naccès rapide à un projet + ouverture de la fiche.',
            backstageTitle: 'Backstage 🎭',
            backstageDesc: 'Passe backstage : certains objets se survolent et se cliquent\npour obtenir plus d’infos (focus lumière / détails).',
            cvTitle: 'CV / À propos 📄',
            cvDesc: 'Optionnel : clique le livre “CV” au centre de la scène pour voir mon profil et mes infos.',
            avatarTitle: 'Avatar backstage 😄',
            avatarDesc: 'Survole l’avatar : fun fact.\nClique : changement de scène (et en backstage, clic → retour accordéon).',
            endTitle: 'C’est à toi ! 🚀',
            endDesc: 'Tu peux relancer ce tutoriel via le bouton “🎓 Tutoriel”.\nBon parcours !'
          }
        },
        quickHelp: {
          buttonTitle: 'Afficher le guide rapide',
          buttonAria: 'Afficher le guide rapide',
          panelTitle: '🎭 Guide express',
          panelCloseAria: 'Fermer le guide',
          intro: 'Quelques repères pour explorer la scène et les projets.',
          items: [
            '<strong>Caméra</strong> : clic gauche + souris pour tourner, molette pour zoomer.',
            '<strong>Changer de vue</strong> : bouton en haut à droite ou touche <b>V</b>.',
            '<strong>Avatar</strong> : survol = fun fact, clic = changer de vue.',
            '<strong>Pupitre &amp; projets</strong> : clic sur une page =&gt; fiche détaillée.',
            '<strong>Filtres compétences</strong> : boutons en bas filtrent les projets.',
            '<strong>Liste complète</strong> : bouton <b>≡</b> à gauche ouvre la liste.'
          ],
          tip: 'Astuce : commence par Entrée → Pupitre → Backstage.'
        },
        viewNames: {
          entrance: "🎬 Vue d'entrée",
          accordion: '🪗 Accordéon',
          desk: '📚 Pupitre',
          backstage: '🎭 Backstage'
        }
      },
      en: {
        funFacts: [
          { emoji: '💻', text: 'Builds Arduino sensor integrations in Unity for IoT/game prototypes' },
          { emoji: '🎲', text: 'Tabletop RPG fan — narrative game design inspires my interfaces' },
          { emoji: '🔬', text: 'Research at IFT De Vinci Lab (bio-optics & embedded systems)' },
          { emoji: '🎮', text: 'Debugs like a speedrunner — optimization mindset everywhere' },
          { emoji: '🎵', text: 'Choir singer — timing and teamwork trained through music' },
          { emoji: '🪗', text: 'Earned an advanced accordion diploma and loves mixing code + music' },
          { emoji: '🤖', text: 'Prototyping AI for real-time posture and movement analysis' },
          { emoji: '🐝', text: 'Imagines AI systems for beehives as much as for labs' }
        ],
        loading: [
          'Loading scene – waking up the circuits…',
          'Loading scene – tuning virtual instruments…',
          'Loading scene – calibrating microphones and sensors…',
          'Loading scene – routing audio and effect buses…',
          'Loading scene – syncing the 3D engine and tempo…',
          'Loading scene – final safety checks…',
          'Scene ready – curtain up!'
        ],
        tour: {
          stepLabel: 'Step',
          prev: '← Previous',
          next: 'Next →',
          finish: 'Finish',
          skip: '✕ Skip',
          steps: {
            welcomeTitle: 'Welcome 👋',
            welcomeDesc: 'Quick tour of the controls: camera, views, projects, filters (and sounds), then backstage.\nYou can leave anytime with “Skip”.',
            dragTitle: 'Drag & See 🖱️',
            dragDesc: 'Left-click + drag: orbit around the scene.\nMouse wheel: zoom.\n(OrbitControls)',
            changeViewTitle: 'Change view 🎬',
            changeViewDesc: 'Top-right button (or V key): Entrance → Accordion → Desk → Backstage.',
            accTitle: 'Accordion = music 🪗',
            accDesc: 'Click the accordion: it plays a chord.\nIt is an interactive audio object.',
            deskTitle: 'Desk: projects 📚',
            deskDesc: 'The desk pages display projects.\nClick a page → detailed panel opens on the side.',
            pagerTitle: 'Change project ◀ ▶',
            pagerDesc: 'Use the Previous/Next buttons (or keyboard arrows) to turn pages.',
            filtersTitle: 'Filters (and sounds) 🎛️',
            filtersDesc: 'Open the bottom “Filters & Controls” drawer and activate a filter:\nit filters projects AND triggers sounds (orbiting notes).',
            audioTitle: 'Audio 🔊',
            audioDesc: 'Audio button: mute/unmute whenever you want.',
            listTitle: 'Project list (left drawer) ≡',
            listDesc: 'The ≡ button on the left opens the full list:\nquick access to a project + detail panel.',
            backstageTitle: 'Backstage 🎭',
            backstageDesc: 'Go backstage: some objects can be hovered and clicked\nto reveal more info (light focus / details).',
            cvTitle: 'CV / About 📄',
            cvDesc: 'Optional: click the “CV” book in the center to see my profile and info.',
            avatarTitle: 'Backstage avatar 😄',
            avatarDesc: 'Hover the avatar: fun fact.\nClick: change scene (and in backstage, click → back to accordion).',
            endTitle: 'Your turn! 🚀',
            endDesc: 'You can restart this tutorial with the “🎓 Tutorial” button.\nEnjoy exploring!'
          }
        },
        quickHelp: {
          buttonTitle: 'Show quick guide',
          buttonAria: 'Show quick guide',
          panelTitle: '🎭 Quick guide',
          panelCloseAria: 'Close guide',
          intro: 'A few landmarks to explore the scene and projects.',
          items: [
            '<strong>Camera</strong>: left click + drag to orbit, mouse wheel to zoom.',
            '<strong>Change view</strong>: top-right button or <b>V</b> key.',
            '<strong>Avatar</strong>: hover = fun fact, click = switch view.',
            '<strong>Desk &amp; projects</strong>: click a page =&gt; detailed panel.',
            '<strong>Skill filters</strong>: bottom buttons filter projects.',
            '<strong>Full list</strong>: left <b>≡</b> button opens the project list.'
          ],
          tip: 'Tip: start with Entrance → Desk → Backstage.'
        },
        viewNames: {
          entrance: '🎬 Entrance View',
          accordion: '🪗 Accordion',
          desk: '📚 Desk',
          backstage: '🎭 Backstage'
        }
      }
    }
  };

  function pfS2Copy() { return PF_S2.txt(); }

  // Override fun facts getter with current language
  getRandomFunFact = function () {
    const facts = pfS2Copy().funFacts || PF_S2.copy.fr.funFacts;
    return facts[Math.floor(Math.random() * facts.length)];
  };

  // Override loading messages with current language
  getLoadingMessage = function (progress) {
    const msgs = pfS2Copy().loading || PF_S2.copy.fr.loading;
    if (progress < 10) return msgs[0];
    if (progress < 25) return msgs[1];
    if (progress < 40) return msgs[2];
    if (progress < 60) return msgs[3];
    if (progress < 80) return msgs[4];
    if (progress < 100) return msgs[5];
    return msgs[6];
  };

  // Keep camera view labels synced with language (script.js source of truth)
  function applyViewNamesFromLang() {
    if (typeof CAMERA_VIEWS !== 'object') return;
    const vn = pfS2Copy().viewNames || PF_S2.copy.fr.viewNames;
    if (CAMERA_VIEWS.entrance) CAMERA_VIEWS.entrance.name = vn.entrance;
    if (CAMERA_VIEWS.accordion) CAMERA_VIEWS.accordion.name = vn.accordion;
    if (CAMERA_VIEWS.desk) CAMERA_VIEWS.desk.name = vn.desk;
    if (CAMERA_VIEWS.backstage) CAMERA_VIEWS.backstage.name = vn.backstage;
    try { if (typeof updateViewButtonText === 'function') updateViewButtonText(); } catch (_) {}
  }

  // Monkey-patch GuidedTour buttons + translated steps
  if (typeof GuidedTour !== 'undefined') {
    GuidedTour.prototype.updatePanel = function(step) {
      const copy = pfS2Copy().tour || PF_S2.copy.fr.tour;
      const stepNum = this.currentStep + 1;
      const totalSteps = this.getTourSteps().length;
      const isLast = this.currentStep === totalSteps - 1;

      this.tourPanel.innerHTML = `
        <div style="margin-bottom: 12px; font-size: 12px; color: #0ea5e9;">
          ${copy.stepLabel} ${stepNum} / ${totalSteps}
        </div>
        <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600;">
          ${step.title}
        </h3>
        <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.5; color: #ddd; white-space: pre-line;">
          ${step.description}
        </p>
        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          ${this.currentStep > 0 ? `
            <button class="tour-btn-prev" style="
              padding: 8px 16px;
              background: rgba(102, 102, 102, 0.6);
              color: white;
              border: 1px solid rgba(255, 255, 255, 0.2);
              border-radius: 6px;
              cursor: pointer;
              font-size: 13px;
              transition: all 0.2s;
            ">
              ${copy.prev}
            </button>
          ` : ''}
          <button class="tour-btn-next" style="
            padding: 8px 16px;
            background: #0ea5e9;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 600;
            transition: all 0.2s;
          ">
           ${isLast ? copy.finish : copy.next}
          </button>
          <button class="tour-btn-close" style="
            padding: 8px 16px;
            background: rgba(102, 102, 102, 0.6);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
          ">
            ${copy.skip}
          </button>
        </div>
      `;

      const btnNext = this.tourPanel.querySelector('.tour-btn-next');
      const btnPrev = this.tourPanel.querySelector('.tour-btn-prev');
      const btnClose = this.tourPanel.querySelector('.tour-btn-close');

      btnNext.onclick = () => (isLast ? this.finish() : this.next());
      if (btnPrev) btnPrev.onclick = () => this.prev();
      btnClose.onclick = () => this.stop();

      this.tourPanel.style.display = 'block';
    };

    GuidedTour.prototype.getTourSteps = function() {
      const V = CAMERA_VIEWS;
      const T = (pfS2Copy().tour || PF_S2.copy.fr.tour).steps;

      return [
        {
          title: T.welcomeTitle,
          description: T.welcomeDesc,
          placement: 'center',
          onEnter: () => {
            window.setBottomMenuOpen?.(false);
            window.__closeProjectDrawer?.();
            if (typeof closeProjectDetail === 'function') closeProjectDetail(false);
            if (typeof switchToView === 'function') switchToView('entrance');
          },
          cameraPosition: V.entrance.position,
          cameraTarget: V.entrance.target
        },
        {
          title: T.dragTitle,
          description: T.dragDesc,
          cameraPosition: null,
          cameraTarget: null
        },
        {
          title: T.changeViewTitle,
          description: T.changeViewDesc,
          ui: '#view-cycle-btn',
          anchor: '#view-cycle-btn',
          placement: 'center',
          cameraPosition: null,
          cameraTarget: null
        },
        {
          title: T.accTitle,
          description: T.accDesc,
          objectName: "accordionModel",
          onEnter: () => switchToView('accordion'),
          cameraPosition: V.accordion.position,
          cameraTarget: V.accordion.target
        },
        {
          title: T.deskTitle,
          description: T.deskDesc,
          objectName: "leftPage",
          onEnter: () => {
            switchToView('desk');
            window.__closeProjectDrawer?.();
          },
          cameraPosition: V.desk.position,
          cameraTarget: V.desk.target
        },
        {
          title: T.pagerTitle,
          description: T.pagerDesc,
          ui: ['#pager', '#prevPage', '#nextPage'],
          anchor: '#pager',
          placement: 'center',
          cameraPosition: V.desk.position,
          cameraTarget: V.desk.target
        },
        {
          title: T.filtersTitle,
          description: T.filtersDesc,
          ui: ['#menu-toggle-btn', '#bottom-menu', '#filters-container'],
          anchor: '#filters-container',
          placement: 'top',
          onEnter: () => window.setBottomMenuOpen?.(true),
          cameraPosition: V.desk.position,
          cameraTarget: V.desk.target
        },
        {
          title: T.audioTitle,
          description: T.audioDesc,
          ui: '#audio-mute-btn',
          anchor: '#audio-mute-btn',
          placement: 'left',
          cameraPosition: null,
          cameraTarget: null
        },
        {
          title: T.listTitle,
          description: T.listDesc,
          ui: ['#toggleListBtn', '#projDrawer'],
          anchor: '#toggleListBtn',
          placement: 'right',
          onEnter: () => window.__openProjectDrawer?.(),
          cameraPosition: V.desk.position,
          cameraTarget: V.desk.target
        },
        {
          title: T.backstageTitle,
          description: T.backstageDesc,
          onEnter: () => {
            window.setBottomMenuOpen?.(false);
            switchToView('backstage');
          },
          cameraPosition: V.backstage.position,
          cameraTarget: V.backstage.target
        },
        {
          title: T.cvTitle,
          description: T.cvDesc,
          objectName: "aboutMePanel",
          cameraPosition: V.backstage.position,
          cameraTarget: V.backstage.target
        },
        {
          title: T.avatarTitle,
          description: T.avatarDesc,
          objectName: "avatarBackstage",
          cameraPosition: V.backstage.position,
          cameraTarget: V.backstage.target
        },
        {
          title: T.endTitle,
          description: T.endDesc,
          ui: '#restart-tour-btn',
          anchor: '#restart-tour-btn',
          placement: 'left',
          onEnter: () => {
            window.setBottomMenuOpen?.(false);
            window.__closeProjectDrawer?.();
          },
          cameraPosition: null,
          cameraTarget: null
        }
      ];
    };
  }

  function localizeQuickHelpPanel() {
    const copy = pfS2Copy().quickHelp || PF_S2.copy.fr.quickHelp;
    const helpBtn = document.getElementById('quickHelpBtn');
    if (helpBtn) {
      helpBtn.title = copy.buttonTitle;
      helpBtn.setAttribute('aria-label', copy.buttonAria);
    }

    const panel = document.getElementById('quickHelpPanel');
    if (!panel) return;

    const titleEl = panel.querySelector('header div');
    if (titleEl) titleEl.textContent = copy.panelTitle;

    const closeBtn = panel.querySelector('#quickHelpClose');
    if (closeBtn) closeBtn.setAttribute('aria-label', copy.panelCloseAria);

    const topDivs = panel.querySelectorAll(':scope > div');
    if (topDivs[0]) topDivs[0].textContent = copy.intro;
    if (topDivs[topDivs.length - 1]) topDivs[topDivs.length - 1].textContent = copy.tip;

    const items = panel.querySelectorAll('ol li');
    copy.items.forEach((html, i) => {
      if (items[i]) items[i].innerHTML = html;
    });
  }

  function refreshGuidedTourIfVisible() {
    try {
      if (window.guidedTour?.isActive) {
        window.guidedTour.showStep();
      }
    } catch (e) {
      console.warn('guidedTour language refresh error', e);
    }
  }

  applyViewNamesFromLang();
  localizeQuickHelpPanel();

  function refreshProjectsLanguageUI() {
    try {
      if (typeof activeFilters !== 'undefined' && activeFilters?.clear) {
        activeFilters.clear();
      }
    } catch (_) {}

    try { rebuildSkillsFromProjects?.(); } catch (e) { console.warn('rebuildSkillsFromProjects lang refresh error', e); }
    try { updateFilteredView?.(); } catch (e) { console.warn('updateFilteredView lang refresh error', e); }
    try { updatePagerState?.(); } catch (e) { console.warn('updatePagerState lang refresh error', e); }
    try { window.__refreshProjectDrawer?.(); } catch (e) { console.warn('drawer lang refresh error', e); }
    try { refreshProjectDetailLanguage?.(); } catch (e) { console.warn('project detail lang refresh error', e); }
  }

  window.addEventListener('portfolio-language-changed', () => {
    applyViewNamesFromLang();
    localizeQuickHelpPanel();
    refreshGuidedTourIfVisible();
    refreshProjectsLanguageUI();
  });
})();
/* ===== END SPRINT 2 — i18n deep texts (script.js) ===== */


/* ===== MINI SPRINT 2.2 — remaining UI labels (project panel + drawer) ===== */
(function () {
  const PF_22_UI = {
    getLang() {
      try {
        if (window.portfolioI18n && typeof window.portfolioI18n.getLang === 'function') {
          return window.portfolioI18n.getLang() === 'en' ? 'en' : 'fr';
        }
      } catch (_) {}
      const htmlLang = document.documentElement?.dataset?.lang || document.documentElement?.lang || 'fr';
      return String(htmlLang).toLowerCase().startsWith('en') ? 'en' : 'fr';
    },
    copy: {
      fr: {
        projectsTitle: '📚 Projets',
        drawerCloseTitle: 'Fermer (L)',
        drawerToggleTitle: 'Liste des projets (L)',
        drawerFilteredOnly: 'Afficher uniquement la sélection filtrée',
        noKeywordsDetected: 'Aucun mot-clé détecté dans projects.json',
        projectPanelCloseAria: 'Fermer la fiche projet'
      },
      en: {
        projectsTitle: '📚 Projects',
        drawerCloseTitle: 'Close (L)',
        drawerToggleTitle: 'Project list (L)',
        drawerFilteredOnly: 'Show filtered selection only',
        noKeywordsDetected: 'No keywords detected in projects.json',
        projectPanelCloseAria: 'Close project panel'
      }
    },
    txt() {
      const lang = this.getLang();
      return this.copy[lang] || this.copy.fr;
    }
  };

  function pf22() { return PF_22_UI.txt(); }

  function localizeProjectDrawerChrome() {
    const t = pf22();

    const drawer = document.getElementById('projDrawer');
    if (drawer) {
      const titleStrong = drawer.querySelector('strong');
      if (titleStrong) titleStrong.textContent = t.projectsTitle;

      const closeBtn = drawer.querySelector('#pdClose');
      if (closeBtn) closeBtn.title = t.drawerCloseTitle;

      const filteredSpan = drawer.querySelector('#pdOnlyFiltered')?.closest('label')?.querySelector('span');
      if (filteredSpan) filteredSpan.textContent = t.drawerFilteredOnly;
    }

    const toggle = document.getElementById('toggleListBtn');
    if (toggle) toggle.title = t.drawerToggleTitle;
  }

  function localizeProjectPanelChrome() {
    const t = pf22();
    const closeBtn = document.querySelector('#projDetailPanel [data-role="close"]');
    if (closeBtn) closeBtn.setAttribute('aria-label', t.projectPanelCloseAria);
  }

  function localizeNoKeywordsInfo() {
    const t = pf22();
    const container = document.getElementById('filters-container');
    if (!container) return;

    const candidates = [...container.children].filter(el => el.tagName === 'DIV' && !el.classList.contains('filter-btn'));
    for (const el of candidates) {
      const txt = (el.textContent || '').trim();
      if (
        txt === 'Aucun mot-clé détecté dans projects.json' ||
        txt === 'No keywords detected in projects.json'
      ) {
        el.textContent = t.noKeywordsDetected;
      }
    }
  }

  function localizeProjectUiLabels() {
    localizeProjectDrawerChrome();
    localizeProjectPanelChrome();
    localizeNoKeywordsInfo();
  }

  // Patch lazy-created project detail panel so aria labels follow current language immediately.
  if (typeof openProjectDetail === 'function') {
    const _openProjectDetail = openProjectDetail;
    openProjectDetail = function (...args) {
      const out = _openProjectDetail.apply(this, args);
      try { localizeProjectPanelChrome(); } catch (_) {}
      return out;
    };
  }

  // Localize now + whenever language changes.
  localizeProjectUiLabels();
  window.addEventListener('portfolio-language-changed', localizeProjectUiLabels);

  // Also expose for manual debugging if needed.
  window.__localizeProjectUiLabels = localizeProjectUiLabels;
})();
/* ===== END MINI SPRINT 2.2 ===== */


/* ===== SPRINT 3 — Recruiter Quick Access Mode ===== */
(function () {
  const RECR = {
    getLang() {
      try {
        if (window.portfolioI18n && typeof window.portfolioI18n.getLang === 'function') {
          return window.portfolioI18n.getLang() === 'en' ? 'en' : 'fr';
        }
      } catch (_) {}
      const htmlLang = document.documentElement?.dataset?.lang || document.documentElement?.lang || 'fr';
      return String(htmlLang).toLowerCase().startsWith('en') ? 'en' : 'fr';
    },
    copy: {
      fr: {
        toggleTitle: 'Mode recruteur / accès rapide',
        toggleLabel: '⚡ Accès rapide',
        panelTitle: 'Mode recruteur',
        panelSubtitle: 'Accès direct à l’essentiel (CV + projets) en quelques secondes.',
        openCvPdf: '📄 Ouvrir le CV (PDF)',
        openCvBackstage: '🎭 Voir le CV dans la scène',
        openProjects: '📚 Ouvrir la liste des projets',
        openFirstProject: '⭐ Ouvrir le 1er projet',
        goDesk: '🪑 Aller au pupitre',
        goAccordion: '🪗 Voir la démo accordéon',
        goBackstage: '🎭 Aller au backstage',
        closePanel: 'Fermer',
        badge: 'Recruteur',
        hintTitle: '⚡ Accès rapide recruteur',
        hintText: 'Tu peux ouvrir directement le CV ou la liste des projets sans explorer toute la scène.',
        hintDismiss: 'Compris',
        hintHideForever: 'Ne plus afficher',
        statusLoadingBackstage: 'Chargement du backstage… ouverture du CV ensuite.',
        statusNoProjects: 'Aucun projet visible pour le moment (ouvre la liste).'
      },
      en: {
        toggleTitle: 'Recruiter mode / quick access',
        toggleLabel: '⚡ Quick access',
        panelTitle: 'Recruiter mode',
        panelSubtitle: 'Direct access to the essentials (resume + projects) in seconds.',
        openCvPdf: '📄 Open resume (PDF)',
        openCvBackstage: '🎭 View resume in scene',
        openProjects: '📚 Open project list',
        openFirstProject: '⭐ Open first project',
        goDesk: '🪑 Go to desk',
        goAccordion: '🪗 Accordion demo',
        goBackstage: '🎭 Go backstage',
        closePanel: 'Close',
        badge: 'Recruiter',
        hintTitle: '⚡ Recruiter quick access',
        hintText: 'You can open the resume or project list directly without exploring the whole scene first.',
        hintDismiss: 'Got it',
        hintHideForever: 'Do not show again',
        statusLoadingBackstage: 'Loading backstage… resume will open next.',
        statusNoProjects: 'No visible project right now (open the list).'
      }
    },
    txt() {
      return this.copy[this.getLang()] || this.copy.fr;
    },
    cvUrl() {
      return this.getLang() === 'en' ? './images/CV_EN.pdf' : './images/CV_FR.pdf';
    }
  };

  const ROOT_ID = 'recruiter-quick-access';
  let ui = null;
  let open = false;
  let hintShownThisLoad = false;
  let autoHintTimer = null;

  function q(selector, root = document) {
    return root.querySelector(selector);
  }

  function safeCall(fn, ...args) {
    try { return typeof fn === 'function' ? fn(...args) : undefined; }
    catch (e) { console.warn('recruiter quick access error', e); }
  }

  function createUI() {
    if (document.getElementById(ROOT_ID)) {
      ui = document.getElementById(ROOT_ID);
      return ui;
    }

    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.style.cssText = `
      position: fixed;
      left: 14px;
      top: 14px;
      z-index: 10030;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      pointer-events: none;
      max-width: min(92vw, 420px);
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    `;

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'recruiter-qa-toggle';
    toggle.style.cssText = `
      pointer-events: auto;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(2,6,23,.88);
      color: #f8fafc;
      border-radius: 999px;
      padding: 10px 14px;
      font-size: clamp(13px, 0.6vw + 11px, 16px);
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(0,0,0,.35);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    `;
    toggle.innerHTML = `<span id="recruiter-qa-badge" style="font-size:11px;padding:4px 7px;border-radius:999px;background:#0ea5e9;color:#fff;line-height:1;">Recruteur</span><span id="recruiter-qa-toggle-label">⚡ Accès rapide</span>`;

    const panel = document.createElement('section');
    panel.id = 'recruiter-qa-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Recruiter quick access');
    panel.style.cssText = `
      pointer-events: auto;
      width: min(92vw, 390px);
      background: rgba(2, 6, 23, 0.95);
      color: #e2e8f0;
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,.45);
      display: none;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    `;

    panel.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div id="recruiter-qa-title" style="font-size:16px;font-weight:700;line-height:1.2;">Mode recruteur</div>
          <div id="recruiter-qa-subtitle" style="font-size:12px;opacity:.85;line-height:1.35;margin-top:4px;">Accès direct à l’essentiel (CV + projets) en quelques secondes.</div>
        </div>
        <button type="button" id="recruiter-qa-close" style="border:0;background:#111827;color:#e5e7eb;width:28px;height:28px;border-radius:999px;cursor:pointer;font-size:14px;">✕</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px;">
        <button type="button" data-action="cv-pdf" class="rqa-btn"></button>
        <button type="button" data-action="cv-backstage" class="rqa-btn"></button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
        <button type="button" data-action="projects-list" class="rqa-btn rqa-btn-secondary"></button>
        <button type="button" data-action="project-first" class="rqa-btn rqa-btn-secondary"></button>
        <button type="button" data-action="go-desk" class="rqa-btn rqa-btn-ghost"></button>
        <button type="button" data-action="go-accordion" class="rqa-btn rqa-btn-ghost"></button>
        <button type="button" data-action="go-backstage" class="rqa-btn rqa-btn-ghost" style="grid-column:1/-1;"></button>
      </div>

      <div id="recruiter-qa-status" style="margin-top:10px;min-height:18px;font-size:11px;opacity:.85;"></div>
    `;

    const hint = document.createElement('div');
    hint.id = 'recruiter-qa-hint';
    hint.style.cssText = `
      pointer-events: auto;
      display: none;
      width: min(92vw, 390px);
      background: rgba(15, 23, 42, 0.96);
      color: #e2e8f0;
      border: 1px solid rgba(14,165,233,.35);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 18px 38px rgba(0,0,0,.35);
    `;
    hint.innerHTML = `
      <div id="recruiter-qa-hint-title" style="font-weight:700;font-size:14px;line-height:1.2;"></div>
      <div id="recruiter-qa-hint-text" style="margin-top:6px;font-size:12px;line-height:1.4;opacity:.92;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap;">
        <button type="button" id="recruiter-qa-hint-open" class="rqa-btn rqa-btn-secondary" style="font-size:12px;padding:8px 10px;"></button>
        <button type="button" id="recruiter-qa-hint-dismiss" class="rqa-btn rqa-btn-ghost" style="font-size:12px;padding:8px 10px;"></button>
        <button type="button" id="recruiter-qa-hint-hide" class="rqa-btn rqa-btn-ghost" style="font-size:12px;padding:8px 10px;"></button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #${ROOT_ID} .rqa-btn {
        border: 1px solid rgba(255,255,255,.12);
        background: #0ea5e9;
        color: #fff;
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        text-align: left;
        font-size: 13px;
        line-height: 1.25;
      }
      #${ROOT_ID} .rqa-btn:hover { filter: brightness(1.06); }
      #${ROOT_ID} .rqa-btn-secondary { background: rgba(30,41,59,.95); }
      #${ROOT_ID} .rqa-btn-ghost { background: rgba(15,23,42,.65); }
      #${ROOT_ID} .rqa-btn:focus-visible,
      #${ROOT_ID} #recruiter-qa-toggle:focus-visible,
      #${ROOT_ID} #recruiter-qa-close:focus-visible {
        outline: 2px solid rgba(14,165,233,.9);
        outline-offset: 2px;
      }
      @media (max-width: 768px) {
        #${ROOT_ID} { left: 10px; top: 10px; }
        #${ROOT_ID} #recruiter-qa-panel,
        #${ROOT_ID} #recruiter-qa-hint { width: min(95vw, 360px); }
      }
    `;
    root.appendChild(style);
    root.appendChild(toggle);
    root.appendChild(panel);
    root.appendChild(hint);
    document.body.appendChild(root);

    // Events
    toggle.addEventListener('click', () => setOpen(!open));
    q('#recruiter-qa-close', root)?.addEventListener('click', () => setOpen(false));

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      runAction(action);
    });

    q('#recruiter-qa-hint-open', root)?.addEventListener('click', () => {
      hideHint();
      setOpen(true);
    });
    q('#recruiter-qa-hint-dismiss', root)?.addEventListener('click', hideHint);
    q('#recruiter-qa-hint-hide', root)?.addEventListener('click', () => {
      localStorage.setItem('recruiterQuickAccessHintHidden', '1');
      hideHint();
    });

    ui = root;
    localize();
    return root;
  }

  function localize() {
    if (!ui) return;
    const t = RECR.txt();
    const setText = (sel, val) => { const el = q(sel, ui); if (el) el.textContent = val; };

    const toggle = q('#recruiter-qa-toggle', ui);
    if (toggle) toggle.title = t.toggleTitle;

    setText('#recruiter-qa-badge', t.badge);
    setText('#recruiter-qa-toggle-label', t.toggleLabel);
    setText('#recruiter-qa-title', t.panelTitle);
    setText('#recruiter-qa-subtitle', t.panelSubtitle);

    const labels = {
      'cv-pdf': t.openCvPdf,
      'cv-backstage': t.openCvBackstage,
      'projects-list': t.openProjects,
      'project-first': t.openFirstProject,
      'go-desk': t.goDesk,
      'go-accordion': t.goAccordion,
      'go-backstage': t.goBackstage
    };
    ui.querySelectorAll('[data-action]').forEach((el) => {
      const key = el.getAttribute('data-action');
      if (key && labels[key]) el.textContent = labels[key];
    });

    const closeBtn = q('#recruiter-qa-close', ui);
    if (closeBtn) closeBtn.setAttribute('aria-label', t.closePanel);

    setText('#recruiter-qa-hint-title', t.hintTitle);
    setText('#recruiter-qa-hint-text', t.hintText);
    setText('#recruiter-qa-hint-open', t.toggleLabel);
    setText('#recruiter-qa-hint-dismiss', t.hintDismiss);
    setText('#recruiter-qa-hint-hide', t.hintHideForever);
  }

  function setOpen(next) {
    open = !!next;
    if (!ui) return;
    const panel = q('#recruiter-qa-panel', ui);
    if (!panel) return;
    panel.style.display = open ? 'block' : 'none';
    q('#recruiter-qa-toggle', ui)?.setAttribute('aria-expanded', String(open));
    if (open) hideHint();
  }

  function setStatus(msg) {
    const status = ui ? q('#recruiter-qa-status', ui) : null;
    if (!status) return;
    status.textContent = msg || '';
    if (!msg) return;
    window.clearTimeout(setStatus._t);
    setStatus._t = window.setTimeout(() => {
      if (status.textContent === msg) status.textContent = '';
    }, 2600);
  }

  function goToView(name) {
    try {
      if (typeof switchToView === 'function') {
        switchToView(name);
      } else if (typeof window.switchToView === 'function') {
        window.switchToView(name);
      }
    } catch (e) {
      console.warn('switchToView failed', e);
    }
  }

  function openCvPdf() {
    const url = RECR.cvUrl();
    window.open(url, '_blank', 'noopener');
  }

  function openCvInScene() {
    goToView('backstage');

    // If backstage system is already ready, open immediately after camera move.
    const attempt = () => {
      try {
        if (backstageSystem && typeof backstageSystem.showCVModal === 'function') {
          backstageSystem.showCVModal();
          return true;
        }
      } catch (_) {}
      return false;
    };

    if (attempt()) return;

    setStatus(RECR.txt().statusLoadingBackstage);
    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (attempt() || tries > 16) {
        clearInterval(timer);
        if (tries > 16) openCvPdf();
      }
    }, 250);
  }

  function openProjectsList() {
    safeCall(window.setBottomMenuOpen, false);
    goToView('desk');
    setTimeout(() => safeCall(window.__openProjectDrawer), 350);
  }

  function openFirstProject() {
    safeCall(window.setBottomMenuOpen, false);
    goToView('desk');

    let visible = [];
    try {
      visible = (typeof getVisibleProjects === 'function' ? getVisibleProjects() : (Array.isArray(projects) ? projects : [])) || [];
    } catch (_) {
      visible = Array.isArray(projects) ? projects : [];
    }

    if (!visible.length) {
      setStatus(RECR.txt().statusNoProjects);
      setTimeout(() => safeCall(window.__openProjectDrawer), 250);
      return;
    }

    const p = visible[0];
    try {
      const all = Array.isArray(projects) ? projects : visible;
      const idx = all.indexOf(p);
      if (typeof idx === 'number' && idx >= 0 && typeof indexLeft !== 'undefined') {
        indexLeft = idx;
      }
      if (typeof rebuildPages === 'function') rebuildPages();
    } catch (e) {
      console.warn('recruiter first-project sync error', e);
    }

    setTimeout(() => {
      try {
        if (typeof closeProjectDetail === 'function') closeProjectDetail(false);
      } catch (_) {}
      try {
        if (typeof openProjectDetail === 'function') openProjectDetail(p, null);
      } catch (e) {
        console.warn('openProjectDetail failed', e);
      }
    }, 450);
  }

  function runAction(action) {
    switch (action) {
      case 'cv-pdf':
        openCvPdf();
        break;
      case 'cv-backstage':
        openCvInScene();
        break;
      case 'projects-list':
        openProjectsList();
        break;
      case 'project-first':
        openFirstProject();
        break;
      case 'go-desk':
        safeCall(window.setBottomMenuOpen, false);
        goToView('desk');
        break;
      case 'go-accordion':
        safeCall(window.setBottomMenuOpen, false);
        goToView('accordion');
        break;
      case 'go-backstage':
        safeCall(window.setBottomMenuOpen, false);
        goToView('backstage');
        break;
      default:
        break;
    }
  }

  function isLoadingScreenHidden() {
    const loadingScreen = document.getElementById('loading-screen');
    if (!loadingScreen) return true;
    const cs = window.getComputedStyle(loadingScreen);
    return cs.display === 'none' || loadingScreen.hidden === true || parseFloat(cs.opacity || '1') === 0;
  }

  function showHint() {
    if (!ui) return;
    if (localStorage.getItem('recruiterQuickAccessHintHidden') === '1') return;
    const hint = q('#recruiter-qa-hint', ui);
    if (!hint) return;
    hint.style.display = 'block';
  }

  function hideHint() {
    if (!ui) return;
    q('#recruiter-qa-hint', ui)?.style && (q('#recruiter-qa-hint', ui).style.display = 'none');
  }

  function maybeShowHintAfterLoading() {
    if (hintShownThisLoad) return;
    hintShownThisLoad = true;

    const tick = () => {
      if (isLoadingScreenHidden()) {
        autoHintTimer = window.setTimeout(showHint, 900);
      } else {
        requestAnimationFrame(tick);
      }
    };
    tick();
  }

  function init() {
    createUI();
    setOpen(false);
    maybeShowHintAfterLoading();

    window.addEventListener('portfolio-language-changed', () => {
      localize();
      // refresh status text if visible and one of the known messages is present
      // (kept simple on purpose)
    });

    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = document.activeElement?.tagName?.toLowerCase();
        const isTyping = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable;
        if (!isTyping) setOpen(!open);
      }
    });

    window.recruiterQuickAccess = {
      open: () => setOpen(true),
      close: () => setOpen(false),
      toggle: () => setOpen(!open),
      openCvPdf,
      openCvInScene,
      openProjectsList,
      openFirstProject
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
/* ===== END SPRINT 3 — Recruiter Quick Access Mode ===== */
