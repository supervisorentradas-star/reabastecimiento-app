// ======================================================
// SISTEMA DE RECOLECCIÓN SOKSO - VERSIÓN MOBILE INTEGRADA
// ======================================================

// ================= CONFIGURACIÓN =================
const CONFIG = {
    appName: 'Recolección SOKSO',
    version: '2.0.0',
    cacheDuration: 5 * 60 * 1000, // 5 minutos
    maxCacheItems: 500,
    syncInterval: 30000, // 30 segundos
    connectionCheckInterval: 10000, // 10 segundos
    dateFormat: 'DD/MM/YYYY',
    timeFormat: 'HH:mm'
};

// ================= VARIABLES GLOBALES =================
let currentUser = null;
let currentRoute = null;
let currentQueue = null;
let currentType = 'REGULAR';
let currentDepositIndex = 0;
let deposits = [];
let routesData = {};
let progressData = {};
let pendingChanges = {};
let isOnline = true;
let isInitialized = false;
let scannerActive = false;

// ================= CACHÉ =================
const cache = {
    routes: {
        data: null,
        timestamp: 0,
        get isValid() {
            return this.data && (Date.now() - this.timestamp) < CONFIG.cacheDuration;
        },
        set: function(data) {
            this.data = data;
            this.timestamp = Date.now();
        },
        clear: function() {
            this.data = null;
            this.timestamp = 0;
        }
    },
    progress: {},
    queues: {}
};

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Iniciando sistema de recolección...');
    
    try {
        // 1. Obtener usuario del localStorage
        await loadUser();
        
        // 2. Configurar Firebase
        setupFirebase();
        
        // 3. Configurar UI
        setupUI();
        
        // 4. Cargar datos iniciales
        await loadInitialData();
        
        // 5. Configurar eventos
        setupEvents();
        
        isInitialized = true;
        console.log('✅ Sistema inicializado correctamente');
        
    } catch (error) {
        console.error('❌ Error en inicialización:', error);
        showToast('Error al inicializar el sistema', 'error');
    }
});

// ================= USUARIO =================
async function loadUser() {
    try {
        currentUser = localStorage.getItem('usuarioSokso');
        
        if (!currentUser) {
            showToast('Usuario no encontrado. Redirigiendo...', 'warning');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
            throw new Error('Usuario no autenticado');
        }
        
        document.getElementById('userName').textContent = currentUser;
        console.log('👤 Usuario cargado:', currentUser);
        
    } catch (error) {
        throw error;
    }
}

function volverAlMenu() {
    if (Object.keys(pendingChanges).length > 0) {
        if (confirm('Tienes cambios sin sincronizar. ¿Seguro que quieres salir?')) {
            window.location.href = 'index.html';
        }
    } else {
        window.location.href = 'index.html';
    }
}

// ================= FIREBASE =================
function setupFirebase() {
    try {
        // Verificar conexión
        const connectedRef = database.ref(".info/connected");
        connectedRef.on("value", function(snap) {
            isOnline = snap.val() === true;
            updateConnectionStatus();
        });
        
        console.log('✅ Firebase configurado');
        
    } catch (error) {
        console.error('❌ Error configurando Firebase:', error);
        isOnline = false;
        updateConnectionStatus();
    }
}

function updateConnectionStatus() {
    const dot = document.getElementById('connectionDot');
    const text = document.getElementById('connectionText');
    
    if (isOnline) {
        dot.className = 'connection-dot';
        text.textContent = 'Online';
        dot.style.background = '#27ae60';
    } else {
        dot.className = 'connection-dot offline';
        text.textContent = 'Offline';
        dot.style.background = '#e74c3c';
    }
}

// ================= UI =================
function setupUI() {
    // Actualizar fecha y hora
    updateDateTime();
    setInterval(updateDateTime, 60000);
    
    // Configurar navegación
    setupNavigation();
    
    // Configurar eventos táctiles
    setupTouchEvents();
    
    // Mostrar loading inicial
    showLoading('Cargando sistema...');
}

function updateDateTime() {
    const now = new Date();
    
    // Fecha
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    document.getElementById('currentDate').textContent = `${day}/${month}/${year}`;
    
    // Hora
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('currentTime').textContent = `${hours}:${minutes}`;
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            
            // Actualizar clases activas
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
            
            // Navegar a la página
            navigateTo(page);
        });
    });
    
    // Navegar a la página inicial
    navigateTo('rutas');
}

function navigateTo(page) {
    console.log('📱 Navegando a:', page);
    
    switch(page) {
        case 'rutas':
            showRoutesPage();
            break;
        case 'colas':
            showQueuesPage();
            break;
        case 'picking':
            showPickingPage();
            break;
        case 'config':
            showConfigPage();
            break;
    }
}

// ================= PÁGINAS =================
function showRoutesPage() {
    const content = `
        <div class="content-section">
            <h3 class="section-title">
                <span>📊</span>
                Rutas Disponibles
            </h3>
            
            <div class="tabs-header mb-2">
                <button class="tab-button ${currentType === 'REGULAR' ? 'active' : ''}" onclick="changeType('REGULAR')">
                    REGULAR
                </button>
                <button class="tab-button ${currentType === 'BACKORDER' ? 'active' : ''}" onclick="changeType('BACKORDER')">
                    BACKORDER
                </button>
                <button class="tab-button ${currentType === 'CYBER' ? 'active' : ''}" onclick="changeType('CYBER')">
                    CYBER
                </button>
            </div>
            
            <div id="routesList">
                <div class="skeleton" style="height: 100px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 100px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 100px;"></div>
            </div>
            
            <div class="card mt-2">
                <button class="btn btn-primary" onclick="loadRoutes()">
                    🔄 Actualizar Rutas
                </button>
                <button class="btn btn-secondary mt-1" onclick="syncPendingChanges()">
                    🔄 Sincronizar (${Object.keys(pendingChanges).length})
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('appContent').innerHTML = content;
    loadRoutes();
}

async function loadRoutes() {
    showLoading('Cargando rutas...');
    
    try {
        // Intentar desde caché primero
        if (cache.routes.isValid) {
            console.log('📦 Usando rutas desde caché');
            processRoutesData(cache.routes.data);
            return;
        }
        
        // Cargar desde Firebase
        console.log('🌐 Cargando rutas desde Firebase...');
        const snapshot = await database.ref('recoleccion_rutas').once('value');
        const data = snapshot.val();
        
        if (!data) {
            showToast('No hay rutas disponibles para hoy', 'warning');
            hideLoading();
            return;
        }
        
        // Guardar en caché
        cache.routes.set(data);
        
        // Procesar datos
        processRoutesData(data);
        
    } catch (error) {
        console.error('❌ Error cargando rutas:', error);
        showToast('Error al cargar rutas', 'error');
    } finally {
        hideLoading();
    }
}

function processRoutesData(data) {
    routesData = {};
    const today = getTodayDate();
    
    // Convertir a array si es objeto
    const dataArray = Array.isArray(data) ? data : Object.values(data);
    
    dataArray.forEach(item => {
        // Verificar fecha
        const itemDate = item.FECHA || item.fecha || '';
        if (itemDate !== today) {
            return;
        }
        
        // Extraer información
        const deposito = item.DEPOSITO || item.deposito || '';
        const upc = item['CODIGO UPC'] || item.upc || '';
        const descripcion = item.ARTICULO || item.articulo || '';
        const cantidad = parseInt(item.CANTIDAD || item.cantidad) || 0;
        const indicador = item.INDICADOR || item.indicador || 'REGULAR';
        
        if (!deposito || !upc || cantidad <= 0) {
            return;
        }
        
        // Extraer ruta del depósito
        const rutaMatch = deposito.match(/^([A-Z]\d+)/);
        if (!rutaMatch) return;
        
        const ruta = rutaMatch[1];
        
        // Inicializar ruta si no existe
        if (!routesData[ruta]) {
            routesData[ruta] = {
                REGULAR: [],
                BACKORDER: [],
                CYBER: [],
                totals: { REGULAR: 0, BACKORDER: 0, CYBER: 0 }
            };
        }
        
        // Agregar item
        const itemData = {
            deposito,
            upc: upc.toString(),
            descripcion,
            cantidad,
            indicador,
            recolectado: 0,
            no_encontrado: 0,
            completado: false
        };
        
        routesData[ruta][indicador].push(itemData);
        routesData[ruta].totals[indicador] += cantidad;
    });
    
    // Mostrar rutas
    displayRoutes();
}

function displayRoutes() {
    const container = document.getElementById('routesList');
    
    if (!routesData || Object.keys(routesData).length === 0) {
        container.innerHTML = `
            <div class="card">
                <div class="text-center p-2">
                    <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                    <h4>No hay rutas disponibles</h4>
                    <p style="color: #666; font-size: 14px;">No hay datos para hoy (${getTodayDate()})</p>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    const rutas = Object.keys(routesData).sort();
    
    rutas.forEach(ruta => {
        const itemsRuta = routesData[ruta][currentType] || [];
        const totalUnidades = routesData[ruta].totals[currentType] || 0;
        
        if (itemsRuta.length === 0) return;
        
        // Calcular progreso
        let recolectado = 0;
        itemsRuta.forEach(item => {
            const key = `${item.deposito}_${item.upc}_${item.indicador}`;
            if (progressData[key]) {
                recolectado += progressData[key].recolectado || 0;
            }
        });
        
        const porcentaje = totalUnidades > 0 ? Math.round((recolectado / totalUnidades) * 100) : 0;
        
        html += `
            <div class="card mb-1" onclick="selectRoute('${ruta}')" style="cursor: pointer;">
                <div class="card-header">
                    <div class="card-title">Ruta ${ruta}</div>
                    <div class="card-badge">${itemsRuta.length} items</div>
                </div>
                
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${porcentaje}%"></div>
                </div>
                
                <div class="progress-text">
                    ${recolectado}/${totalUnidades} unidades (${porcentaje}%)
                </div>
                
                <div class="grid-3 mt-1">
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">TOTAL</small>
                        <div style="font-weight: bold; color: #6600a1;">${totalUnidades}</div>
                    </div>
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">RECOLECTADO</small>
                        <div style="font-weight: bold; color: #27ae60;">${recolectado}</div>
                    </div>
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">PENDIENTE</small>
                        <div style="font-weight: bold; color: #f39c12;">${totalUnidades - recolectado}</div>
                    </div>
                </div>
                
                <button class="btn btn-outline mt-1" onclick="event.stopPropagation(); selectRoute('${ruta}')">
                    Seleccionar Ruta
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function changeType(type) {
    currentType = type;
    
    // Actualizar botones activos
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    // Actualizar lista
    displayRoutes();
}

function selectRoute(ruta) {
    if (!routesData[ruta] || routesData[ruta][currentType].length === 0) {
        showToast(`No hay datos de ${currentType} para esta ruta`, 'warning');
        return;
    }
    
    currentRoute = ruta;
    showToast(`Ruta ${ruta} seleccionada`, 'success');
    
    // Navegar a colas
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('.nav-item[data-page="colas"]').classList.add('active');
    navigateTo('colas');
}

// ================= COLAS =================
function showQueuesPage() {
    if (!currentRoute) {
        showToast('Primero selecciona una ruta', 'warning');
        
        // Volver a rutas
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelector('.nav-item[data-page="rutas"]').classList.add('active');
        navigateTo('rutas');
        return;
    }
    
    const content = `
        <div class="content-section">
            <h3 class="section-title">
                <span>📋</span>
                Colas - Ruta ${currentRoute}
            </h3>
            
            <div class="card mb-2">
                <div class="card-header">
                    <div class="card-title">${currentType}</div>
                    <div class="card-badge">${routesData[currentRoute] ? routesData[currentRoute][currentType].length : 0} items</div>
                </div>
                <p style="color: #666; font-size: 13px; margin: 0;">
                    Selecciona una zona para comenzar la recolección
                </p>
            </div>
            
            <div id="queuesList">
                <div class="skeleton" style="height: 80px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 80px; margin-bottom: 10px;"></div>
                <div class="skeleton" style="height: 80px;"></div>
            </div>
            
            <div class="card mt-2">
                <button class="btn btn-secondary" onclick="goBackToRoutes()">
                    ← Volver a Rutas
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('appContent').innerHTML = content;
    loadQueues();
}

async function loadQueues() {
    if (!currentRoute || !routesData[currentRoute]) {
        showToast('No hay datos de la ruta seleccionada', 'error');
        return;
    }
    
    const items = routesData[currentRoute][currentType];
    if (!items || items.length === 0) {
        showToast('No hay items para esta ruta/tipo', 'warning');
        return;
    }
    
    // Agrupar por colas
    const queues = groupByQueue(items);
    displayQueues(queues);
}

function groupByQueue(items) {
    const queues = {};
    
    items.forEach(item => {
        const parts = item.deposito.split('-');
        if (parts.length < 3) return;
        
        const nivel = parts[2].charAt(0);
        let cola;
        
        if (nivel === 'A' || nivel === 'B') cola = 'A+B';
        else if (nivel === 'C' || nivel === 'D' || nivel === 'E') cola = 'CDE';
        else if (nivel === 'F') cola = 'F';
        else return;
        
        if (!queues[cola]) {
            queues[cola] = [];
        }
        
        queues[cola].push(item);
    });
    
    // Ordenar por depósito
    Object.values(queues).forEach(queue => {
        queue.sort((a, b) => a.deposito.localeCompare(b.deposito));
    });
    
    return queues;
}

function displayQueues(queues) {
    const container = document.getElementById('queuesList');
    
    if (!queues || Object.keys(queues).length === 0) {
        container.innerHTML = `
            <div class="card">
                <div class="text-center p-2">
                    <div style="font-size: 48px; margin-bottom: 10px;">📭</div>
                    <h4>No hay colas disponibles</h4>
                    <p style="color: #666; font-size: 14px;">No se pudieron agrupar los depósitos</p>
                </div>
            </div>
        `;
        return;
    }
    
    let html = '';
    const colas = Object.keys(queues).sort();
    
    colas.forEach(cola => {
        const itemsCola = queues[cola];
        const totalUnidades = itemsCola.reduce((sum, item) => sum + item.cantidad, 0);
        
        // Calcular progreso
        let recolectado = 0;
        itemsCola.forEach(item => {
            const key = `${item.deposito}_${item.upc}_${item.indicador}`;
            if (progressData[key]) {
                recolectado += progressData[key].recolectado || 0;
            }
        });
        
        const estado = recolectado === 0 ? 'DISPONIBLE' : 
                      recolectado >= totalUnidades ? 'COMPLETADA' : 'EN PROGRESO';
        
        const clase = recolectado === 0 ? 'available' : 
                     recolectado >= totalUnidades ? 'completed' : 'in-progress';
        
        html += `
            <div class="card mb-1" onclick="selectQueue('${cola}')" style="cursor: pointer;">
                <div class="card-header">
                    <div class="card-title">Cola ${cola}</div>
                    <div class="card-badge ${clase}">${estado}</div>
                </div>
                
                <div style="font-size: 13px; color: #666;">
                    ${itemsCola.length} depósitos • ${totalUnidades} unidades
                </div>
                
                <div class="progress-bar mt-1">
                    <div class="progress-fill" style="width: ${totalUnidades > 0 ? Math.round((recolectado / totalUnidades) * 100) : 0}%"></div>
                </div>
                
                <div class="grid-2 mt-1">
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">RECOLECTADO</small>
                        <div style="font-weight: bold; color: #27ae60;">${recolectado}</div>
                    </div>
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">PENDIENTE</small>
                        <div style="font-weight: bold; color: #f39c12;">${totalUnidades - recolectado}</div>
                    </div>
                </div>
                
                <button class="btn btn-primary mt-1" onclick="event.stopPropagation(); selectQueue('${cola}')">
                    Seleccionar Cola
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function selectQueue(cola) {
    currentQueue = cola;
    showToast(`Cola ${cola} seleccionada`, 'success');
    
    // Navegar a picking
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('.nav-item[data-page="picking"]').classList.add('active');
    navigateTo('picking');
}

function goBackToRoutes() {
    currentRoute = null;
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('.nav-item[data-page="rutas"]').classList.add('active');
    navigateTo('rutas');
}

// ================= PICKING =================
function showPickingPage() {
    if (!currentRoute || !currentQueue) {
        showToast('Primero selecciona una ruta y cola', 'warning');
        
        // Volver a rutas
        document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
        document.querySelector('.nav-item[data-page="rutas"]').classList.add('active');
        navigateTo('rutas');
        return;
    }
    
    // Obtener items de la cola actual
    const items = routesData[currentRoute][currentType];
    deposits = groupByQueue(items)[currentQueue] || [];
    
    if (deposits.length === 0) {
        showToast('No hay depósitos en esta cola', 'warning');
        goBackToRoutes();
        return;
    }
    
    // Iniciar con el primer depósito no completado
    currentDepositIndex = findNextIncompleteDeposit();
    
    const content = `
        <div class="content-section">
            <h3 class="section-title">
                <span>📦</span>
                Picking - ${currentQueue}
            </h3>
            
            <!-- Depósito Actual -->
            <div class="card mb-2" id="currentDepositCard">
                <div class="card-header">
                    <div class="card-title" id="depositCode">-----</div>
                    <div class="card-badge" id="depositProgress">0/0</div>
                </div>
                
                <div id="depositDescription" style="font-size: 14px; color: #666; margin-bottom: 10px;">
                    -----
                </div>
                
                <div class="grid-3 mb-2">
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">TOTAL</small>
                        <div style="font-weight: bold; color: #6600a1;" id="totalQty">0</div>
                    </div>
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">RECOLECTADO</small>
                        <div style="font-weight: bold; color: #27ae60;" id="collectedQty">0</div>
                    </div>
                    <div class="text-center">
                        <small style="color: #666; font-size: 11px;">PENDIENTE</small>
                        <div style="font-weight: bold; color: #f39c12;" id="pendingQty">0</div>
                    </div>
                </div>
                
                <!-- Modo de Escaneo -->
                <div class="tabs-header mb-2">
                    <button class="tab-button active" id="modeUnit" onclick="setScanMode('unit')">
                        🔢 Unitario
                    </button>
                    <button class="tab-button" id="modeBatch" onclick="setScanMode('batch')">
                        📦 Lote
                    </button>
                </div>
                
                <!-- Escáner -->
                <div class="form-group">
                    <input type="text" 
                           id="upcInput" 
                           class="form-input" 
                           placeholder="Escanea código UPC o toca para escanear"
                           autocomplete="off"
                           onfocus="openScanner()">
                </div>
                
                <!-- Botones de Acción -->
                <div class="grid-2">
                    <button class="btn btn-warning" onclick="markNotFound()">
                        No Encontrado
                    </button>
                    <button class="btn btn-success" onclick="nextDeposit()">
                        Siguiente →
                    </button>
                </div>
            </div>
            
            <!-- Lista de Depósitos -->
            <h4 style="font-size: 16px; margin-bottom: 10px; color: #2c3e50;">
                📋 Lista de Depósitos
            </h4>
            
            <div class="list" id="depositsList">
                <!-- Se llena dinámicamente -->
            </div>
            
            <!-- Botones Inferiores -->
            <div class="card mt-2">
                <button class="btn btn-secondary" onclick="goBackToQueues()">
                    ← Volver a Colas
                </button>
                <button class="btn btn-primary mt-1" onclick="syncNow()">
                    🔄 Sincronizar Ahora
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('appContent').innerHTML = content;
    updateCurrentDeposit();
    updateDepositsList();
    
    // Configurar eventos del input
    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        upcInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                processScan(this.value);
                this.value = '';
            }
        });
    }
}

function updateCurrentDeposit() {
    if (currentDepositIndex >= deposits.length) {
        showToast('¡Cola completada!', 'success');
        goBackToQueues();
        return;
    }
    
    const deposit = deposits[currentDepositIndex];
    if (!deposit) {
        showToast('Error: Depósito no encontrado', 'error');
        return;
    }
    
    const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
    const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
    
    const recolectado = progress.recolectado || 0;
    const no_encontrado = progress.no_encontrado || 0;
    const totalLeido = recolectado + no_encontrado;
    const pendiente = Math.max(0, deposit.cantidad - totalLeido);
    
    // Actualizar UI
    document.getElementById('depositCode').textContent = deposit.deposito;
    document.getElementById('depositDescription').textContent = deposit.descripcion;
    document.getElementById('depositProgress').textContent = `${totalLeido}/${deposit.cantidad}`;
    document.getElementById('totalQty').textContent = deposit.cantidad;
    document.getElementById('collectedQty').textContent = totalLeido;
    document.getElementById('pendingQty').textContent = pendiente;
    
    // Actualizar clase de la tarjeta
    const card = document.getElementById('currentDepositCard');
    card.classList.remove('completed', 'not-found');
    
    if (totalLeido >= deposit.cantidad) {
        card.classList.add('completed');
    } else if (no_encontrado > 0) {
        card.classList.add('not-found');
    }
    
    // Actualizar input placeholder según modo
    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        const mode = document.querySelector('.tab-button.active').id === 'modeUnit' ? 'unit' : 'batch';
        upcInput.placeholder = mode === 'unit' 
            ? "Escanea código UPC (1 unidad por escaneo)" 
            : "Escanea código UPC para ingresar cantidad";
    }
}

function updateDepositsList() {
    const container = document.getElementById('depositsList');
    
    if (!deposits || deposits.length === 0) {
        container.innerHTML = '<div class="list-item text-center p-2">No hay depósitos</div>';
        return;
    }
    
    let html = '';
    
    deposits.forEach((deposit, index) => {
        const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
        const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
        const totalLeido = (progress.recolectado || 0) + (progress.no_encontrado || 0);
        const completado = totalLeido >= deposit.cantidad;
        
        let clase = 'list-item';
        if (index === currentDepositIndex) clase += ' current';
        if (completado) clase += ' completed';
        if (progress.no_encontrado > 0) clase += ' not-found';
        
        html += `
            <div class="${clase}" onclick="selectDeposit(${index})">
                <div class="list-item-icon">
                    ${index + 1}
                </div>
                <div class="list-item-content">
                    <div class="list-item-title">${deposit.deposito}</div>
                    <div class="list-item-subtitle">${deposit.descripcion.substring(0, 30)}...</div>
                </div>
                <div class="list-item-badge ${completado ? 'badge-success' : 'badge-warning'}">
                    ${totalLeido}/${deposit.cantidad}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function selectDeposit(index) {
    currentDepositIndex = index;
    updateCurrentDeposit();
    updateDepositsList();
}

function findNextIncompleteDeposit() {
    for (let i = 0; i < deposits.length; i++) {
        const deposit = deposits[i];
        const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
        const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
        const totalLeido = (progress.recolectado || 0) + (progress.no_encontrado || 0);
        
        if (totalLeido < deposit.cantidad) {
            return i;
        }
    }
    return 0;
}

// ================= ESCANEO =================
function setScanMode(mode) {
    const unitBtn = document.getElementById('modeUnit');
    const batchBtn = document.getElementById('modeBatch');
    
    unitBtn.classList.remove('active');
    batchBtn.classList.remove('active');
    
    if (mode === 'unit') {
        unitBtn.classList.add('active');
    } else {
        batchBtn.classList.add('active');
    }
    
    updateCurrentDeposit();
}

function openScanner() {
    document.getElementById('scannerModal').style.display = 'flex';
    document.getElementById('manualUPC').focus();
    scannerActive = true;
}

function closeScanner() {
    document.getElementById('scannerModal').style.display = 'none';
    scannerActive = false;
    
    // Enfocar input principal
    const upcInput = document.getElementById('upcInput');
    if (upcInput) upcInput.focus();
}

function processScan(upc) {
    if (!upc || upc.trim().length < 7) {
        showToast('Código UPC inválido', 'error');
        return;
    }
    
    const deposit = deposits[currentDepositIndex];
    if (!deposit) {
        showToast('No hay depósito activo', 'error');
        return;
    }
    
    // Validar UPC
    const scannedUPC = upc.trim();
    const expectedUPC = deposit.upc.toString().trim();
    
    // Normalizar UPC (remover ceros a la izquierda)
    const normalize = (code) => code.replace(/^0+/, '');
    
    if (normalize(scannedUPC) !== normalize(expectedUPC)) {
        showToast(`UPC incorrecto. Esperado: ${expectedUPC}`, 'error');
        playErrorSound();
        return;
    }
    
    // Determinar modo
    const mode = document.querySelector('.tab-button.active').id === 'modeUnit' ? 'unit' : 'batch';
    
    if (mode === 'unit') {
        processUnitScan(deposit);
    } else {
        showQuantityModal(deposit);
    }
    
    // Limpiar input
    const upcInput = document.getElementById('upcInput');
    if (upcInput) upcInput.value = '';
    
    // Cerrar scanner si está abierto
    if (scannerActive) {
        closeScanner();
    }
}

function processUnitScan(deposit) {
    const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
    const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
    
    const nuevoRecolectado = (progress.recolectado || 0) + 1;
    const total = nuevoRecolectado + (progress.no_encontrado || 0);
    
    // Validar que no exceda la cantidad
    if (total > deposit.cantidad) {
        showToast('Cantidad excedida', 'warning');
        return;
    }
    
    // Actualizar progreso
    progressData[key] = {
        recolectado: nuevoRecolectado,
        no_encontrado: progress.no_encontrado || 0
    };
    
    // Marcar como cambio pendiente
    pendingChanges[key] = {
        deposito: deposit.deposito,
        upc: deposit.upc,
        indicador: deposit.indicador,
        recolectado: nuevoRecolectado,
        no_encontrado: progress.no_encontrado || 0,
        timestamp: Date.now(),
        usuario: currentUser
    };
    
    // Actualizar UI
    updateCurrentDeposit();
    updateDepositsList();
    
    playSuccessSound();
    showToast('Escaneo registrado', 'success');
    
    // Verificar si está completado
    if (total >= deposit.cantidad) {
        setTimeout(() => nextDeposit(), 1000);
    }
}

function showQuantityModal(deposit) {
    const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
    const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
    
    const recolectado = progress.recolectado || 0;
    const no_encontrado = progress.no_encontrado || 0;
    const totalLeido = recolectado + no_encontrado;
    const pendiente = Math.max(0, deposit.cantidad - totalLeido);
    
    // Actualizar modal
    document.getElementById('modalItemTitle').textContent = deposit.deposito;
    document.getElementById('modalItemBadge').textContent = `${totalLeido}/${deposit.cantidad}`;
    document.getElementById('modalItemInfo').innerHTML = `
        <div><strong>UPC:</strong> ${deposit.upc}</div>
        <div><strong>Descripción:</strong> ${deposit.descripcion}</div>
        <div><strong>Pendiente:</strong> ${pendiente} unidades</div>
    `;
    
    const qtyInput = document.getElementById('quantityInput');
    qtyInput.value = pendiente > 0 ? pendiente : 1;
    qtyInput.max = pendiente;
    
    // Mostrar modal
    document.getElementById('quantityModal').style.display = 'flex';
    qtyInput.focus();
    qtyInput.select();
}

function closeQuantityModal() {
    document.getElementById('quantityModal').style.display = 'none';
}

function adjustQuantity(amount) {
    const input = document.getElementById('quantityInput');
    const current = parseInt(input.value) || 0;
    const max = parseInt(input.max) || 0;
    
    let newValue = current + amount;
    if (newValue < 1) newValue = 1;
    if (newValue > max) newValue = max;
    
    input.value = newValue;
}

function confirmQuantity() {
    const input = document.getElementById('quantityInput');
    const cantidad = parseInt(input.value) || 0;
    
    if (cantidad < 1) {
        showToast('Cantidad inválida', 'error');
        return;
    }
    
    const deposit = deposits[currentDepositIndex];
    const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
    const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
    
    const nuevoRecolectado = (progress.recolectado || 0) + cantidad;
    const total = nuevoRecolectado + (progress.no_encontrado || 0);
    
    // Validar que no exceda la cantidad
    if (total > deposit.cantidad) {
        showToast(`Máximo permitido: ${deposit.cantidad - (progress.no_encontrado || 0)}`, 'warning');
        return;
    }
    
    // Actualizar progreso
    progressData[key] = {
        recolectado: nuevoRecolectado,
        no_encontrado: progress.no_encontrado || 0
    };
    
    // Marcar como cambio pendiente
    pendingChanges[key] = {
        deposito: deposit.deposito,
        upc: deposit.upc,
        indicador: deposit.indicador,
        recolectado: nuevoRecolectado,
        no_encontrado: progress.no_encontrado || 0,
        timestamp: Date.now(),
        usuario: currentUser
    };
    
    // Cerrar modal
    closeQuantityModal();
    
    // Actualizar UI
    updateCurrentDeposit();
    updateDepositsList();
    
    playSuccessSound();
    showToast(`${cantidad} unidades registradas`, 'success');
    
    // Verificar si está completado
    if (total >= deposit.cantidad) {
        setTimeout(() => nextDeposit(), 1000);
    }
}

function markNotFound() {
    const deposit = deposits[currentDepositIndex];
    if (!deposit) return;
    
    const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
    const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
    
    const recolectado = progress.recolectado || 0;
    const pendiente = Math.max(0, deposit.cantidad - recolectado);
    
    if (pendiente <= 0) {
        showToast('Este depósito ya está completado', 'warning');
        return;
    }
    
    if (confirm(`¿Marcar ${pendiente} unidad(es) como NO ENCONTRADA(S) en ${deposit.deposito}?`)) {
        // Actualizar progreso
        progressData[key] = {
            recolectado: recolectado,
            no_encontrado: pendiente
        };
        
        // Marcar como cambio pendiente
        pendingChanges[key] = {
            deposito: deposit.deposito,
            upc: deposit.upc,
            indicador: deposit.indicador,
            recolectado: recolectado,
            no_encontrado: pendiente,
            timestamp: Date.now(),
            usuario: currentUser
        };
        
        // Actualizar UI
        updateCurrentDeposit();
        updateDepositsList();
        
        showToast(`${pendiente} unidad(es) marcadas como no encontradas`, 'warning');
        
        // Ir al siguiente depósito
        setTimeout(() => nextDeposit(), 1000);
    }
}

function nextDeposit() {
    // Buscar siguiente depósito no completado
    for (let i = currentDepositIndex + 1; i < deposits.length; i++) {
        const deposit = deposits[i];
        const key = `${deposit.deposito}_${deposit.upc}_${deposit.indicador}`;
        const progress = progressData[key] || { recolectado: 0, no_encontrado: 0 };
        const totalLeido = (progress.recolectado || 0) + (progress.no_encontrado || 0);
        
        if (totalLeido < deposit.cantidad) {
            currentDepositIndex = i;
            updateCurrentDeposit();
            updateDepositsList();
            return;
        }
    }
    
    // Si todos están completados
    showToast('¡Todos los depósitos están completados!', 'success');
    
    // Opcional: preguntar si terminar cola
    if (confirm('¿Finalizar esta cola y volver a la lista de colas?')) {
        goBackToQueues();
    }
}

function goBackToQueues() {
    // Verificar si hay cambios pendientes
    if (Object.keys(pendingChanges).length > 0) {
        if (confirm('Tienes cambios sin sincronizar. ¿Sincronizar ahora?')) {
            syncNow();
        }
    }
    
    currentQueue = null;
    deposits = [];
    currentDepositIndex = 0;
    
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    document.querySelector('.nav-item[data-page="colas"]').classList.add('active');
    navigateTo('colas');
}

// ================= CONFIG =================
function showConfigPage() {
    const content = `
        <div class="content-section">
            <h3 class="section-title">
                <span>⚙️</span>
                Configuración
            </h3>
            
            <div class="card mb-2">
                <div class="card-header">
                    <div class="card-title">Usuario</div>
                </div>
                <div style="padding: 10px;">
                    <div><strong>Nombre:</strong> ${currentUser}</div>
                    <div><strong>Estado:</strong> ${isOnline ? '🟢 Online' : '🔴 Offline'}</div>
                </div>
            </div>
            
            <div class="card mb-2">
                <div class="card-header">
                    <div class="card-title">Sistema</div>
                </div>
                <div style="padding: 10px;">
                    <div><strong>Versión:</strong> ${CONFIG.version}</div>
                    <div><strong>Ruta actual:</strong> ${currentRoute || 'Ninguna'}</div>
                    <div><strong>Cola actual:</strong> ${currentQueue || 'Ninguna'}</div>
                    <div><strong>Cambios pendientes:</strong> ${Object.keys(pendingChanges).length}</div>
                </div>
            </div>
            
            <div class="card mb-2">
                <div class="card-header">
                    <div class="card-title">Acciones</div>
                </div>
                <div style="padding: 10px;">
                    <button class="btn btn-primary mb-1" onclick="syncNow()" style="width: 100%;">
                        🔄 Sincronizar Cambios (${Object.keys(pendingChanges).length})
                    </button>
                    <button class="btn btn-secondary mb-1" onclick="clearCache()" style="width: 100%;">
                        🧹 Limpiar Caché
                    </button>
                    <button class="btn btn-warning" onclick="testScanner()" style="width: 100%;">
                        📷 Probar Escáner
                    </button>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Información</div>
                </div>
                <div style="padding: 10px; font-size: 12px; color: #666;">
                    <p>Este es el sistema de recolección móvil de SOKSO.</p>
                    <p>Desarrollado para operaciones en almacén.</p>
                    <p>Fecha: ${getTodayDate()}</p>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('appContent').innerHTML = content;
}

// ================= SINCRONIZACIÓN =================
async function syncNow() {
    if (Object.keys(pendingChanges).length === 0) {
        showToast('No hay cambios pendientes', 'info');
        return;
    }
    
    if (!isOnline) {
        showToast('Sin conexión para sincronizar', 'warning');
        return;
    }
    
    showLoading('Sincronizando...');
    
    try {
        const changes = Object.values(pendingChanges);
        let successCount = 0;
        
        for (const change of changes) {
            try {
                const key = `${getTodayDate()}_${change.usuario}_${change.deposito}_${change.upc}_${Date.now()}`;
                const safeKey = key.replace(/\//g, '_').replace(/:/g, '_');
                
                const record = {
                    usuario: change.usuario,
                    ruta: currentRoute,
                    cola: currentQueue,
                    deposito: change.deposito,
                    upc: change.upc,
                    indicador: change.indicador,
                    cantidad_recolectada: change.recolectado,
                    no_encontrados: change.no_encontrado,
                    fecha: getTodayDate(),
                    hora: new Date().toLocaleTimeString(),
                    timestamp: Date.now(),
                    tipoRecoleccion: currentType
                };
                
                await database.ref(`recolecciones/${safeKey}`).set(record);
                successCount++;
                
                // Eliminar del pendiente
                const changeKey = `${change.deposito}_${change.upc}_${change.indicador}`;
                delete pendingChanges[changeKey];
                
            } catch (error) {
                console.error('Error sincronizando cambio:', error);
            }
        }
        
        showToast(`${successCount} cambios sincronizados`, 'success');
        
        // Actualizar cache de progreso
        await loadProgress();
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
        showToast('Error al sincronizar', 'error');
    } finally {
        hideLoading();
    }
}

async function loadProgress() {
    try {
        const today = getTodayDate();
        const snapshot = await database.ref('recolecciones')
            .orderByChild('fecha')
            .equalTo(today)
            .once('value');
        
        const data = snapshot.val() || {};
        progressData = {};
        
        Object.values(data).forEach(record => {
            const key = `${record.deposito}_${record.upc}_${record.indicador}`;
            
            if (!progressData[key]) {
                progressData[key] = {
                    recolectado: 0,
                    no_encontrado: 0
                };
            }
            
            progressData[key].recolectado += (record.cantidad_recolectada || 0);
            progressData[key].no_encontrado += (record.no_encontrados || 0);
        });
        
        console.log('📊 Progreso cargado:', Object.keys(progressData).length, 'registros');
        
    } catch (error) {
        console.error('Error cargando progreso:', error);
    }
}

// ================= DATOS INICIALES =================
async function loadInitialData() {
    showLoading('Cargando datos...');
    
    try {
        // Cargar progreso
        await loadProgress();
        
        // Cargar rutas si hay cache
        if (cache.routes.isValid) {
            processRoutesData(cache.routes.data);
        }
        
    } catch (error) {
        console.error('Error cargando datos iniciales:', error);
    } finally {
        hideLoading();
    }
}

// ================= UTILIDADES =================
function getTodayDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}/${month}/${year}`;
}

function showLoading(message = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');
    
    if (overlay && text) {
        text.textContent = message;
        overlay.style.display = 'flex';
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${getToastIcon(type)}</span>
        <span style="flex: 1;">${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove después de 4 segundos
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function getToastIcon(type) {
    switch(type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        default: return 'ℹ️';
    }
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        // Silenciar en caso de error
    }
}

function playErrorSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 400;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
        // Silenciar en caso de error
    }
}

function setupEvents() {
    // Evento beforeunload para prevenir pérdida de datos
    window.addEventListener('beforeunload', function(e) {
        if (Object.keys(pendingChanges).length > 0) {
            e.preventDefault();
            e.returnValue = 'Tienes cambios sin sincronizar. ¿Seguro que quieres salir?';
            return e.returnValue;
        }
    });
    
    // Eventos de teclado
    document.addEventListener('keydown', function(e) {
        // Escape para cerrar modales
        if (e.key === 'Escape') {
            if (document.getElementById('scannerModal').style.display === 'flex') {
                closeScanner();
            }
            if (document.getElementById('quantityModal').style.display === 'flex') {
                closeQuantityModal();
            }
        }
        
        // Enter en scanner manual
        if (e.key === 'Enter' && document.getElementById('scannerModal').style.display === 'flex') {
            const manualUPC = document.getElementById('manualUPC').value;
            if (manualUPC && manualUPC.length >= 7) {
                processScan(manualUPC);
                document.getElementById('manualUPC').value = '';
            }
        }
    });
    
    // Eventos táctiles
    setupTouchEvents();
}

function setupTouchEvents() {
    let touchStartX = 0;
    
    document.addEventListener('touchstart', function(e) {
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        const touchEndX = e.changedTouches[0].clientX;
        const deltaX = touchEndX - touchStartX;
        
        // Swipe horizontal (mínimo 50px)
        if (Math.abs(deltaX) > 50) {
            const currentPage = document.querySelector('.nav-item.active').dataset.page;
            const pages = ['rutas', 'colas', 'picking', 'config'];
            const currentIndex = pages.indexOf(currentPage);
            
            if (deltaX > 0) {
                // Swipe derecha -> página anterior
                const prevIndex = (currentIndex - 1 + pages.length) % pages.length;
                document.querySelector(`.nav-item[data-page="${pages[prevIndex]}"]`).click();
            } else {
                // Swipe izquierda -> página siguiente
                const nextIndex = (currentIndex + 1) % pages.length;
                document.querySelector(`.nav-item[data-page="${pages[nextIndex]}"]`).click();
            }
        }
    }, { passive: true });
}

// ================= FUNCIONES DE CONFIG =================
function clearCache() {
    cache.routes.clear();
    cache.progress = {};
    cache.queues = {};
    
    showToast('Caché limpiado', 'success');
    
    // Recargar rutas
    if (document.querySelector('.nav-item.active').dataset.page === 'rutas') {
        loadRoutes();
    }
}

function testScanner() {
    openScanner();
    showToast('Modo escáner activado. Usa la cámara o ingresa manualmente.', 'info');
}

// ================= FUNCIONES GLOBALES =================
window.volverAlMenu = volverAlMenu;
window.changeType = changeType;
window.selectRoute = selectRoute;
window.selectQueue = selectQueue;
window.goBackToRoutes = goBackToRoutes;
window.goBackToQueues = goBackToQueues;
window.setScanMode = setScanMode;
window.openScanner = openScanner;
window.closeScanner = closeScanner;
window.processScan = processScan;
window.markNotFound = markNotFound;
window.nextDeposit = nextDeposit;
window.selectDeposit = selectDeposit;
window.adjustQuantity = adjustQuantity;
window.confirmQuantity = confirmQuantity;
window.closeQuantityModal = closeQuantityModal;
window.syncNow = syncNow;
window.clearCache = clearCache;
window.testScanner = testScanner;

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('✅ Sistema listo');
    });
}