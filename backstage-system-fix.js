/**
 * ═══════════════════════════════════════════════════════════════════
 * BACKSTAGE SYSTEM - Portfolio Three.js (VERSION CORRIGÉE)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * CORRECTIONS :
 * - Rotation globale backstage (pointe vers l'extérieur)
 * - Horloges visibles (orientation corrigée)
 * - Music sheet visible (orientation corrigée)
 * - Contrôle GUI pour rotation
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'https://esm.sh/gsap@3';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION GLOBALE
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// HELPERS ANIMATION & LUMIÈRE (inspirés de la scène principale)
// ═══════════════════════════════════════════════════════════════════
class SpotlightController {
  constructor(spotlight, ambientLight, parentGroup = null, callbacks = {}) {
    this.spotlight = spotlight;
    this.ambientLight = ambientLight;
    this.parent = parentGroup || spotlight.parent;

    // États par défaut
    this.defaultPosition = spotlight.position.clone();
    this.defaultIntensity = spotlight.intensity;
    this.defaultAmbient = ambientLight.intensity;
    this.defaultAngle = spotlight.angle || Math.PI / 4;

    // Position cible par défaut du target
    this.defaultTargetPosition = spotlight.target.position.clone();

    // État courant de l'animation
    this.targetPosition = this.defaultPosition.clone();
    this.targetAngle = this.defaultAngle;
    this.targetSize = 1;

    this.isAnimating = false;
    this.animationProgress = 0;
    this.animationDuration = 0.3;

    this.startPosition = this.defaultPosition.clone();
    this.startIntensity = this.defaultIntensity;
    this.startAmbient = this.defaultAmbient;
    this.startAngle = this.defaultAngle;

    // Panneau "ON AIR" About me
    this.aboutOnAirSign = null; // { canvas, ctx, texture }

    this.callbacks = callbacks;
    this.mode = 'default'; // 'default' | 'focus'
  }

  focusOnObject(mesh) {
    if (!mesh) return;

    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const worldPos = new THREE.Vector3();
    mesh.getWorldPosition(worldPos);

    const localPos = this.parent.worldToLocal(worldPos.clone());

    // Nouvelle cible au-dessus de l’objet
    this.targetPosition = localPos.clone().add(new THREE.Vector3(0, maxDim * 2.5, 0));
    const distance = maxDim * 2.5;
    this.targetAngle = Math.atan((maxDim * 1.2) / distance);
    this.targetSize = maxDim * 2;

    // On repart de l’état ACTUEL (même si une anim est en cours)
    this.startPosition.copy(this.spotlight.position);
    this.startIntensity = this.spotlight.intensity;
    this.startAmbient = this.ambientLight.intensity;
    this.startAngle = this.spotlight.angle;

    // Le target pointe vers l’objet
    this.spotlight.target.position.copy(localPos);
    this.spotlight.target.updateMatrixWorld();

    if (this.mode !== 'focus') {
      this.mode = 'focus';
      if (this.callbacks.onFocusStart) this.callbacks.onFocusStart();
    }

    this.animationProgress = 0;
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animate();
    }

    console.log('🔦 Spotlight focus on object at', localPos, 'size:', maxDim);
    console.log('   Target spotlight position:', this.targetPosition);
    console.log('   Target spotlight angle:', this.targetAngle);
  }

  returnToDefault() {
    // callback inverse quand on revient à l’état normal
    if (this.mode !== 'default') {
      this.mode = 'default';
      if (this.callbacks.onFocusEnd) this.callbacks.onFocusEnd();
    }

    this.targetPosition.copy(this.defaultPosition);
    this.targetAngle = this.defaultAngle;
    this.targetSize = 1;

    // Repart de l’état actuel
    this.startPosition.copy(this.spotlight.position);
    this.startIntensity = this.spotlight.intensity;
    this.startAmbient = this.ambientLight.intensity;
    this.startAngle = this.spotlight.angle;

    // On remet le target là où il était au départ
    this.spotlight.target.position.copy(this.defaultTargetPosition);
    this.spotlight.target.updateMatrixWorld();

    this.animationProgress = 0;
    if (!this.isAnimating) {
      this.isAnimating = true;
      this.animate();
    }

    console.log('🔦 Spotlight return to default');
    console.log('   Target spotlight position:', this.targetPosition);
    console.log('   returnToDefault angle:', this.targetAngle);
    console.log('   Default spotlight position:', this.defaultPosition);
  }

  animate() {
    if (!this.isAnimating) return;

    this.animationProgress += 0.016 / this.animationDuration;

    if (this.animationProgress >= 1) {
      this.animationProgress = 1;
      this.isAnimating = false;
    }

    const t = this.easeInOutCubic(this.animationProgress);

    this.spotlight.position.lerpVectors(this.startPosition, this.targetPosition, t);

    const isFocusing = this.mode === 'focus';
    const targetIntensity = isFocusing ? 10.0 : this.defaultIntensity;
    const targetAmbient   = isFocusing ? 0.1  : this.defaultAmbient;

    this.spotlight.intensity = THREE.MathUtils.lerp(this.startIntensity, targetIntensity, t);
    this.ambientLight.intensity = THREE.MathUtils.lerp(this.startAmbient, targetAmbient, t);
    this.spotlight.angle = THREE.MathUtils.lerp(this.startAngle, this.targetAngle, t);

    if (this.isAnimating) {
      requestAnimationFrame(() => this.animate());
    }
  }

  easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
}


// Groupe "centre + orbiteur" pour l'épée + le dé
class OrbitingGroup {
  constructor(centerModel, orbiterModel, config = {}) {
    this.group = new THREE.Group();

    // Configuration
    this.orbitRadius = config.orbitRadius || 0.9;
    this.orbitSpeed = config.orbitSpeed || 0.6;
    this.yVariation = config.yVariation || 0.15;
    this.centerImpulse = config.centerImpulse || 2.5;
    this.centerGravity = config.centerGravity || 5.0;
    this.centerFallSpeed = config.centerFallSpeed || 10.0;
    this.centerBottomPause = config.centerBottomPause || 1.0;
    this.centerTopPause = config.centerTopPause || 0.2;
    this.orbitRotSpeedFactor = config.orbitRotSpeedFactor || 0.25;

    // Ajouter les modèles
    this.center = centerModel;
    this.orbiter = orbiterModel;
    this.group.add(this.center);
    this.group.add(this.orbiter);

    // Variables d'animation du centre
    this.centerY = 0;
    this.centerVelocity = 0;
    this.centerState = 'bottom';
    this.centerBottomTime = 0;
    this.centerTopTime = 0;

    // Variables d'orbite
    this.orbitAngle = 0;

    // Rotation aléatoire de l'orbiter
    this.orbiterRotSpeed = {
      x: (Math.random() - 0.5) * this.orbitRotSpeedFactor,
      y: (Math.random() - 0.5) * this.orbitRotSpeedFactor,
      z: (Math.random() - 0.5) * this.orbitRotSpeedFactor
    };
  }

  update(deltaTime) {
    const dt = deltaTime || 0.016;

    // Animation bounce du centre (épée)
    if (this.centerState === 'bottom') {
      this.centerBottomTime += dt;
      if (this.centerBottomTime > this.centerBottomPause) {
        this.centerState = 'rising';
        this.centerVelocity = this.centerImpulse;
        this.centerBottomTime = 0;
      }
    } else if (this.centerState === 'rising') {
      this.centerY += this.centerVelocity * dt;
      this.centerVelocity -= this.centerGravity * dt;
      if (this.centerVelocity <= 0) {
        this.centerState = 'top';
      }
    } else if (this.centerState === 'top') {
      this.centerTopTime += dt;
      if (this.centerTopTime > this.centerTopPause) {
        this.centerState = 'falling';
        this.centerTopTime = 0;
      }
    } else if (this.centerState === 'falling') {
      this.centerY += this.centerVelocity * dt;
      this.centerVelocity -= this.centerFallSpeed * dt;
      if (this.centerY <= 0) {
        this.centerY = 0;
        this.centerVelocity = 0;
        this.centerState = 'bottom';
      }
    }

    this.center.position.y = this.centerY;

    // Orbite du dé autour de l'épée
    this.orbitAngle += this.orbitSpeed * dt;
    const x = Math.cos(this.orbitAngle) * this.orbitRadius;
    const z = Math.sin(this.orbitAngle) * this.orbitRadius;
    const y = Math.sin(this.orbitAngle * 2) * this.yVariation;

    this.orbiter.position.set(x, y, z);

    // Rotation aléatoire continue du dé
    this.orbiter.rotation.x += this.orbiterRotSpeed.x * dt;
    this.orbiter.rotation.y += this.orbiterRotSpeed.y * dt;
    this.orbiter.rotation.z += this.orbiterRotSpeed.z * dt;
  }
}




const CONFIG = {
  // Zone backstage (GLOBAL)
  backstagePosition: { x: -13, y: 0.5, z: -15 }, // tu peux la bouger librement
  backstageRotation: 2.27, // en radians, pour pointer vers l'extérieur (ex : 130° = 2.27 rad)
  backstageSize: { width: 12, depth: 12, height: 10 },

  // Toutes les positions suivantes sont maintenant LOCALES au backstage (origine = centre du sol)
  
  // Avatar (si tu l'utilises plus tard)
  avatarPosition: { x: 3.5, y: 0, z: 0 }, // ex : devant au centre

  // Fun Facts (au-dessus de l'avatar)
  funFactsOffset: { x: 0, y: 1.5, z: 0 },
  funFactsRadius: 0.3,
  
  // Mur "About Me" (mur arrière gauche)
  // avant : (-3, 2.5, -19) avec stage z = -15 → local z = -4
  aboutMePosition: { x: -2, y: 1.1, z: -3 },
  aboutMeSize: { width: 2.5, height: 3 },
  
  // CV Carnet (table centrale)
  // avant : (0, 1.2, -15) → local z = 0
  cvNotebookPosition: { x: 0, y: 1.2, z: 0 },
  cvNotebookScale: 6.15,
  
  // Horloges (mur arrière droit)
  // avant : (3, 3, -19) → local z = -4
  clocksPosition: { x: 3, y: 3, z: -4 },
  clockSpacing: 1.8,
  
  // Diplôme (mur gauche)
  // avant : (-4.5, 2.5, -16) → local z = -1
  diplomaPosition: { x: -4.5, y: 2.0, z: -2 },
  diplomaSize: { width: 1.2, height: 1.6 },
  
  // Objets symboliques (étagères)
  // avant : z=-14 → local z = +1
  swordDicePosition: { x: -2.75, y: 1.5, z: 1 },
  controllerPosition: { x: 3.5, y: 1.1, z: -1 },
  // avant : (0, 1.8, -15) → local z=0
  musicPosition: { x: 3.5, y: 1.8, z: 1.5 },
  
  // Liens sociaux (toujours visibles, en bas)
  // avant : (0, 0.8, -13) → local z=+2
  // Social links (closer + higher because bigger cards)
    socialLinksPosition: { x: 0, y: 1.2, z: 3.3 },
    socialLinkSpacing: 2.6,

    // NEW: tilt toward camera
    socialLinksTiltX: 0.85, // ~20°

};


// Fun Facts Data
const FUN_FACTS = [
  { emoji: '💻', text: 'Arduino + Unity prototypes' },
  { emoji: '🎲', text: 'Narrative game design → UX' },
  { emoji: '🔬', text: 'IFT De Vinci Lab (bio-optics)' },
  { emoji: '🎮', text: 'Optimization mindset (speedrun)' },
  { emoji: '🎵', text: 'Choir: timing & teamwork' },
  { emoji: '🪗', text: 'CEM Accordéon (advanced level)' },
  { emoji: '🤖', text: 'Realtime posture/motion AI POC' },
  { emoji: '🐝', text: 'AI tools for beekeeping & labs' }
];


// About Me Text
// About Me Text
const ABOUT_ME_TEXT = `INGÉNIEUR R&D | DOUBLE DIPLÔME ESILV × IFT DE VINCI (IFT)

Je conçois des expériences immersives et utiles, où le tangible rencontre le numérique :
du game dev interactif (Unity) aux objets connectés (Arduino/ESP32), en passant par le web 3D
(Three.js / Next.js) et des prototypes orientés “wow effect” — mais toujours au service d’un besoin.

Mon fil rouge : transformer une idée en démo solide, rapidement.
Je teste, j’itère, j’observe l’impact utilisateur, je simplifie, puis j’industrialise quand ça vaut le coup.
J’aime quand une interface “se comprend toute seule”, quand l’interaction est fluide, et quand la technique
reste invisible derrière une expérience claire.

Ce qui me différencie : une culture produit + une culture R&D.
Je documente, je mesure, je compare, et je construis des systèmes modulaires qui peuvent évoluer :
capteurs, audio, lumière, UI, logique interactive… Chaque brique est pensée pour être réutilisable.

Actuellement : R&D / projets au De Vinci Lab (IFT) | Développeur Full-Stack & prototypage interactif
Domaines : systèmes interactifs, IoT, interfaces 3D, expérimentation UX, prototypes temps réel
Stack favorite : Unity/C#, Arduino/ESP32, Three.js/Next.js, WebAudion, python`;

// Diplôme Text
const DIPLOMA_TEXT = `DOUBLE DIPLÔME INGÉNIEUR (ESILV) × PROGRAMME IFT (De Vinci)

ESILV — École d’Ingénieurs (Pôle Léonard de Vinci)
IFT — Institute for Future Technologies (De Vinci Innovation Center)

Focus : Systèmes Interactifs • Prototypage R&D • IoT • Expériences temps réel
Année : 2025`;

// Hover Texts pour objets symboliques (plus courts)
const HOVER_TEXTS = {
  swordDice: `Le JDR, autant sous forme de dès que sous forme de Grandeur Nature(GN), pour s'exprimer et se mettre dans la peaux des autres.`,
  
  controller: `Le jeux vidéo, autant une source de plaisir que d'inspiration.`,
  
  music: `La musique, pour explorer et inspirer autrement que par des mots.`
};

// Textes détaillés pour le clic (beaucoup plus longs, avec des \\n)
// Textes détaillés pour le clic (version beaucoup plus personnelle, avec des \n)
const DETAIL_TEXTS = {
  swordDice: `Le JDR, c’est mon terrain de jeu préféré pour comprendre l’humain.\n\nQuand je lance des dés autour d’une table, ou quand je participe à un GN, je ne “joue” pas seulement :\nje m’entraîne à changer de point de vue.\nJe me mets dans la peau d’un autre personnage, avec ses contraintes, ses émotions, ses angles morts.\nEt ça, je le retrouve ensuite dans ma façon de concevoir des expériences.\n\nCe que le JDR m’a appris (pour de vrai) :\n- écouter avant de décider,\n- rendre une situation compréhensible sans tout expliquer,\n- donner du choix sans perdre le fil,\n- faire sentir les conséquences de manière claire.\n\nDans mes projets, je cherche ce même équilibre :\nlaisser l’utilisateur explorer librement, mais ne jamais le laisser “perdu”.\nSi une interaction est possible, je veux qu’elle soit ressentie comme une invitation, pas comme un piège.\n\nEn résumé : le JDR m’a donné un réflexe.\nMe demander : “si quelqu’un arrive ici sans mode d’emploi… est-ce qu’il comprend ce qui se passe, et est-ce qu’il a envie de continuer ?”`,

  controller: `Le jeu vidéo, c’est à la fois une source de plaisir… et mon laboratoire d’UX quotidien.\n\nJe suis sensible à cette sensation très précise :\nquand tu touches une manette (ou une souris) et que le système répond instantanément.\nTu comprends. Tu apprends. Tu maîtrises.\nEt tu te dis : “ok, je peux avancer”.\n\nC’est exactement ce que je veux provoquer dans mes interfaces et mes scènes interactives.\nPas juste “faire joli”, mais créer une dynamique :\n- une intention claire,\n- un geste simple,\n- un feedback net,\n- et une progression naturelle.\n\nCe que j’emprunte souvent au jeu vidéo :\n- le feedback immédiat (animation / son / lumière),\n- la progression par petites victoires (micro-objectifs),\n- la cohérence des règles (même geste = même résultat),\n- le respect du rythme (ne pas saturer, laisser respirer).\n\nQuand quelqu’un explore mon portfolio, j’aimerais qu’il ressente ça :\n“c’est fluide”, “je comprends”, “j’ai envie de cliquer encore”.\nComme une bonne première minute de jeu.`,

  music: `La musique, c’est mon moyen d’explorer autrement que par des mots.\n\nIl y a des choses que je comprends mieux en rythme, en tension/détente, en harmonie.\nQuand je chante ou que je travaille une partie, je ressens très vite si “ça se tient”.\nEt j’ai le même rapport à une expérience interactive :\nsi une scène est bien construite, on le “sent”.\n\nLa musique m’a appris :\n- la structure (intro, thème, variations, retour),\n- le tempo (quand accélérer, quand ralentir),\n- l’écoute (des autres… et de ce que le système renvoie),\n- la précision (un détail peut casser l’ensemble).\n\nDans mon portfolio, j’aime utiliser le son et le mouvement comme des repères.\nPas pour faire du bruit.\nMais pour guider, donner une ambiance, et rendre l’exploration plus intuitive.\n\nAu fond, je vise une expérience qui “sonne juste” :\nune interaction claire, une esthétique cohérente, et une sensation globale harmonieuse.`,

  aboutMe: `Je suis quelqu’un qui a besoin de construire pour comprendre.\n\nJe peux passer du temps à imaginer, mais ce qui me rend vraiment heureux, c’est le moment où ça prend vie :\nun prototype qui répond, une interaction qui “clique”, un petit détail qui rend l’expérience évidente.\n\nJ’aime créer des passerelles entre des mondes :\n- le jeu (interaction, narration, plaisir),\n- le réel (capteurs, objets, contraintes physiques),\n- le web (accessibilité, diffusion, partage),\n- et la 3D (immersion, mise en scène, surprise).\n\nMa manière de travailler est simple :\nje teste vite.\nJe garde ce qui fonctionne.\nJe coupe ce qui complique.\nJe recommence jusqu’à ce que ce soit fluide.\n\nCe portfolio est pensé comme une scène.\nJe veux que tu puisses te balader, découvrir, et comprendre qui je suis sans lire un roman.\nEt si tu prends le temps d’explorer, tu trouveras les détails :\nles projets, les choix techniques, et ce que j’ai essayé de raconter derrière chaque objet.`,

  diploma: `Mon double diplôme, pour moi, ce n’est pas juste une ligne sur un CV.\nC’est la traduction de ma curiosité et de mon envie de mêler rigueur et expérimentation.\n\nD’un côté, l’école d’ingénieur :\napprendre à structurer, à être fiable, à livrer, à comprendre les contraintes.\nDe l’autre, l’IFT :\naller chercher les usages, prototyper, explorer des systèmes interactifs, tester des idées “futures”.\n\nCe que j’aime dans ce mélange :\nje peux être très concret (faire marcher le système),\net en même temps très orienté expérience (faire que ça se vive bien).\n\nAujourd’hui, je me sens à ma place quand je construis des projets qui ont :\n- une dimension interactive,\n- un vrai point de vue (pas juste une démo technique),\n- et un résultat que quelqu’un peut utiliser ou ressentir.\n\nEn bref : je suis un profil hybride, et j’assume.\nParce que c’est exactement à cet endroit-là — entre technique et expérience — que j’ai le plus d’énergie.`
};



// Liens sociaux
const SOCIAL_LINKS = [
  { 
    name: 'Email', 
    icon: '📧', 
    url: 'mailto:aurelien.devinci@devinci.fr',
    color: 0xf59e0b
  },
  { 
    name: 'GitHub', 
    icon: '🐙', 
    url: 'https://github.com/Aure3479',
    color: 0x6366f1
  },
  {   
    name: 'LinkedIn', 
    icon: '💼', 
    url: 'https://www.linkedin.com/in/aurelien-passelaigue-803872265',
    color: 0x0ea5e9
  }
];

// ═══════════════════════════════════════════════════════════════════
// CLASSE PRINCIPALE BACKSTAGE SYSTEM
// ═══════════════════════════════════════════════════════════════════

class BackstageSystem {
  constructor(scene, camera, renderer, callbacks = {}) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    
    // callbacks globaux (onFocusStart / onFocusEnd)
    this.callbacks = callbacks;

    // 🎮 OrbitControls (optionnel) si tu les passes dans callbacks
    this.controls = callbacks.controls || null;

    // Groupes principaux
    this.backstageGroup = new THREE.Group();
    this.interactiveObjects = [];
    this.hoveredObject = null;
    
    // ★ Lumières et animations
    this.backstageLights = {
      ambient: null,
      spotlight: null,
      spotlightTarget: null
    };
    this.spotlightController = null;
    this.orbitingGroups = [];
    this.idleRotations = [];

    // Raycaster...
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // UI...
    this.tooltip = null;
    this.cvModal = null;
    this.funFactsBubbles = [];

    this.clocks = [];
    this.gltfLoader = new GLTFLoader();
    this.textureLoader = new THREE.TextureLoader();
    this.isInitialized = false;
    this.showFunFacts = false;
    this.gui = null;

    // 🔍 Caméra : état initial + état précédent pour le zoom
    this.cameraInitialPosition = this.camera.position.clone();
    this.cameraInitialTarget = new THREE.Vector3();
    {
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.cameraInitialTarget.copy(this.camera.position).add(dir);
    }

    this.cameraPrevPosition = this.cameraInitialPosition.clone();
    this.cameraPrevTarget = this.cameraInitialTarget.clone();

    this.isZoomed = false;
    this.zoomedObject = null;

    // Panneau de détail (DOM)
    this.detailPanel = null;
    this.detailPanelTitle = null;
    this.detailPanelBody = null;
  }

  
  

    addIdleRotation(object, options = {}) {
    this.idleRotations.push({
      object,
      axes: options.axes || ['y'],
      speed: options.speed ?? 0.2
    });
  }

  // ✨ Contour brillant autour d'un objet interactif
    // ✨ Contour brillant autour d'un objet interactif
  // ✨ Contour brillant autour d'un objet interactif
  addGlowOutline(object, options = {}) {
    const {
      color = 0xffffaa,
      thickness = 1.06,     // 1.0 = même taille que l'objet
      opacity = 0.35,       // opacité au repos
      hoverOpacity = 0.8    // opacité au survol
    } = options;

    if (!object.userData) object.userData = {};

    // Si on a déjà mis un outline, on ne recommence pas
    if (object.userData.hasOutline) return;
    object.userData.hasOutline = true;

    const outlines = [];

    object.traverse(child => {
      // On ne s'occupe que des vrais meshes
      if (!child.isMesh) return;

      // ⚠️ Important : ne pas créer d'outline sur un outline
      if (child.userData && child.userData.isOutlineMesh) return;

      const outlineMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.BackSide,     // l'arrière évite le z-fighting
        transparent: true,
        opacity,
        depthWrite: false
      });

      const outlineMesh = new THREE.Mesh(child.geometry, outlineMat);
      outlineMesh.scale.set(thickness, thickness, thickness);

      // Marqueur pour les prochains traverses
      outlineMesh.userData.isOutlineMesh = true;

      child.add(outlineMesh);
      outlines.push(outlineMesh);
    });

    object.userData.outlines = outlines;
    object.userData.outlineBaseOpacity = opacity;
    object.userData.outlineHoverOpacity = hoverOpacity;
  }

    // Change l'intensité du halo (repos / hover)
  setGlowState(object, highlight) {
    if (!object || !object.userData) return;

    const outlines = object.userData.outlines;
    if (!outlines || !outlines.length) return;

    const base = object.userData.outlineBaseOpacity ?? 0.35;
    const hover = object.userData.outlineHoverOpacity ?? 0.8;
    const targetOpacity = highlight ? hover : base;

    outlines.forEach(outline => {
      const mat = outline.material;
      if (!mat) return;

      gsap.to(mat, {
        opacity: targetOpacity,
        duration: 0.2,
        ease: 'power2.out'
      });
    });
  }

  clearHoverState() {
    if (!this.hoveredObject) return;

    gsap.to(this.hoveredObject.scale, {
      x: 1, y: 1, z: 1,
      duration: 0.2
    });

    this.setGlowState(this.hoveredObject, false);
    this.hoveredObject = null;

    if (this.spotlightController) {
      this.spotlightController.returnToDefault();
    }

    this.hideTooltip();
    document.body.style.cursor = 'default';
  }



  // ═══════════════════════════════════════════════════════════════════
  // INITIALISATION
  // ═══════════════════════════════════════════════════════════════════
  
  async init() {
    console.log('🎬 Initialisation du système backstage...');
    
    // Positionne le groupe backstage
    this.backstageGroup.position.set(
      CONFIG.backstagePosition.x,
      CONFIG.backstagePosition.y,
      CONFIG.backstagePosition.z
    );
    
    // ⚠️ ROTATION GLOBALE pour pointer vers l'extérieur
    this.backstageGroup.rotation.y = CONFIG.backstageRotation;
    
    this.scene.add(this.backstageGroup);
    
    // Crée les éléments de base
    await this.createBackstageStructure();

    this.createAboutOnAirSign();

    // créer les éclairages 
    this.createBackstageLights();

    // Crée les éléments interactifs
    await this.createAboutMePanel();
    await this.createCVNotebook();
    await this.createClocks();
    await this.createDiploma();
    await this.createSymbolicObjects();
    await this.createSocialLinks();
    
    // Setup UI
    this.createTooltip();
    this.createCVModal();
    this.createDetailPanel();

    
    // Setup événements
    this.setupEventListeners();
    
    // Setup GUI pour debug
    //this.setupDebugGUI();
    
    this.isInitialized = true;
    console.log('✓ Système backstage initialisé');
    console.log('📐 Rotation backstage:', (CONFIG.backstageRotation * 180 / Math.PI).toFixed(0) + '°');
    
    return this;
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // DEBUG GUI
  // ═══════════════════════════════════════════════════════════════════
  
  /* setupDebugGUI() {
    this.gui = new GUI({ title: 'Backstage Debug', width: 320 });
    
    // Folder Rotation
    const rotFolder = this.gui.addFolder('🔄 Rotation Globale');
    rotFolder.add(this.backstageGroup.rotation, 'y', 0, Math.PI * 2, 0.01)
      .name('Rotation Y (rad)')
      .onChange(() => {
        console.log('Rotation:', (this.backstageGroup.rotation.y * 180 / Math.PI).toFixed(0) + '°');
      });
    
    const rotDegrees = { value: CONFIG.backstageRotation * 180 / Math.PI };
    rotFolder.add(rotDegrees, 'value', 0, 360, 1)
      .name('Rotation Y (degrés)')
      .onChange((val) => {
        this.backstageGroup.rotation.y = val * Math.PI / 180;
        CONFIG.backstageRotation = this.backstageGroup.rotation.y;
      });
    
    rotFolder.open();
    
    // Folder Position CV
    const cvFolder = this.gui.addFolder('📓 CV Position');
    cvFolder.add(CONFIG.cvNotebookPosition, 'x', -10, 10, 0.1).name('CV X');
    cvFolder.add(CONFIG.cvNotebookPosition, 'y', 0, 5, 0.1).name('CV Y');
    cvFolder.add(CONFIG.cvNotebookPosition, 'z', -20, -10, 0.1).name('CV Z');
    
    // Folder Horloges
    const clockFolder = this.gui.addFolder('🕐 Horloges Position');
    clockFolder.add(CONFIG.clocksPosition, 'x', -10, 10, 0.1).name('Clocks X');
    clockFolder.add(CONFIG.clocksPosition, 'y', 0, 5, 0.1).name('Clocks Y');
    clockFolder.add(CONFIG.clocksPosition, 'z', -20, -10, 0.1).name('Clocks Z');
    
    // Folder Music
    const musicFolder = this.gui.addFolder('🎵 Music Position');
    musicFolder.add(CONFIG.musicPosition, 'x', -10, 10, 0.1).name('Music X');
    musicFolder.add(CONFIG.musicPosition, 'y', 0, 5, 0.1).name('Music Y');
    musicFolder.add(CONFIG.musicPosition, 'z', -20, -10, 0.1).name('Music Z');
    
    // Bouton pour rafraîchir positions
    this.gui.add({ refresh: () => {
      console.log('🔄 Rafraîchissement des positions...');
      // Force update des objets
      this.backstageGroup.children.forEach(child => {
        child.updateMatrixWorld(true);
      });
    }}, 'refresh').name('🔄 Refresh Positions');
  } */
  
  // ═══════════════════════════════════════════════════════════════════
  // STRUCTURE BACKSTAGE (Murs, Sol, Éclairage)
  // ═══════════════════════════════════════════════════════════════════
  

  async createBackstageStructure() {
    const { width, depth, height } = CONFIG.backstageSize;
    
    // Sol backstage (plus clair, beige/gris clair)
   const floorGeom = new THREE.PlaneGeometry(width, depth);
   const floorMat = new THREE.MeshStandardMaterial({
     color: 0xd4d4d4,      // gris clair lumineux
     roughness: 0.7,
     metalness: 0.0
   });

    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.backstageGroup.add(floor);
    
    // Mur arrière (plus clair, bleu pâle/gris clair)
   const backWallGeom = new THREE.PlaneGeometry(width, height);
   const backWallMat = new THREE.MeshStandardMaterial({
     color: 0xb8c5d6,      // bleu gris clair (mur du fond)
     roughness: 0.85
   });

    const backWall = new THREE.Mesh(backWallGeom, backWallMat);
    backWall.position.set(0, height / 2, -depth / 2);
    backWall.receiveShadow = true;
    this.backstageGroup.add(backWall);
    
    // Murs latéraux (même couleur, gris clair)
   const sideWallGeom = new THREE.PlaneGeometry(depth, height);
   const sideWallMat = new THREE.MeshStandardMaterial({
     color: 0xc0c0c0,      // gris clair uniforme (gauche + droite)
     roughness: 0.8
   });

    
    // Mur gauche
    const leftWall = new THREE.Mesh(sideWallGeom, sideWallMat);
    leftWall.position.set(-width / 2, height / 2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    this.backstageGroup.add(leftWall);
    
    // Mur droit (clone du mur gauche → même couleur)
    const rightWall = new THREE.Mesh(sideWallGeom, sideWallMat.clone());
    rightWall.position.set(width / 2, height / 2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    this.backstageGroup.add(rightWall);
    
    console.log('✓ Structure backstage créée (colors: sol clair, mur arrière bleu, murs côtés gris)');
  }


    // ═══════════════════════════════════════════════════════════════════
  // LUMIÈRES BACKSTAGE (spot au-dessus du stage)
  // ═══════════════════════════════════════════════════════════════════
  createBackstageLights() {
  const { width, depth, height } = CONFIG.backstageSize;

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  this.backstageGroup.add(ambient);

  const spot = new THREE.SpotLight(
    0xffffff,
    2.5, // un peu plus fort
    Math.max(width, depth) * 3,
    Math.PI / 4,
    0.4,
    1
  );

  spot.position.set(0, height + 2, 0);

   // 🔥 IMPORTANT : activer les ombres du spot
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024); // qualité correcte
  spot.shadow.bias = -0.0001;          // pour limiter les artefacts


  const target = new THREE.Object3D();
  target.position.set(0, height / 2, 0);
  this.backstageGroup.add(target);

  spot.target = target;
  this.backstageGroup.add(spot);

  // 🔦 on stocke l’intensité cible pour le switch stage/backstage
  ambient.userData.targetIntensity = ambient.intensity;
  spot.userData.targetIntensity = spot.intensity;

  // off par défaut, le main décidera quand les allumer
  ambient.visible = true;
  spot.visible = true;

  this.backstageLights.ambient = ambient;
  this.backstageLights.spotlight = spot;
  this.backstageLights.spotlightTarget = target;

  // 👇 on passe les callbacks
  this.spotlightController = new SpotlightController(
    spot,
    ambient,
    this.backstageGroup,
    {
      onFocusStart: this.callbacks.onFocusStart,
      onFocusEnd: this.callbacks.onFocusEnd
    }
  );
}


  // ═══════════════════════════════════════════════════════════════════
  // ABOUT ME PANEL (Mur arrière gauche)
  // ═══════════════════════════════════════════════════════════════════
  
  async createAboutMePanel() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Dimensions canvas (haute résolution)
    canvas.width = 1024;
    canvas.height = Math.round(1024 * (CONFIG.aboutMeSize.height / CONFIG.aboutMeSize.width));
    
    // Fond beige/vintage
    ctx.fillStyle = '#f5f5dc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Bordure dorée
    ctx.strokeStyle = '#c9a961';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Texte
    ctx.fillStyle = '#2a2a2a';
    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.textAlign = 'center';
    
    // Split text en lignes
    const lines = ABOUT_ME_TEXT.split('\n');
    let y = 80;
    const lineHeight = 40;
    
    lines.forEach((line, index) => {
      if (index === 0) {
        // Titre en plus grand
        ctx.font = 'bold 36px Arial';
        ctx.fillText(line, canvas.width / 2, y);
        y += lineHeight + 20;
        ctx.font = '28px Arial';
      } else if (line.trim()) {
        ctx.fillText(line, canvas.width / 2, y);
        y += lineHeight;
      } else {
        y += lineHeight / 2;
      }
    });
    
    // Crée la texture
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    // Crée le mesh
    const geometry = new THREE.PlaneGeometry(
      CONFIG.aboutMeSize.width,
      CONFIG.aboutMeSize.height
    );
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8
    });
    
        const panel = new THREE.Mesh(geometry, material);
    panel.position.set(
      CONFIG.aboutMePosition.x,
      CONFIG.aboutMePosition.y,
      CONFIG.aboutMePosition.z
    );

    panel.castShadow = true;

    // 🔍 Interaction + zoom + description longue
    panel.userData = {
      type: 'about-me',
      interactive: true,
      hoverText: 'À propos de moi',
      lightOnHover: true,
      zoomOnClick: true,
      detailTitle: 'À propos de moi',
      detailText: ABOUT_ME_TEXT,
      // optionnel : tu peux fixer une distance de zoom spécifique
      zoomDistance: 6
    };

    // Halo discret
    this.addGlowOutline(panel, {
      color: 0xfff2b2,
      thickness: 1.03,
      opacity: 0.25,
      hoverOpacity: 0.8
    });

    this.interactiveObjects.push(panel);
    this.backstageGroup.add(panel);
    console.log('✓ About Me panel créé');
  }


  /// ══════════════════════════════════════════════════════════════════
  // PANNEAU "ABOUT ME" ON AIR (Mur arrière)
  // ══════════════════════════════════════════════════════════════════
  

  createAboutOnAirSign() {
  const { width, depth, height } = CONFIG.backstageSize;

  const signW = 3.2;
  const signH = 1.05;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(signW, signH), mat);

  // ✅ TOP-LEFT du mur du fond
  const marginX = 0.6;
  const marginY = 5.7;

  mesh.position.set(
    -width / 2 + signW / 2 + marginX,   // gauche
    height - signH / 2 - marginY,       // haut
    -depth / 2 + 0.03                   // collé au mur du fond
  );

  mesh.rotation.y = 0;
  mesh.rotation.x = -0.03; // léger tilt optionnel

  this.backstageGroup.add(mesh);

  this.aboutOnAirSign = { canvas, ctx, texture };
  this.drawAboutOnAirSign(1.0);
  texture.needsUpdate = true;

  console.log('✓ Panneau "About me" ON AIR ajouté (haut-gauche)');
}

drawAboutOnAirSign(glow = 1.0) {
  if (!this.aboutOnAirSign) return;
  const { canvas, ctx } = this.aboutOnAirSign;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Fond noir
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);

  // Cadre
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 18;
  ctx.strokeRect(18, 18, W - 36, H - 36);

  // Petite grille / texture légère (optionnel)
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#ffffff';
  for (let x = 30; x < W; x += 18) ctx.fillRect(x, 30, 1, H - 60);
  ctx.globalAlpha = 1.0;

  // Texte rouge qui “clignote”
  const alpha = 0.15 + 0.85 * glow;

  // Glow (néon)
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Lueur
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ff2b2b';
  ctx.shadowColor = '#ff0000';
  ctx.shadowBlur = 40 * glow;
  ctx.font = '900 120px Arial';
  ctx.fillText('About me', W / 2, H / 2 + 5);

  // Texte net au-dessus
  ctx.shadowBlur = 0;
  ctx.globalAlpha = Math.min(1, alpha + 0.15);
  ctx.fillStyle = '#ff3b3b';
  ctx.font = '900 120px Arial';
  ctx.fillText('About me', W / 2, H / 2 + 5);

  // Petit label style "ON AIR"
  ctx.globalAlpha = 0.9 * alpha;
  ctx.font = '700 34px Arial';
  ctx.fillText('● ON AIR', W / 2, 70);
  ctx.restore();
}

updateAboutOnAirSign(time) {
  if (!this.aboutOnAirSign) return;

  // Clignotement “néon”: pulse + petits décrochages
  const pulse = (Math.sin(time * 5.0) + 1) * 0.5;     // 0..1
  let glow = Math.pow(pulse, 2.6);                    // plus “blink” que “wave”

  // Micro-flicker occasionnel
  if (Math.sin(time * 17.0) > 0.985) glow *= 0.25;

  this.drawAboutOnAirSign(glow);
  this.aboutOnAirSign.texture.needsUpdate = true;
}

  


  // ═══════════════════════════════════════════════════════════════════
  // CV NOTEBOOK (Carnet 3D + Modal)
  // ═══════════════════════════════════════════════════════════════════
  
  async createCVNotebook() {
    const notebookGroup = new THREE.Group();
    
    // Couverture
    const coverGeom = new THREE.BoxGeometry(0.6, 0.02, 0.8);
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.8,
      metalness: 0.1
    });
    const cover = new THREE.Mesh(coverGeom, coverMat);
    cover.castShadow = true;
    notebookGroup.add(cover);
    
    // Pages (blanches, légèrement visibles sur le côté)
    const pagesGeom = new THREE.BoxGeometry(0.58, 0.015, 0.78);
    const pagesMat = new THREE.MeshStandardMaterial({
      color: 0xfaf0e6,
      roughness: 0.9
    });
    const pages = new THREE.Mesh(pagesGeom, pagesMat);
    pages.position.y = 0.02;
    notebookGroup.add(pages);
    
    // Texte sur la couverture (canvas texture)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(0, 0, 512, 512);
    
    ctx.fillStyle = '#f5deb3';
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Portfolio', 256, 220);
    ctx.fillText('& CV', 256, 280);
    
    const coverTexture = new THREE.CanvasTexture(canvas);
    cover.material.map = coverTexture;
    cover.material.needsUpdate = true;
    
    // Positionne le carnet
    notebookGroup.position.set(
      CONFIG.cvNotebookPosition.x ,
      CONFIG.cvNotebookPosition.y,
      CONFIG.cvNotebookPosition.z 
    );
    notebookGroup.scale.multiplyScalar(CONFIG.cvNotebookScale);
    notebookGroup.rotation.y = Math.PI * 0.1;
    
    // Rend interactif
    notebookGroup.userData = {
      type: 'cv-notebook',
      interactive: true,
      hoverText: 'Cliquez pour consulter mon CV'
    };
    
        // ✨ Contour brillant discret sur le carnet
    this.addGlowOutline(notebookGroup, {
      color: 0xfff2b2,
      thickness: 1.04,
      opacity: 0.25,
      hoverOpacity: 0.75
    });



    this.interactiveObjects.push(notebookGroup);
    this.backstageGroup.add(notebookGroup);
    
     
    // ★ rotation très légère
    this.addIdleRotation(notebookGroup, { axes: ['y'], speed: 0.1 });

    console.log('✓ CV Notebook créé');
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // HORLOGES FUSEAUX HORAIRES (CORRECTION ORIENTATION)
  // ═══════════════════════════════════════════════════════════════════
  
  async createClocks() {
    const timezones = [
      { name: 'Paris', emoji: '🏠', offset: 1 },
      { name: 'San Francisco', emoji: '🌉', offset: -8 },
      { name: 'Tokyo', emoji: '🗼', offset: 9 }
    ];
    
    timezones.forEach((tz, index) => {
      const clockGroup = new THREE.Group();
      
      // Fond horloge (rectangle noir)
      const bgGeom = new THREE.PlaneGeometry(2.1, 1.1);
      const bgMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        roughness: 0.3,
        emissive: 0xff0000,
        emissiveIntensity: 0.1
      });
      const bg = new THREE.Mesh(bgGeom, bgMat);
      clockGroup.add(bg);
      
      // Canvas pour l'affichage digital
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 256;
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      
      const displayMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true
      });
      const display = new THREE.Mesh(bgGeom, displayMat);
      display.position.z = 0.01;
      clockGroup.add(display);
      
      // Position relative
      const xOffset = (index - 1) * CONFIG.clockSpacing;
      clockGroup.position.set(
        CONFIG.clocksPosition.x + xOffset,
        CONFIG.clocksPosition.y - index * 0.5,
        CONFIG.clocksPosition.z + 0.1
      );

      
      // ⚠️ CORRECTION : Rotation pour faire face à la caméra (vers l'avant du backstage)
      // Le mur arrière est à z = -depth/2, donc les horloges doivent pointer vers +z localement
      clockGroup.rotation.y = 0; // Face au +z local (qui devient -z global après rotation du backstage)
      
      // Sauvegarde les données
      clockGroup.userData = {
        type: 'clock',
        timezone: tz.name,
        emoji: tz.emoji,
        offset: tz.offset,
        canvas: canvas,
        texture: texture
      };
      
      this.clocks.push(clockGroup);
      this.backstageGroup.add(clockGroup);
      
      console.log(`✓ Horloge ${tz.name} créée à position:`, clockGroup.position);
    });
    
    console.log('✓ Horloges créées (total:', this.clocks.length, ')');
  }
  
  // Update des horloges (appelé dans la boucle animate)
  updateClocks() {
    const now = new Date();
    
    this.clocks.forEach(clock => {
      const { canvas, texture, timezone, emoji, offset } = clock.userData;
      if (!canvas || !texture) return;
      
      const ctx = canvas.getContext('2d');
      
      // Calcule l'heure locale
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const localTime = new Date(utc + (3600000 * offset));
      
      const hours = String(localTime.getHours()).padStart(2, '0');
      const minutes = String(localTime.getMinutes()).padStart(2, '0');
      const seconds = String(localTime.getSeconds()).padStart(2, '0');
      
      // Efface le canvas
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, 512, 256);
      
      // Dessine l'heure (style LED rouge)
      ctx.fillStyle = '#ff0000';
      ctx.font = 'bold 80px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${hours}:${minutes}:${seconds}`, 256, 128);
      
      // Label ville + emoji
      ctx.fillStyle = '#ff6666';
      ctx.font = '32px Arial';
      ctx.fillText(`${emoji} ${timezone}`, 256, 200);
      
      texture.needsUpdate = true;
    });
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // DIPLÔME ENCADRÉ
  // ═══════════════════════════════════════════════════════════════════
  
  async createDiploma() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(1024 * (CONFIG.diplomaSize.height / CONFIG.diplomaSize.width));
    const ctx = canvas.getContext('2d');
    
    // Fond beige parchemin
    ctx.fillStyle = '#faf8f3';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Bordure dorée épaisse
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 30;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);
    
    // Motifs décoratifs coins
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 60px serif';
    ctx.fillText('✦', 60, 80);
    ctx.fillText('✦', canvas.width - 100, 80);
    ctx.fillText('✦', 60, canvas.height - 40);
    ctx.fillText('✦', canvas.width - 100, canvas.height - 40);
    
    // Texte du diplôme
    ctx.fillStyle = '#2a2a2a';
    ctx.textAlign = 'center';
    
    const lines = DIPLOMA_TEXT.split('\n');
    let y = 200;
    
    lines.forEach((line, index) => {
      if (index === 0) {
        ctx.font = 'bold 56px serif';
      } else if (index <= 2) {
        ctx.font = 'italic 42px serif';
      } else {
        ctx.font = '38px serif';
      }
      
      ctx.fillText(line, canvas.width / 2, y);
      y += 80;
    });
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    // Cadre doré
    const frameDepth = 0.05;
    const frameGroup = new THREE.Group();
    
    // Diplôme au centre
    const diplomaGeom = new THREE.PlaneGeometry(
      CONFIG.diplomaSize.width,
      CONFIG.diplomaSize.height
    );
    const diplomaMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8
    });
    const diploma = new THREE.Mesh(diplomaGeom, diplomaMat);
    frameGroup.add(diploma);
    
    // Cadre doré autour
    const frameThickness = 0.08;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.4,
      metalness: 0.6
    });
    
    // Haut
    const topFrame = new THREE.Mesh(
      new THREE.BoxGeometry(CONFIG.diplomaSize.width + frameThickness * 2, frameThickness, frameDepth),
      frameMat
    );
    topFrame.position.y = CONFIG.diplomaSize.height / 2 + frameThickness / 2;
    frameGroup.add(topFrame);
    
    // Bas
    const bottomFrame = topFrame.clone();
    bottomFrame.position.y = -CONFIG.diplomaSize.height / 2 - frameThickness / 2;
    frameGroup.add(bottomFrame);
    
    // Gauche
    const leftFrame = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, CONFIG.diplomaSize.height, frameDepth),
      frameMat
    );
    leftFrame.position.x = -CONFIG.diplomaSize.width / 2 - frameThickness / 2;
    frameGroup.add(leftFrame);
    
    // Droite
    const rightFrame = leftFrame.clone();
    rightFrame.position.x = CONFIG.diplomaSize.width / 2 + frameThickness / 2;
    frameGroup.add(rightFrame);
    
        // Positionne le groupe
    frameGroup.position.set(
      CONFIG.diplomaPosition.x,
      CONFIG.diplomaPosition.y,
      CONFIG.diplomaPosition.z + 0.1
    );

    frameGroup.rotation.y = Math.PI * 0.05;
    frameGroup.castShadow = true;

    // 🔍 Interaction + zoom
    frameGroup.userData = {
      type: 'diploma',
      interactive: true,
      hoverText: 'Diplôme & double master',
      lightOnHover: true,
      zoomOnClick: true,
      detailTitle: 'Diplôme & double master',
      detailText: DIPLOMA_TEXT,
      zoomDistance: 5.5
    };

    this.addGlowOutline(frameGroup, {
      color: 0xd4af37,
      thickness: 1.04,
      opacity: 0.3,
      hoverOpacity: 0.9
    });

    this.interactiveObjects.push(frameGroup);
    this.backstageGroup.add(frameGroup);
    
    console.log('✓ Diplôme créé');
  }

  
  
  // ═══════════════════════════════════════════════════════════════════
  // OBJETS SYMBOLIQUES (Épée, Dés, Manette, Partition)
  // ═══════════════════════════════════════════════════════════════════
  
  async createSymbolicObjects() {
    await this.createSwordAndDice();
    await this.createController();
    await this.createMusicSheet();

  }
  
  async createSwordAndDice() {
    // Charge le modèle GLTF de l'épée
    const gltf = await this.gltfLoader.loadAsync('./models/backstage/medieval_sword.glb');
    const sword = gltf.scene;
    sword.scale.set(1.5, 1.5, 1.5);
    // Juste après le chargement de l'épée, avant l'orbite
    sword.rotation.set(0, 0, Math.PI/2); // fait face à la caméra d'entrée

    sword.position.set(0, 0, 0);
    sword.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Charge le D20
    const dice_gltf = await this.gltfLoader.loadAsync('./models/backstage/d20.glb');
    const dice = dice_gltf.scene;
    dice.scale.set(0.005, 0.005, 0.005);
    
    dice.position.set(0, 0, 0);
    dice.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Crée le groupe avec orbite
    const swordDiceOrbit = new OrbitingGroup(sword, dice, {
      orbitRadius: 0.6,
      orbitSpeed: 0.9,
      yVariation: 0.8,
      centerImpulse: 2.5,
      centerGravity: 5.0,
      centerFallSpeed: 10.0,
      centerBottomPause: 1.1,
      centerTopPause: 0.25,
      orbitRotSpeedFactor: 0.75
    });

    // Position globale du groupe (comme avant)
    swordDiceOrbit.group.position.set(
  CONFIG.swordDicePosition.x,
  CONFIG.swordDicePosition.y,
  CONFIG.swordDicePosition.z
);


    swordDiceOrbit.group.userData = {
      type: 'sword-dice',
      interactive: true,
      hoverText: HOVER_TEXTS.swordDice,
      lightOnHover: true,        // le spot se focalise dessus au hover
      hoverAnimation: 'orbit',    // indicatif, au cas où tu veux filtrer plus tard
      zoomOnClick: true,         // ✅ zoom caméra autorisé
      detailTitle: 'Game design & JDR',
      detailText: DETAIL_TEXTS.swordDice

    };

        // ✨ Halo autour du groupe épée + dé
    this.addGlowOutline(swordDiceOrbit.group, {
      color: 0xffe4b5,
      thickness: 1.06,
      opacity: 0.3,
      hoverOpacity: 0.8
    });


    this.interactiveObjects.push(swordDiceOrbit.group);
    this.backstageGroup.add(swordDiceOrbit.group);
    this.orbitingGroups.push(swordDiceOrbit);

    // ★ Rotation idle UNIQUEMENT sur l'épée autour de son axe Y
   this.addIdleRotation(sword, { axes: ['y'], speed: 0.8 });

    console.log('✓ Épée + dés créés (avec orbite)');
  }

  

async createController() {
  // PIVOT = c'est lui qu'on fait tourner
  const pivot = new THREE.Group();
  pivot.position.set(
    CONFIG.controllerPosition.x,
    CONFIG.controllerPosition.y,
    CONFIG.controllerPosition.z
  );

  // HOLDER = orientation fixe du modèle
  const holder = new THREE.Group();
  pivot.add(holder);

  const gltf = await this.gltfLoader.loadAsync('./models/backstage/retro_controler.glb');
  const controller = gltf.scene;

  controller.scale.set(0.1, 0.1, 0.1);

  controller.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Orientation VISUELLE ici (inclinaison etc.)
  holder.rotation.set(-Math.PI / 6, 0, Math.PI / 8);
  holder.add(controller);

  // Interactions sur le PIVOT (c'est lui qu'on raycast + outline)
  pivot.userData = {
    type: 'controller',
    interactive: true,
    hoverText: HOVER_TEXTS.controller,
    lightOnHover: true,
    zoomOnClick: true,
    detailTitle: 'Manette & interaction',
    detailText: DETAIL_TEXTS.controller
  };

  this.addGlowOutline(pivot, {
    color: 0xbad7ff,
    thickness: 1.05,
    opacity: 0.3,
    hoverOpacity: 0.85
  });

  // Rotation idle = sur le pivot (rotation autour de son centre)
  this.addIdleRotation(pivot, { axes: ['y'], speed: 0.5 });

  this.interactiveObjects.push(pivot);
  this.backstageGroup.add(pivot);

  console.log('✓ Manette créée (pivot/holder)');
}

  
  // ═══════════════════════════════════════════════════════════════════
  // MUSIC SHEET (CORRECTION ORIENTATION + DOUBLE-SIDED)
  // ═══════════════════════════════════════════════════════════════════
  
  async createMusicSheet() {
    const group = new THREE.Group();

    try {
      // Charge le modèle GLTF
      const gltf = await this.gltfLoader.loadAsync('./models/backstage/piano.glb');
      const music = gltf.scene;

      // Reset scale first
      music.scale.set(3, 3, 3);
      music.position.set(0, 0, 0);
      music.rotation.set(0, 0, 0);

      // ⚠️ CRITIQUE : Assure que tous les matériaux sont double-sided + visibles
      music.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Force double-sided
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                mat.side = THREE.DoubleSide;
                mat.transparent = false;
                mat.opacity = 1;
                mat.needsUpdate = true;
              });
            } else {
              child.material.side = THREE.DoubleSide;
              child.material.transparent = false;
              child.material.opacity = 1;
              child.material.needsUpdate = true;
            }
          }
        }
      });

      // Auto-scale basé sur bbox
      const bbox = new THREE.Box3().setFromObject(music);
      const size = new THREE.Vector3();
      bbox.getSize(size);
      
      if (size.y > 0) {
        const desiredHeight = 0.6;
        const scaleFactor = desiredHeight / size.y;
        music.scale.multiplyScalar(scaleFactor);
        console.log('✓ Music sheet auto-scaled by', scaleFactor.toFixed(3));
      }

      group.add(music);

      // Position
      group.position.set(
        CONFIG.musicPosition.x,
        CONFIG.musicPosition.y,
        CONFIG.musicPosition.z
);

      
      // ⚠️ CORRECTION : Rotation pour faire face vers l'avant
      // Ajuste selon l'orientation de ton modèle GLB
      group.rotation.y = 0; // Commence à 0, ajuste si nécessaire

      group.userData = {
        type: 'music',
        interactive: true,
        hoverText: HOVER_TEXTS.music,
        lightOnHover: true,
        zoomOnClick: true,        // ✅ zoom caméra
        detailTitle: 'Musique & harmonie',
        detailText: DETAIL_TEXTS.music
      };


      // ✨ Contour brillant autour de la partition
      this.addGlowOutline(group, {
        color: 0xffcde4,
        thickness: 1.05,
        opacity: 0.3,
        hoverOpacity: 0.8
      });

     

       // ★ Légère rotation autour de Y
      this.addIdleRotation(group, { axes: ['y'], speed: 0.18 });

      this.interactiveObjects.push(group);
      this.backstageGroup.add(group);

      // Debug helpers
      const boxHelper = new THREE.BoxHelper(group, 0x00ff00);
      this.backstageGroup.add(boxHelper);

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      marker.position.copy(group.position);
      this.backstageGroup.add(marker);

      console.log('✓ Partition créée à position:', group.position);
      console.log('  Bbox size:', size);
      
    } catch (error) {
      console.error('❌ Erreur chargement music sheet:', error);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // LIENS SOCIAUX 3D
  // ═══════════════════════════════════════════════════════════════════
  
  async createSocialLinks() {
  const group = new THREE.Group();

  // Bigger cards (physical size, not scale)
  const CARD_W = 2.4;
  const CARD_H = 1.8;
  const CARD_D = 0.04;

  // Tilt the whole set toward camera
  group.rotation.x = - (CONFIG.socialLinksTiltX ?? 0.35);

  SOCIAL_LINKS.forEach((link, index) => {
    const cardGroup = new THREE.Group();

    // Card
    const cardGeom = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
    const cardMat = new THREE.MeshStandardMaterial({
      color: link.color,
      roughness: 0.4,
      metalness: 0.2
    });
    const card = new THREE.Mesh(cardGeom, cardMat);
    cardGroup.add(card);

    // Icon canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    ctx.font = 'bold 140px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(link.icon, 128, 105);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(link.name, 128, 200);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    // Bigger icon plane
    const iconGeom = new THREE.PlaneGeometry(1.6, 1.05);
    const iconMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide
    });

    const icon = new THREE.Mesh(iconGeom, iconMat);
    icon.position.z = (CARD_D / 2) + 0.002; // always in front of card
    cardGroup.add(icon);

    // Position / spacing
    const xOffset = (index - 1) * CONFIG.socialLinkSpacing;
    cardGroup.position.set(xOffset, 0, 0);

    // Floating baseline fix (so your update() doesn't add the parent's Y again)
    cardGroup.userData = {
      type: 'social-link',
      url: link.url,
      name: link.name,
      interactive: true,
      hoverText: `Ouvrir ${link.name}`,
      floatBaseY: cardGroup.position.y
    };

    this.addGlowOutline(cardGroup, {
      color: link.color,
      thickness: 1.04,
      opacity: 0.3,
      hoverOpacity: 0.85
    });

    this.interactiveObjects.push(cardGroup);
    group.add(cardGroup);
  });

  // Much closer
  group.position.set(
    CONFIG.socialLinksPosition.x,
    CONFIG.socialLinksPosition.y,
    CONFIG.socialLinksPosition.z
  );

  this.backstageGroup.add(group);
  console.log('✓ Liens sociaux créés (bigger + closer + tilted)');
}

  // ═══════════════════════════════════════════════════════════════════
  // TOOLTIP (UI DOM)
  // ═══════════════════════════════════════════════════════════════════
  
  createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.style.cssText = `
      position: fixed;
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.9);
      color: #fff;
      font: 14px/1.4 system-ui, Arial;
      border-radius: 8px;
      pointer-events: none;
      z-index: 1000;
      display: none;
      max-width: 300px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transform: translate(-50%, -120%);
    `;
    document.body.appendChild(this.tooltip);
  }
  
  showTooltip(text, x, y) {
    if (!this.tooltip) return;
    this.tooltip.textContent = text;
    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
    this.tooltip.style.display = 'block';
  }
  
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════
  // CV MODAL (UI DOM)
  // ═══════════════════════════════════════════════════════════════════
  
  createCVModal() {
    const overlay = document.createElement('div');
    overlay.id = 'cv-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      z-index: 2000;
      display: none;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(5px);
    `;
    
    const modal = document.createElement('div');
    modal.id = 'cv-modal';
    modal.style.cssText = `
      background: #faf8f3;
      border-radius: 12px;
      padding: 30px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      position: relative;
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      position: absolute;
      top: 15px;
      right: 15px;
      width: 40px;
      height: 40px;
      border: none;
      background: #d4af37;
      color: #fff;
      font-size: 24px;
      border-radius: 50%;
      cursor: pointer;
      transition: background 0.2s;
    `;
    closeBtn.onmouseover = () => closeBtn.style.background = '#c9a961';
    closeBtn.onmouseout = () => closeBtn.style.background = '#d4af37';
    closeBtn.onclick = () => this.hideCVModal();
    
    const cvViewer = document.createElement('div');
        cvViewer.style.cssText = `
          width: min(1000px, 92vw);
          height: min(80vh, 900px);
          background: #fff;
          border: 2px solid #d4af37;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 20px;
        `;

    const pdf = document.createElement('iframe');
    pdf.src = './images/PASSELAIGUE_Aurelien_CV_A5.pdf#toolbar=1&navpanes=0&view=FitH';
    pdf.title = 'CV (PDF)';
    pdf.style.cssText = `
      width: 100%;
      height: 100%;
      border: 0;
    `;
    pdf.setAttribute('loading', 'lazy');

    cvViewer.appendChild(pdf);

    const downloadBtn = document.createElement('a');
    downloadBtn.textContent = '📥 Télécharger le CV (PDF)';
    downloadBtn.href = './images/PASSELAIGUE_Aurelien_CV_A5.pdf';
    downloadBtn.download = 'CV_Aurelien_Passelaigue.pdf';
    downloadBtn.style.cssText = `
      display: inline-block;
      padding: 12px 24px;
      background: #d4af37;
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font: bold 16px Arial;
      transition: background 0.2s;
    `;
    downloadBtn.onmouseover = () => downloadBtn.style.background = '#c9a961';
    downloadBtn.onmouseout = () => downloadBtn.style.background = '#d4af37';
    
    modal.appendChild(closeBtn);
    modal.appendChild(cvViewer);

    modal.appendChild(downloadBtn);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    this.cvModal = overlay;
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideCVModal();
    });
    
        document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;

      if (this.cvModal && this.cvModal.style.display === 'flex') {
        this.hideCVModal();
      }

      if (this.detailPanel && this.detailPanel.style.display === 'block') {
        this.hideDetailPanel();
        this.resetCameraZoom();
      }
    });

  }

  
  
    showCVModal() {
    if (this.cvModal) {
      this.clearHoverState();
      this.cvModal.style.display = 'flex';
    }
  }

    hideCVModal() {
    if (this.cvModal) {
      this.cvModal.style.display = 'none';
    }
  }

  showDetailPanel(title, text) {
    if (!this.detailPanel) return;
    this.clearHoverState();
    this.detailPanelTitle.textContent = title || '';
    this.detailPanelBody.textContent = text || '';
    this.detailPanel.style.display = 'block';
  }

  
  // ═══════════════════════════════════════════════════════════════════
  // PANNEAU DE DÉTAIL (description longue au clic)
  // ═══════════════════════════════════════════════════════════════════

  createDetailPanel() {
    const panel = document.createElement('div');
    panel.id = 'backstage-detail-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 24px;
      left: 24px;
      max-width: 420px;
      background: rgba(0, 0, 0, 0.88);
      color: #fff;
      padding: 16px 20px;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      z-index: 1900;
      display: none;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;

    const title = document.createElement('div');
    title.id = 'backstage-detail-title';
    title.style.cssText = `
      font-weight: 600;
      margin-bottom: 8px;
      font-size: 16px;
    `;

    const body = document.createElement('div');
    body.id = 'backstage-detail-body';
    body.style.cssText = `
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-line;
    `;

    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Fermer';
    closeBtn.style.cssText = `
      margin-top: 12px;
      padding: 6px 12px;
      border-radius: 999px;
      border: none;
      background: #d4af37;
      color: #000;
      font-size: 13px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => {
      this.hideDetailPanel();
      this.resetCameraZoom();
    };

    panel.appendChild(title);
    panel.appendChild(body);
    panel.appendChild(closeBtn);
    document.body.appendChild(panel);

    this.detailPanel = panel;
    this.detailPanelTitle = title;
    this.detailPanelBody = body;
  }

  showDetailPanel(title, text) {
    if (!this.detailPanel) return;
    this.detailPanelTitle.textContent = title || '';
    this.detailPanelBody.textContent = text || '';
    this.detailPanel.style.display = 'block';
  }

  hideDetailPanel() {
    if (this.detailPanel) {
      this.detailPanel.style.display = 'none';
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  // ZOOM CAMÉRA SUR OBJET BACKSTAGE
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  // ZOOM CAMÉRA SUR OBJET BACKSTAGE
  // ═══════════════════════════════════════════════════════════════════

      // ═══════════════════════════════════════════════════════════════════
  // ZOOM CAMÉRA SUR OBJET BACKSTAGE (style CameraZoomController)
  // ═══════════════════════════════════════════════════════════════════
  focusCameraOnObject(obj) {
    if (!this.camera || !obj) return;

    // 1) Centre visuel via bounding box
    const bbox = new THREE.Box3().setFromObject(obj);
    const size = bbox.getSize(new THREE.Vector3());
    const center = bbox.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;

    // 2) Sauvegarder l’état caméra AVANT le premier zoom
    if (!this.isZoomed) {
      const currentPos = this.camera.position.clone();

      let currentTarget;
      if (this.controls && this.controls.target) {
        currentTarget = this.controls.target.clone();
      } else {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        currentTarget = currentPos.clone().add(dir);
      }

      this.cameraPrevPosition = currentPos;
      this.cameraPrevTarget = currentTarget;
    }

    // 3) Direction “face avant” du backstage en coordonnées monde
    //    (local +Z du backstage → direction vers le public)
    const frontDirWorld = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(this.backstageGroup.quaternion)
      .normalize();

    // 4) Paramètres de zoom (peuvent être override par userData)
    const zoomDistance =
      (obj.userData && obj.userData.zoomDistance) ||
      radius * 3.0;         // distance standard

    const verticalOffset =
      (obj.userData && typeof obj.userData.zoomVerticalOffset === 'number')
        ? obj.userData.zoomVerticalOffset
        : 0;                 // pas de décalage vertical par défaut

    const cameraOffset = frontDirWorld.clone().multiplyScalar(zoomDistance);
    cameraOffset.y += verticalOffset;

    const targetCameraPos = center.clone().add(cameraOffset);
    const lookTarget = center.clone();

    this.isZoomed = true;
    this.zoomedObject = obj;

    const self = this;

    gsap.to(this.camera.position, {
      x: targetCameraPos.x,
      y: targetCameraPos.y,
      z: targetCameraPos.z,
      duration: 0.7,
      ease: 'power2.inOut',
      onUpdate() {
        self.camera.lookAt(lookTarget);

        if (self.controls && self.controls.target) {
          self.controls.target.copy(lookTarget);
          if (self.controls.update) self.controls.update();
        }
      }
    });
  }



        resetCameraZoom() {
    if (!this.isZoomed) return;

    this.isZoomed = false;
    this.zoomedObject = null;

    const targetPos = (this.cameraPrevPosition || this.cameraInitialPosition).clone();
    const targetLookAt = (this.cameraPrevTarget || this.cameraInitialTarget).clone();

    const self = this;

    gsap.to(this.camera.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 0.7,
      ease: 'power2.inOut',
      onUpdate() {
        self.camera.lookAt(targetLookAt);

        if (self.controls && self.controls.target) {
          self.controls.target.copy(targetLookAt);
          if (self.controls.update) self.controls.update();
        }
      }
    });
  }





  // ═══════════════════════════════════════════════════════════════════
  // EVENT LISTENERS (Mouse, Raycasting)
  // ═══════════════════════════════════════════════════════════════════
  
  setupEventListeners() {
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('click', (e) => this.onClick(e));
  }
  
     onMouseMove(event) {
    // UI ouverte → pas d’interaction visuelle avec le décor
    if (this.cvModal && this.cvModal.style.display === 'flex') {
      this.hideTooltip();
      document.body.style.cursor = 'default';
      return;
    }
    if (this.detailPanel && this.detailPanel.style.display === 'block') {
      this.hideTooltip();
      document.body.style.cursor = 'default';
      return;
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData.interactive) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData.interactive) {
        document.body.style.cursor = 'pointer';
        
        if (obj.userData.hoverText) {
          this.showTooltip(obj.userData.hoverText, event.clientX, event.clientY);
        }
        
        if (this.hoveredObject !== obj) {
          // Reset ancien hover
          if (this.hoveredObject) {
            gsap.to(this.hoveredObject.scale, {
              x: 1, y: 1, z: 1,
              duration: 0.2
            });

            // Halo ancien objet → état normal
            this.setGlowState(this.hoveredObject, false);
          }

          // Nouvelle mise en avant (scale)
          gsap.to(obj.scale, {
            x: 1.1, y: 1.1, z: 1.1,
            duration: 0.2
          });

          // Halo nouvel objet → highlight
          this.setGlowState(obj, true);

          // ★ Spotlight : uniquement si autorisé pour cet objet
          const wantsLight = (obj.userData.lightOnHover !== false);
          if (this.spotlightController && wantsLight) {
            console.log('🔦 Spotlight focus on:', obj.userData.type);
            this.spotlightController.focusOnObject(obj);
          }

          this.hoveredObject = obj;
        }

        
        return;
      }
    }
    
        /// AUCUN OBJET SOUS LA SOURIS
      document.body.style.cursor = 'default';
      this.hideTooltip();

          if (this.hoveredObject) {
      gsap.to(this.hoveredObject.scale, {
        x: 1, y: 1, z: 1,
        duration: 0.2
      });

          // Halo retour à la normale
          this.setGlowState(this.hoveredObject, false);

          this.hoveredObject = null;
        

        // Et seulement à ce moment-là on remet la lumière par défaut
        if (this.spotlightController) {
          this.spotlightController.returnToDefault();
        }
      }

  }

     onClick(event) {
    // UI ouverte → pas de clic sur le décor
    if (this.cvModal && this.cvModal.style.display === 'flex') {
      return;
    }
    if (this.detailPanel && this.detailPanel.style.display === 'block') {
      return;
    }

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.interactiveObjects, true);
    
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj && !obj.userData.interactive) {
        obj = obj.parent;
      }
      
      if (obj && obj.userData.interactive) {
        this.handleInteraction(obj);
      }
    }
  }

  
  
        handleInteraction(obj) {
    const type = obj.userData.type;
    
    console.log(`🖱️ Clic sur : ${type}`);

    // Si on est déjà zoomé sur cet objet → toggle retour
    if (this.isZoomed && this.zoomedObject === obj) {
      this.hideDetailPanel();
      this.resetCameraZoom();
      return;
    }

    switch (type) {
      case 'cv-notebook':
        this.showCVModal();
        break;
        
      case 'social-link':
        if (obj.userData.url) {
          window.open(obj.userData.url, '_blank', 'noopener,noreferrer');
        }
        break;
        
      case 'sword-dice':
      case 'controller':
      case 'music':
      case 'about-me':
      case 'diploma':
        // petit feedback scale
        gsap.to(obj.scale, {
          x: 1.2, y: 1.2, z: 1.2,
          duration: 0.15,
          yoyo: true,
          repeat: 1
        });

        // 🔍 Zoom caméra
        if (obj.userData.zoomOnClick) {
          this.focusCameraOnObject(obj);
        }

        // 📝 Description longue
        if (obj.userData.detailText) {
          this.showDetailPanel(
            obj.userData.detailTitle || 'Détail',
            obj.userData.detailText
          );
        }
        break;
    }
  }



  
  // ═══════════════════════════════════════════════════════════════════
  // UPDATE LOOP (Appelé dans animate())
  // ═══════════════════════════════════════════════════════════════════
  
  update(delta) {
  if (!this.isInitialized) return;

  // Utiliser delta directement, avec un fallback raisonnable
  const dt = (typeof delta === 'number' && delta > 0) ? delta : 0.016;

  // Social links qui flottent (si tu en as besoin)
  const time = Date.now() * 0.001;
  this.interactiveObjects.forEach((obj, index) => {
    if (obj.userData.type === 'social-link') {
    const baseY = obj.userData.floatBaseY ?? 0;
    obj.position.y = baseY + Math.sin(time * 2 + index * 0.5) * 0.08;
  }

  });
    this.updateAboutOnAirSign(time);

  // Orbites (épée/dé)
  this.orbitingGroups.forEach(group => {
    group.update(dt);
  });

  // Rotations idle (CV, manette, partition, etc.)
  this.idleRotations.forEach(entry => {
    const s = dt * entry.speed;
    entry.axes.forEach(axis => {
      if (axis === 'x') entry.object.rotation.x += s;
      if (axis === 'y') entry.object.rotation.y += s;
      if (axis === 'z') entry.object.rotation.z += s;
    });
  });

  // Horloges
  this.updateClocks();

  // Spotlight
  if (this.spotlightController) {
    this.spotlightController.animate();
  }
}


  
  // ═══════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════════════
  
  dispose() {
    this.interactiveObjects.forEach(obj => {
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    
    if (this.tooltip) {
      this.tooltip.remove();
    }
    if (this.cvModal) {
      this.cvModal.remove();
    }
   /*  if (this.gui) {
      this.gui.destroy();
    }
     */
    this.backstageGroup.removeFromParent();
    
    console.log('✓ Backstage system disposed');
  }
}

// ═══════════════════════════════════════════════════════════════════
// FONCTION D'INITIALISATION PUBLIQUE
// ═══════════════════════════════════════════════════════════════════

export async function initBackstageSystem(scene, camera, renderer, callbacks = {}) {
  const backstage = new BackstageSystem(scene, camera, renderer, callbacks);
  await backstage.init();
  return backstage;
}

export default BackstageSystem;
export { BackstageSystem };
export { SpotlightController};
