/* UI/controller layer — DOM, interactions, and file orchestration only. */

function addRipple(el, evt){
  const rect = el.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  const x = (evt.clientX ?? rect.left + rect.width/2) - rect.left - size/2;
  const y = (evt.clientY ?? rect.top + rect.height/2) - rect.top - size/2;
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  el.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

function showTab(tabId){
  tabPanels.forEach(p => p.classList.toggle('active', p.id === tabId));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === tabId));
}

function bindFileDisplay(inputId, labelId){
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  input.addEventListener('change', () => {
    if (input.files[0]) {
      label.textContent = input.files[0].name;
      label.classList.add('has-file');
    } else {
      label.textContent = 'No file selected';
      label.classList.remove('has-file');
    }
  });
}

function refreshSwitchState(){
  let activeCount = 0;
  eventToggles.forEach(cb => {
    const wrapper = cb.closest('.md-switch');
    wrapper.classList.toggle('is-off', !cb.checked);
    if (cb.checked) activeCount++;
  });
  excludeCountEl.textContent = activeCount + '/' + eventToggles.length;
}

function refreshNoteTypeState() {
  let activeCount = 0;
  noteTypeToggles.forEach(cb => {
    const wrapper = cb.closest('.md-switch');
    wrapper.classList.toggle('is-off', !cb.checked);
    if (cb.checked) activeCount++;
  });
  noteTypeCountEl.textContent = activeCount + '/' + noteTypeToggles.length;
}

function renderNoteTypeSwitches(types) {
  noteTypeGrid.innerHTML = '';
  if (!types.length) {
    noteTypeGrid.innerHTML = '<p class="card-subtitle" style="padding-left:0;margin:0;">No custom notetypes detected in this chart.</p>';
    noteTypeToggles = [];
    noteTypeCountEl.textContent = '0/0';
    return;
  }
  types.forEach(t => {
    const label = document.createElement('label');
    label.className = 'md-switch';
    label.innerHTML = '<input type="checkbox" class="notetype-toggle" value="' + escapeHtml(t.value) + '" checked><span class="track"><span class="thumb"></span></span><span class="switch-label">' + escapeHtml(t.label) + '</span>';
    noteTypeGrid.appendChild(label);
  });
  noteTypeToggles = Array.from(document.querySelectorAll('.notetype-toggle'));
  noteTypeToggles.forEach(cb => cb.addEventListener('change', refreshNoteTypeState));
  refreshNoteTypeState();

  // Notify the user that notetypes were found and are ready to be toggled.
  // Disappears on its own after a few seconds instead of staying on screen.
  const preview = types.slice(0, 3).map(t => t.label).join(', ') + (types.length > 3 ? ', ...' : '');
  const plural = types.length > 1 ? 's' : '';
  showStatus(types.length + ' notetype' + plural + ' detected: ' + preview, 'success', 4000);
}

function refreshNoteTypeBehaviorUI(){
  noteTypeBehaviorRadios.forEach(r => r.closest('.segment').classList.toggle('active', r.checked));
}

function getNoteTypeBehavior(){
  const checked = noteTypeBehaviorRadios.find(r => r.checked);
  return checked ? checked.value : 'remove';
}

function showStatus(message, type, autoHideMs){
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = 'snackbar show' + (type ? (' ' + type) : '');
  if (status._hideTimer) { clearTimeout(status._hideTimer); status._hideTimer = null; }
  if (autoHideMs) {
    status._hideTimer = setTimeout(() => { status.classList.remove('show'); }, autoHideMs);
  }
}

const navItems = Array.from(document.querySelectorAll('.nav-item'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const eventToggles = Array.from(document.querySelectorAll('.event-toggle'));
const excludeCountEl = document.getElementById('excludeCount');
const noteTypeGrid = document.getElementById('noteTypeSwitchGrid');
const noteTypeCountEl = document.getElementById('noteTypeCount');
const noteTypeHeader = document.getElementById('noteTypeHeader');
const noteTypeBehaviorRadios = Array.from(document.querySelectorAll('input[name="noteTypeBehavior"]'));
let noteTypeToggles = [];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function readNumberInput(id, fallback) {
  const value = parseFloat(document.getElementById(id)?.value);
  return value || fallback;
}

function collectConversionOptions() {
  return {
    multipliers: {
      defaultStageZoom: readNumberInput('defaultStageZoom', 0.4),
      zoomDurMult: readNumberInput('zoomDurMult', 1.0),
      bloomMult: readNumberInput('bloomMult', 0.9),
      saturationMult: readNumberInput('saturationMult', 1.0),
      vignetteMult: readNumberInput('vignetteMult', 1.0),
      cinematicBarMult: readNumberInput('cinematicBarMult', 1.03),
      screenCoverMult: readNumberInput('screenCoverMult', 1.0),
      flashDurMult: readNumberInput('flashDurMult', 1.0)
    },
    excludedEvents: new Set(
      eventToggles.filter(cb => !cb.checked).map(cb => cb.value)
    ),
    excludedNoteTypes: new Set(
      noteTypeToggles.filter(cb => !cb.checked).map(cb => cb.value)
    ),
    noteTypeBehavior: getNoteTypeBehavior()
  };
}

function bindRippleTargets() {
  document.querySelectorAll('.fab-button, .file-trigger, .section-header-row, .nav-item').forEach(el => {
    el.style.position = el.style.position || 'relative';
    el.style.overflow = 'hidden';
    el.addEventListener('click', event => addRipple(el, event));
  });
}

function toggleAllCheckboxes(checkboxes, refresh) {
  if (!checkboxes.length) return;
  const anyOff = checkboxes.some(cb => !cb.checked);
  checkboxes.forEach(cb => { cb.checked = anyOff; });
  refresh();
}

async function inspectChartNoteTypes(file) {
  if (!file) {
    renderNoteTypeSwitches([]);
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    renderNoteTypeSwitches(detectNoteTypes(data));
  } catch (err) {
    noteTypeGrid.innerHTML = '<p class="card-subtitle" style="padding-left:0;margin:0;">Could not read notetypes from this file (invalid JSON?).</p>';
    noteTypeToggles = [];
    noteTypeCountEl.textContent = '0/0';
  }
}

async function processConversion() {
  const convertBtn = document.getElementById('convertBtn');
  const chartInput = document.getElementById('chartFile');
  const eventsInput = document.getElementById('eventsFile');
  const hscriptInput = document.getElementById('hscriptFile');
  const initialBpm = readNumberInput('initialBpm', 130);

  if (!chartInput.files[0]) {
    showStatus('Please select a chart file first!', 'error');
    return;
  }

  try {
    convertBtn.disabled = true;
    showStatus('Reading files...', '');

    const codenameData = JSON.parse(await chartInput.files[0].text());

    if (eventsInput.files[0]) {
      const eventsData = JSON.parse(await eventsInput.files[0].text());
      if (eventsData && Array.isArray(eventsData.events)) {
        if (!Array.isArray(codenameData.events)) codenameData.events = [];
        codenameData.events = codenameData.events.concat(eventsData.events);
      }
    }

    let hscriptContent = null;
    let bpmTimeline = null;
    if (hscriptInput.files[0]) {
      hscriptContent = await hscriptInput.files[0].text();
      bpmTimeline = buildBPMTimeline(initialBpm, codenameData.events || []);
    }

    const vSliceChart = convertChart(
      codenameData,
      hscriptContent,
      bpmTimeline,
      collectConversionOptions()
    );
    const jsonOutput = JSON.stringify(vSliceChart, null, 2).replace(/"p": \[\]/g, '"p": [        ]');

    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chart-converted.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showStatus('Success! File downloaded.', 'success');
  } catch (e) {
    showStatus('Error: ' + e.message, 'error');
  } finally {
    convertBtn.disabled = false;
  }
}

function initUI() {
  bindRippleTargets();

  navItems.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

  bindFileDisplay('chartFile', 'chartFileName');
  bindFileDisplay('eventsFile', 'eventsFileName');
  bindFileDisplay('hscriptFile', 'hscriptFileName');

  eventToggles.forEach(cb => cb.addEventListener('change', refreshSwitchState));
  refreshSwitchState();

  document.getElementById('excludeHeader').addEventListener('click', () => {
    toggleAllCheckboxes(eventToggles, refreshSwitchState);
  });

  noteTypeHeader.addEventListener('click', () => {
    toggleAllCheckboxes(noteTypeToggles, refreshNoteTypeState);
  });

  noteTypeBehaviorRadios.forEach(radio => radio.addEventListener('change', refreshNoteTypeBehaviorUI));
  refreshNoteTypeBehaviorUI();

  document.getElementById('chartFile').addEventListener('change', event => {
    inspectChartNoteTypes(event.target.files[0]);
  });

  document.getElementById('convertBtn').addEventListener('click', processConversion);
}

document.addEventListener('DOMContentLoaded', initUI);
