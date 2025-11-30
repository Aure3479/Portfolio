/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  SYSTÈME AUDIO ACCORDÉON V3.3 FINAL - Tous les sons + Auto-Loop       ║
 * ║                                                                        ║
 * ║  ✅ 15 notes simples (A2-G4)                                           ║
 * ║  ✅ 9 accords 5 notes avec variantes (_down, _var)                     ║
 * ║  ✅ Boucle infinie + Respirations dynamiques                           ║
 * ║  ✅ Anti-répétition intelligent (variantes + accords)                  ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'https://esm.sh/gsap@3';

// ═══════════════════════════════════════════════════════════════════════
// 1. CONFIGURATION AUDIO COMPLÈTE
// ═══════════════════════════════════════════════════════════════════════

/*
 * 🛠️ COMMENT AJOUTER UNE NOUVELLE VARIANTE :
 * -------------------------------------------
 * 1. Ajoutez le fichier dans AUDIO_CONFIG.sounds[N]
 * 2. Liez-le à son accord de base dans VARIANT_GROUPS
 * 3. Copiez les notes de l'accord de base dans CHORD_NOTE_MAP
 */

const AUDIO_CONFIG = {
  basePath: './sounds/raw_personnal/',
  
  sounds: {
    // ═══════════════════════════════════════════════════════
    // 1 NOTE - 15 notes complètes (A2 à G4)
    // ═══════════════════════════════════════════════════════
    1: {
      'A2': 'single/normal/A2.mp3',
      'A4': 'single/normal/A4.mp3',
      'B2': 'single/normal/B2.mp3',
      'B4': 'single/normal/B4.mp3',
      'C2': 'single/normal/C2.mp3',
      'C4': 'single/normal/C4.mp3',
      'C5': 'single/normal/C5.mp3',
      'D2': 'single/normal/D2.mp3',
      'D4': 'single/normal/D4.mp3',
      'E2': 'single/normal/E2.mp3',
      'E4': 'single/normal/E4.mp3',
      'F1': 'single/normal/F1.mp3',
      'F4': 'single/normal/F4.mp3',
      'G1': 'single/normal/G1.mp3',
      'G4': 'single/normal/G4.mp3'
    },
    
    // ═══════════════════════════════════════════════════════
    // 2 NOTES (Gardez vos accords existants ou ajoutez-en)
    // ═══════════════════════════════════════════════════════
    2: {
      'C4_E4': 'double/C4_E4.mp3',
      'C4_G4': 'double/C4_G4.mp3',
      'D4_A4': 'double/D4_A4.mp3',
      'E4_G4': 'double/E4_G4.mp3',
      'F4_A5': 'double/F4_A5.mp3',
      'G4_B5': 'double/G4_B5.mp3',
      'A5_C5': 'double/A5_C5.mp3'
    },
    
    // ═══════════════════════════════════════════════════════
    // 3 NOTES (Gardez vos triades)
    // ═══════════════════════════════════════════════════════
    3: {
      'C_major': '3notes/C_major.mp3',
      'D_major': '3notes/D_major.mp3',
      'E_major': '3notes/E_major.mp3',
      'F_major': '3notes/F_major.mp3',
      'G_major': '3notes/G_major.mp3',
      'A_major': '3notes/A_major.mp3',
      'A_minor': '3notes/A_minor.mp3',
      'E_minor': '3notes/E_minor.mp3',
      'D_minor': '3notes/D_minor.mp3'
    },
    
    // ═══════════════════════════════════════════════════════
    // 4 NOTES (Gardez vos accords de 7e)
    // ═══════════════════════════════════════════════════════
    4: {
      'C_major7': '4notes/C_major.mp3',
      'D_minor7': '4notes/D_minor.mp3',
      'G_dominant7': '4notes/g_dominant.mp3',
      'A_dominant': '4notes/A_dominant.mp3'
    },
    
    // ═══════════════════════════════════════════════════════
    // 5 NOTES - AVEC TOUTES LES VARIANTES
    // ═══════════════════════════════════════════════════════
    5: {
      // A_minor9 (3 variantes)
      'A_minor9': '5notes/A_minor9.mp3',
      'A_minor9_down': '5notes/A_minor9_down.mp3',
      'A_minor9_var': '5notes/A_minor9_var.mp3',
      
      // C_major9 (2 variantes)
      'C_major9': '5notes/C_major9.mp3',
      'C_major9_down': '5notes/C_major9_down.mp3',
      
      // D_minor9 (2 variantes)
      'D_minor9': '5notes/D_minor9.mp3',
      'D_minor9_down': '5notes/D_minor9_down.mp3',
      
      // G_major_extended (2 variantes)
      'G_major_ext': '5notes/G_major_ext.mp3',
      'G_major_ext_down': '5notes/G_major_ext_down.mp3'
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 2. GROUPES DE VARIANTES
// ═══════════════════════════════════════════════════════════════════════

const VARIANT_GROUPS = {
  // A_minor9 → 3 variantes
  'A_minor9': 'A_minor9',
  'A_minor9_down': 'A_minor9',
  'A_minor9_var': 'A_minor9',
  
  // C_major9 → 2 variantes
  'C_major9': 'C_major9',
  'C_major9_down': 'C_major9',
  
  // D_minor9 → 2 variantes
  'D_minor9': 'D_minor9',
  'D_minor9_down': 'D_minor9',
  
  // G_major_extended → 2 variantes
  'G_major_ext': 'G_major_ext',
  'G_major_ext_down': 'G_major_ext'
};

function getBaseChord(chordName) {
  return VARIANT_GROUPS[chordName] || chordName;
}

function getVariants(baseChord) {
  const variants = Object.keys(VARIANT_GROUPS).filter(v => VARIANT_GROUPS[v] === baseChord);
  return variants.length > 0 ? variants : [baseChord];
}

// ═══════════════════════════════════════════════════════════════════════
// 3. THÉORIE MUSICALE (CONSONANCE & NOTES)
// ═══════════════════════════════════════════════════════════════════════

const CONSONANCE_MATRIX = {
  0: 10, 1: 1, 2: 3, 3: 7, 4: 9, 5: 8,
  6: 2, 7: 10, 8: 6, 9: 8, 10: 4, 11: 2
};

const MIN_CONSONANCE = 6.0;

const CHORD_NOTE_MAP = {
  // 1 NOTE - Toutes les notes simples
  'A2': ['A2'], 'A4': ['A4'],
  'B2': ['B2'], 'B4': ['B4'],
  'C2': ['C2'], 'C4': ['C4'], 'C5': ['C5'],
  'D2': ['D2'], 'D4': ['D4'],
  'E2': ['E2'], 'E4': ['E4'],
  'F1': ['F1'], 'F4': ['F4'],
  'G1': ['G1'], 'G4': ['G4'],
  
  // 2 NOTES
  'C4_E4': ['C4', 'E4'], 'C4_G4': ['C4', 'G4'],
  'D4_A4': ['D4', 'A4'], 'E4_G4': ['E4', 'G4'],
  'F4_A5': ['F4', 'A5'], 'G4_B5': ['G4', 'B5'],
  'A5_C5': ['A5', 'C5'],
  
  // 3 NOTES
  'C_major': ['C4', 'E4', 'G4'],
  'D_major': ['D4', 'F#4', 'A4'],
  'E_major': ['E4', 'G#4', 'B4'],
  'F_major': ['F4', 'A4', 'C5'],
  'G_major': ['G4', 'B4', 'D5'],
  'A_major': ['A4', 'C#5', 'E5'],
  'A_minor': ['A4', 'C5', 'E5'],
  'E_minor': ['E4', 'G4', 'B4'],
  'D_minor': ['D4', 'F4', 'A4'],
  
  // 4 NOTES
  'C_major7': ['C4', 'E4', 'G4', 'B4'],
  'D_minor7': ['D4', 'F4', 'A4', 'C5'],
  'G_dominant7': ['G4', 'B4', 'D5', 'F5'],
  'A_dominant': ['A4', 'C#5', 'E5', 'G5'],
  
  // 5 NOTES - Toutes les variantes partagent les mêmes notes
  'A_minor9': ['A4', 'C5', 'E5', 'G5', 'B5'],
  'A_minor9_down': ['A4', 'C5', 'E5', 'G5', 'B5'],
  'A_minor9_var': ['A4', 'C5', 'E5', 'G5', 'B5'],
  
  'C_major9': ['C4', 'E4', 'G4', 'B4', 'D5'],
  'C_major9_down': ['C4', 'E4', 'G4', 'B4', 'D5'],
  
  'D_minor9': ['D4', 'F4', 'A4', 'C5', 'E5'],
  'D_minor9_down': ['D4', 'F4', 'A4', 'C5', 'E5'],
  
  'G_major_ext': ['G4', 'B4', 'D5', 'F5', 'A5'],
  'G_major_ext_down': ['G4', 'B4', 'D5', 'F5', 'A5']
};

// ═══════════════════════════════════════════════════════════════════════
// 4. CLASSE PRINCIPALE - AUTO-LOOP + ANTI-RÉPÉTITION
// ═══════════════════════════════════════════════════════════════════════

class FilteredAccordionSoundManager {
  constructor(cameraRef) {
    if (!cameraRef) throw new Error('Camera requise');
    
    this.listener = new THREE.AudioListener();
    cameraRef.add(this.listener);
    
    this.sounds = {};
    this.currentChord = null;
    this.previousChord = null;
    this.currentFilterCount = 0;
    this.isPlaying = false;
    
     // 🔇 état mute
    this.isMuted = false;

    // HISTORIQUE ANTI-RÉPÉTITION
    this.baseChordHistory = [];
    this.maxBaseChordHistory = 5;
    this.variantHistory = new Map();
    this.maxVariantHistory = 3;
    
    // SYSTÈME DE BOUCLE
    this.loopTimer = null;
    this.consecutivePlayCount = 0;
    this.baseDuration = 2.5;
    
    this.audioLoader = new THREE.AudioLoader();
    console.log('✓ Audio System V3.3 FINAL (15 notes + 9 accords 5 notes + Auto-Loop)');
  }
  
  async loadAllSounds() {
    let total = 0, loaded = 0;
    for (const n in AUDIO_CONFIG.sounds) total += Object.keys(AUDIO_CONFIG.sounds[n]).length;
    
    console.log(`📂 Chargement de ${total} sons...`);
    
    for (const noteCount in AUDIO_CONFIG.sounds) {
      for (const [name, path] of Object.entries(AUDIO_CONFIG.sounds[noteCount])) {
        try {
          const buffer = await this.audioLoader.loadAsync(AUDIO_CONFIG.basePath + path);
          const sound = new THREE.Audio(this.listener);
          sound.setBuffer(buffer);
          sound.setVolume(0.35);
          this.sounds[name] = sound;
          loaded++;
          
          if (loaded % 10 === 0 || loaded === total) {
            console.log(`  ✓ ${loaded}/${total} sons chargés`);
          }
        } catch (e) {
          console.warn(`  ✗ Erreur: ${name}`);
        }
      }
    }
    console.log(`✓ ${loaded}/${total} sons prêts.`);
    return this.sounds;
  }
  
  noteToSemitone(note) {
    const vals = { 'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11 };
    const oct = parseInt(note.slice(note.search(/\d/)));
    const mod = note.includes('#') ? 1 : note.includes('b') ? -1 : 0;
    return oct * 12 + (vals[note[0]] || 0) + mod;
  }
  
  calculateConsonance(chord1, chord2) {
    if (!chord1 || !chord2) return 0;
    const notes1 = CHORD_NOTE_MAP[getBaseChord(chord1)] || CHORD_NOTE_MAP[chord1];
    const notes2 = CHORD_NOTE_MAP[getBaseChord(chord2)] || CHORD_NOTE_MAP[chord2];
    if (!notes1 || !notes2) return 0;
    
    let sum = 0, count = 0;
    notes1.forEach(n1 => notes2.forEach(n2 => {
      sum += CONSONANCE_MATRIX[Math.abs(this.noteToSemitone(n1) - this.noteToSemitone(n2)) % 12] || 0;
      count++;
    }));
    return count ? sum / count : 0;
  }
  
  getAvailableChords(noteCount) {
    return AUDIO_CONFIG.sounds[noteCount] ? Object.keys(AUDIO_CONFIG.sounds[noteCount]) : [];
  }

  selectVariant(baseChord) {
    const variants = getVariants(baseChord);
    if (variants.length <= 1) return variants[0];
    
    const history = this.variantHistory.get(baseChord) || [];
    const weights = variants.map(v => {
      const idx = history.lastIndexOf(v);
      return idx === -1 ? 10 : Math.max(1, (history.length - idx) * 2);
    });
    
    let pick = this.weightedRandomPick(variants, weights);
    history.push(pick);
    if (history.length > this.maxVariantHistory) history.shift();
    this.variantHistory.set(baseChord, history);
    
    return pick;
  }

  calculateAvoidanceWeight(baseChord) {
    const idx = this.baseChordHistory.lastIndexOf(baseChord);
    return idx === -1 ? 10 : Math.max(1, (this.baseChordHistory.length - idx) * 2);
  }

  weightedRandomPick(items, weights) {
    let random = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    return items[0];
  }
  
  findConsonantChord(maxNotes, previousChord) {
    const candidates = [];
    const probWeights = { [maxNotes]: 0.7, [maxNotes-1]: 0.2, [maxNotes-2]: 0.1 };
    
    for (let n = Math.max(1, maxNotes - 2); n <= maxNotes; n++) {
      const avail = this.getAvailableChords(n);
      const count = Math.round((probWeights[n] || 0) * 10);
      for(let i=0; i<count; i++) candidates.push(...avail);
    }
    if (candidates.length === 0) return null;

    if (!previousChord) {
      const randomChord = candidates[Math.floor(Math.random() * candidates.length)];
      return this.selectVariant(getBaseChord(randomChord));
    }

    const uniqueBases = [...new Set(candidates.map(c => getBaseChord(c)))];
    const consonantBases = uniqueBases.filter(b => 
      this.calculateConsonance(previousChord, b) >= MIN_CONSONANCE
    );

    const pool = consonantBases.length > 0 ? consonantBases : uniqueBases;
    const avoidWeights = pool.map(b => this.calculateAvoidanceWeight(b));
    const chosenBase = this.weightedRandomPick(pool, avoidWeights);

    this.baseChordHistory.push(chosenBase);
    if (this.baseChordHistory.length > this.maxBaseChordHistory) this.baseChordHistory.shift();

    return this.selectVariant(chosenBase);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SYSTÈME DE BOUCLE AUTOMATIQUE
  // ═══════════════════════════════════════════════════════════════════

  playChordForFilterCount(filterCount) {
    if (this.isMuted) return; 
    if (this.currentFilterCount === filterCount && this.loopTimer !== null) return;
    
    console.log(`🎚️ Filtres: ${filterCount}`);
    this.stopLoop();
    this.currentFilterCount = filterCount;
    this.consecutivePlayCount = 0;

    if (filterCount === 0) {
      this.stopAllSounds();
      this.baseChordHistory = [];
      this.variantHistory.clear();
      console.log('🔇 Silence (Historique réinitialisé)');
      return;
    }

    this.playLoopStep();
  }

  playLoopStep() {
    if (this.isMuted) return; 
    if (this.currentFilterCount === 0) return;

    const maxNotes = Math.min(this.currentFilterCount, 5);
    const chord = this.findConsonantChord(maxNotes, this.currentChord);

    if (chord) {
      this.playSoundFile(chord);
      this.consecutivePlayCount++;
      console.log(`🎵 ${chord} (Base: ${getBaseChord(chord)})`);
    }

    let nextDelay = this.baseDuration * 1000;
    
    if (this.consecutivePlayCount > 4) {
      const fatigue = Math.random() * 1500 + 500;
      nextDelay += fatigue;
      if (Math.random() > 0.5) this.consecutivePlayCount = 0;
    } else {
      nextDelay -= 200;
    }

    this.loopTimer = setTimeout(() => this.playLoopStep(), nextDelay);
  }

  playSoundFile(chordName) {
    if (this.isMuted) return; 
    if (!this.sounds[chordName]) return;
    
    this.previousChord = this.currentChord;
    this.stopAllSounds();

    const sound = this.sounds[chordName];
    if (sound.isPlaying) sound.stop();
    sound.play();
    
    this.currentChord = chordName;
    this.isPlaying = true;
  }

  stopLoop() {
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
  }

  stopAllSounds() {
    if (this.currentChord && this.sounds[this.currentChord]) {
      this.sounds[this.currentChord].stop();
    }
    this.isPlaying = false;
  }
  
    // ▶ Jouer un accord ponctuel quand on clique l’accordéon
  playHitChord() {
    if (this.isMuted) return;
    if (!Object.keys(this.sounds).length) return;

    // On prend jusqu'à 5 notes, avec l’algo de consonance existant
    const maxNotes = 5;
    const refChord = this.currentChord || this.previousChord || null;
    const chord = this.findConsonantChord(maxNotes, refChord);

    if (!chord) return;
    this.playSoundFile(chord);   // réutilise ta logique existante
    console.log(`🪗 Hit sur accordéon → ${chord}`);
  }

    setMuted(muted) {
    this.isMuted = muted;
    if (muted) {
      this.stopLoop();
      this.stopAllSounds();
      console.log('🔇 Mute ON');
    } else {
      console.log('🔊 Mute OFF');
      // si des filtres sont actifs, on relance la boucle
      if (this.currentFilterCount > 0) {
        this.playLoopStep();
      }
    }
  }


  getStatus() {
    return {
      active: this.isPlaying,
      current: this.currentChord,
      filterCount: this.currentFilterCount,
      historyBase: this.baseChordHistory.join('→'),
      loopActive: this.loopTimer !== null,
      soundsLoaded: Object.keys(this.sounds).length
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 5. EXPORTS ET INITIALISATION
// ═══════════════════════════════════════════════════════════════════════

let audioManager = null;

async function initializeAudioSystem(cameraRef) {
  if (!cameraRef) return null;
  audioManager = new FilteredAccordionSoundManager(cameraRef);
  await audioManager.loadAllSounds();
  window.audioManager = audioManager;      
  return audioManager;
}

function playAccordionHit() {
  if (!audioManager) return;
  audioManager.playHitChord();
}

window.playAccordionHit = playAccordionHit;

function updateAudioFromFilters(activeFilters) {
  if (!audioManager) return;
  audioManager.playChordForFilterCount(activeFilters.size);
}

window.audioManager = null;
window.initializeAudioSystem = initializeAudioSystem;
window.updateAudioFromFilters = updateAudioFromFilters;

window.addEventListener('keydown', (e) => {
  if (!audioManager) return;
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    console.log('📊 Status:', audioManager.getStatus());
  }
  if (e.key === 'm') {
    audioManager.stopLoop();
    audioManager.stopAllSounds();
    console.log('🔇 Arrêté manuellement');
  }
});

export { FilteredAccordionSoundManager, initializeAudioSystem, updateAudioFromFilters, playAccordionHit };
