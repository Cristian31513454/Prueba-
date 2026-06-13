// App Configuration and State
let appState = {
  coins: 0,
  totalFocusTime: 0,
  petName: 'Pixel',
  petLevel: 1,
  petXP: 0,
  petHappiness: 100,
  petHat: 'none',
  petBackground: 'default',
  ownedItems: ['none']
};

// Timer Variables
let timerInterval = null;
let isTimerRunning = false;
let currentMode = 'focus'; // 'focus' or 'break'
let timeLeft = 25 * 60; // 25 minutes default
let sessionDuration = 25; // initial focus minutes

// SVG elements for hats
const hatsSVG = {
  none: '',
  tophat: `
    <rect x="75" y="45" width="50" height="25" fill="#111827" rx="3" />
    <ellipse cx="100" cy="70" rx="35" ry="6" fill="#111827" />
    <rect x="75" y="64" width="50" height="4" fill="#ef4444" />
  `,
  chefhat: `
    <path d="M 72 70 C 65 50, 80 40, 90 48 C 95 35, 110 35, 115 48 C 125 40, 135 50, 128 70 Z" fill="#ffffff" stroke="#9ca3af" stroke-width="1.5" />
    <rect x="78" y="62" width="44" height="10" fill="#ffffff" stroke="#9ca3af" stroke-width="1.5" rx="1" />
  `,
  crown: `
    <polygon points="75,70 70,48 85,58 100,40 115,58 130,48 125,70" fill="#fbbf24" stroke="#d97706" stroke-width="2" />
    <circle cx="100" cy="40" r="3" fill="#ef4444" />
    <circle cx="70" cy="48" r="3" fill="#3b82f6" />
    <circle cx="130" cy="48" r="3" fill="#10b981" />
    <circle cx="85" cy="58" r="2.5" fill="#a78bfa" />
    <circle cx="115" cy="58" r="2.5" fill="#a78bfa" />
  `,
  glasses: `
    <rect x="73" y="100" width="22" height="12" rx="4" fill="#111827" opacity="0.9" />
    <rect x="105" y="100" width="22" height="12" rx="4" fill="#111827" opacity="0.9" />
    <rect x="95" y="103" width="10" height="3" fill="#111827" />
    <line x1="68" y1="104" x2="73" y2="104" stroke="#111827" stroke-width="2.5" />
    <line x1="127" y1="104" x2="132" y2="104" stroke="#111827" stroke-width="2.5" />
  `
};

// DOM Elements
const timerClock = document.getElementById('timer-clock');
const timerLabel = document.getElementById('timer-label');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnReset = document.getElementById('btn-reset');
const iconPlayPause = document.getElementById('icon-play-pause');
const timerProgress = document.getElementById('timer-progress');
const modeFocus = document.getElementById('mode-focus');
const modeShort = document.getElementById('mode-short');

const petLevelText = document.getElementById('pet-level');
const petXPText = document.getElementById('xp-text');
const petXPFill = document.getElementById('xp-fill');
const userCoinsText = document.getElementById('user-coins');
const happyFill = document.getElementById('happy-fill');
const petNameDisplay = document.getElementById('pet-name-display');

const screenTimer = document.getElementById('screen-timer');
const ambientGlow = document.getElementById('ambient-glow');
const petCard = document.getElementById('pet-card-container');
const petBody = document.getElementById('pet-body');
const petBodyGroup = document.getElementById('pet-body-group');
const petHatSlot = document.getElementById('pet-hat-slot');
const petSceneBg = document.getElementById('pet-scene-bg');
const petSceneFg = document.getElementById('pet-scene-fg');
const inputPetName = document.getElementById('input-pet-name');
const btnSaveSettings = document.getElementById('btn-save-settings');

// Audio elements
const audioComplete = document.getElementById('audio-complete');
const audioClick = document.getElementById('audio-click');

// Initialize Lucide Icons
lucide.createIcons();

// --- DATABASE SYNC & API ---

async function fetchUserData() {
  try {
    const res = await fetch('/api/user');
    if (res.ok) {
      const data = await res.json();
      appState.coins = data.coins;
      appState.totalFocusTime = data.total_focus_time;
      appState.petName = data.pet_name;
      appState.petLevel = data.pet_level;
      appState.petXP = data.pet_xp;
      appState.petHappiness = data.pet_happiness;
      appState.petHat = data.pet_hat;
      appState.petBackground = data.pet_background;
      
      // Load inventory
      const invRes = await fetch('/api/inventory');
      if (invRes.ok) {
        const invData = await invRes.json();
        appState.ownedItems = ['none', ...invData.filter(i => i.owned === 1).map(i => i.item_id)];
      }
      
      updateUI();
    }
  } catch (err) {
    console.warn('Backend connection failed, using localStorage fallback.', err);
    loadLocalFallback();
  }
}

async function updateUserDataOnServer(updates) {
  try {
    await fetch('/api/user/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  } catch (err) {
    console.error('Error updating state on server:', err);
    saveLocalFallback();
  }
}

async function logFocusSessionOnServer(duration, mode) {
  try {
    await fetch('/api/focus/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration, mode })
    });
    fetchUserData(); // Reload updated stats
    loadHistoryChart();
  } catch (err) {
    console.error('Error logging focus session on server:', err);
    
    // Offline local logic
    if (mode === 'focus') {
      const coinsEarned = duration * 2;
      const xpEarned = duration * 10;
      
      appState.coins += coinsEarned;
      appState.totalFocusTime += duration;
      appState.petXP += xpEarned;
      
      // Level up logic
      let nextLevelXP = appState.petLevel * 100;
      while (appState.petXP >= nextLevelXP) {
        appState.petXP -= nextLevelXP;
        appState.petLevel += 1;
        nextLevelXP = appState.petLevel * 100;
      }
      
      saveLocalFallback();
      updateUI();
    }
  }
}

// --- LOCAL STORAGE FALLBACK (OFFLINE SUPPORT) ---
function loadLocalFallback() {
  const localData = localStorage.getItem('focus_quest_state');
  if (localData) {
    appState = JSON.parse(localData);
  } else {
    // Default setup
    appState = {
      coins: 20, // Start with a few coins
      totalFocusTime: 0,
      petName: 'Pixel',
      petLevel: 1,
      petXP: 0,
      petHappiness: 100,
      petHat: 'none',
      petBackground: 'default',
      ownedItems: ['none']
    };
    saveLocalFallback();
  }
  updateUI();
  loadHistoryChartOffline();
}

function saveLocalFallback() {
  localStorage.setItem('focus_quest_state', JSON.stringify(appState));
}

// --- NAVIGATION LOGIC ---
const navItems = document.querySelectorAll('.nav-item');
const screens = document.querySelectorAll('.screen');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    // Navigation Sound
    playAudio(audioClick);
    
    const targetScreen = item.getAttribute('data-screen');
    
    // Update active nav item
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
    
    // Update active screen
    screens.forEach(screen => screen.classList.remove('active'));
    document.getElementById(targetScreen).classList.add('active');
    
    // Load screen-specific logic
    if (targetScreen === 'screen-stats') {
      loadHistoryChart();
    } else if (targetScreen === 'screen-shop') {
      renderShopButtons();
    }
  });
});

// --- TIMER LOGIC ---
function updateTimerDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timerClock.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Update circular progress bar
  const total = currentMode === 'focus' ? sessionDuration * 60 : 5 * 60;
  const progress = timeLeft / total;
  const dashoffset = 596.9 * progress;
  timerProgress.style.strokeDashoffset = dashoffset;
}

function toggleTimer() {
  playAudio(audioClick);
  
  if (isTimerRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
}

function startTimer() {
  isTimerRunning = true;
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    
    if (timeLeft <= 0) {
      completeSession();
    }
  }, 1000);
  
  iconPlayPause.setAttribute('data-lucide', 'pause');
  lucide.createIcons();
  
  // Set pet visual state when focus session begins
  updatePetState(currentMode === 'focus' ? 'focusing' : 'sleeping');
}

function pauseTimer() {
  clearInterval(timerInterval);
  isTimerRunning = false;
  iconPlayPause.setAttribute('data-lucide', 'play');
  lucide.createIcons();
  updatePetState('idle');
}

function resetTimer() {
  playAudio(audioClick);
  pauseTimer();
  timeLeft = (currentMode === 'focus' ? sessionDuration : 5) * 60;
  updateTimerDisplay();
}

function setMode(mode) {
  playAudio(audioClick);
  pauseTimer();
  currentMode = mode;
  
  // Toggle UI active classes
  modeFocus.classList.toggle('active', mode === 'focus');
  modeShort.classList.toggle('active', mode === 'short');
  
  // Adjust timing
  sessionDuration = mode === 'focus' ? 25 : 5;
  timeLeft = sessionDuration * 60;
  
  // Adjust label
  timerLabel.textContent = mode === 'focus' ? 'ENFOQUE' : 'DESCANSO';
  
  // Adjust colors on glow and controls
  ambientGlow.className = `ambient-glow state-${mode}`;
  timerProgress.style.stroke = mode === 'focus' ? '#8b5cf6' : '#10b981';
  btnPlayPause.className = `ctrl-btn main-ctrl ${mode === 'short' ? 'running-break' : ''}`;
  
  updateTimerDisplay();
}

modeFocus.addEventListener('click', () => setMode('focus'));
modeShort.addEventListener('click', () => setMode('short'));
btnPlayPause.addEventListener('click', toggleTimer);
btnReset.addEventListener('click', resetTimer);

function completeSession() {
  pauseTimer();
  playAudio(audioComplete);
  
  // Log session to backend / calculate XP & Coins
  logFocusSessionOnServer(sessionDuration, currentMode);
  
  alert(currentMode === 'focus' ? '¡Increíble trabajo! Te has enfocado correctamente. Tu mascota se siente muy feliz.' : '¡Descanso terminado! Volvamos al trabajo.');
  
  // Reset back to focus mode after a break, or vice versa
  setMode(currentMode === 'focus' ? 'short' : 'focus');
}

// --- PET VISUAL ENGINE (SVG) ---

function updatePetState(state) {
  // Clear pet screen background & foreground elements
  petSceneBg.innerHTML = '';
  petSceneFg.innerHTML = '';
  petBodyGroup.className = '';
  
  if (state === 'idle') {
    petBodyGroup.classList.add('pet-idle');
    // Default open eyes, mouth smile
    document.getElementById('eye-l').setAttribute('cy', '105');
    document.getElementById('eye-r').setAttribute('cy', '105');
    document.getElementById('eye-l').setAttribute('r', '7');
    document.getElementById('eye-r').setAttribute('r', '7');
    document.getElementById('pet-mouth').setAttribute('d', 'M 95 118 Q 100 122 105 118');
    
  } else if (state === 'focusing') {
    // Add study desk background
    petSceneBg.innerHTML = `
      <rect x="40" y="145" width="120" height="25" fill="#7c2d12" rx="4" />
      <rect x="55" y="170" width="10" height="15" fill="#451a03" />
      <rect x="135" y="170" width="10" height="15" fill="#451a03" />
    `;
    
    // Add typing laptop in foreground
    petSceneFg.innerHTML = `
      <path class="key-pressing" d="M 85 140 L 115 140 L 120 152 L 80 152 Z" fill="#6b7280" />
      <rect x="90" y="120" width="20" height="20" fill="#374151" rx="2" />
      <rect x="92" y="122" width="16" height="16" fill="#60a5fa" rx="1" opacity="0.8" />
    `;
    
    // Make body float a bit faster (busy)
    petBodyGroup.className = '';
    
    // Eyes: focused/determined curves or small dots
    document.getElementById('eye-l').setAttribute('r', '6');
    document.getElementById('eye-r').setAttribute('r', '6');
    document.getElementById('pet-mouth').setAttribute('d', 'M 97 122 Q 100 120 103 122'); // focused straight line mouth
    
  } else if (state === 'sleeping') {
    // Make eyes look closed (curved lines)
    document.getElementById('eye-l').setAttribute('r', '0'); // Hide circle eyes
    document.getElementById('eye-r').setAttribute('r', '0');
    
    // Draw closed curved lines
    petSceneFg.innerHTML = `
      <path d="M 80 105 Q 85 110 90 105" stroke="#1e1b4b" stroke-width="3" fill="none" stroke-linecap="round" />
      <path d="M 110 105 Q 115 110 120 105" stroke="#1e1b4b" stroke-width="3" fill="none" stroke-linecap="round" />
      
      <!-- Sleeping Zzz's -->
      <g style="font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 800; fill: var(--break-color); opacity: 0.8;">
        <text x="135" y="80">Z</text>
        <text x="145" y="65" style="font-size: 10px;">z</text>
        <text x="153" y="55" style="font-size: 8px;">z</text>
      </g>
    `;
    
    // Relaxed slow breathing animation
    petBodyGroup.style.animation = 'pet-float 6s ease-in-out infinite';
    document.getElementById('pet-mouth').setAttribute('d', 'M 97 118 Q 100 123 103 118'); // Relaxed mouth
  }
}

// --- UI UPDATER ---

function updateUI() {
  // Update currency and level metrics
  userCoinsText.textContent = appState.coins;
  petLevelText.textContent = appState.petLevel;
  petNameDisplay.textContent = appState.petName;
  inputPetName.value = appState.petName;
  
  // Calculate XP Percentage
  const nextLevelXP = appState.petLevel * 100;
  const xpPct = (appState.petXP / nextLevelXP) * 100;
  petXPText.textContent = `${appState.petXP} / ${nextLevelXP} XP`;
  petXPFill.style.width = `${xpPct}%`;
  
  // Update happiness bar
  happyFill.style.width = `${appState.petHappiness}%`;
  
  // Equip hat
  const hatMarkup = hatsSVG[appState.petHat] || '';
  petHatSlot.innerHTML = hatMarkup;
  
  // Equip background card class
  petCard.className = `pet-card ${appState.petBackground}-bg`;
}

// --- SHOP LOGIC ---

const shopItems = [
  { id: 'tophat', name: 'Sombrero de Copa', price: 30, type: 'hat' },
  { id: 'chefhat', name: 'Gorro de Chef', price: 45, type: 'hat' },
  { id: 'crown', name: 'Corona Real', price: 100, type: 'hat' },
  { id: 'glasses', name: 'Gafas Cool', price: 25, type: 'hat' },
  { id: 'bg_neon', name: 'Fondo Neón', price: 50, type: 'background' },
  { id: 'bg_garden', name: 'Fondo Jardín', price: 60, type: 'background' }
];

function renderShopButtons() {
  const shopGrid = document.querySelector('.shop-grid');
  shopGrid.innerHTML = '';
  
  shopItems.forEach(item => {
    const isOwned = appState.ownedItems.includes(item.id);
    let isEquipped = false;
    
    if (item.type === 'hat') isEquipped = appState.petHat === item.id;
    if (item.type === 'background') isEquipped = appState.petBackground === item.id;
    
    let btnText = 'Comprar';
    let btnClass = 'buy-btn';
    
    if (isEquipped) {
      btnText = 'Equipado';
      btnClass = 'buy-btn equipped';
    } else if (isOwned) {
      btnText = 'Equipar';
      btnClass = 'buy-btn equip';
    }
    
    const isBg = item.type === 'background';
    const previewContent = isBg 
      ? `<div class="item-preview-bg ${item.id.replace('bg_', '')}">${item.id === 'bg_neon' ? '🌌' : '🏡'}</div>`
      : `<div class="item-preview">${item.id === 'tophat' ? '🎩' : item.id === 'chefhat' ? '👨‍🍳' : item.id === 'crown' ? '👑' : '🕶️'}</div>`;

    const itemHTML = `
      <div class="shop-item">
        ${previewContent}
        <div class="item-info">
          <h3>${item.name}</h3>
          <div class="price-tag">
            <i data-lucide="coins"></i> ${item.price}
          </div>
        </div>
        <button class="${btnClass}" onclick="handleShopClick('${item.id}', ${item.price}, '${item.type}', ${isOwned}, ${isEquipped})">${btnText}</button>
      </div>
    `;
    shopGrid.innerHTML += itemHTML;
  });
  
  lucide.createIcons();
}

window.handleShopClick = async function(id, price, type, isOwned, isEquipped) {
  playAudio(audioClick);
  
  if (isEquipped) return; // Do nothing if already equipped
  
  if (isOwned) {
    // Equip the item
    if (type === 'hat') appState.petHat = id;
    if (type === 'background') appState.petBackground = id;
    
    updateUI();
    saveLocalFallback();
    updateUserDataOnServer({ pet_hat: appState.petHat, pet_background: appState.petBackground });
    renderShopButtons();
  } else {
    // Attempt buy
    if (appState.coins < price) {
      alert('¡No tienes suficientes monedas! Sigue enfocándote para ganar más.');
      return;
    }
    
    try {
      const res = await fetch('/api/shop/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: id, price })
      });
      
      if (res.ok) {
        const data = await res.json();
        appState.coins = data.remaining_coins;
        appState.ownedItems.push(id);
      } else {
        throw new Error('Server purchase failed');
      }
    } catch (err) {
      console.warn('Shop server buy failed. Processing purchase offline.');
      appState.coins -= price;
      appState.ownedItems.push(id);
    }
    
    // Equip immediately on buy
    if (type === 'hat') appState.petHat = id;
    if (type === 'background') appState.petBackground = id;
    
    updateUI();
    saveLocalFallback();
    updateUserDataOnServer({ coins: appState.coins, pet_hat: appState.petHat, pet_background: appState.petBackground });
    renderShopButtons();
  }
};

// --- SETTINGS LOGIC ---
btnSaveSettings.addEventListener('click', () => {
  playAudio(audioClick);
  const newName = inputPetName.value.trim();
  if (newName.length > 0) {
    appState.petName = newName;
    updateUI();
    saveLocalFallback();
    updateUserDataOnServer({ pet_name: newName });
    alert('¡Ajustes guardados correctamente!');
  }
});

// --- STATS / HISTORY CHART ---

async function loadHistoryChart() {
  const chartContainer = document.getElementById('history-chart');
  
  try {
    const res = await fetch('/api/history');
    if (res.ok) {
      const data = await res.json();
      
      // Update totals
      const totalMin = appState.totalFocusTime;
      const hours = (totalMin / 60).toFixed(1);
      document.getElementById('total-focus-hours').textContent = `${hours}h`;
      
      // Count unique days or total logged sessions
      document.getElementById('sessions-count').textContent = Math.ceil(totalMin / 25);

      if (data.length === 0) {
        chartContainer.innerHTML = '<div class="chart-empty">No hay sesiones registradas esta semana. ¡Es hora de enfocarse!</div>';
        return;
      }

      chartContainer.innerHTML = '';
      
      // Get max duration to scale columns height relatively
      const maxDuration = Math.max(...data.map(d => d.total_duration), 1);
      
      // Render reverse order for left-to-right timeline
      data.slice().reverse().forEach(day => {
        const percentage = (day.total_duration / maxDuration) * 100;
        
        // Format Date (MM-DD)
        const dateObj = new Date(day.date);
        const formattedDate = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

        const colHTML = `
          <div class="chart-col">
            <span style="font-size: 10px; font-weight: 600;">${day.total_duration}m</span>
            <div class="chart-bar-container">
              <div class="chart-bar" style="height: ${percentage}%"></div>
            </div>
            <span class="chart-date">${formattedDate}</span>
          </div>
        `;
        chartContainer.innerHTML += colHTML;
      });
    }
  } catch (err) {
    console.warn('Error fetching chart stats from API, using offline stats.');
    loadHistoryChartOffline();
  }
}

function loadHistoryChartOffline() {
  const chartContainer = document.getElementById('history-chart');
  const totalMin = appState.totalFocusTime;
  const hours = (totalMin / 60).toFixed(1);
  document.getElementById('total-focus-hours').textContent = `${hours}h`;
  document.getElementById('sessions-count').textContent = Math.ceil(totalMin / 25);
  
  // Offline stats placeholder
  chartContainer.innerHTML = `
    <div class="chart-col">
      <span style="font-size: 10px; font-weight: 600;">${totalMin}m</span>
      <div class="chart-bar-container">
        <div class="chart-bar" style="height: ${totalMin > 0 ? 80 : 0}%"></div>
      </div>
      <span class="chart-date">Hoy</span>
    </div>
  `;
}

// Audio Helper with safety check (mobile browser safety)
function playAudio(audioElement) {
  if (audioElement) {
    audioElement.currentTime = 0;
    audioElement.play().catch(e => console.log('Audio autoplay blocked by browser context.'));
  }
}

// --- INITIAL LOAD ---
fetchUserData();
updatePetState('idle');
updateTimerDisplay();

// --- SERVICE WORKER REGISTRATION (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully!', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// PWA Install Button handling
let deferredPrompt;
const btnPwaInstall = document.getElementById('btn-pwa-install');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnPwaInstall) {
    btnPwaInstall.style.display = 'flex';
  }
});

if (btnPwaInstall) {
  btnPwaInstall.addEventListener('click', () => {
    btnPwaInstall.style.display = 'none';
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the PWA install prompt');
      } else {
        console.log('User dismissed the PWA install prompt');
      }
      deferredPrompt = null;
    });
  });
}

