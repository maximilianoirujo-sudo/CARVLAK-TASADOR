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
  sheetId: "1pomsp0u3fEhCz1syDz9HtOT5VrneOZT2JYBDgK2qv-I",
  gid: "782368790"
};

let allLeads = [];
let filteredLeads = [];
let activeFilter = 'todos'; // 'todos' (orden de llegada), 'pendientes', 'tasados', 'fotos', 'descartar'
let activeCampaign = 'all';
let currentSort = 'newest_first';  // Hoy primero por orden de ingreso estricto
let pageSize = 30;
let currentlyRendered = 0;
let activeModalLead = null;

// Lightbox state
let activeLightboxLead = null;
let activeLightboxIndex = 0;

// Attach photo modal state
let activeAttachLead = null;

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  checkIosEnvironment();
  initLightboxListeners();
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

  // Aplicar tasaciones y fotos adjuntadas guardadas en localStorage
  applyLocalStorageOverrides();

  // Ordenar y renderizar (Hoy primero / Orden de llegada)
  sortAndFilter();

  // Sincronización en vivo silenciosa al abrir
  setTimeout(() => {
    triggerLiveSync(true);
  }, 1000);

  // Sincronización automática al volver a la app o cambiar de pestaña
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      triggerLiveSync(true);
    }
  });

  // Sincronización periódica cada 3 minutos en segundo plano
  setInterval(() => {
    if (!document.hidden) {
      triggerLiveSync(true);
    }
  }, 180000);
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
  const b = document.getElementById("iosInstallBanner");
  if (b) b.classList.add("hidden");
  localStorage.setItem('carvlak_ios_banner_dismissed', 'true');
}

// ================= GESTIÓN DE OPERADORES Y FIRMA =================
function changeOperator(newOperator) {
  if (OPERATORS.includes(newOperator)) {
    appConfig.activeOperator = newOperator;
    localStorage.setItem('carvlak_active_operator', newOperator);
    showToast("✓ Operador Activo", `Firmando como: ${newOperator}`);
    
    if (activeModalLead) {
      const b = document.getElementById("modalOperatorBadge");
      if (b) b.innerText = newOperator;
      updatePreviewMessage();
    }
  }
}

// ================= OVERRIDES LOCALES (PERSISTENCIA OFFLINE) =================
function applyLocalStorageOverrides() {
  try {
    // Tasaciones guardadas
    const saved = localStorage.getItem('carvlak_saved_tasaciones');
    if (saved) {
      const overrides = JSON.parse(saved);
      allLeads.forEach(lead => {
        const key = lead.id || lead.row;
        if (overrides[key]) {
          lead.tasacion = overrides[key].tasacion;
          lead.estado = overrides[key].estado || lead.estado;
          lead.isPending = (lead.tasacion === 0);
        }
      });
    }

    // Fotos añadidas manualmente
    const savedPhotos = localStorage.getItem('carvlak_attached_photos');
    if (savedPhotos) {
      const photoOverrides = JSON.parse(savedPhotos);
      allLeads.forEach(lead => {
        const key = lead.id || lead.row;
        if (photoOverrides[key] && Array.isArray(photoOverrides[key])) {
          lead.photos = photoOverrides[key].concat(lead.photos || []);
        }
      });
    }
  } catch (e) {
    console.warn("Error leyendo localStorage:", e);
  }
}

function saveOverrideLocal(leadKey, tasacion, estado) {
  try {
    let saved = {};
    const existing = localStorage.getItem('carvlak_saved_tasaciones');
    if (existing) saved = JSON.parse(existing);
    
    saved[leadKey] = {
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

// ================= ORDENAMIENTO (ORDEN DE LLEGADA / HOY PRIMERO) Y FILTRADO =================
function changeSortOrder(val) {
  currentSort = val;
  sortAndFilter();
}

function setCampaignFilter(camp) {
  activeCampaign = camp;
  ['all', 'CF', 'SF'].forEach(c => {
    const btn = document.getElementById(`campBtn-${c}`);
    if (btn) {
      if (c === camp) {
        btn.className = "campaign-btn active px-2.5 py-1 rounded-lg border bg-[#2D3E46] text-white border-[#2D3E46] transition-all font-bold";
      } else {
        btn.className = "campaign-btn px-2.5 py-1 rounded-lg border bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 transition-all font-bold";
      }
    }
  });
  applyFilters();
}

function sortAndFilter() {
  allLeads.sort((a, b) => {
    if (currentSort === 'newest_first') {
      // Orden de llegada estricto: la fila más alta de Google Sheets es la más reciente
      return (parseInt(b.row, 10) || 0) - (parseInt(a.row, 10) || 0);
    } else if (currentSort === 'oldest_first') {
      return (parseInt(a.row, 10) || 0) - (parseInt(b.row, 10) || 0);
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
    const isDesc = (l.isDiscarded || (l.papeles && (l.papeles.includes('No esta a mi nombre') || l.papeles.includes('No conozco al titular'))));
    const isFoto = (l.photos && l.photos.length > 0) || (l.estado && (l.estado.includes('FOTO') || l.estado.includes('fotos')));
    const isTas = (l.tasacion && l.tasacion > 0) || (l.estado && String(l.estado).toUpperCase() === 'TASADO');

    if (isDesc) countDescartar++;
    else if (isTas) countTasados++;
    else countPendientes++;

    if (isFoto) countFotos++;
  });

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.innerText = val;
  };

  setTxt("counterPendientes", countPendientes);
  setTxt("counterTasados", countTasados);
  setTxt("counterFotos", countFotos);
  setTxt("counterDescartados", countDescartar);
  setTxt("counterTotal", allLeads.length);

  setTxt("tabCountPendientes", countPendientes);
  setTxt("tabCountTasados", countTasados);
  setTxt("tabCountFotos", countFotos);
  setTxt("tabCountDescartar", countDescartar);
  setTxt("tabCountTodos", allLeads.length);
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
  const searchEl = document.getElementById("searchInput");
  const q = (searchEl ? searchEl.value : "").toLowerCase().trim();

  filteredLeads = allLeads.filter(l => {
    // Campaign filter
    if (activeCampaign !== 'all' && l.campaign !== activeCampaign) {
      return false;
    }

    const isDesc = (l.isDiscarded || (l.papeles && (l.papeles.includes('No esta a mi nombre') || l.papeles.includes('No conozco al titular'))));
    const isFoto = (l.photos && l.photos.length > 0) || (l.estado && (l.estado.includes('FOTO') || l.estado.includes('fotos')));
    const isTas = (l.tasacion && l.tasacion > 0) || (l.estado && String(l.estado).toUpperCase() === 'TASADO');
    const isPend = !isDesc && !isTas;

    if (activeFilter === 'pendientes' && !isPend) return false;
    if (activeFilter === 'tasados' && !isTas) return false;
    if (activeFilter === 'fotos' && !isFoto) return false;
    if (activeFilter === 'descartar' && !isDesc) return false;

    if (q) {
      const hayMatch = `${l.nombre || ''} ${l.whatsapp || ''} ${l.marca || ''} ${l.modelo || ''} ${l.ano || ''} ${l.comentario || ''} ${l.estado || ''} ${l.papeles || ''}`.toLowerCase();
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
  const leadKey = lead.id || lead.row;
  
  // LOGICA URUGUAY: LIBRETA VS TÍTULOS
  // Si nunca tuvo títulos pero tiene libreta a su nombre, es POSITIVO (traspaso directo sin gasto de títulos)
  const isDesc = (lead.isDiscarded || (lead.papeles && (lead.papeles.includes('No esta a mi nombre') || lead.papeles.includes('No conozco al titular'))));
  const isLibreta = (lead.papeles && (lead.papeles.includes('Libreta a mi nombre') || lead.papeles.includes('nunca tuvo') || lead.papeles.includes('traspaso de libreta')));

  let papelesBadge = '';
  if (isDesc) {
    papelesBadge = `
      <div class="inline-flex flex-col">
        <span class="px-2 py-0.5 rounded-lg text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
          🚫 Sin Títulos (Descarte)
        </span>
        <span class="text-[9px] text-rose-600 font-semibold">Titular desconocido</span>
      </div>`;
  } else if (isLibreta) {
    papelesBadge = `
      <div class="inline-flex flex-col">
        <span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          ✓ Traspaso por Libreta
        </span>
        <span class="text-[9px] text-emerald-700 font-medium">Ágil • Sin gasto notarial</span>
      </div>`;
  } else {
    papelesBadge = `
      <div class="inline-flex flex-col">
        <span class="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
          ✓ Títulos al Día
        </span>
        <span class="text-[9px] text-teal-700 font-medium">A nombre del titular</span>
      </div>`;
  }

  // Tags automáticos
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
    tagsHtml = `<span class="text-[11px] text-slate-400 italic">Sin observaciones detectadas</span>`;
  }

  // Galería de fotos del auto
  const hasPhotos = (lead.photos && lead.photos.length > 0);
  let photosHtml = '';

  if (hasPhotos) {
    const totalPhotos = lead.photos.length;
    const maxPreview = 4;
    const previewList = lead.photos.slice(0, maxPreview);
    
    const thumbs = previewList.map((p, pIdx) => {
      const isLast = (pIdx === maxPreview - 1 && totalPhotos > maxPreview);
      const remainingPhotos = totalPhotos - maxPreview;
      
      return `
        <div 
          onclick="openLightbox('${leadKey}', ${pIdx})" 
          class="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-sm cursor-pointer group shrink-0 w-20 sm:w-24 md:w-28"
        >
          <img 
            src="${p.thumbnail || p.url}" 
            alt="Foto auto" 
            loading="lazy"
            onerror="this.onerror=null; this.src='https://lh3.googleusercontent.com/d/${p.id}=w600';"
            class="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          >
          ${isLast ? `
            <div class="absolute inset-0 bg-black/70 flex items-center justify-center text-white font-bold text-xs sm:text-sm">
              +${remainingPhotos + 1}
            </div>` : ''}
          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors"></div>
        </div>
      `;
    }).join('');

    photosHtml = `
      <div class="bg-purple-50/70 border border-purple-200 rounded-xl p-2.5 sm:p-3 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-purple-950 flex items-center gap-1.5">
            <span>📷</span>
            <span>Fotos del Vehículo (${totalPhotos}):</span>
          </span>
          <div class="flex items-center gap-2">
            <button onclick="openLightbox('${leadKey}', 0)" class="text-[11px] font-bold text-purple-800 hover:text-purple-950 underline flex items-center gap-1">
              <span>🔍 Ver pantalla completa</span>
            </button>
            ${lead.photos[0] && lead.photos[0].viewUrl ? `
              <a href="${lead.photos[0].viewUrl}" target="_blank" class="text-[11px] text-slate-500 hover:text-slate-800" title="Ver en Google Drive">
                Drive ↗
              </a>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          ${thumbs}
        </div>
      </div>
    `;
  } else {
    photosHtml = `
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
        <div class="flex items-center gap-1.5 text-slate-500">
          <span>📷</span>
          <span class="text-[11px] italic">Sin fotos cargadas en el formulario</span>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openWhatsAppModal('${leadKey}', 'fotos')" class="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline flex items-center gap-1">
            <span>📲 Pedir fotos</span>
          </button>
          <span>•</span>
          <button onclick="openAttachModal('${leadKey}')" class="text-[11px] font-bold text-slate-700 hover:text-slate-900 underline flex items-center gap-1">
            <span>📎 Adjuntar</span>
          </button>
        </div>
      </div>
    `;
  }

  const isTasado = (lead.tasacion && lead.tasacion > 0) || (lead.estado && String(lead.estado).toUpperCase() === 'TASADO');
  const formattedMonto = isTasado && lead.tasacion ? Number(lead.tasacion).toLocaleString('es-UY') : (lead.tasacion || '0');
  const tasacionVal = lead.tasacion && lead.tasacion > 0 ? lead.tasacion : '';
  const estadoVal = lead.estado || '';

  const currentYear = new Date().getFullYear();
  const carYear = parseInt(lead.ano, 10) || currentYear;
  const age = Math.max(0, currentYear - carYear);

  return `
    <div id="lead-card-${leadKey}" class="lead-card bg-white rounded-2xl ${isTasado ? 'border-2 border-emerald-500/80 bg-emerald-50/10 ring-1 ring-emerald-500/20' : 'border border-slate-200'} p-4 sm:p-5 shadow-sm space-y-3 sm:space-y-4 transition-all">
      
      <!-- Encabezado Móvil y Desktop -->
      <div class="flex items-center justify-between gap-2 pb-2.5 border-b ${isTasado ? 'border-emerald-200' : 'border-slate-100'}">
        <div class="flex items-center space-x-2.5">
          <div class="w-9 h-9 rounded-xl ${isTasado ? 'bg-emerald-600 text-white shadow-sm' : 'bg-[#EFF2EE] text-[#2D3E46] border border-[#DFE5DD]'} flex items-center justify-center font-bold font-serif text-base shrink-0">
            ${isTasado ? '✓' : (lead.nombre || 'C').charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="flex items-center space-x-1.5 flex-wrap">
              <h2 class="text-sm sm:text-base font-bold font-serif text-[#1E2B31]">${escapeHtml(lead.nombre || 'Cliente')}</h2>
              <span class="text-[9px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border border-slate-200">
                #${lead.row}
              </span>
              ${isTasado ? `
                <span class="inline-flex items-center gap-1 text-[11px] font-black bg-emerald-600 text-white px-2.5 py-0.5 rounded-full shadow-sm">
                  ✓ TASADO • USD $${formattedMonto}
                </span>
                <span class="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-300">
                  📁 Archivo Cerrado
                </span>
              ` : `
                <span class="inline-flex items-center gap-1 text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                  ⏳ Por Tasar
                </span>
              `}
              ${lead.campaign === 'CF' ? `
                <span class="text-[9px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded border border-purple-200">
                  📸 Con Fotos
                </span>` : ''}
              ${estadoVal && estadoVal !== 'TASADO' ? `<span class="text-[9px] bg-blue-100 text-blue-800 font-black px-1.5 py-0.5 rounded border border-blue-200 uppercase">${escapeHtml(estadoVal)}</span>` : ''}
            </div>
            <p class="text-[10px] text-slate-500 flex items-center gap-1">
              <span>🕒 ${lead.fecha || 'Reciente'}</span>
            </p>
          </div>
        </div>

        <!-- Botón WhatsApp Directo en Cabezal -->
        <button 
          onclick="openWhatsAppModal('${leadKey}', 'oferta')" 
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
          <p class="text-[10px] text-slate-500 truncate">${escapeHtml(lead.modelo || '')}</p>
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
          <p class="text-[9px] uppercase font-bold tracking-wider text-slate-500 mb-0.5">Titularidad</p>
          <div>${papelesBadge}</div>
        </div>

      </div>

      <!-- Fotos del Vehículo -->
      ${photosHtml}

      <!-- Comentario del Cliente (Columna J) -->
      <div class="bg-[#F8FAFC] border border-slate-200 p-3 rounded-xl space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="font-bold text-[#1E2B31] text-[11px] uppercase tracking-wider flex items-center gap-1">
            💬 Comentarios / Detalles del Cliente:
          </span>
          <button onclick="openWhatsAppModal('${leadKey}', 'fotos')" class="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline">
            📸 Pedir fotos adicionales
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

      <!-- SECCIÓN DE TASACIÓN: ESTADO CERRADO SI YA ESTÁ TASADO O CAJA ABIERTA SI ESTÁ PENDIENTE -->
      ${isTasado ? `
        <!-- ESTADO CERRADO / TASADO (con cartelito y opción a re-editar) -->
        <div id="tasacionClosedBox-${leadKey}" class="bg-gradient-to-r from-emerald-50 via-teal-50/40 to-emerald-50 border-2 border-emerald-400 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm">
          
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0">
              ✓
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-950 bg-emerald-200/90 border border-emerald-300 px-2 py-0.5 rounded-md">
                  <span>🏷️</span> CARTELITO: TASADO
                </span>
                <span class="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                  📁 Archivo Cerrado
                </span>
                <span class="text-[11px] font-semibold text-slate-500">
                  Fila #${lead.row}
                </span>
              </div>
              <p class="text-lg sm:text-xl font-black text-emerald-950 font-serif mt-0.5">
                USD $${formattedMonto}
                <span class="text-xs font-semibold text-emerald-700 ml-1">contado en mano</span>
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button 
              onclick="openWhatsAppModal('${leadKey}', 'oferta')" 
              class="flex-1 sm:flex-none px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all touch-target"
            >
              <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>
              <span>💬 Ver WhatsApp</span>
            </button>

            <button 
              onclick="toggleEditTasacion('${leadKey}')" 
              class="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border-2 border-emerald-500 text-emerald-900 hover:bg-emerald-100 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all touch-target"
              title="Volver a editar monto"
            >
              <span>✏️ Editar</span>
            </button>
          </div>

        </div>

        <!-- Panel de Edición para Modificar Tasación (Oculto mientras el archivo está cerrado) -->
        <div id="tasacionEditBox-${leadKey}" class="hidden bg-[#EFF2EE] border-2 border-[#2D3E46] rounded-xl p-3 sm:p-4 space-y-3">
          <div class="flex items-center justify-between border-b border-slate-200 pb-2">
            <span class="text-xs font-black text-[#1E2B31] flex items-center gap-1.5">
              <span>✏️</span>
              <span>Modificar Valor de Tasación:</span>
            </span>
            <button onclick="toggleEditTasacion('${leadKey}')" class="text-xs font-bold text-slate-500 hover:text-slate-800">
              ✖ Cancelar edición
            </button>
          </div>

          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <div class="relative rounded-xl shadow-sm flex-1 sm:flex-none">
                <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-black text-slate-600">$</span>
                <input 
                  type="number" 
                  id="tasacionInput-${leadKey}" 
                  value="${tasacionVal}" 
                  placeholder="Monto USD" 
                  class="w-full sm:w-36 pl-7 pr-2 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-[#1E2B31] focus:ring-2 focus:ring-[#2D3E46] focus:outline-none"
                >
              </div>

              <div class="flex items-center gap-1">
                <button onclick="quickAdjustTasacion('${leadKey}', -500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">-500</button>
                <button onclick="quickAdjustTasacion('${leadKey}', 500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+500</button>
                <button onclick="quickAdjustTasacion('${leadKey}', 1000)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+1k</button>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <button 
                onclick="saveLeadTasacion('${leadKey}', false)" 
                class="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-[#2D3E46] text-[#2D3E46] hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-sm touch-target text-center"
              >
                💾 Guardar Cambios
              </button>
              
              <button 
                onclick="saveLeadTasacion('${leadKey}', true)" 
                class="flex-2 sm:flex-none px-4 py-2.5 bg-[#C0392B] hover:bg-[#A93226] text-white rounded-xl text-xs font-black transition-all shadow hover:shadow-md flex items-center justify-center gap-1.5 touch-target text-center"
              >
                <span>🚀 Guardar y WSP</span>
              </button>
            </div>
          </div>
        </div>
      ` : `
        <!-- Caja de Tasación Abierta para Tasar por primera vez -->
        <div id="tasacionOpenBox-${leadKey}" class="bg-[#EFF2EE] border border-[#DFE5DD] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          <div class="flex items-center gap-2">
            <div class="relative rounded-xl shadow-sm flex-1 sm:flex-none">
              <span class="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-black text-slate-600">$</span>
              <input 
                type="number" 
                id="tasacionInput-${leadKey}" 
                value="${tasacionVal}" 
                placeholder="Monto USD" 
                class="w-full sm:w-36 pl-7 pr-2 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black text-[#1E2B31] focus:ring-2 focus:ring-[#2D3E46] focus:outline-none"
              >
            </div>

            <div class="flex items-center gap-1">
              <button onclick="quickAdjustTasacion('${leadKey}', -500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">-500</button>
              <button onclick="quickAdjustTasacion('${leadKey}', 500)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+500</button>
              <button onclick="quickAdjustTasacion('${leadKey}', 1000)" class="px-2 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold rounded-lg text-slate-700 touch-target">+1k</button>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button 
              onclick="saveLeadTasacion('${leadKey}', false)" 
              class="flex-1 sm:flex-none px-3.5 py-2.5 bg-white border border-[#2D3E46] text-[#2D3E46] hover:bg-slate-50 rounded-xl text-xs font-bold transition-all shadow-sm touch-target text-center"
            >
              💾 Guardar
            </button>
            
            <button 
              onclick="saveLeadTasacion('${leadKey}', true)" 
              class="flex-2 sm:flex-none px-4 py-2.5 bg-[#C0392B] hover:bg-[#A93226] text-white rounded-xl text-xs font-black transition-all shadow hover:shadow-md flex items-center justify-center gap-1.5 touch-target text-center"
            >
              <span>🚀 Tasar y WhatsApp</span>
            </button>
          </div>

        </div>
      `}

    </div>
  `;
}

// ================= ACCIONES DE TASACIÓN =================
function toggleEditTasacion(leadKey) {
  const closedBox = document.getElementById(`tasacionClosedBox-${leadKey}`);
  const editBox = document.getElementById(`tasacionEditBox-${leadKey}`);
  if (closedBox && editBox) {
    const isCurrentlyEditing = !editBox.classList.contains('hidden');
    if (isCurrentlyEditing) {
      editBox.classList.add('hidden');
      closedBox.classList.remove('hidden');
    } else {
      closedBox.classList.add('hidden');
      editBox.classList.remove('hidden');
      const input = document.getElementById(`tasacionInput-${leadKey}`);
      if (input) {
        input.focus();
        input.select();
      }
    }
  }
}

function quickAdjustTasacion(leadKey, amount) {
  const input = document.getElementById(`tasacionInput-${leadKey}`);
  if (!input) return;
  let val = parseFloat(input.value) || 0;
  val = Math.max(0, val + amount);
  input.value = val;
}

function saveLeadTasacion(leadKey, openWspAfter) {
  const input = document.getElementById(`tasacionInput-${leadKey}`);
  const val = parseFloat(input ? input.value : 0) || 0;
  if (val <= 0) {
    showToast("⚠️ Atención", "Ingresá un valor mayor a 0 para tasar el auto.");
    if (input) input.focus();
    return;
  }

  const lead = allLeads.find(l => (l.id === leadKey || l.row === leadKey || String(l.row) === String(leadKey)));
  if (lead) {
    lead.tasacion = val;
    lead.estado = 'TASADO';
    lead.isPending = false;
  }

  // Guardar en caché local
  saveOverrideLocal(leadKey, val, 'TASADO');

  // Si hay Webhook conectado a Google Sheets, sincronizar en vivo
  if (appConfig.webhookUrl && lead) {
    postTasacionToWebhook(lead.row, val, 'TASADO');
  }

  showToast("✓ Tasación Guardada", `USD ${val.toLocaleString('es-UY')} registrada como TASADO (Archivo Cerrado)`);
  updateGlobalCounters();

  if (activeFilter === 'pendientes') {
    applyFilters();
  } else {
    const cardEl = document.getElementById(`lead-card-${leadKey}`);
    if (cardEl && lead) {
      cardEl.outerHTML = createLeadCardHtml(lead);
    }
  }

  if (openWspAfter) {
    openWhatsAppModal(leadKey, 'oferta');
  }
}

// ================= LIGHTBOX VIEWER (FOTOS EN PANTALLA COMPLETA) =================
function openLightbox(leadKey, index) {
  const lead = allLeads.find(l => (l.id === leadKey || l.row === leadKey || String(l.row) === String(leadKey)));
  if (!lead || !lead.photos || lead.photos.length === 0) return;

  activeLightboxLead = lead;
  activeLightboxIndex = Math.max(0, Math.min(index || 0, lead.photos.length - 1));

  updateLightboxView();
  document.getElementById("lightboxModal").classList.remove("hidden");
  document.body.classList.add("overflow-hidden");
}

function closeLightbox() {
  document.getElementById("lightboxModal").classList.add("hidden");
  document.body.classList.remove("overflow-hidden");
  activeLightboxLead = null;
}

function updateLightboxView() {
  if (!activeLightboxLead || !activeLightboxLead.photos) return;
  const photos = activeLightboxLead.photos;
  const current = photos[activeLightboxIndex];

  document.getElementById("lightboxCounter").innerText = `Foto ${activeLightboxIndex + 1} de ${photos.length}`;
  document.getElementById("lightboxCarTitle").innerText = `${activeLightboxLead.marca} ${activeLightboxLead.modelo} (${activeLightboxLead.ano || ''}) • ${activeLightboxLead.nombre || ''}`;

  const imgEl = document.getElementById("lightboxImg");
  imgEl.src = current.thumbnail || current.url;
  imgEl.onerror = () => {
    imgEl.src = `https://lh3.googleusercontent.com/d/${current.id}=w1200`;
  };

  const driveLink = document.getElementById("lightboxDriveLink");
  if (current.viewUrl) {
    driveLink.href = current.viewUrl;
    driveLink.classList.remove("hidden");
  } else {
    driveLink.classList.add("hidden");
  }

  // Thumbnails bar
  const strip = document.getElementById("lightboxThumbStrip");
  strip.innerHTML = photos.map((p, idx) => `
    <img 
      src="${p.thumbnail || p.url}" 
      onclick="setLightboxIndex(${idx})" 
      class="h-12 sm:h-14 aspect-[4/3] object-cover rounded-lg cursor-pointer transition-all ${idx === activeLightboxIndex ? 'ring-2 ring-emerald-400 opacity-100 scale-105' : 'opacity-50 hover:opacity-80'}"
    >
  `).join('');
}

function setLightboxIndex(idx) {
  if (!activeLightboxLead) return;
  activeLightboxIndex = idx;
  updateLightboxView();
}

function nextLightboxPhoto() {
  if (!activeLightboxLead || !activeLightboxLead.photos) return;
  activeLightboxIndex = (activeLightboxIndex + 1) % activeLightboxLead.photos.length;
  updateLightboxView();
}

function prevLightboxPhoto() {
  if (!activeLightboxLead || !activeLightboxLead.photos) return;
  activeLightboxIndex = (activeLightboxIndex - 1 + activeLightboxLead.photos.length) % activeLightboxLead.photos.length;
  updateLightboxView();
}

function initLightboxListeners() {
  window.addEventListener('keydown', (e) => {
    const lb = document.getElementById("lightboxModal");
    if (lb && !lb.classList.contains("hidden")) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') nextLightboxPhoto();
      if (e.key === 'ArrowLeft') prevLightboxPhoto();
    }
  });

  // Touch swipe support for mobile / iPhone
  let touchStartX = 0;
  let touchEndX = 0;
  const lbModal = document.getElementById("lightboxModal");
  if (lbModal) {
    lbModal.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    lbModal.addEventListener('touchend', e => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) nextLightboxPhoto();
      if (touchEndX - touchStartX > 50) prevLightboxPhoto();
    }, { passive: true });
  }
}

// ================= MODAL ADJUNTAR FOTOS =================
function openAttachModal(leadKey) {
  const lead = allLeads.find(l => (l.id === leadKey || l.row === leadKey || String(l.row) === String(leadKey)));
  if (!lead) return;

  activeAttachLead = lead;
  document.getElementById("attachModalCarTitle").innerText = `${lead.marca} ${lead.modelo} (${lead.ano || ''}) • ${lead.nombre || ''}`;
  document.getElementById("attachPhotoUrls").value = "";
  document.getElementById("attachPhotoModal").classList.remove("hidden");
}

function closeAttachModal() {
  document.getElementById("attachPhotoModal").classList.add("hidden");
  activeAttachLead = null;
}

function saveAttachedPhotos() {
  if (!activeAttachLead) return;
  const text = document.getElementById("attachPhotoUrls").value.trim();
  if (!text) {
    showToast("⚠️ Atención", "Ingresá al menos un enlace de foto.");
    return;
  }

  const urls = text.split(/[\r\n,]+/).map(u => u.trim()).filter(u => u.length > 5);
  const newPhotos = [];

  urls.forEach(u => {
    let fId = "";
    if (u.includes('id=')) {
      fId = u.split('id=')[1].split('&')[0];
    } else if (u.includes('/d/')) {
      fId = u.split('/d/')[1].split('/')[0];
    }

    if (fId) {
      newPhotos.push({
        id: fId,
        thumbnail: `https://drive.google.com/thumbnail?id=${fId}&sz=w800`,
        viewUrl: `https://drive.google.com/file/d/${fId}/view?usp=sharing`
      });
    } else {
      newPhotos.push({
        id: "custom-" + Date.now(),
        thumbnail: u,
        viewUrl: u
      });
    }
  });

  if (newPhotos.length > 0) {
    activeAttachLead.photos = newPhotos.concat(activeAttachLead.photos || []);
    
    // Guardar en localStorage
    let saved = {};
    try {
      const ex = localStorage.getItem('carvlak_attached_photos');
      if (ex) saved = JSON.parse(ex);
    } catch (e) {}

    const key = activeAttachLead.id || activeAttachLead.row;
    saved[key] = activeAttachLead.photos;
    localStorage.setItem('carvlak_attached_photos', JSON.stringify(saved));

    showToast("✓ Fotos Guardadas", `Se agregaron ${newPhotos.length} fotos a la ficha`);
    closeAttachModal();
    applyFilters();
  }
}

// ================= MOTOR DE MENSAJES DE WHATSAPP CON OPERADOR =================
let currentTemplateKey = 'oferta';

function openWhatsAppModal(leadKey, templateKey) {
  const lead = allLeads.find(l => (l.id === leadKey || l.row === leadKey || String(l.row) === String(leadKey)));
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
  const leadKey = lead.id || lead.row;

  const currentTasacion = lead.tasacion || (document.getElementById(`tasacionInput-${leadKey}`) ? parseFloat(document.getElementById(`tasacionInput-${leadKey}`).value) : 0) || 0;
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
    text = `¡Hola ${lead.nombre || ''}! Te saluda ${operator} de CARVLAK por tu ${lead.marca || 'auto'} ${lead.modelo || ''} año ${lead.ano || ''}.\n\n¿Me podrás mandar unas fotos del exterior y del interior por acá? Así le pego una mirada y te paso el valor exacto de tasación hoy mismo. ¡Muchas gracias!\n\n${operator} • CARVLAK`;
  } else if (currentTemplateKey === 'visita') {
    text = `¡Hola ${lead.nombre || ''}! ${operator} de CARVLAK nuevamente.\n\n¿Cómo te queda para pasar por nuestro local con el ${lead.modelo || 'auto'} para revisarlo juntos y ya dejar liquidada la compra? Saludos cordiales.\n\n${operator} • CARVLAK`;
  } else if (currentTemplateKey === 'descarte') {
    text = `Hola ${lead.nombre || ''}, muchas gracias por consultar en CARVLAK por tu ${lead.marca || ''} ${lead.modelo || ''}.\n\nLamentablemente por el momento solo estamos comprando vehículos que tengan los títulos o la libreta a nombre del titular directo para transferir en el momento. ¡Cualquier otra consulta quedamos a las órdenes!\n\n${operator} • CARVLAK`;
  }

  const textarea = document.getElementById("modalMessageText");
  textarea.value = text;

  // Actualizar link de WhatsApp
  const cleanPhone = (lead.whatsapp || "").replace(/\D/g, '');
  const encodedText = encodeURIComponent(text);
  const wspLink = `https://wa.me/${cleanPhone}?text=${encodedText}`;
  document.getElementById("modalOpenWspLink").href = wspLink;
}

function copyModalMessage() {
  const text = document.getElementById("modalMessageText").value;
  navigator.clipboard.writeText(text).then(() => {
    showToast("✓ Copiado al portapapeles", "Mensaje listo para pegar en WhatsApp Web");
  }).catch(() => {
    showToast("✓ Copiado", "Texto seleccionado");
  });
}

function onWspOpened() {
  if (activeModalLead) {
    showToast("🚀 WhatsApp Abierto", `Chat iniciado para ${activeModalLead.nombre}`);
    setTimeout(() => {
      closeWhatsAppModal();
    }, 1000);
  }
}

// ================= MODALES DE IPHONE Y SINCRONIZACIÓN =================
function openIPhoneModal() {
  const currentUrl = window.location.href;
  document.getElementById("appUrlInput").value = currentUrl;
  
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentUrl)}&bgcolor=F8FAFC&color=2D3E46`;
  document.getElementById("qrCodeImg").src = qrApiUrl;

  document.getElementById("iphoneModal").classList.remove("hidden");
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

function openSyncModal() {
  document.getElementById("settingWebhookUrl").value = appConfig.webhookUrl;
  document.getElementById("syncModal").classList.remove("hidden");
}

function closeSyncModal() {
  document.getElementById("syncModal").classList.add("hidden");
}

function saveSyncSettings() {
  const url = document.getElementById("settingWebhookUrl").value.trim();
  appConfig.webhookUrl = url;
  localStorage.setItem('carvlak_webhook_url', url);
  showToast("✓ Configuración Guardada", url ? "Conectado a Google Sheets" : "Modo local activo");
  closeSyncModal();
  if (url) syncWithGoogleSheetWebhook(true);
}

// ================= SINCRONIZACIÓN EN VIVO CON GOOGLE SHEETS & FOTOS DRIVE =================
let isSyncingLive = false;

function triggerLiveSync(isSilent = false) {
  if (isSyncingLive) return;
  isSyncingLive = true;

  const btnText = document.getElementById("liveSyncText");
  const btnIcon = document.getElementById("liveSyncIcon");
  if (btnIcon) btnIcon.classList.add("animate-spin");
  if (btnText && !isSilent) btnText.innerText = "Sincronizando...";

  const scriptId = "gviz_live_sync_script";
  const existing = document.getElementById(scriptId);
  if (existing) existing.remove();

  const script = document.createElement("script");
  script.id = scriptId;
  const sheetId = appConfig.sheetId || "1pomsp0u3fEhCz1syDz9HtOT5VrneOZT2JYBDgK2qv-I";
  const gid = appConfig.gid || "782368790";
  script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:carvlakLiveSyncCallback&gid=${gid}&_t=${Date.now()}`;

  script.onerror = () => {
    isSyncingLive = false;
    if (btnIcon) btnIcon.classList.remove("animate-spin");
    if (btnText) btnText.innerText = "🔄 Actualizar en Vivo";
    if (!isSilent) showToast("⚠️ Conexión", "No se pudo conectar a Google Sheets temporalmente. Mostrando fotos guardadas.");
  };

  document.body.appendChild(script);
}

window.carvlakLiveSyncCallback = function(data) {
  isSyncingLive = false;
  const btnText = document.getElementById("liveSyncText");
  const btnIcon = document.getElementById("liveSyncIcon");
  if (btnIcon) btnIcon.classList.remove("animate-spin");
  if (btnText) btnText.innerText = "🔄 Actualizar en Vivo";

  try {
    if (!data || !data.table || !data.table.rows) return;
    const rows = data.table.rows;
    let newOrUpdated = 0;

    rows.forEach((r, idx) => {
      const c = r.c;
      if (!c) return;

      const rawA = c[0] ? (c[0].f || c[0].v || '') : '';
      if (!rawA) return;

      const rowNum = idx + 2;
      const nombre = c[1] ? String(c[1].v || '').trim() : '';
      let rawPhone = c[2] ? String(c[2].f || c[2].v || '') : '';
      let whatsapp = rawPhone.replace(/\D/g, '');
      if (whatsapp.startsWith('09')) whatsapp = '598' + whatsapp.substring(1);
      else if (whatsapp.startsWith('9') && whatsapp.length === 8) whatsapp = '598' + whatsapp;

      const marca = c[4] ? String(c[4].v || '').trim() : '';
      const modelo = c[5] ? String(c[5].v || '').trim() : '';
      const ano = c[6] ? String(c[6].f || c[6].v || '').replace('.0', '') : '';
      const km = c[7] ? String(c[7].f || c[7].v || '').replace('.0', '') : '';
      const papeles = c[8] ? String(c[8].v || '').trim() : '';

      // Photos from cols 9, 10, 11, 12
      const photos = [];
      [9, 10, 11, 12].forEach(colIdx => {
        const val = c[colIdx] ? String(c[colIdx].v || '') : '';
        const match = val.match(/id=([a-zA-Z0-9_-]+)/);
        if (match) {
          const fId = match[1];
          photos.push({
            id: fId,
            thumbnail: `https://drive.google.com/thumbnail?id=${fId}&sz=w800`,
            viewUrl: `https://drive.google.com/file/d/${fId}/view?usp=sharing`
          });
        }
      });

      const comentario = c[13] ? String(c[13].v || '').trim() : (c[14] ? String(c[14].v || '').trim() : '');
      const tasVal = c[14] ? parseFloat(c[14].v) || 0 : 0;
      const estado = c[16] ? String(c[16].v || '').trim() : '';

      const isDesc = papeles.includes('No esta a mi nombre') || papeles.includes('No conozco al titular');
      const leadKey = `CF-${rowNum}`;

      const existingIndex = allLeads.findIndex(l => l.id === leadKey || l.row === rowNum);
      if (existingIndex >= 0) {
        if (photos.length > 0 && (!allLeads[existingIndex].photos || allLeads[existingIndex].photos.length === 0)) {
          allLeads[existingIndex].photos = photos;
          newOrUpdated++;
        }
      } else if (nombre || whatsapp || marca || photos.length > 0) {
        allLeads.unshift({
          id: leadKey,
          campaign: "CF",
          campaignName: "Tasación Con Fotos",
          row: rowNum,
          nombre: nombre,
          whatsapp: whatsapp,
          marca: marca,
          modelo: modelo,
          ano: ano,
          km: km,
          papeles: papeles,
          comentario: comentario,
          tasacion: tasVal,
          estado: estado,
          isPending: (tasVal === 0),
          isDiscarded: isDesc,
          photos: photos,
          tags: getLiveTags(comentario, papeles),
          fecha: String(rawA),
          rawDate: String(rawA)
        });
        newOrUpdated++;
      }
    });

    applyLocalStorageOverrides();
    sortAndFilter();
    showToast("✓ ¡Sincronizado en Vivo!", `${newOrUpdated > 0 ? newOrUpdated + ' nuevas consultas sincronizadas' : 'Base de datos al día con Google Sheets y fotos'}`);
  } catch (err) {
    console.error("Error en live sync callback:", err);
  }
};

function getLiveTags(comment, papeles) {
  const tags = [];
  const c = (comment || "").toLowerCase();
  const p = (papeles || "").toLowerCase();

  if (p.includes("libreta a mi nombre")) {
    tags.push({ type: "positive", label: "Traspaso Facil por Libreta", code: "LIBRETA_AGIL" });
  } else if (p.includes("titulos a mi nombre") || p.includes("tiene titulos a mi nombre")) {
    tags.push({ type: "positive", label: "Titulos al Dia", code: "TITULOS_AL_DIA" });
  } else if (p.includes("no esta a mi nombre") || p.includes("no conozco al titular")) {
    tags.push({ type: "danger", label: "Sin Titulos (Descarte)", code: "SIN_TITULOS" });
  }

  if (c.includes("service oficial") || c.includes("servis oficial") || c.includes("service oficiales")) {
    tags.push({ type: "positive", label: "Service Oficial", code: "SERVICE_OFICIAL" });
  }
  if (c.includes("impecable") || c.includes("como nuevo") || c.includes("muy buen estado")) {
    tags.push({ type: "positive", label: "Estado Impecable", code: "IMPECABLE" });
  }
  if (c.includes("cubiertas nuevas") || c.includes("neumaticos nuevos")) {
    tags.push({ type: "positive", label: "Cubiertas Nuevas", code: "CUBIERTAS_NUEVAS" });
  }
  if (c.includes("choque") || c.includes("golpe") || c.includes("chocado")) {
    tags.push({ type: "danger", label: "Detalles de Choque", code: "CHOQUE" });
  }
  if (c.includes("raya") || c.includes("rayones") || c.includes("raspado")) {
    tags.push({ type: "warning", label: "Rayas / Detalles de Pintura", code: "RAYAS" });
  }
  if (c.includes("deuda") || c.includes("multas")) {
    tags.push({ type: "warning", label: "Deuda / Multas a Revisar", code: "DEUDA" });
  }

  if (tags.length === 0 && comment && comment.length > 3) {
    tags.push({ type: "neutral", label: "Nota del cliente", code: "NOTA_CLIENTE" });
  }

  return tags;
}

function refreshData() {
  triggerLiveSync(false);
}

// ================= POST TASACIÓN A WEBHOOK GOOGLE SHEETS =================
async function postTasacionToWebhook(rowNum, tasacion, estado) {
  if (!appConfig.webhookUrl) return;

  try {
    const payload = {
      action: "updateTasacion",
      row: rowNum,
      tasacion: tasacion,
      estado: estado,
      operator: appConfig.activeOperator,
      timestamp: new Date().toISOString()
    };

    await fetch(appConfig.webhookUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    console.log(`Tasación enviada a Google Sheets para fila ${rowNum}`);
  } catch (err) {
    console.warn("Fallo enviando al Webhook de Google Sheets:", err);
  }
}

// ================= TOASTS & UTILIDADES =================
let toastTimer = null;
function showToast(title, message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  document.getElementById("toastTitle").innerText = title;
  document.getElementById("toastMessage").innerText = message;

  clearTimeout(toastTimer);
  toast.classList.remove("opacity-0", "translate-y-20");
  toast.classList.add("opacity-100", "translate-y-0");

  toastTimer = setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-20");
  }, 3500);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
