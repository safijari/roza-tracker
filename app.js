const DB_NAME = 'RozaTrackerDB';
const DB_VERSION = 1;

let db;
let currentYear;
const today = new Date();
const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
const currentHijriYear = getCurrentHijriYear();

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      if (!database.objectStoreNames.contains('years')) {
        const yearsStore = database.createObjectStore('years', { keyPath: 'id', autoIncrement: true });
        yearsStore.createIndex('hijriYear', 'hijriYear', { unique: true });
      }
      
      if (!database.objectStoreNames.contains('fasts')) {
        const fastsStore = database.createObjectStore('fasts', { keyPath: 'id', autoIncrement: true });
        fastsStore.createIndex('yearId', 'yearId', { unique: false });
        fastsStore.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

async function requestPersistentStorage() {
  const indicator = document.getElementById('storage-indicator');
  const statusDiv = document.getElementById('storage-status');
  
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persist();
    if (!isPersisted) {
      statusDiv.classList.remove('hidden');
      indicator.textContent = 'Warning: data might not persist. Install to homepage to fix.';
      indicator.style.color = 'orange';
    }
    return isPersisted;
  } else {
    statusDiv.classList.remove('hidden');
    indicator.textContent = 'Warning: data might not persist. Install to homepage to fix.';
    indicator.style.color = 'orange';
    return false;
  }
}

async function getAllYears() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('years', 'readonly');
    const store = tx.objectStore('years');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getYearByHijriYear(hijriYear) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('years', 'readonly');
    const store = tx.objectStore('years');
    const index = store.index('hijriYear');
    const request = index.get(hijriYear);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addYear(year) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('years', 'readwrite');
    const store = tx.objectStore('years');
    const request = store.add(year);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateYear(year) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('years', 'readwrite');
    const store = tx.objectStore('years');
    const request = store.put(year);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFastsByYear(yearId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fasts', 'readonly');
    const store = tx.objectStore('fasts');
    const index = store.index('yearId');
    const request = index.getAll(yearId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function addFast(fast) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fasts', 'readwrite');
    const store = tx.objectStore('fasts');
    const request = store.add(fast);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateFast(fast) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fasts', 'readwrite');
    const store = tx.objectStore('fasts');
    const request = store.put(fast);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateFastRecordsForDates(yearId, newStartDate, newEndDate, type) {
  const existingFasts = await getFastsByYear(yearId);
  const existingRamadanFasts = existingFasts.filter(f => f.type === type);
  
  const existingDates = new Set(existingRamadanFasts.map(f => f.date));
  
  const [startY, startM, startD] = newStartDate.split('-').map(Number);
  const [endY, endM, endD] = newEndDate.split('-').map(Number);
  
  const newDates = [];
  let d = new Date(startY, startM - 1, startD);
  const end = new Date(endY, endM - 1, endD);
  
  while (d <= end) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    newDates.push(`${year}-${month}-${day}`);
    d.setDate(d.getDate() + 1);
  }
  
  const fastsToDelete = existingRamadanFasts.filter(f => !newDates.includes(f.date));
  for (const fast of fastsToDelete) {
    await deleteFast(fast.id);
  }
  
  for (const dateStr of newDates) {
    if (!existingDates.has(dateStr)) {
      await addFast({
        yearId: yearId,
        date: dateStr,
        type: type,
        status: 'PENDING',
        isMakeup: false,
        toggledAt: null
      });
    }
  }
}

async function deleteFast(fastId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fasts', 'readwrite');
    const store = tx.objectStore('fasts');
    const request = store.delete(fastId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getCurrentHijriYear() {
  const hijriYearMap = {
    2019: 1440, 2020: 1441, 2021: 1442, 2022: 1443,
    2023: 1444, 2024: 1445, 2025: 1446, 2026: 1447,
    2027: 1448, 2028: 1449, 2029: 1450
  };
  return hijriYearMap[today.getFullYear()] || 1446;
}

function getRamadanDates(hijriYear) {
  const yearMap = {
    1440: ['2019-05-06', '2019-06-03'],
    1441: ['2020-04-24', '2020-05-23'],
    1442: ['2021-04-13', '2021-05-12'],
    1443: ['2022-04-03', '2022-05-02'],
    1444: ['2023-03-23', '2023-04-21'],
    1445: ['2024-03-10', '2024-04-09'],
    1446: ['2025-02-28', '2025-03-30'],
    1447: ['2026-02-17', '2026-03-19'],
    1448: ['2027-02-07', '2027-03-08'],
    1449: ['2028-01-27', '2028-02-25'],
    1450: ['2029-01-15', '2029-02-13']
  };
  return yearMap[hijriYear] || [null, null];
}

async function ensureYearExists(hijriYear) {
  let year = await getYearByHijriYear(hijriYear);
  
  if (!year) {
    const years = await getAllYears();
    const latestYear = years.sort((a, b) => b.hijriYear - a.hijriYear)[0];
    
    if (latestYear) {
      year = latestYear;
    } else {
      const [startDate, endDate] = getRamadanDates(hijriYear);
      year = {
        hijriYear: hijriYear,
        gregorianStartDate: startDate || `${today.getFullYear()}-03-01`,
        gregorianEndDate: endDate || `${today.getFullYear()}-03-30`
      };
      year.id = await addYear(year);
    }
  }
  
  currentYear = year;
  return year;
}

async function ensureFastRecordsExist(yearId, startDate, endDate, type) {
  const existingFasts = await getFastsByYear(yearId);
  const existingTypes = new Set(existingFasts.map(f => f.type));
  
  if (!existingTypes.has(type)) {
    const [startY, startM, startD] = startDate.split('-').map(Number);
    const [endY, endM, endD] = endDate.split('-').map(Number);
    
    let d = new Date(startY, startM - 1, startD);
    const end = new Date(endY, endM - 1, endD);
    
    while (d <= end) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      await addFast({
        yearId: yearId,
        date: `${year}-${month}-${day}`,
        type: type,
        status: 'PENDING',
        isMakeup: false,
        toggledAt: null
      });
      d.setDate(d.getDate() + 1);
    }
  }
}

async function ensureShawwalFasts(yearId) {
  const fasts = await getFastsByYear(yearId);
  const shawwalFasts = fasts.filter(f => f.type === 'SHAWWAL');
  
  if (shawwalFasts.length === 0) {
    const year = (await getAllYears()).find(y => y.id === yearId);
    if (year) {
      const [y, m, d] = year.gregorianEndDate.split('-').map(Number);
      const endDate = new Date(y, m - 1, d);
      for (let i = 1; i <= 6; i++) {
        const date = new Date(endDate);
        date.setDate(date.getDate() + i);
        const yearNum = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        await addFast({
          yearId: yearId,
          date: `${yearNum}-${month}-${day}`,
          type: 'SHAWWAL',
          status: 'PENDING',
          isMakeup: false,
          toggledAt: null
        });
      }
    }
  }
}

async function ensureQuranRecords(yearId) {
  const fasts = await getFastsByYear(yearId);
  const quranFasts = fasts.filter(f => f.type === 'QURAN');
  
  if (quranFasts.length === 0) {
    for (let i = 1; i <= 30; i++) {
      await addFast({
        yearId: yearId,
        date: `QURAN-${i}`,
        type: 'QURAN',
        status: 'PENDING',
        isMakeup: false,
        toggledAt: null
      });
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.startsWith('QURAN')) return '';
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const date = new Date(year, month - 1, day);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${parseInt(day)}, ${year}`;
}

function render() {
  document.getElementById('today-date').textContent = today.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });
  
  loadData();
}

async function loadData() {
  currentYear = await ensureYearExists(currentHijriYear);
  
  document.getElementById('year-display').textContent = currentYear.hijriYear;
  
  await ensureFastRecordsExist(currentYear.id, currentYear.gregorianStartDate, currentYear.gregorianEndDate, 'RAMADAN');
  await ensureShawwalFasts(currentYear.id);
  await ensureQuranRecords(currentYear.id);
  
  const allFasts = await getFastsByYear(currentYear.id);
  
  const ramadanFasts = allFasts.filter(f => f.type === 'RAMADAN').sort((a, b) => a.date.localeCompare(b.date));
  const shawwalFasts = allFasts.filter(f => f.type === 'SHAWWAL').sort((a, b) => a.date.localeCompare(b.date));
  const quranFasts = allFasts.filter(f => f.type === 'QURAN');
  
  const completedRamadan = ramadanFasts.filter(f => f.status === 'DONE').length;
  const completedShawwal = shawwalFasts.filter(f => f.status === 'DONE').length;
  const completedQuran = quranFasts.filter(f => f.status === 'DONE').length;
  const makeupCount = ramadanFasts.filter(f => f.isMakeup).length;
  const totalFastsDone = completedRamadan + makeupCount;
  
  const missedFasts = ramadanFasts.filter(f => (f.status === 'PENDING' && f.date < todayStr) || f.isMakeup);
  
  const daysSinceStart = ramadanFasts.filter(f => f.date <= todayStr).length;
  
  document.getElementById('start-date-display').textContent = formatDate(currentYear.gregorianStartDate);
  document.getElementById('end-date-display').textContent = formatDate(currentYear.gregorianEndDate);
  
  renderGrid('ramadan-grid', ramadanFasts, 'ramadan');
  renderGrid('shawwal-grid', shawwalFasts, 'shawwal');
  renderGrid('missed-grid', missedFasts, 'missed');
  renderGrid('quran-grid', quranFasts, 'quran');
  
  const totalRamadan = ramadanFasts.length || 30;
  
  updateProgress('ramadan', daysSinceStart, totalRamadan);
  updateProgress('fasts', totalFastsDone, totalRamadan);
  updateProgress('shawwal', completedShawwal, 6);
  updateProgress('quran', completedQuran, 30);
}

function renderGrid(containerId, fasts, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  
  if (type === 'missed') {
    const emptyMsg = document.getElementById('missed-empty');
    if (fasts.length === 0) {
      emptyMsg.classList.remove('hidden');
    } else {
      emptyMsg.classList.add('hidden');
    }
  }
  
  fasts.forEach((fast, index) => {
    const div = document.createElement('div');
    const isDone = fast.status === 'DONE';
    const isToday = fast.date === todayStr;
    const isMakeup = fast.isMakeup;
    const isMissed = type === 'ramadan' && !isDone && fast.date < todayStr;
    
    div.className = `day-card ${isDone ? 'done' : ''} ${isToday ? 'today' : ''} ${isMakeup ? 'makeup' : ''} ${isMissed ? 'missed' : ''}`;
    
    let content = '';
    if (type === 'quran') {
      const siparaNum = fast.date.replace('QURAN-', '');
      content = `<span class="day-number">${siparaNum}</span>`;
      if (isDone) content += `<span class="check">✓</span>`;
    } else if (type === 'missed') {
      const date = new Date(fast.date + 'T12:00:00');
      content = `<span class="day-number">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`;
      if (isMakeup && fast.toggledAt) {
        content += `<span class="makeup-date">${formatDate(fast.toggledAt)}</span>`;
      }
    } else if (type === 'shawwal') {
      const shawwalDay = index + 1;
      content = `<span class="day-number">${shawwalDay}</span>`;
      if (isDone) {
        content += `<span class="check">✓</span>`;
        if (fast.toggledAt) {
          content += `<span class="makeup-date">${formatDate(fast.toggledAt)}</span>`;
        }
      }
    } else {
      const date = new Date(fast.date + 'T12:00:00');
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'short' });
      content = `<span class="day-number">${date.getDate()}</span><span class="day-name">${dayOfWeek}</span>`;
      if (isDone) content += `<span class="check">✓</span>`;
      if (isMakeup) {
        content += `<span class="makeup-date">Made up</span>`;
      }
    }
    
    div.innerHTML = content;
    div.onclick = () => toggleFast(fast, type);
    container.appendChild(div);
  });
}

let confettiShown = {};

function loadConfettiState() {
  try {
    const stored = localStorage.getItem('confettiShown');
    if (stored) {
      confettiShown = JSON.parse(stored);
    }
  } catch (e) {}
}

function saveConfettiState() {
  try {
    localStorage.setItem('confettiShown', JSON.stringify(confettiShown));
  } catch (e) {}
}

function updateProgress(type, count, total) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  const bar = document.getElementById(`${type}-bar`);
  const text = document.getElementById(`${type}-progress-text`);
  
  bar.style.width = `${percentage}%`;
  text.textContent = `${count} / ${total}`;
  
  if (count >= total && total > 0 && !confettiShown[type]) {
    confettiShown[type] = true;
    saveConfettiState();
    showConfetti();
  }
}

function showConfetti() {
  const colors = ['#4caf50', '#ff9800', '#9c27b0', '#2196f3', '#f44336'];
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);
  
  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position:absolute;
      width:10px;
      height:10px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      left:${Math.random() * 100}%;
      top:-10px;
      opacity:${Math.random() * 0.7 + 0.3};
      transform:rotate(${Math.random() * 360}deg);
    `;
    
    const duration = Math.random() * 2000 + 2000;
    const delay = Math.random() * 500;
    
    confetti.animate([
      { top: '-10px', transform: `rotate(0deg)` },
      { top: '100%', transform: `rotate(${Math.random() * 720 - 360}deg)` }
    ], {
      duration: duration,
      delay: delay,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    });
    
    container.appendChild(confetti);
  }
  
  setTimeout(() => container.remove(), 4000);
}

async function toggleFast(fast, type) {
  if (type === 'missed') {
    const newMakeup = !fast.isMakeup;
    const newToggledAt = newMakeup ? todayStr : null;
    await updateFast({
      ...fast,
      isMakeup: newMakeup,
      toggledAt: newToggledAt
    });
  } else {
    const newStatus = fast.status === 'PENDING' ? 'DONE' : 'PENDING';
    const newToggledAt = newStatus === 'DONE' ? todayStr : null;
    await updateFast({
      ...fast,
      status: newStatus,
      toggledAt: newToggledAt
    });
  }
  
  loadData();
}

function toLocalDateString(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function openDatePicker(mode) {
  const currentStart = currentYear.gregorianStartDate;
  const currentEnd = currentYear.gregorianEndDate;
  
  const currentDate = mode === 'start' ? currentStart : currentEnd;
  const currentDateFormatted = formatDateDisplay(currentDate);
  
  document.getElementById('date-picker-content').innerHTML = `
    <h3>Select ${mode === 'start' ? 'Ramadan Start' : 'Ramadan End'} Date</h3>
    <p class="current-date">Current: ${currentDateFormatted}</p>
    <div class="date-buttons">
      <button id="prev-day" class="date-nav">◀</button>
      <span id="selected-date-display" class="selected-date">${currentDateFormatted}</span>
      <button id="next-day" class="date-nav">▶</button>
    </div>
    <p class="date-hint">Use arrows or tap the date to change</p>
    <div class="button-row">
      <button id="confirm-date" class="confirm-btn">Save</button>
      <button id="cancel-date" class="cancel-btn">Cancel</button>
    </div>
  `;
  
  let selectedDate = new Date(currentDate);
  
  const updateDisplay = () => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    document.getElementById('selected-date-display').textContent = 
      `${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;
  };
  
  document.getElementById('prev-day').onclick = () => {
    selectedDate.setDate(selectedDate.getDate() - 1);
    updateDisplay();
  };
  
  document.getElementById('next-day').onclick = () => {
    selectedDate.setDate(selectedDate.getDate() + 1);
    updateDisplay();
  };
  
  document.getElementById('selected-date-display').onclick = () => {
    const input = document.createElement('input');
    input.type = 'date';
    const [y, m, d] = currentDate.split('-');
    input.value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    input.onchange = (e) => {
      selectedDate = new Date(e.target.value + 'T12:00:00');
      updateDisplay();
    };
    input.showPicker?.();
  };
  
  document.getElementById('date-picker').classList.remove('hidden');
  
  document.getElementById('confirm-date').onclick = async () => {
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const selectedDateStr = `${year}-${month}-${day}`;
    
    const newStart = mode === 'start' ? selectedDateStr : currentStart;
    const newEnd = mode === 'end' ? selectedDateStr : currentEnd;
    
    await updateYear({
      ...currentYear,
      gregorianStartDate: newStart,
      gregorianEndDate: newEnd
    });
    
    await updateFastRecordsForDates(currentYear.id, newStart, newEnd, 'RAMADAN');
    await ensureShawwalFasts(currentYear.id);
    
    document.getElementById('date-picker').classList.add('hidden');
    loadData();
  };
  
  document.getElementById('cancel-date').onclick = () => {
    document.getElementById('date-picker').classList.add('hidden');
  };
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

document.getElementById('edit-start').onclick = () => openDatePicker('start');
document.getElementById('edit-end').onclick = () => openDatePicker('end');

async function init() {
  loadConfettiState();
  document.documentElement.setAttribute('data-theme', 'dark');
  
  await initDB();
  await requestPersistentStorage();
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
  
  render();
}

init();
