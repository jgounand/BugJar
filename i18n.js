/**
 * BugJar -- i18n (P3-20)
 *
 * Provides EN / FR / ES translations.
 * The popup loads this file before popup.js and calls applyTranslations().
 */

const TRANSLATIONS = {
  en: {
    description: 'Description',
    descriptionPlaceholder: 'Describe the issue...',
    steps: 'Steps to reproduce',
    stepsPlaceholder: '1. Go to...\n2. Click on...\n3. See error...',
    category: 'Category',
    priority: 'Priority',
    captures: 'Captures',
    captureAll: 'Capture All (Screenshot + Console + Network)',
    screenshot: 'Screenshot',
    selectElement: 'Select Element',
    console: 'Console',
    network: 'Network',
    generate: 'Generate Report',
    clear: 'Clear',
    ready: 'Ready',
    // Categories
    catBug: 'Bug',
    catFeature: 'Feature Request',
    catQuestion: 'Question',
    catOther: 'Other',
    // Priorities
    priLow: 'Low',
    priMedium: 'Medium',
    priHigh: 'High',
    priCritical: 'Critical',
    // Help panel
    helpStep1Title: 'Navigate to the bug',
    helpStep1Desc: 'Go to the page where you see the issue',
    helpStep2Title: 'Describe the problem',
    helpStep2Desc: 'Write what happened vs what you expected',
    helpStep3Title: 'Capture evidence',
    helpStep3Desc: 'Click Capture All for a quick capture, or use individual buttons for more control',
    helpStep4Title: 'Annotate (optional)',
    helpStep4Desc: 'Use the screenshot button to annotate with arrows, circles, and text',
    helpStep5Title: 'Generate & share',
    helpStep5Desc: 'Click Generate Report to download a file. Send it to your developer or paste it into Claude/ChatGPT',
    helpShortcutsTitle: 'Keyboard shortcuts',
    helpShortcutOpen: 'Open BugJar',
    helpShortcutCapture: 'Quick capture all',
    helpDismiss: 'Got it!',
    // History tab
    tabReport: 'Report',
    tabHistory: 'History',
    clearHistory: 'Clear All',
    historyEmpty: 'No reports yet',
    reportCleared: 'Report saved! Fields cleared.'
  },
  fr: {
    description: 'Description',
    descriptionPlaceholder: 'D\u00e9crivez le probl\u00e8me...',
    steps: '\u00c9tapes de reproduction',
    stepsPlaceholder: '1. Aller sur...\n2. Cliquer sur...\n3. Voir l\'erreur...',
    category: 'Cat\u00e9gorie',
    priority: 'Priorit\u00e9',
    captures: 'Captures',
    captureAll: 'Tout capturer (Capture + Console + R\u00e9seau)',
    screenshot: 'Capture',
    selectElement: '\u00c9l\u00e9ment',
    console: 'Console',
    network: 'R\u00e9seau',
    generate: 'G\u00e9n\u00e9rer le rapport',
    clear: 'Effacer',
    ready: 'Pr\u00eat',
    catBug: 'Bug',
    catFeature: 'Demande de fonctionnalit\u00e9',
    catQuestion: 'Question',
    catOther: 'Autre',
    priLow: 'Basse',
    priMedium: 'Moyenne',
    priHigh: 'Haute',
    priCritical: 'Critique',
    // Help panel
    helpStep1Title: 'Naviguez vers le bug',
    helpStep1Desc: 'Allez sur la page o\u00f9 vous voyez le probl\u00e8me',
    helpStep2Title: 'D\u00e9crivez le probl\u00e8me',
    helpStep2Desc: '\u00c9crivez ce qui s\'est pass\u00e9 vs ce que vous attendiez',
    helpStep3Title: 'Capturez les preuves',
    helpStep3Desc: 'Cliquez sur Tout capturer pour une capture rapide, ou utilisez les boutons individuels',
    helpStep4Title: 'Annotez (optionnel)',
    helpStep4Desc: 'Utilisez le bouton capture pour annoter avec des fl\u00e8ches, cercles et texte',
    helpStep5Title: 'G\u00e9n\u00e9rez et partagez',
    helpStep5Desc: 'Cliquez sur G\u00e9n\u00e9rer le rapport pour t\u00e9l\u00e9charger un fichier. Envoyez-le \u00e0 votre d\u00e9veloppeur ou collez-le dans Claude/ChatGPT',
    helpShortcutsTitle: 'Raccourcis clavier',
    helpShortcutOpen: 'Ouvrir BugJar',
    helpShortcutCapture: 'Capture rapide',
    helpDismiss: 'Compris !',
    // History tab
    tabReport: 'Rapport',
    tabHistory: 'Historique',
    clearHistory: 'Tout effacer',
    historyEmpty: 'Aucun rapport',
    reportCleared: 'Rapport sauvegard\u00e9 ! Champs effac\u00e9s.'
  },
  es: {
    description: 'Descripci\u00f3n',
    descriptionPlaceholder: 'Describe el problema...',
    steps: 'Pasos para reproducir',
    stepsPlaceholder: '1. Ir a...\n2. Hacer clic en...\n3. Ver error...',
    category: 'Categor\u00eda',
    priority: 'Prioridad',
    captures: 'Capturas',
    captureAll: 'Capturar todo (Captura + Consola + Red)',
    screenshot: 'Captura',
    selectElement: 'Elemento',
    console: 'Consola',
    network: 'Red',
    generate: 'Generar informe',
    clear: 'Limpiar',
    ready: 'Listo',
    catBug: 'Bug',
    catFeature: 'Solicitud de funci\u00f3n',
    catQuestion: 'Pregunta',
    catOther: 'Otro',
    priLow: 'Baja',
    priMedium: 'Media',
    priHigh: 'Alta',
    priCritical: 'Cr\u00edtica',
    // Help panel
    helpStep1Title: 'Navega al bug',
    helpStep1Desc: 'Ve a la p\u00e1gina donde ves el problema',
    helpStep2Title: 'Describe el problema',
    helpStep2Desc: 'Escribe lo que pas\u00f3 vs lo que esperabas',
    helpStep3Title: 'Captura evidencia',
    helpStep3Desc: 'Haz clic en Capturar todo para una captura r\u00e1pida, o usa los botones individuales',
    helpStep4Title: 'Anota (opcional)',
    helpStep4Desc: 'Usa el bot\u00f3n de captura para anotar con flechas, c\u00edrculos y texto',
    helpStep5Title: 'Genera y comparte',
    helpStep5Desc: 'Haz clic en Generar informe para descargar un archivo. Env\u00edalo a tu desarrollador o p\u00e9galo en Claude/ChatGPT',
    helpShortcutsTitle: 'Atajos de teclado',
    helpShortcutOpen: 'Abrir BugJar',
    helpShortcutCapture: 'Captura r\u00e1pida',
    helpDismiss: '\u00a1Entendido!',
    // History tab
    tabReport: 'Informe',
    tabHistory: 'Historial',
    clearHistory: 'Borrar todo',
    historyEmpty: 'Sin informes',
    reportCleared: '\u00a1Informe guardado! Campos limpiados.'
  }
};

/**
 * Detect default language from the browser, falling back to 'en'.
 */
function detectLanguage() {
  const lang = (navigator.language || 'en').substring(0, 2).toLowerCase();
  return TRANSLATIONS[lang] ? lang : 'en';
}

/**
 * Get the translation string for a given key in the current language.
 */
function t(key) {
  const lang = window.__bugjarLang || 'en';
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en[key]) || key;
}

/**
 * Apply translations to all elements with data-i18n attributes.
 * Also updates placeholders via data-i18n-placeholder.
 */
function applyTranslations(lang) {
  window.__bugjarLang = lang || window.__bugjarLang || detectLanguage();

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val) el.placeholder = val;
  });

  // Update select options with i18n keys
  document.querySelectorAll('[data-i18n-options]').forEach(select => {
    const mapping = JSON.parse(select.getAttribute('data-i18n-options'));
    Array.from(select.options).forEach(opt => {
      const key = mapping[opt.value];
      if (key) opt.textContent = t(key);
    });
  });

  // Update language selector active state
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === window.__bugjarLang);
  });

  // Persist preference
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({ bugjarLang: window.__bugjarLang });
  }
}
