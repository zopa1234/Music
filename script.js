/* =========================================================
   STATE
   ========================================================= */
const SLOT_WIDTH = 28;
const TOTAL_MEASURES = 50;
const SUBDIVISIONS = 4;

let state = {
  songName: 'Hla Hming',
  tempo: 100,
  beatsPerCycle: 4,
  masterVol: 0.8,
  activeTrackId: 'drums',
  isPlaying: false,
  tracks: [
    { id: 'lyrics', type: 'text', name: 'Hla Thu', color: 'lyrics', muted: false, volume: 0.9, slots: {} },
    { id: 'guitar', type: 'audio', name: 'Guitar', color: 'guitar', muted: false, volume: 0.8, slots: {} },
    { id: 'bass', type: 'synth', name: 'Bass', color: 'bass', muted: false, volume: 0.9, slots: {} },
    { id: 'drums', type: 'drum', name: 'Drums', color: 'drums', muted: false, volume: 0.8, slots: {} }
  ],
  audioLibrary: {},
  selectedSound: 'kick'
};

const NOTE_FREQ = {
  'C1':32.70,'D1':36.71,'E1':41.20,'F1':43.65,'G1':49.00,'A1':55.00,'B1':61.74,
  'C2':65.41,'D2':73.42,'E2':82.41,'F2':87.31,'G2':98.00,'A2':110.00,'B2':123.47,
  'C3':130.81
};

/* 
   DRUM SOUNDS - Real drum kit names
   A basic drum kit has: Kick, Snare, Hi-Hat (closed/open), Toms, Crash, Ride
   For rolls: use "Snare Roll" which is rapid snare hits
*/

const DRUM_SOUNDS = [
  {id: 'kick', label: 'Kick', desc: 'Bass drum - low thump'},
  {id: 'snare', label: 'Snare', desc: 'Sharp crack'},
  {id: 'hihat', label: 'Hi-Hat', desc: 'Closed - chick'},
  {id: 'hihat_open', label: 'Open Hat', desc: 'Open - tss'},
  {id: 'snare_roll', label: 'Roll', desc: 'Fast snare - rrrr'},
  {id: 'tom_low', label: 'Tom Low', desc: 'Low tom'},
  {id: 'tom_mid', label: 'Tom Mid', desc: 'Mid tom'},
  {id: 'tom_high', label: 'Tom High', desc: 'High tom'},
  {id: 'crash', label: 'Crash', desc: 'Cymbal crash'},
  {id: 'ride', label: 'Ride', desc: 'Ride cymbal - ping'},
  {id: 'clap', label: 'Clap', desc: 'Hand clap'}
];

/* =========================================================
   AUDIO ENGINE
   ========================================================= */
let audioCtx;
let currentMasterGain = null;
let noiseBuffers = {};
let playheadRaf = null;
let playbackStartTime = 0;
async function preloadBuiltInSounds() {

  initAudio();

  const chords = [
    "A","Am",
    "B","Bm",
    "C","Cm",
    "D","Dm",
    "E","Em",
    "F","Fm",
    "G","Gm"
  ];

  const directions = ["d", "u"];

  for (const chord of chords) {

    for (const dir of directions) {

      const name = `${chord}_${dir}`;

      try {

        const response =
          await fetch(`audio/${name}.mp3`);

        const arrayBuffer =
          await response.arrayBuffer();

        const audioBuffer =
          await audioCtx.decodeAudioData(arrayBuffer);

        state.audioLibrary[name] =
          audioBuffer;

        console.log("Loaded:", name);

      } catch(err) {

        console.error(
          "Failed loading:",
          name,
          err
        );

      }

    }

  }

  renderPalette();

}
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  if (!noiseBuffers.snare) {
    noiseBuffers.snare = createNoiseBuffer(0.3);
    noiseBuffers.snare_roll = createNoiseBuffer(0.5);
    noiseBuffers.hihat = createNoiseBuffer(0.08);
    noiseBuffers.hihat_open = createNoiseBuffer(0.3);
    noiseBuffers.crash = createNoiseBuffer(2.5);
    noiseBuffers.ride = createNoiseBuffer(1.0);
    noiseBuffers.clap = createNoiseBuffer(0.15);
  }
}

function createNoiseBuffer(duration) {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
console.log(state.audioLibrary);
/* =========================================================
   SYNTHESIS
   ========================================================= */
function scheduleKick(time, vol) {
  if (!currentMasterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(50, time + 0.12);
  gain.gain.setValueAtTime(vol*1.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
  osc.connect(gain).connect(currentMasterGain);
  osc.start(time);
  osc.stop(time + 0.45);
}

function scheduleSnare(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.snare;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1000;
  gain.gain.setValueAtTime(vol * 0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 0.2);
}




function scheduleSnareRoll(time, vol) {
  if (!currentMasterGain) return;

  const spb = 60 / state.tempo;
  const stepDuration = spb / SUBDIVISIONS;

  scheduleSnare(time, vol);
  scheduleSnare(time + stepDuration, vol * 0.9);
  scheduleSnare(time + stepDuration * 2, vol * 0.8);
  scheduleSnare(time + stepDuration * 3, vol * 0.7);
}

function scheduleHihat(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.hihat;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  gain.gain.setValueAtTime(vol * 0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 0.05);
}

function scheduleHihatOpen(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.hihat_open;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  gain.gain.setValueAtTime(vol * 0.6, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 0.25);
}

function scheduleTom(time, vol, freq) {
  if (!currentMasterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, time + 0.15);
  gain.gain.setValueAtTime(vol * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
  osc.connect(gain).connect(currentMasterGain);
  osc.start(time);
  osc.stop(time + 0.35);
}

function scheduleCrash(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.crash;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 4000;
  filter.Q.value = 0.5;
  gain.gain.setValueAtTime(vol, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 2.0);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 2.5);
}

function scheduleRide(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.ride;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 5000;
  filter.Q.value = 1.0;
  gain.gain.setValueAtTime(vol * 0.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.8);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 1.0);
}

function scheduleClap(time, vol) {
  if (!currentMasterGain) return;
  const src = audioCtx.createBufferSource();
  src.buffer = noiseBuffers.clap;
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2000;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(vol * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  src.connect(filter).connect(gain).connect(currentMasterGain);
  src.start(time);
  src.stop(time + 0.15);
}

function scheduleBass(note, time, vol) {
  const freq = NOTE_FREQ[note];
  if (!freq || !currentMasterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  gain.gain.setValueAtTime(vol*1.5, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 1.5);
  osc.connect(gain).connect(currentMasterGain);
  osc.start(time);
  osc.stop(time + 1.5);
}

function scheduleDrumSound(sound, time, vol) {
  if (sound === 'kick') scheduleKick(time, vol);
  else if (sound === 'snare') scheduleSnare(time, vol);
  else if (sound === 'snare_roll') scheduleSnareRoll(time, vol);
  else if (sound === 'hihat') scheduleHihat(time, vol);
  else if (sound === 'hihat_open') scheduleHihatOpen(time, vol);
  else if (sound === 'tom_low') scheduleTom(time, vol, 100);
  else if (sound === 'tom_mid') scheduleTom(time, vol, 150);
  else if (sound === 'tom_high') scheduleTom(time, vol, 220);
  else if (sound === 'crash') scheduleCrash(time, vol);
  else if (sound === 'ride') scheduleRide(time, vol);
  else if (sound === 'clap') scheduleClap(time, vol);
}

/* =========================================================
   TIMELINE
   ========================================================= */
function renderTimeline() {
  const container = document.getElementById('timeline');
  container.innerHTML = '';
  
  state.tracks.forEach(track => {
    const lane = document.createElement('div');
    lane.className = 'track-lane' + (track.id === state.activeTrackId ? ' active' : '');
    lane.onclick = () => selectTrack(track.id);
    
    const head = document.createElement('div');
    head.className = 'track-head';
    head.innerHTML = `
      <div class="track-name" style="color:var(--${track.color})">${track.name}</div>
     
${track.id !== 'lyrics' ? `
<div class="track-vol">
  <span>Vol</span>
  <input type="range" min="0" max="1" step="0.1" value="${track.volume}"
    onchange="event.stopPropagation();setTrackVolume('${track.id}', this.value)"
    onclick="event.stopPropagation()">
</div>
` : ''}

      <button class="track-btn ${track.muted?'muted':''}" 
        onclick="event.stopPropagation();toggleMute('${track.id}')">
        ${track.muted ? '🔇' : '👁️'}
      </button>
    `;
    
    const body = document.createElement('div');
    body.className = 'track-body';
    
    for (let m = 1; m <= TOTAL_MEASURES; m++) {
      const group = document.createElement('div');
      group.className = 'measure-group';


const totalSlots =
  state.beatsPerCycle * SUBDIVISIONS;

    group.style.width =
  (totalSlots * SLOT_WIDTH) + 'px';
      group.style.position = 'relative';
      
      const label = document.createElement('div');
      label.className = 'measure-label';
      label.textContent = m;
      group.appendChild(label);
      
     

for (let b = 1; b <= totalSlots; b++) {
       const slot = document.createElement('div');
slot.className = 'beat-slot';


slot.style.width = SLOT_WIDTH + 'px';
        
        const slotKey = `${m}-${b}`;
        const sound = track.slots[slotKey];
        
        if (sound) {
          slot.classList.add('has-sound');
          if (track.id === 'guitar') slot.classList.add('guitar-sound');
          if (track.id === 'bass') slot.classList.add('bass-sound');
          if (track.id === 'lyrics') slot.classList.add('lyric-sound');
          // Show short name
          const shortName = DRUM_SOUNDS.find(d => d.id === sound)?.label || sound;
          slot.textContent = shortName;
        }
        
        const beatNum = document.createElement('span');
        beatNum.className = 'beat-num';
        


const beatIndex =
  Math.floor((b - 1) / SUBDIVISIONS) + 1;

const subIndex =
  (b - 1) % SUBDIVISIONS;

const subLabels = ['1', 'e', '&', 'a'];

if (subIndex === 0) {
  beatNum.textContent = beatIndex;
  beatNum.classList.add('main-beat');
} else {
  beatNum.textContent = subLabels[subIndex];
}




        slot.appendChild(beatNum);
        
        slot.onclick = (e) => { 
          e.stopPropagation(); 
          toggleSlot(track.id, m, b); 
        };
        
        group.appendChild(slot);
      }
      
      body.appendChild(group);
    }
    
    lane.appendChild(head);
    lane.appendChild(body);
    container.appendChild(lane);
  });
  
  let playhead = document.getElementById('playhead');
  if (!playhead) {
    playhead = document.createElement('div');
    playhead.id = 'playhead';
  }
  container.appendChild(playhead);
}

/* =========================================================
   CONTROLS
   ========================================================= */
function selectTrack(id) {
  state.activeTrackId = id;
  state.selectedSound = getDefaultSoundForTrack(id);
  renderTimeline();
  renderPalette();
}

function getDefaultSoundForTrack(trackId) {
  if (trackId === 'drums') return 'kick';
  if (trackId === 'bass') return 'C2';
  if (trackId === 'guitar') return Object.keys(state.audioLibrary)[0] || '';
  return '';
}

function toggleMute(id) {
  const t = state.tracks.find(tr => tr.id === id);
  if (t) { t.muted = !t.muted; renderTimeline(); }
}

function setTrackVolume(id, val) {
  const t = state.tracks.find(tr => tr.id === id);
  if (t) { t.volume = parseFloat(val); }
}

/* =========================================================
   SLOT TOGGLE
   ========================================================= */
function toggleSlot(trackId, measure, beat) {
  const track = state.tracks.find(t => t.id === trackId);
  if (!track) return;
  
  const slotKey = `${measure}-${beat}`;
  
  if (track.slots[slotKey]) {
    delete track.slots[slotKey];
    renderTimeline();
    return;
  }
  
  let sound = state.selectedSound;
  
  if (track.type === 'text') {
    const text = document.getElementById('lyric-text').value.trim();
    if (!text) return;
    sound = text;
    document.getElementById('lyric-text').value = '';
  }
  
  if (!sound) return;
  
 track.slots[slotKey] =  sound;
  renderTimeline();
}

/* =========================================================
   PALETTE
   ========================================================= */
function renderPalette() {
  const label = document.getElementById('palette-label');
  const items = document.getElementById('palette-items');
  const lyricRow = document.getElementById('lyric-input-row');
  items.innerHTML = '';
  lyricRow.style.display = 'none';
  
  const track = state.tracks.find(t => t.id === state.activeTrackId);
  if (!track) return;
  
  if (track.id === 'lyrics') {
    label.textContent = 'Hla thu ziahna';
    lyricRow.style.display = 'flex';
    return;
  }
  
  if (track.id === 'guitar') {
    label.textContent = 'Guitar chord thlanna';
    const up = document.createElement('div');
    up.className = 'palette-item';
    up.textContent = '+ Upload';
    up.onclick = () => document.getElementById('file-input').click();
    items.appendChild(up);
    
   Object.keys(state.audioLibrary).forEach(name => {

  const label =
    name.replace('_d', ' ↓')
        .replace('_u', ' ↑');

  items.appendChild(
    createSoundBtn(
      name,
      label,
      name === state.selectedSound
    )
  );

});




  }
  
  if (track.id === 'bass') {
    label.textContent = 'Bass ri thlang rawh';
    const notes = ['C1','D1','E1','F1','G1','A1','B1','C2','D2','E2','F2','G2','A2'];
    notes.forEach(n => items.appendChild(createSoundBtn(n, n, n === state.selectedSound)));
  }
  
  if (track.id === 'drums') {
    label.textContent = 'Drum sound thlang rawh';
    DRUM_SOUNDS.forEach(s => {
      items.appendChild(createSoundBtn(s.id, s.label, s.id === state.selectedSound));
    });
  }
}

function createSoundBtn(id, label, isSelected) {
  const btn = document.createElement('div');
  btn.className = 'palette-item' + (isSelected ? ' selected' : '');
  btn.textContent = label;
  btn.onclick = () => { state.selectedSound = id; renderPalette(); };
  return btn;
}

function addLyricFromInput() {
  selectTrack('lyrics');
}

/* =========================================================
   AUDIO UPLOAD
   ========================================================= */
async function handleAudioUpload(e) {
  initAudio();
  const files = Array.from(e.target.files);
  for (const file of files) {
    const buf = await file.arrayBuffer();
    const audioBuf = await audioCtx.decodeAudioData(buf);
    const name = file.name.replace(/\.[^/.]+$/, '');
    state.audioLibrary[name] = audioBuf;
  }
  renderPalette();
}

/* =========================================================
   PLAYHEAD
   ========================================================= */
function startPlayhead() {
  const playhead = document.getElementById('playhead');
  const wrap = document.getElementById('timeline-wrap');
  if (!playhead) return;
  playhead.style.display = 'block';
  
  function frame() {
    if (!state.isPlaying) {
      playhead.style.display = 'none';
      return;
    }
    const elapsed = audioCtx.currentTime - playbackStartTime;
    const spb = 60 / state.tempo;
   const stepDuration = spb / SUBDIVISIONS;

const px =
  90 +
  (elapsed / stepDuration) * SLOT_WIDTH;
    playhead.style.left = px + 'px';
    
    if (px > wrap.scrollLeft + wrap.clientWidth - 100) {
      wrap.scrollLeft = px - 100;
    }
    
    playheadRaf = requestAnimationFrame(frame);
  }
  playheadRaf = requestAnimationFrame(frame);
}

/* =========================================================
   PLAYBACK
   ========================================================= */
document.getElementById('play-btn').onclick = play;
document.getElementById('stop-btn').onclick = stop;

function syncStateFromInputs() {
  state.songName = document.getElementById('song-name').value;
  state.tempo = parseInt(document.getElementById('tempo').value) || 100;
  state.beatsPerCycle = parseInt(document.getElementById('beats-per-cycle').value) || 4;
  state.masterVol = parseFloat(document.getElementById('master-vol').value);
}

function play() {
  syncStateFromInputs();
  initAudio();
  stop();
  
  state.isPlaying = true;
  currentMasterGain = audioCtx.createGain();
  currentMasterGain.connect(audioCtx.destination);
  currentMasterGain.gain.setValueAtTime(state.masterVol, audioCtx.currentTime + 0.02);
  
  const now = audioCtx.currentTime + 0.15;
  const spb = 60 / state.tempo;
  playbackStartTime = now;
  
  state.tracks.forEach(track => {
    if (track.muted) return;
    const trackVol = track.volume;
    
    Object.entries(track.slots).forEach(([slotKey, sound]) => {
      const [measure, beat] = slotKey.split('-').map(Number);
  
const stepDuration = spb / SUBDIVISIONS;

const base =
  (measure - 1) * state.beatsPerCycle * SUBDIVISIONS;

const globalStep = base + (beat - 1);

const time = now + globalStep * stepDuration;




    
     if (track.id === 'guitar' && state.audioLibrary[sound]) {
        const src = audioCtx.createBufferSource();
        src.buffer = state.audioLibrary[sound];
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(trackVol, time);
        src.connect(g).connect(currentMasterGain);
        src.start(time);
      }
      
      if (track.id === 'bass') {
        scheduleBass(sound, time, trackVol);
      }
      
      if (track.id === 'drums') {
        scheduleDrumSound(sound, time, trackVol);
      }
    });
  });
  
  startPlayhead();
  
  const lastSlot = Math.max(
  ...state.tracks.flatMap(t =>
    Object.keys(t.slots).map(k => {

      const [m, b] = k.split('-').map(Number);

      return (
        ((m - 1) * state.beatsPerCycle * SUBDIVISIONS)
        + b
      );

    })
  ),
  0
);


  const totalSeconds =
  lastSlot * (spb / SUBDIVISIONS);
  setTimeout(() => { if (state.isPlaying) stop(); }, totalSeconds * 1000 + 500);
}

function stop() {
  state.isPlaying = false;
  if (playheadRaf) {
    cancelAnimationFrame(playheadRaf);
    playheadRaf = null;
  }
  if (currentMasterGain) {
    try { currentMasterGain.disconnect(); } catch(e) {}
    currentMasterGain = null;
  }
  const playhead = document.getElementById('playhead');
  if (playhead) playhead.style.display = 'none';
}

/* =========================================================
   SAVE / LOAD / NEW
   ========================================================= */
function saveSong() {
  syncStateFromInputs();
  const payload = {
    name: state.songName,
    tempo: state.tempo,
    beatsPerCycle: state.beatsPerCycle,
    masterVol: state.masterVol,
    tracks: state.tracks.map(t => ({
      id: t.id, muted: t.muted, volume: t.volume, slots: t.slots
    }))
  };
  localStorage.setItem('seq_' + payload.name, JSON.stringify(payload));
  alert('Save a ni e: ' + payload.name);
}

function loadSong() {
  const name = prompt('Hla hming:');
  if (!name) return;
  const raw = localStorage.getItem('seq_' + name);
  if (!raw) { alert('Hmuh lo'); return; }
  
  const data = JSON.parse(raw);
  document.getElementById('song-name').value = data.name || 'Untitled';
  document.getElementById('tempo').value = data.tempo || 100;
  document.getElementById('beats-per-cycle').value = data.beatsPerCycle || 4;
  document.getElementById('master-vol').value = data.masterVol ?? 0.8;
  
  syncStateFromInputs();
  
  data.tracks.forEach(saved => {
    const t = state.tracks.find(tr => tr.id === saved.id);
    if (t) {
      t.muted = saved.muted || false;
      t.volume = typeof saved.volume === 'number' ? saved.volume : 0.8;
      t.slots = saved.slots || {};
    }
  });
  
  renderTimeline();
  renderPalette();
  alert('Load a ni e: ' + name);
}

function newSong() {
  if (!confirm('Hla Thar')) return;
  state.tracks.forEach(t => { t.slots = {}; t.muted = false; t.volume = 0.8; });
  state.tracks[2].volume = 0.9;
  state.selectedSound = 'kick';
  document.getElementById('song-name').value = 'Hla Hming';
  document.getElementById('tempo').value = '100';
  document.getElementById('beats-per-cycle').value = '4';
  document.getElementById('master-vol').value = '0.8';
  syncStateFromInputs();
  renderTimeline();
  renderPalette();
}

/* =========================================================
   INPUT LISTENERS
   ========================================================= */
document.getElementById('tempo').addEventListener('change', syncStateFromInputs);
document.getElementById('beats-per-cycle').addEventListener('change', () => { 
  syncStateFromInputs(); 
  renderTimeline(); 
  renderPalette();
});
document.getElementById('master-vol').addEventListener('change', syncStateFromInputs);

/* =========================================================
   INIT
   ========================================================= */
renderTimeline();
renderPalette();

document.body.addEventListener('click', async () => {

  if (!window.soundsLoaded) {

    window.soundsLoaded = true;

    await preloadBuiltInSounds();

    renderPalette();

    console.log("Sounds loaded!");

  }

}, { once:true });