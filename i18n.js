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
    priCritical: 'Critical'
  },
  fr: {
    description: 'Description',
    descriptionPlaceholder: 'Decrivez le probleme...',
    steps: 'Etapes de reproduction',
    stepsPlaceholder: '1. Aller sur...\n2. Cliquer sur...\n3. Voir l\'erreur...',
    category: 'Categorie',
    priority: 'Priorite',
    captures: 'Captures',
    captureAll: 'Tout capturer (Capture + Console + Reseau)',
    screenshot: 'Capture',
    selectElement: 'Element',
    console: 'Console',
    network: 'Reseau',
    generate: 'Generer le rapport',
    clear: 'Effacer',
    ready: 'Pret',
    catBug: 'Bug',
    catFeature: 'Demande de fonctionnalite',
    catQuestion: 'Question',
    catOther: 'Autre',
    priLow: 'Basse',
    priMedium: 'Moyenne',
    priHigh: 'Haute',
    priCritical: 'Critique'
  },
  es: {
    description: 'Descripcion',
    descriptionPlaceholder: 'Describe el problema...',
    steps: 'Pasos para reproducir',
    stepsPlaceholder: '1. Ir a...\n2. Hacer clic en...\n3. Ver error...',
    category: 'Categoria',
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
    catFeature: 'Solicitud de funcion',
    catQuestion: 'Pregunta',
    catOther: 'Otro',
    priLow: 'Baja',
    priMedium: 'Media',
    priHigh: 'Alta',
    priCritical: 'Critica'
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
