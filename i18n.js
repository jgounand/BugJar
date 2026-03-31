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
    // Steps
    stepsLabel: 'Reproduction Steps',
    addStep: 'Add Step',
    stepN: 'Step',
    captureAllStep: 'All',
    stepDescription: 'Describe this step...',
    // History tab
    tabReport: 'Report',
    tabHistory: 'History',
    clearHistory: 'Clear All',
    historyEmpty: 'No reports yet',
    reportCleared: 'Report saved! Fields cleared.',
    // Settings tab
    tabSettings: 'Settings',
    settingsIntegrations: 'INTEGRATIONS',
    saveSettings: 'Save Settings',
    // Integration guides
    intHowTo: 'How to configure',
    intAzdoStep1: 'Go to https://dev.azure.com/{org}',
    intAzdoStep2: 'Click your avatar (top right) > Personal access tokens',
    intAzdoStep3: 'Click "+ New Token", name it "BugJar"',
    intAzdoStep4: 'Scopes: select only "Work Items: Read & Write"',
    intAzdoStep5: 'Copy the token and paste it above. A Stakeholder (free) account is sufficient.',
    intEmailStep1: 'Enter the email address of the person who should receive bug reports',
    intEmailStep2: 'When you generate a report, your default mail client will open with the report pre-filled',
    intEmailStep3: 'You can customize the subject line (optional)',
    intGithubStep1: 'Go to github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens',
    intGithubStep2: 'Click "Generate new token", select the repository',
    intGithubStep3: 'Permissions: Issues > Read and Write',
    intGithubStep4: 'Copy the token (ghp_...) and paste it above',
    // Profiles
    intProfile: 'Profile',
    intUrlPattern: 'URL Pattern',
    intUrlHint: 'Use * as wildcard. This profile\'s integrations will only activate for matching URLs.',
    intAddProfile: 'New profile name:',
    intProfileMatched: 'Profile matched',
    profileHowTo: 'How profiles work',
    profileDesc: 'Profiles let you route bug reports to different channels per client/project.',
    profileStep1: '<strong>Default</strong> profile catches all URLs. Keep it as a fallback.',
    profileStep2: 'Click <strong>+</strong> to add a profile (e.g. "Client A").',
    profileStep3: 'Set a <strong>URL Pattern</strong> (e.g. <code>*client-a*</code>) — BugJar auto-selects this profile when the page URL matches.',
    profileStep4: 'Configure each profile\'s integrations independently (different Slack channel, Azure DevOps project, etc.).',
    profileStep5: 'The <strong>Bot Token</strong> is the same across profiles — only the <strong>Channel ID</strong> changes per Slack channel.',
    profileMultiClient: '<strong>Multi-client setup:</strong> Create one Slack channel per client (e.g. #bugjar-clientA, #bugjar-clientB), invite the bot to each, then create a BugJar profile per client with the matching Channel ID.',
    profileNaming: '<strong>Naming convention:</strong>',
    profileNamingElement: 'Element',
    profileNamingFormat: 'Format',
    profileNamingExample: 'Example',
    profileTeamSetup: '<strong>Team deployment:</strong> Configure all profiles once, click <em>Export Config</em> (secrets are stripped), share the JSON file with your team. Each colleague imports it and only needs to fill in the <strong>Bot Token</strong> once.',
    // Monitoring indicator
    monitoringActive: 'Monitoring active',
    monitoringInactive: 'Cannot monitor this page',
    // Import / Export config
    exportConfig: 'Export Config',
    importConfig: 'Import Config',
    exportSuccess: 'Config exported (tokens stripped for security)',
    importConfirm: 'Import {0} profiles? Tokens will need to be re-entered.',
    importSuccess: 'Config imported successfully',
    importError: 'Invalid config file'
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
    // Steps
    stepsLabel: '\u00c9tapes de reproduction',
    addStep: 'Ajouter une \u00e9tape',
    stepN: '\u00c9tape',
    captureAllStep: 'Tout',
    stepDescription: 'D\u00e9crivez cette \u00e9tape...',
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
    reportCleared: 'Rapport sauvegard\u00e9 ! Champs effac\u00e9s.',
    // Settings tab
    tabSettings: 'Param\u00e8tres',
    settingsIntegrations: 'INT\u00c9GRATIONS',
    saveSettings: 'Enregistrer',
    intHowTo: 'Comment configurer',
    intAzdoStep1: 'Allez sur https://dev.azure.com/{org}',
    intAzdoStep2: 'Cliquez sur votre avatar (en haut \u00e0 droite) > Personal access tokens',
    intAzdoStep3: 'Cliquez "+ New Token", nommez-le "BugJar"',
    intAzdoStep4: 'Scopes : s\u00e9lectionnez uniquement "Work Items: Read & Write"',
    intAzdoStep5: 'Copiez le token et collez-le ci-dessus. Un compte Stakeholder (gratuit) suffit.',
    intEmailStep1: 'Entrez l\'adresse email de la personne qui recevra les rapports',
    intEmailStep2: 'Quand vous g\u00e9n\u00e9rez un rapport, votre client mail s\'ouvrira avec le rapport pr\u00e9-rempli',
    intEmailStep3: 'Vous pouvez personnaliser le sujet (optionnel)',
    intGithubStep1: 'Allez sur github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens',
    intGithubStep2: 'Cliquez "Generate new token", s\u00e9lectionnez le repository',
    intGithubStep3: 'Permissions : Issues > Read and Write',
    intGithubStep4: 'Copiez le token (ghp_...) et collez-le ci-dessus',
    // Profiles
    intProfile: 'Profil',
    intUrlPattern: 'Pattern URL',
    intUrlHint: 'Utilisez * comme joker. Les int\u00e9grations de ce profil ne s\'activeront que pour les URLs correspondantes.',
    intAddProfile: 'Nom du nouveau profil :',
    intProfileMatched: 'Profil d\u00e9tect\u00e9',
    profileHowTo: 'Comment fonctionnent les profils',
    profileDesc: 'Les profils permettent de router les rapports de bugs vers diff\u00e9rents canaux par client/projet.',
    profileStep1: '<strong>Default</strong> capture toutes les URLs. Gardez-le comme profil par d\u00e9faut.',
    profileStep2: 'Cliquez sur <strong>+</strong> pour ajouter un profil (ex: "Client A").',
    profileStep3: 'D\u00e9finissez un <strong>Pattern URL</strong> (ex: <code>*client-a*</code>) \u2014 BugJar s\u00e9lectionne automatiquement ce profil quand l\'URL de la page correspond.',
    profileStep4: 'Configurez les int\u00e9grations de chaque profil ind\u00e9pendamment (canal Slack diff\u00e9rent, projet Azure DevOps diff\u00e9rent, etc.).',
    profileStep5: 'Le <strong>Bot Token</strong> est le m\u00eame pour tous les profils \u2014 seul le <strong>Channel ID</strong> change par canal Slack.',
    profileMultiClient: '<strong>Multi-clients :</strong> Cr\u00e9ez un canal Slack par client (ex: #bugjar-clientA, #bugjar-clientB), invitez le bot dans chacun, puis cr\u00e9ez un profil BugJar par client avec le Channel ID correspondant.',
    profileNaming: '<strong>Convention de nommage :</strong>',
    profileNamingElement: '\u00c9l\u00e9ment',
    profileNamingFormat: 'Format',
    profileNamingExample: 'Exemple',
    profileTeamSetup: '<strong>D\u00e9ploiement \u00e9quipe :</strong> Configurez tous les profils une fois, cliquez sur <em>Exporter Config</em> (les secrets sont masqu\u00e9s), partagez le JSON avec votre \u00e9quipe. Chaque coll\u00e8gue l\'importe et n\'a qu\'\u00e0 remplir le <strong>Bot Token</strong> une seule fois.',
    // Monitoring indicator
    monitoringActive: 'Surveillance active',
    monitoringInactive: 'Impossible de surveiller cette page',
    // Import / Export config
    exportConfig: 'Exporter la config',
    importConfig: 'Importer une config',
    exportSuccess: 'Config export\u00e9e (tokens retir\u00e9s)',
    importConfirm: 'Importer {0} profils ? Les tokens devront \u00eatre re-saisis.',
    importSuccess: 'Config import\u00e9e avec succ\u00e8s',
    importError: 'Fichier de config invalide'
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
    // Steps
    stepsLabel: 'Pasos de reproducci\u00f3n',
    addStep: 'Agregar paso',
    stepN: 'Paso',
    captureAllStep: 'Todo',
    stepDescription: 'Describe este paso...',
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
    reportCleared: '\u00a1Informe guardado! Campos limpiados.',
    // Settings tab
    tabSettings: 'Ajustes',
    settingsIntegrations: 'INTEGRACIONES',
    saveSettings: 'Guardar',
    intHowTo: 'C\u00f3mo configurar',
    intAzdoStep1: 'Vaya a https://dev.azure.com/{org}',
    intAzdoStep2: 'Haga clic en su avatar (arriba a la derecha) > Personal access tokens',
    intAzdoStep3: 'Haga clic en "+ New Token", n\u00f3mbrelo "BugJar"',
    intAzdoStep4: 'Scopes: seleccione solo "Work Items: Read & Write"',
    intAzdoStep5: 'Copie el token y p\u00e9guelo arriba. Una cuenta Stakeholder (gratuita) es suficiente.',
    intEmailStep1: 'Ingrese la direcci\u00f3n de email de la persona que recibir\u00e1 los reportes',
    intEmailStep2: 'Al generar un reporte, su cliente de correo se abrir\u00e1 con el reporte pre-rellenado',
    intEmailStep3: 'Puede personalizar el asunto (opcional)',
    intGithubStep1: 'Vaya a github.com > Settings > Developer settings > Personal access tokens > Fine-grained tokens',
    intGithubStep2: 'Haga clic en "Generate new token", seleccione el repositorio',
    intGithubStep3: 'Permisos: Issues > Read and Write',
    intGithubStep4: 'Copie el token (ghp_...) y p\u00e9guelo arriba',
    // Profiles
    intProfile: 'Perfil',
    intUrlPattern: 'Patr\u00f3n URL',
    intUrlHint: 'Use * como comod\u00edn. Las integraciones de este perfil solo se activar\u00e1n para URLs coincidentes.',
    intAddProfile: 'Nombre del nuevo perfil:',
    intProfileMatched: 'Perfil detectado',
    profileHowTo: 'C\u00f3mo funcionan los perfiles',
    profileDesc: 'Los perfiles permiten enrutar los reportes de bugs a diferentes canales por cliente/proyecto.',
    profileStep1: '<strong>Default</strong> captura todas las URLs. Mant\u00e9ngalo como perfil predeterminado.',
    profileStep2: 'Haga clic en <strong>+</strong> para agregar un perfil (ej: "Cliente A").',
    profileStep3: 'Defina un <strong>Patr\u00f3n URL</strong> (ej: <code>*cliente-a*</code>) \u2014 BugJar selecciona autom\u00e1ticamente este perfil cuando la URL de la p\u00e1gina coincide.',
    profileStep4: 'Configure las integraciones de cada perfil independientemente (canal Slack diferente, proyecto Azure DevOps diferente, etc.).',
    profileStep5: 'El <strong>Bot Token</strong> es el mismo para todos los perfiles \u2014 solo el <strong>Channel ID</strong> cambia por canal Slack.',
    profileMultiClient: '<strong>Multi-clientes:</strong> Cree un canal Slack por cliente (ej: #bugjar-clienteA, #bugjar-clienteB), invite al bot a cada uno, luego cree un perfil BugJar por cliente con el Channel ID correspondiente.',
    profileNaming: '<strong>Convenci\u00f3n de nombres:</strong>',
    profileNamingElement: 'Elemento',
    profileNamingFormat: 'Formato',
    profileNamingExample: 'Ejemplo',
    profileTeamSetup: '<strong>Despliegue en equipo:</strong> Configure todos los perfiles una vez, haga clic en <em>Exportar Config</em> (los secretos se eliminan), comparta el JSON con su equipo. Cada colega lo importa y solo necesita completar el <strong>Bot Token</strong> una vez.',
    // Monitoring indicator
    monitoringActive: 'Monitoreo activo',
    monitoringInactive: 'No se puede monitorear esta p\u00e1gina',
    // Import / Export config
    exportConfig: 'Exportar config',
    importConfig: 'Importar config',
    exportSuccess: 'Config exportada (tokens eliminados)',
    importConfirm: 'Importar {0} perfiles? Los tokens deber\u00e1n reingresarse.',
    importSuccess: 'Config importada con \u00e9xito',
    importError: 'Archivo de config inv\u00e1lido'
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
