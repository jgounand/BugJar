/**
 * BugJar — Annotation Editor (annotate.js)
 *
 * Full-screen canvas drawing tools for annotating screenshots.
 * Tools: pen (freehand), arrow, rectangle, text
 * Actions: undo, clear, done
 */

// ============================================================================
// State
// ============================================================================
let currentTool = 'pen';
let currentColor = '#e74c3c';
let currentThickness = 3;
let isDrawing = false;
let startX = 0;
let startY = 0;

// History: each entry is an ImageData snapshot
const history = [];
let backgroundImage = null;

// ============================================================================
// DOM references
// ============================================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvas-container');
const textInputOverlay = document.getElementById('text-input-overlay');
const textInput = document.getElementById('text-input');

// Tool buttons
const toolButtons = {
  pen: document.getElementById('tool-pen'),
  arrow: document.getElementById('tool-arrow'),
  rect: document.getElementById('tool-rect'),
  text: document.getElementById('tool-text')
};

const colorSwatches = document.querySelectorAll('.color-swatch');
const thicknessSlider = document.getElementById('thickness');
const btnUndo = document.getElementById('btn-undo');
const btnClear = document.getElementById('btn-clear');
const btnDone = document.getElementById('btn-done');

// ============================================================================
// Initialize — load screenshot from storage
// ============================================================================
(async function init() {
  const data = await chrome.storage.local.get('pendingScreenshot');
  if (!data.pendingScreenshot) {
    document.body.textContent = 'No screenshot found. Please capture a screenshot from the popup first.';
    document.body.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100vh;color:#aaa;font-size:16px;';
    return;
  }

  const img = new Image();
  img.onload = () => {
    backgroundImage = img;
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    saveState();

    // Clean up
    chrome.storage.local.remove('pendingScreenshot');
  };
  img.onerror = () => {
    chrome.storage.local.remove('pendingScreenshot');
    document.body.textContent = 'Screenshot data is corrupted. Please capture again.';
  };
  img.src = data.pendingScreenshot;
})();

// ============================================================================
// State management (undo support)
// ============================================================================
function saveState() {
  history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  // Cap history to prevent memory issues
  if (history.length > 15) history.shift();
}

function undo() {
  if (history.length <= 1) return; // keep at least the base image
  history.pop(); // remove current state
  const prev = history[history.length - 1];
  ctx.putImageData(prev, 0, 0);
}

function clearAll() {
  if (!backgroundImage) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(backgroundImage, 0, 0);
  history.length = 0;
  saveState();
}

// ============================================================================
// Tool selection
// ============================================================================
function setTool(tool) {
  currentTool = tool;
  for (const [key, btn] of Object.entries(toolButtons)) {
    btn.classList.toggle('active', key === tool);
  }
  canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
}

for (const [tool, btn] of Object.entries(toolButtons)) {
  btn.addEventListener('click', () => setTool(tool));
}

// ============================================================================
// Color selection
// ============================================================================
colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    colorSwatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    currentColor = swatch.dataset.color;
  });
});

// ============================================================================
// Thickness slider
// ============================================================================
thicknessSlider.addEventListener('input', () => {
  currentThickness = parseInt(thicknessSlider.value, 10);
});

// ============================================================================
// Canvas drawing — helpers
// ============================================================================
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// For rectangle/arrow preview, we need a snapshot to restore before redraw
let previewSnapshot = null;

function drawArrow(fromX, fromY, toX, toY) {
  const headLen = 14 + currentThickness * 2;
  const angle = Math.atan2(toY - fromY, toX - fromX);

  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentThickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();

  // Head
  ctx.fillStyle = currentColor;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawRect(x1, y1, x2, y2) {
  ctx.strokeStyle = currentColor;
  ctx.lineWidth = currentThickness;
  ctx.lineJoin = 'round';
  ctx.strokeRect(
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.abs(x2 - x1),
    Math.abs(y2 - y1)
  );
}

// ============================================================================
// Canvas events
// ============================================================================
canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'text') {
    handleTextClick(e);
    return;
  }

  isDrawing = true;
  const pos = getCanvasCoords(e);
  startX = pos.x;
  startY = pos.y;

  if (currentTool === 'pen') {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  } else {
    // Arrow or rect: take a snapshot for live preview
    previewSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
});

let rafPending = false;
canvas.addEventListener('mousemove', (e) => {
  if (!isDrawing) return;

  const pos = getCanvasCoords(e);

  if (currentTool === 'pen') {
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  } else if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!isDrawing || !previewSnapshot) return;
      if (currentTool === 'arrow') {
        ctx.putImageData(previewSnapshot, 0, 0);
        drawArrow(startX, startY, pos.x, pos.y);
      } else if (currentTool === 'rect') {
        ctx.putImageData(previewSnapshot, 0, 0);
        drawRect(startX, startY, pos.x, pos.y);
      }
    });
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (!isDrawing) return;
  isDrawing = false;

  const pos = getCanvasCoords(e);

  if (currentTool === 'arrow') {
    ctx.putImageData(previewSnapshot, 0, 0);
    drawArrow(startX, startY, pos.x, pos.y);
  } else if (currentTool === 'rect') {
    ctx.putImageData(previewSnapshot, 0, 0);
    drawRect(startX, startY, pos.x, pos.y);
  }

  previewSnapshot = null;
  saveState();
});

canvas.addEventListener('mouseleave', () => {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentTool === 'pen') {
    saveState();
  } else if (previewSnapshot) {
    ctx.putImageData(previewSnapshot, 0, 0);
    previewSnapshot = null;
  }
});

// ============================================================================
// Text tool
// ============================================================================
function handleTextClick(e) {
  const pos = getCanvasCoords(e);

  // Position input overlay at click location
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  textInputOverlay.style.left = (rect.left + pos.x * scaleX) + 'px';
  textInputOverlay.style.top = (rect.top + pos.y * scaleY) + 'px';
  textInputOverlay.classList.add('visible');

  textInput.value = '';
  textInput.style.color = currentColor;
  textInput.focus();

  // Store where to draw the text
  textInput.dataset.canvasX = pos.x;
  textInput.dataset.canvasY = pos.y;
}

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    commitText();
  } else if (e.key === 'Escape') {
    textInputOverlay.classList.remove('visible');
  }
});

textInput.addEventListener('blur', () => {
  if (textInput.value.trim()) {
    commitText();
  } else {
    textInputOverlay.classList.remove('visible');
  }
});

function commitText() {
  const text = textInput.value.trim();
  if (!text) {
    textInputOverlay.classList.remove('visible');
    return;
  }

  const x = parseFloat(textInput.dataset.canvasX);
  const y = parseFloat(textInput.dataset.canvasY);

  const fontSize = 14 + currentThickness * 2;
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = currentColor;

  // Draw text with background for readability
  const metrics = ctx.measureText(text);
  const padding = 4;
  const bgX = x - padding;
  const bgY = y - fontSize - padding;
  const bgW = metrics.width + padding * 2;
  const bgH = fontSize + padding * 2 + 4;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(bgX, bgY, bgW, bgH);

  ctx.fillStyle = currentColor;
  ctx.fillText(text, x, y);

  textInputOverlay.classList.remove('visible');
  saveState();
}

// ============================================================================
// Action buttons
// ============================================================================
btnUndo.addEventListener('click', undo);
btnClear.addEventListener('click', clearAll);

// Done: export canvas as JPEG (smaller) and save to storage
btnDone.addEventListener('click', async () => {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  await chrome.storage.local.set({ annotatedScreenshot: dataUrl });

  // Close this tab
  const currentTab = await chrome.tabs.getCurrent();
  if (currentTab) {
    chrome.tabs.remove(currentTab.id);
  }
});

// ============================================================================
// Keyboard shortcuts
// ============================================================================
document.addEventListener('keydown', (e) => {
  // Skip if text input is focused
  if (document.activeElement === textInput) return;

  if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undo();
  } else if (e.key === 'p') {
    setTool('pen');
  } else if (e.key === 'a') {
    setTool('arrow');
  } else if (e.key === 'r') {
    setTool('rect');
  } else if (e.key === 't') {
    setTool('text');
  }
});
