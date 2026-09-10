/* Conversion/domain layer — browser/DOM independent. */

function getNoteTypeValue(note) {
  const raw = (note && note.type !== undefined && note.type !== null) ? note.type : (note && note.noteType);
  if (raw === undefined || raw === null) return '';
  const val = String(raw).trim();
  if (val === '' || val === '0') return '';
  if (val.toLowerCase() === 'normal' || val.toLowerCase() === 'none' || val.toLowerCase() === 'default') return '';
  return val;
}

function findNoteTypeRegistry(chartData) {
  const candidateKeys = ['noteTypes', 'noteTypeList', 'customNoteTypes', 'noteSkins', 'types'];
  for (const key of candidateKeys) {
    const val = chartData && chartData[key];
    if (Array.isArray(val) && val.length) return val;
  }
  return null;
}

function resolveNoteTypeLabel(rawValue, registry) {
  const str = String(rawValue).trim();
  const isNumeric = /^-?\d+$/.test(str);
  if (isNumeric && registry) {
    const entry = registry[parseInt(str, 10)];
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry && typeof entry === 'object') {
      const name = entry.name || entry.title || entry.id;
      if (name) return String(name);
    }
  }
  return isNumeric ? ('Notetype #' + str) : str;
}

function detectNoteTypes(chartData) {
  const registry = findNoteTypeRegistry(chartData);
  const found = new Map();
  const strumLines = (chartData && Array.isArray(chartData.strumLines)) ? chartData.strumLines : [];
  strumLines.forEach(strumLine => {
    if (!Array.isArray(strumLine.notes)) return;
    strumLine.notes.forEach(note => {
      const val = getNoteTypeValue(note);
      if (val && !found.has(val)) found.set(val, resolveNoteTypeLabel(val, registry));
    });
  });
  return Array.from(found, ([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function buildBPMTimeline(initialBPM, events) {
  const timeline = [{ step: 0, time: 0, bpm: initialBPM }];
  const bpmChanges = (events || [])
    .filter(e => e.name === 'BPM Change')
    .sort((a, b) => a.time - b.time);
  for (const change of bpmChanges) {
    const last = timeline[timeline.length - 1];
    const stepLen = 60000 / (last.bpm * 4);
    timeline.push({
      step: last.step + (change.time - last.time) / stepLen,
      time: change.time,
      bpm: change.params[0]
    });
  }
  return timeline;
}

function stepToMs(step, timeline) {
  let last = timeline[0];
  for (const point of timeline) {
    if (point.step <= step) last = point;
    else break;
  }
  return last.time + (step - last.step) * (60000 / (last.bpm * 4));
}

function extractCameraSpeedFromHScript(content, bpmTimeline) {
  const events = [];
  const lines = content.split('\n');
  let currentSteps = [];
  for (const line of lines) {
    const caseMatch = line.match(/^\s*case\s+([\d\s|]+):/);
    if (caseMatch) {
      currentSteps = caseMatch[1]
        .split('|')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));
    }
    const lerpMatch = line.match(/FlxG\.camera\.followLerp\s*=\s*([\d.]+)/);
    if (lerpMatch && currentSteps.length > 0) {
      const lerpValue = parseFloat(lerpMatch[1]);
      for (const step of currentSteps) {
        events.push({
          t: stepToMs(step, bpmTimeline),
          e: 'CameraSpeedEvent',
          v: { lerpSpeed: String(lerpValue) }
        });
      }
    }
  }
  return events;
}

function getParam(params, index, defaultValue) {
  if (!Array.isArray(params) || index >= params.length) return defaultValue;
  const val = params[index];
  if (val === 0 || val === "0") return 0;
  if (val === "" || val === null || val === undefined) return defaultValue;
  const num = parseFloat(val);
  return isNaN(num) ? defaultValue : num;
}

function getBoolParam(params, index, defaultValue) {
  if (!Array.isArray(params) || index >= params.length) return defaultValue;
  const val = params[index];
  if (val === true || val === "true" || val === 1) return true;
  if (val === false || val === "false" || val === 0) return false;
  return defaultValue;
}

function intToHex(color) {
  if (color === undefined || color === null || color === "") return "FFFFFF";
  if (typeof color === "string" && color.startsWith("#")) return color.replace("#", "").toUpperCase();
  return (color & 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
}

function convertEasing(ease, easeDirection) {
  if (ease === "CLASSIC") return "CLASSIC";
  let easeStr = (ease !== null && ease !== undefined) ? String(ease) : "linear";
  const easingMap = {
    "linear": "linear", "sine": "sine", "quad": "quad", "cubic": "cube",
    "quart": "quart", "quint": "quint", "expo": "expo", "circ": "circ",
    "back": "back", "elastic": "elastic", "bounce": "bounce",
    "smoothStep": "smoothStep", "smootherStep": "smootherStep"
  };
  const directionMap = { "In": "In", "Out": "Out", "InOut": "InOut" };
  const normalizedEase = easingMap[easeStr.toLowerCase()] || "linear";
  if (normalizedEase === "linear") return "linear";
  const dirStr = (easeDirection !== null && easeDirection !== undefined) ? String(easeDirection) : "";
  if (dirStr && directionMap[dirStr]) return normalizedEase + directionMap[dirStr];
  return normalizedEase + "In";
}

function charIndexToRole(index) {
  const roles = { 0: "dad", 1: "bf", 2: "gf" };
  return roles[index] !== undefined ? roles[index] : "dad";
}

const LYRICS_SKIP_ACTIONS = new Set(["Enable text history (On, Off)"]);
const LYRICS_VALID_ACTIONS = new Set(["Add Text", "Force remove all text", "Set Color", "Set Border Color", "Set Font", "Set Size", "Center", "Cutscene", "Ultra remove"]);

function convertLyricsEvent(event) {
  let action = (event.params && event.params[0] != null) ? String(event.params[0]) : "Add Text";
  if (LYRICS_SKIP_ACTIONS.has(action) || !LYRICS_VALID_ACTIONS.has(action)) return null;
  let value = (event.params && event.params[1] != null) ? String(event.params[1]) : "";
  const rawColor = (event.params && event.params[2] != null) ? event.params[2] : -1;
  const boolVal = (event.params && event.params[3] != null) ? Boolean(event.params[3]) : false;
  const color = (rawColor === -1 || rawColor === "-1") ? "FFFFFF" : intToHex(rawColor);
  if (action === "Set Font" && /^\d+$/.test(value.trim())) action = "Set Size";
  return { t: event.time, e: "Lyrics", v: { action: action, boolVal: boolVal, color: color, value: value } };
}

function convertChart(codenameChart, hscriptContent, bpmTimeline, options) {
  const result = {
    version: "2.0.0",
    scrollSpeed: { normal: codenameChart.scrollSpeed || 1 },
    events: [],
    notes: { normal: [] },
    generatedBy: "Friday Night Funkin' - v0.7.5 (Android Porter)"
  };

  const mult = options.multipliers;
  const excluded = options.excludedEvents;
  const excludedNoteTypes = options.excludedNoteTypes || new Set();
  const noteTypeBehavior = options.noteTypeBehavior || 'remove'; // 'remove' | 'normal'

  if (codenameChart.events && Array.isArray(codenameChart.events)) {
    codenameChart.events.forEach((event) => {
        const name = event.name;

        // Skip if the event is in the exclusion list
        if (excluded.has(name) || (name === "Change Scroll Speed" && excluded.has("Scroll Speed Change"))) {
            return;
        }

        if (name === "Scroll Speed Change" || name === "Change Scroll Speed") {
            const useTween = name === "Change Scroll Speed" ? getBoolParam(event.params, 0, true) : true;
            const newSpeed = getParam(event.params, 1, 1);
            const duration = getParam(event.params, 2, 0);
            const ease = event.params && event.params[3] ? event.params[3] : "linear";
            const easeDirection = event.params && event.params[4] ? event.params[4] : "";
            result.events.push({
                t: event.time,
                e: "ScrollSpeed",
                v: { scroll: newSpeed, duration: useTween ? duration : 0, ease: convertEasing(ease, easeDirection), strumline: "both", absolute: true }
            });
        } else if (name === "Camera Movement") {
            const codenameCharId = getParam(event.params, 0, 0);
            const instant = event.params && event.params[1] === true;
            const duration = getParam(event.params, 2, (instant ? 0 : 4));
            result.events.push({
                t: event.time,
                e: "CameraMovement",
                v: { char: codenameCharId, duration: duration, ease: "CLASSIC", movement: instant ? "snap" : "tween" }
            });
        } else if (name === "Add Camera Zoom") {
            const zoomAmount = getParam(event.params, 0, 0.015);
            const cameraTag = (event.params && event.params[1]) ? event.params[1] : "camGame";
            result.events.push({ t: event.time, e: "AddCameraZoom", v: { zoom: zoomAmount, camera: cameraTag } });
        } else if (name === "Change Stage Zoom") {
            let rawZoom, duration, ease, easeDir;
            if (event.params && event.params.length > 5) {
                rawZoom = getParam(event.params, 5, 1.0);
                duration = getParam(event.params, 6, 0) * mult.zoomDurMult;
                ease = event.params[7] || "linear";
                easeDir = event.params[8] || "";
            } else {
                rawZoom = getParam(event.params, 0, 1.0);
                duration = getParam(event.params, 1, 0) * mult.zoomDurMult;
                ease = event.params[2] || "linear";
                easeDir = event.params[3] || "";
            }
            if (ease === "linear") { ease = "expo"; easeDir = "Out"; }
            const correctedZoom = (mult.defaultStageZoom > 0) ? (rawZoom / mult.defaultStageZoom) : rawZoom;
            result.events.push({ t: event.time, e: "ZoomCamera", v: { zoom: correctedZoom, duration: duration, ease: convertEasing(ease, easeDir), mode: "stage" } });
        } else if (name === "Camera Modulo Change") {
            result.events.push({ t: event.time, e: "SetCameraBop", v: { rate: getParam(event.params, 0, 4), intensity: getParam(event.params, 1, 1) } });
        } else if (name === "Camera Speed") {
            result.events.push({ t: event.time, e: "CameraSpeedEvent", v: { lerpSpeed: String(getParam(event.params, 0, 0.04)) } });
        } else if (name === "Cinematic Bars") {
            result.events.push({ t: event.time, e: "CinematicBarsEvent", v: { hexcolor: intToHex(event.params[6] || 0), size: getParam(event.params, 1, 0.5) * mult.cinematicBarMult, camera: event.params[5] || "camHUD", tweenEase: convertEasing(event.params[3], event.params[4]), time: getParam(event.params, 2, 4), tweenBars: getBoolParam(event.params, 0, true) } });
        } else if (name === "Saturation Effect") {
            result.events.push({ t: event.time, e: "Saturation", v: { useTween: getBoolParam(event.params, 0, true), saturation: getParam(event.params, 1, 1) * mult.saturationMult, duration: getParam(event.params, 2, 4), easeBase: event.params[3] || "linear", easeType: event.params[4] || "In" } });
        } else if (name === "Screen Vignette") {
            result.events.push({ t: event.time, e: "Vignette", v: { useTween: getBoolParam(event.params, 0, true), amount: getParam(event.params, 1, 1) * mult.vignetteMult, strength: getParam(event.params, 2, 1) * mult.vignetteMult, duration: getParam(event.params, 3, 4), easeBase: event.params[4] || "linear", easeType: event.params[5] || "In" } });
        } else if (name === "Bloom Effect") {
            result.events.push({ t: event.time, e: "Bloom", v: { useTween: getBoolParam(event.params, 0, true), bloom: getParam(event.params, 1, 0) * mult.bloomMult, duration: getParam(event.params, 2, 4), easeBase: event.params[3] || "linear", easeType: event.params[4] || "In" } });
        } else if (name === "Change HUD Alpha") {
            const alphaData = { newAlpha: getParam(event.params, 1, 1), tweenTime: getParam(event.params, 2, 4) * mult.screenCoverMult, tweenAlpha: getBoolParam(event.params, 0, true), tweenEase: convertEasing(event.params[3], event.params[4]) };
            result.events.push({ t: event.time, e: "ChangeHUDAlphaEvent", v: { ...alphaData } });
        } else if (name === "Change Character") {
            result.events.push({ t: event.time, e: "ChangeCharacter", v: { newchar: String(event.params[1] || ""), character: charIndexToRole(getParam(event.params, 0, 0)) } });
        } else if (name === "Lyrics") {
            const converted = convertLyricsEvent(event);
            if (converted) result.events.push(converted);
        }
    });
    result.events.sort((a, b) => a.t - b.t);
  }

  if (hscriptContent && bpmTimeline && !excluded.has("HScript")) {
    result.events.push(...extractCameraSpeedFromHScript(hscriptContent, bpmTimeline));
    result.events.sort((a, b) => a.t - b.t);
  }

  if (codenameChart.strumLines && Array.isArray(codenameChart.strumLines)) {
    codenameChart.strumLines.forEach(strumLine => {
      let offset = (strumLine.type === 1 || strumLine.position === "boyfriend") ? 0 : (strumLine.type === 2 || strumLine.position === "girlfriend" ? 8 : 4);
      if (!strumLine.notes) return;
      strumLine.notes.forEach(note => {
        const noteType = getNoteTypeValue(note);
        // If this notetype was switched off by the user, either drop the note
        // entirely ('remove') or keep it but treat it as a plain Normal note
        // ('normal') — either way no special type info is ever carried into p.
        if (noteType && excludedNoteTypes.has(noteType) && noteTypeBehavior === 'remove') return;
        result.notes.normal.push({ t: note.time, d: note.id + offset, l: note.sLen || 0, p: [] });
      });
    });
  }

  result.notes.normal.sort((a, b) => a.t - b.t);
  return result;
}
