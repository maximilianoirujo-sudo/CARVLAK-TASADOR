/**
 * ==============================================================================
 * CARVLAK - TASADOR RÁPIDO DE VEHÍCULOS (VERCEL EDITION)
 * Arquitectura desacoplada, alta velocidad para iPhone y Computadora
 * ==============================================================================
 * Desarrollado para Jonathan Kaitazoff, Maximiliano Irujo, Marcos Martínez y Bruno Di Giovanni.
 */

// ================= CONFIGURACIÓN & ESTADO GLOBAL =================
const OPERATORS = [
  "Jonathan Kaitazoff",
  "Maximiliano Irujo",
  "Marcos Martínez",
  "Bruno Di Giovanni"
];

let appConfig = {
  activeOperator: localStorage.getItem('carvlak_active_operator') || "Jonathan Kaitazoff",
  webhookUrl: localStorage.getItem('carvlak_webhook_url') || "",
  sheetId: "1pomsp0u3fEhCz1syDz9HtOT5VrneOZT2JYBDgK2qv-I"
};

let allLeads = [];
let filteredLeads = [];
let activeFilter = 'pendientes'; // Por defecto: liquidar los pendientes
let currentSort = 'newest_first'; // Hoy primero por orden de ingreso
let pageSize = 30;
let currentlyRendered = 0;
let activeModalLead = null;

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  checkIosEnvironment();
});

function initApp() {
  // Configurar selector de operador
  const opSelect = document.getElementById("operatorSelect");
  if (opSelect) {
    opSelect.value = appConfig.activeOperator;
  }

  // Cargar base de datos pre-cargada
  if (typeof INITIAL_LEADS !== 'undefined' && Array.isArray(INITIAL_LEADS)) {
    allLeads = JSON.parse(JSON.stringify(INITIAL_LEADS));
  } else {
    allLeads = [];
  }

  // Aplicar tasaciones guardadas localmente en el navegador
  applyLocalStorageOverrides();

  // Si hay webhook configurado, intentar sincronizar en segundo plano
  if (appConfig.webhookUrl) {
    syncWithGoogleSheetWebhook(false);
  }

  // Ordenar y renderizar
  sortAndFilter();
}

function checkIosEnvironment() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
  
  if (isIos && !isStandalone) {
    const banner = document.getElementById("iosInstallBanner");
    if (banner && !localStorage.getItem('carvlak_ios_banner_dismissed')) {
      banner.classList.remove("hidden");
    }
  }
}

function dismissIosBanner() {
  document.getElementById("iosInstallBanner").classList.add("hidden");
  localStorage.setItem('carvlak_ios_banner_dismissed', 'true');
}

// ================= GESTIÓN DE OPERADORES Y FIRMA =================
function changeOperator(newOperator) {
  if (OPERATORS.includes(newOperator)) {
    appConfig.activeOperator = newOperator;
    localStorage.setItem('carvlak_active_operator', newOperator);
    showToast("✓ Operador Activo", `Firmando como: ${newOperator}`);
    
    // Si el modal de WhatsApp está abierto, actualizar vista previa
    if (activeModalLead) {
      document.getElementById("modalOperatorBadge").innerText = newOperator;
      updatePreviewMessage();
    }
  }
}

// ================= OVERRIDES LOCALES (PERSISTENCIA OFFLINE) =================
function applyLocalStorageOverrides() {
  try {
    const saved = localStorage.getItem('carvlak_saved_tasaciones');
    if (saved) {
      const overrides = JSON.parse(saved);
      allLeads.forEach(lead => {
        if (overrides[lead.row]) {
          lead.tasacion = overrides[lead.row].tasacion;
          lead.estado = overrides[lead.row].estado || lead.estado;
          lead.isPending = (lead.tasacion === 0);
        }
      });
    }
  } catch (e) {
    console.warn("Error leyendo localStorage:", e);
  }
}

function saveOverrideLocal(rowNum, tasacion, estado) {
  try {
    let saved = {};
    const existing = localStorage.getItem('carvlak_saved_tasaciones');
    if (existing) saved = JSON.parse(existing);
    
    saved[rowNum] = {
      tasacion: tasacion,
      estado: estado,
      operator: appConfig.activeOperator,
      timestamp: new Date().toISOString()
    };

    localStorage.setItem('carvlak_saved_tasaciones', JSON.stringify(saved));
  } catch (e) {
    console.warn("Error guardando en localStorage:", e);
  }
}

// ================= ORDENAMIENTO (HOY PRIMERO) Y FILTRADO =================
function changeSortOrder(val) {
  currentSort = val;
  sortAndFilter();
}

function sortAndFilter() {
  allLeads.sort((a, b) => {
    if (currentSort === 'newest_first') {
      const dateA = parseFloat(a.rawDate) || a.row || 0;
      const dateB = parseFloat(b.rawDate) || b.row || 0;
      return dateB - dateA;
    } else if (currentSort === 'oldest_first') {
      const dateA = parseFloat(a.rawDate) || a.row || 0;
      const dateB = parseFloat(b.rawDate) || b.row || 0;
      return dateA - dateB;
    } else if (currentSort === 'km_lowest') {
      const kmA = parseInt(a.km, 10) || 999999;
      const kmB = parseInt(b.km, 10) || 999999;
      return kmA - kmB;
    } else if (currentSort === 'year_newest') {
      const yA = parseInt(a.ano, 10) || 0;
      const yB = parseInt(b.ano, 10) || 0;
      return yB - yA;
    }
    return 0;
  });

  updateGlobalCounters();
  applyFilters();
}

function updateGlobalCounters() {
  let countPendientes = 0;
  let countTasados = 0;
  let countFotos = 0;
  let countDescartar = 0;

  allLeads.forEach(l => {
    const isDesc = (l.papeles && (l.papeles.includes('No esta a mi nombre') || l.papeles.includes('No conozco al titular')));
    const isFoto = (l.estado && (l.estado.includes('FOTO') || l.estado.includes('fotos')));
    const isTas = (l.tasacion && l.tasacion > 0);

    if (isDesc) countDescartar++;
    else if (isFoto) countFotos++;
    else if (isTas) countTasados++;
    else countPendientes++;
  });

  document.getElementById("counterPendientes").innerText = countPendientes;
  document.getElementById("counterTasados").innerText = countTasados;
  document.getElementById("counterFotos").innerText = countFotos;
  document.getElementById("counterDescartados").innerText = countDescartar;
  document.getElementById("counterTotal").innerText = allLeads.length;

  document.getElementById("tabCountPendientes").innerText = countPendientes;
  document.getElementById("tabCountTasados").innerText = countTasados;
  document.getElementById("tabCountFotos").innerText = countFotos;
  document.getElementById("tabCountDescartar").innerText = countDescartar;
  document.getElementById("tabCountTodos").innerText = allLeads.length;
}

function setFilter(filterType) {
  activeFilter = filterType;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('bg-[#2D3E46]', 'text-white', 'border-[#2D3E46]');
    btn.classList.add('bg-slate-50', 'text-slate-700', 'border-slate-200');
  });
  const activeBtn = document.getElementById(`filter-${filterType}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-slate-50', 'text-slate-700', 'border-slate-200');
    activeBtn.classList.add('bg-[#2D3E46]', 'text-white', 'border-[#2D3E46]');
  }
  applyFilters();
}

function applyFilters() {
  const q = (document.getElementById("searchInput").value || "").toLowerCase().trim();

  filteredLeads = allLeads.filter(l => {
    const isDesc = (l.papeles && (l.papeles.includes('No esta a mi nombre') || l.papeles.includes('No conozco al titular')));
    const isFoto = (l.estado && (l.estado.includes('FOTO') || l.estado.includes('fotos')));
    const isTas = (l.tasacion && l.tasacion > 0);
    const isPend = !isDesc && !isTas;

    if (activeFilter === 'pendientes' && !isPend) return false;
    if (activeFilter === 'tasados' && !isTas) return false;
    if (activeFilter === 'fotos' && !isFoto) return false;
    if (activeFilter === 'descartar' && !isDesc) return false;

    if (q) {
      const hayMatch = `${l.nombre || ''} ${l.whatsapp || ''} ${l.marca || ''} ${l.modelo || ''} ${l.ano || ''} ${l.comentario || ''} ${l.estado || ''}`.toLowerCase();
      return hayMatch.includes(q);
    }
    return true;
  });

  currentlyRendered = 0;
  document.getElementById("leadsContainer").innerHTML = "";
  renderNextBatch();
}

function renderNextBatch() {
  const container = document.getElementById("leadsContainer");
  const emptyState = document.getElementById("emptyState");
  const loadMoreContainer = document.getElementById("loadMoreContainer");

  if (filteredLeads.length === 0) {
    emptyState.classList.remove("hidden");
    loadMoreContainer.classList.add("hidden");
    document.getElementById("displayedCount").innerText = "0";
    document.getElementById("totalFilteredCount").innerText = "0";
    return;
  }

  emptyState.classList.add("hidden");

  const nextBatch = filteredLeads.slice(currentlyRendered, currentlyRendered + pageSize);
  const htmlChunk = nextBatch.map(lead => createLeadCardHtml(lead)).join('');
  container.insertAdjacentHTML('beforeend', htmlChunk);

  currentlyRendered += nextBatch.length;

  document.getElementById("displayedCount").innerText = currentlyRendered;
  document.getElementById("totalFilteredCount").innerText = filteredLeads.length;

  const remaining = filteredLeads.length - currentlyRendered;
  if (remaining > 0) {
    document.getElementById("remainingCount").innerText = remaining;
    loadMoreContainer.classList.remove("hidden");
  } else {
    loadMoreContainer.classList.add("hidden");
  }
}

function loadMoreLeads() {
  renderNextBatch();
}

// ================= GENERACIÓN DE TARJETA DE VEHÍCULO =================
function createLeadCardHtml(lead) {
  const isDesc = (lead.papeles && (lead.papeles.includes('No esta a mi nombre') || lead.papeles.includes('No conozco al titular')));
  const isLibreta = (lead.papeles && lead.papeles.includes('Libreta a mi nombre'));

  let papelesBadge = '';
  if (isDesc) {
    papelesBadge = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">🚫 Sin Títulos</span>`;
  } else if (isLibreta) {
    papelesBadge = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">⚠️ Libreta</span>`;
  } else {
    papelesBadge = `<span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">✓ Títulos</span>`;
  }

  const tagsArray = Array.isArray(lead.tags) ? lead.tags : (lead.tags ? [lead.tags] : []);
  let tagsHtml = '';
  if (tagsArray.length > 0) {
    tagsHtml = tagsArray.map(t => {
      let colorCls = 'bg-slate-100 text-slate-700 border-slate-200';
      if (t.type === 'positive') colorCls = 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold';
      if (t.type === 'negative') colorCls = 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      if (t.type === 'danger') colorCls = 'bg-rose-100 text-rose-800 border-rose-300 font-black';

      return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border ${colorCls} badge-tag">
                ${escapeHtml(t.label)}
                ${t.impact ? `<span class="text-[9px] opacity-75">(${t.impact > 0 ? '+' : ''}$${t.impact})</span>` : ''}
              </span>`;
    }).join(' ');
  } else {
    tagsHtml = `<span class="text-[11px] text-slate-400 italic">Sin tags detectados</span>`;
  }

  const kmDisplay = lead.km ? `${Number(lead.km).toLocaleString('es-UY')} km` : 'S/D';
  const tasacionVal = lead.tasacion && lead.tasacion > 0 ? lead.tasacion : '';
  const estadoVal = lead.estado || '';

  const currentYear = new Date().getFullYear();
  const carYear = parseInt(lead.ano, 10) || currentYear;
  const age = Math.max(0, currentYear - carYear);

  return `
    <div id="lead-card-${lead.row}" class="lead-card bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4">
      
      <!-- Encabezado Móvil y Desktop -->
      <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
        <div class="flex items-center space-x-2.5">
          <div class="w-9 h-9 rounded-xl bg-[#EFF2EE] text-[#2D3E46] border border-[#DFE5DD] flex items-center justify-center font-bold font-serif text-base shrink-0">
            ${(lead.nombre || 'C').charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="flex items-center space-x-1.5 flex-wrap">
              <h2 class="text-sm sm:text-base font-bold font-serif text-[#1E2B31]">${escapeHtml(lead.nombre || 'Cliente')}</h2>
              <span class="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border border-slate-200">
                #${lead.row}
              </span>
              ${estadoVal ? `<span class="text-[9px] bg-blue-100 text-blue-800 font-black px-1.5 py-0.5 rounded border border-blue-200 uppercase">${escapeHtml(estadoVal)}</span>` : ''}
            </div>
            <p class="text-[10px] text-slate-500">${lead.fecha || 'Reciente'}</p>
          </div>
        </div>

        <!-- Botón WhatsApp Directo en Cabezal -->
        <button 
          onclick="openWhatsAppModal(${lead.row}, 'oferta')" 
          class="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors touch-target shrink-0"
        >
          <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
          <span>WSP</span>
        </button>
      </div>

      <!-- Datos Principales del Vehículo -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        
        <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
          <p class="text-[9px] uppercase font-bold tracking-wider text-slate-500">Vehículo</p>
          <p class="text-xs sm:text-sm font-black text-[#1E2B31] truncate">${escapeHtml(lead.marca)} ${escapeHtml(lead.modelo)}</p>
          <p class="text-[10px] text-slate-500">Modelo declarado</p>
        </div>

        <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between">
          <div>
            <p class="text-[9px] uppercase font-bold tracking-wider text-slate-500">Año</p>
            <p class="text-sm sm:text-base font-black font-serif text-[#1E2B31]">${escapeHtml(lead.ano || 'S/D')}</p>
          </div>
          <span class="px-1.5 py-0.5 bg-[#EFF2EE] text-[#2D3E46] border border-[#DFE5DD] rounded text-[10px] font-bold">
            ${age}a
          </span>
        </div>

        <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
          <p class="text-[9px] uppercase font-bold tracking-wider text-slate-500">Kilometraje</p>
          <p class="text-xs sm:text-sm font-black text-[#2D3E46]">${kmDisplay}</p>
        </div>

        <div class="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex flex-col justify-center">
          <p class="text-[9px] uppercase font-bold tracking-wider text-slate-500 mb-0.5">Papeles</p>
          <div>${papelesBadge}</div>
        </div>

      </div>

      <!-- Comentario del Cliente (Columna J) -->
      <div class="bg-[#F8FAFC] border border-slate-200 p-3 rounded-xl space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-[#1E2B31] text-[11px] uppercase tracking-wider flex items-center gap-1">
            💬 Detalles del Auto (Columna J):
          </span>
          <button onclick="openWhatsAppModal(${lead.row}, 'fotos')" class="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline">
            📸 Pedir fotos si faltan
          </button>
        </div>

        <div class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
          <p class="text-xs text-slate-800 leading-relaxed font-medium">
            ${lead.comentario ? `"${escapeHtml(lead.comentario)}"` : `<span class="text-slate-400 italic">Sin comentarios cargados</span>`}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-1 pt-0.5">
          ${tagsHtml}
        </div>
      </div>

      <!-- Caja de Tasación Rápida -->
      <div class="bg-[#EFF2EE] border border-[#DFE5DD] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        
        <div class="flex items-center gap-2">
          <div class="relative rounded-xl shadow-sm flex-1 sm:flex-none">
            <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-black text-slate-600">$</span>
            <input 
              type="number" 
              id="tasacionInput-${lead.row}" 
              value="${tasacionVal}" 
              placeholder="Monto USD" 
              class="w-full sm:w-36 pl-7 pr-2 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-[#1E2B31] focus:ring-2 focus:ring-[#2D3E46] focus:outline-none"
            >
          </div>

          <div class="flex items-center gap-1">
            <button onclick="quickAdjustTasacion(${lead.row}, -500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">-500</button>
            <button onclick="quickAdjustTasacion(${lead.row}, 500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+500</button>
            <button onclick="quickAdjustTasacion(${lead.row}, 1000)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+1k</button>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button 
            onclick="saveLeadTasacion(${lead.row}, false)" 
            class="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-[#2D3E46] text-[#2D3E46] hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-sm touch-target text-center"
          >
            💾 Guardar
          </button>
          
          <button 
            onclick="saveLeadTasacion(${lead.row}, true)" 
            class="flex-2 sm:flex-none px-4 py-2.5 bg-[#C0392B] hover:bg-[#A93226] text-white rounded-xl text-xs font-black transition-all shadow hover:shadow-md flex items-center justify-center gap-1.5 touch-target text-center"
          >
            <span>🚀 Tasar y WhatsApp</span>
          </button>
        </div>

      </div>

    </div>
  `;
}

// ================= ACCIONES DE TASACIÓN =================
function quickAdjustTasacion(rowNum, amount) {
  const input = document.getElementById(`tasacionInput-${rowNum}`);
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, val + amount);
  input.value = val;
}

function saveLeadTasacion(rowNum, openWspAfter) {
  const input = document.getElementById(`tasacionInput-${rowNum}`);
  const val = parseFloat(input.value) || 0;
  if (val <= 0) {
    showToast("⚠️ Atención", "Ingresá un valor mayor a 0 para tasar el auto.");
    input.focus();
    return;
  }

  const lead = allLeads.find(l => l.row === rowNum);
  if (lead) {
    lead.tasacion = val;
    lead.estado = 'TASADO';
    lead.isPending = false;
  }

  // 1. Guardar en caché local
  saveOverrideLocal(rowNum, val, 'TASADO');

  // 2. Si hay Webhook conectado a Google Sheets, sincronizar en vivo
  if (appConfig.webhookUrl) {
    postTasacionToWebhook(rowNum, val, 'TASADO');
  }

  showToast("✓ Tasación Guardada", `USD ${val.toLocaleString('es-UY')} registrada por ${appConfig.activeOperator}`);
  updateGlobalCounters();

  if (openWspAfter) {
    openWhatsAppModal(rowNum, 'oferta');
  }
}

// ================= MOTOR DE MENSAJES DE WHATSAPP CON OPERADOR =================
let currentTemplateKey = 'oferta';

function openWhatsAppModal(rowNum, templateKey) {
  const lead = allLeads.find(l => l.row === rowNum);
  if (!lead) return;

  activeModalLead = lead;
  currentTemplateKey = templateKey || 'oferta';

  const modal = document.getElementById("whatsappModal");
  const clientTitle = document.getElementById("modalClientTitle");
  const clientSub = document.getElementById("modalClientSub");
  const targetPhone = document.getElementById("modalTargetPhone");
  const operatorBadge = document.getElementById("modalOperatorBadge");

  clientTitle.innerText = `WhatsApp para ${lead.nombre || 'Cliente'}`;
  clientSub.innerText = `${lead.marca || ''} ${lead.modelo || ''} (${lead.ano || ''})`;
  targetPhone.innerText = lead.whatsapp || 'Sin número';
  if (operatorBadge) operatorBadge.innerText = appConfig.activeOperator;

  selectTemplate(currentTemplateKey);
  modal.classList.remove("hidden");
}

function closeWhatsAppModal() {
  document.getElementById("whatsappModal").classList.add("hidden");
  activeModalLead = null;
}

function selectTemplate(templateKey) {
  currentTemplateKey = templateKey;
  if (!activeModalLead) return;

  ['oferta', 'fotos', 'visita', 'descarte'].forEach(k => {
    const btn = document.getElementById(`tplBtn-${k}`);
    if (btn) {
      if (k === templateKey) {
        btn.className = "px-2.5 py-2 rounded-xl border bg-[#2D3E46] text-white border-[#2D3E46] transition-all";
      } else {
        btn.className = "px-2.5 py-2 rounded-xl border bg-white text-slate-700 border-slate-300 hover:bg-slate-100 transition-all";
      }
    }
  });

  updatePreviewMessage();
}

function updatePreviewMessage() {
  if (!activeModalLead) return;
  const lead = activeModalLead;
  const operator = appConfig.activeOperator;

  const currentTasacion = lead.tasacion || (document.getElementById(`tasacionInput-${lead.row}`) ? parseFloat(document.getElementById(`tasacionInput-${lead.row}`).value) : 0) || 0;
  const formattedMonto = currentTasacion > 0 ? Number(currentTasacion).toLocaleString('es-UY') : '0';

  const tagsArray = Array.isArray(lead.tags) ? lead.tags : (lead.tags ? [lead.tags] : []);
  const tagsLabels = tagsArray.filter(t => t.type !== 'neutral').map(t => t.label.toLowerCase()).join(', ');

  let text = "";

  if (currentTemplateKey === 'oferta') {
    let detalleMention = "";
    if (tagsLabels) {
      detalleMention = `Tomando en cuenta los detalles que nos comentaste (${tagsLabels}), `;
    } else if (lead.comentario && lead.comentario.length > 5 && !lead.comentario.toLowerCase().includes('foto')) {
      detalleMention = `Revisando lo que nos comentaste de la unidad, `;
    }

    text = `¡Hola ${lead.nombre || ''}! Te saluda ${operator} de CARVLAK.\n\nEstuvimos revisando la información de tu ${lead.marca || 'auto'} ${lead.modelo || ''} año ${lead.ano || ''} (${lead.km ? lead.km + ' km' : ''}).\n\n${detalleMention}te podemos pasar una tasación estimada de USD $${formattedMonto} al contado en mano.\n\n¿Te sirve la propuesta para coordinar y que te des una vuelta por el local a revisarlo y cerrar en el día? ¡Quedo a las órdenes!\n\n¡Saludos cordiales!\n${operator} • CARVLAK`;
  } else if (currentTemplateKey === 'fotos') {
    text = `¡Hola ${lead.nombre || ''}! Te saluda ${operator} de CARVLAK por tu ${lead.marca || 'auto'} ${lead.modelo || ''} año ${lead.ano || ''}.\n\n¿Me podrás mandar unas fotitos del exterior y del interior por acá? Así le pego una mirada y te paso el valor exacto de tasación hoy mismo. ¡Muchas gracias!\n\n${operator} • CARVLAK`;
  } else if (currentTemplateKey === 'visita') {
    text = `¡Hola ${lead.nombre || ''}! ${operator} de CARVLAK nuevamente.\n\n¿Cómo te queda para pasar por nuestro local con el ${lead.modelo || 'auto'} para revisarlo juntos y ya dejar liquidada la compra? Saludos cordiales.\n\n${operator} • CARVLAK`;
  } else if (currentTemplateKey === 'descarte') {
    text = `Hola ${lead.nombre || ''}, muchas gracias por consultar en CARVLAK por tu ${lead.marca || ''} ${lead.modelo || ''}.\n\nLamentablemente por el momento solo estamos comprando vehículos que tengan los títulos o libreta a nombre del titular directo para transferir en el momento. ¡Cualquier otra consulta quedamos a las órdenes!\n\n${operator} • CARVLAK`;
  }

  const textarea = document.getElementById("modalMessageText");
  textarea.value = text;
  updateModalWspLink();
}

function updateModalWspLink() {
  if (!activeModalLead) return;
  const cleanPhone = sanitizePhone(activeModalLead.whatsapp || "");
  const text = document.getElementById("modalMessageText").value;
  const link = document.getElementById("modalOpenWspLink");
  link.href = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
}

document.getElementById("modalMessageText").addEventListener('input', updateModalWspLink);

function copyModalMessage() {
  const textarea = document.getElementById("modalMessageText");
  textarea.select();
  navigator.clipboard.writeText(textarea.value).then(() => {
    showToast("✓ Copiado", "Mensaje copiado al portapapeles");
  });
}

function onWspOpened() {
  showToast("✓ WhatsApp Abierto", `Mensaje enviado firmado por ${appConfig.activeOperator}`);
  setTimeout(() => {
    closeWhatsAppModal();
  }, 600);
}

// ================= MODAL IPHONE & QR =================
function openIPhoneModal() {
  const modal = document.getElementById("iphoneModal");
  const urlInput = document.getElementById("appUrlInput");
  const qrImg = document.getElementById("qrCodeImg");
  
  const targetUrl = window.location.href;
  urlInput.value = targetUrl;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(targetUrl)}`;
  
  modal.classList.remove("hidden");
}

function closeIPhoneModal() {
  document.getElementById("iphoneModal").classList.add("hidden");
}

function copyAppUrl() {
  const input = document.getElementById("appUrlInput");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    showToast("✓ Enlace Copiado", "Pegalo en Safari de tu iPhone");
  });
}

// ================= MODAL DE SINCRONIZACIÓN GOOGLE SHEETS =================
function openSyncModal() {
  const modal = document.getElementById("syncModal");
  const input = document.getElementById("settingWebhookUrl");
  input.value = appConfig.webhookUrl || "";
  modal.classList.remove("hidden");
}

function closeSyncModal() {
  document.getElementById("syncModal").classList.add("hidden");
}

function saveSyncSettings() {
  const input = document.getElementById("settingWebhookUrl");
  const url = input.value.trim();
  appConfig.webhookUrl = url;
  localStorage.setItem('carvlak_webhook_url', url);
  closeSyncModal();
  showToast("✓ Configuración Guardada", "Conexión a Google Sheets actualizada");
  if (url) {
    syncWithGoogleSheetWebhook(true);
  }
}

function refreshData() {
  const icon = document.getElementById("refreshIcon");
  if (icon) icon.classList.add("animate-spin");
  
  if (appConfig.webhookUrl) {
    syncWithGoogleSheetWebhook(true, () => {
      if (icon) icon.classList.remove("animate-spin");
    });
  } else {
    setTimeout(() => {
      sortAndFilter();
      if (icon) icon.classList.remove("animate-spin");
      showToast("✓ Actualizado", "Lista de vehículos ordenada");
    }, 300);
  }
}

function syncWithGoogleSheetWebhook(showNotification = false, callback = null) {
  if (!appConfig.webhookUrl) {
    if (callback) callback();
    return;
  }

  fetch(appConfig.webhookUrl + "?action=getLeads")
    .then(res => res.json())
    .then(data => {
      if (data && data.leads && data.leads.length > 0) {
        allLeads = data.leads;
        applyLocalStorageOverrides();
        sortAndFilter();
        if (showNotification) {
          showToast("✓ Sincronizado", `${allLeads.length} respuestas recibidas en vivo de Google Sheets`);
        }
      }
      if (callback) callback();
    })
    .catch(err => {
      console.warn("Error en sincronización webhook:", err);
      if (showNotification) {
        showToast("⚠️ Modo Offline", "Usando datos locales cargados");
      }
      if (callback) callback();
    });
}

function postTasacionToWebhook(rowNum, tasacion, estado) {
  if (!appConfig.webhookUrl) return;

  const payload = {
    action: "saveTasacion",
    rowIndex: rowNum,
    tasacion: tasacion,
    estado: estado,
    operator: appConfig.activeOperator
  };

  fetch(appConfig.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: JSON.stringify(payload)
  })
  .then(res => res.json())
  .then(res => {
    console.log("Guardado en Google Sheets con éxito:", res);
  })
  .catch(err => {
    console.warn("Aviso: guardado localmente, pendiente sincronizar en Google Sheets:", err);
  });
}

// ================= UTILIDADES =================
function sanitizePhone(phoneRaw) {
  if (!phoneRaw) return "";
  let digits = phoneRaw.replace(/\D/g, "");
  if (digits.startsWith("09") && digits.length === 9) {
    digits = "598" + digits.substring(1);
  } else if (digits.startsWith("9") && digits.length === 8) {
    digits = "598" + digits;
  }
  return digits;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(title, msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toastTitle").innerText = title;
  document.getElementById("toastMessage").innerText = msg;
  toast.classList.remove("translate-y-20", "opacity-0");
  setTimeout(() => {
    toast.classList.add("translate-y-20", "opacity-0");
  }, 3500);
}
