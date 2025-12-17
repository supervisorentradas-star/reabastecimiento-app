// ================= CONFIGURACIÓN FIREBASE =================
const firebaseConfig = {
    apiKey: "AIzaSyAl6wzWg_opgBrZ4fe0golJ-fe-civk7RE",
    authDomain: "reabastecimiento-d71a1.firebaseapp.com",
    databaseURL: "https://reabastecimiento-d71a1-default-rtdb.firebaseio.com",
    projectId: "reabastecimiento-d71a1",
    storageBucket: "reabastecimiento-d71a1.firebasestorage.app",
    messagingSenderId: "107012533068",
    appId: "1:107012533068:web:3576d5e3a18a42dcaefde9"
};

// ================= INICIALIZAR FIREBASE =================
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ================= VARIABLES GLOBALES =================
let cacheRutas = null;
let cacheProgresos = {};
let cacheColasEnUso = {};
let cacheTimestamp = 0;
const CACHE_DURATION = 30000;
let rutaActual = null;
let usuarioActual = null;
let colaActual = null;
let tipoRecoleccionActual = 'REGULAR';
let itemsPorCola = {};
let depositosActuales = [];
let depositoActualIndex = 0;
const TIMEOUT_MINUTOS = 15 * 60 * 1000;
let procesandoEscaneo = false;

// ✅ VARIABLES PARA SISTEMA DUAL DE ESCANEO
let modoEscaneo = 'unitario'; // 'unitario' o 'lote'
let upcEscaneadoModoLote = '';
let procesandoModoLote = false;

// ✅ ALMACENAMIENTO TEMPORAL EN MEMORIA
let progresoTemporal = {};
let cambiosPendientes = {};
let fechaSistema = '';

// ✅ CONTROL DE TRANSFERENCIAS
let transferenciasRealizadas = [];
let numeroTransferencia = 1;

// ✅ BLOQUEO DE NAVEGACIÓN
let navegacionBloqueada = false;

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', function() {
    inicializarAplicacion();
});

async function inicializarAplicacion() {
    try {
        usuarioActual = localStorage.getItem('usuarioSokso');
        if (!usuarioActual) {
            window.location.href = 'index.html';
            return;
        }

        document.getElementById('userDisplayV1').textContent = `Usuario: ${usuarioActual}`;
        
        establecerFechaActual();
        
        // ✅ LIMPIAR DATOS DE DÍAS ANTERIORES AL INICIAR
        await limpiarDatosDiasAnteriores();
        
        await cargarProgresosTemporales();
        
        inicializarFirebase();
        configurarEventListeners();
        
        await cargarRutasDesdeFirebase();
        
    } catch (error) {
        console.error('Error en inicialización:', error);
        mostrarMensaje('Error al inicializar: ' + error.message, false);
    }
}

// ✅ ESTABLECER FECHA ACTUAL DEL SISTEMA
function establecerFechaActual() {
    const fecha = new Date();
    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const anio = fecha.getFullYear();
    fechaSistema = `${dia}/${mes}/${anio}`;
    
    document.getElementById('fechaActual').textContent = fechaSistema;
}

// ✅ LIMPIAR DATOS DE DÍAS ANTERIORES
async function limpiarDatosDiasAnteriores() {
    try {
        console.log('🧹 Verificando datos de días anteriores...');
        
        const ultimaFecha = localStorage.getItem('ultimaFechaEjecucion');
        
        if (ultimaFecha && ultimaFecha !== fechaSistema) {
            console.log('🗑️ Limpiando datos de fecha anterior:', ultimaFecha);
            
            localStorage.removeItem(`progresoTemporal_${usuarioActual}`);
            localStorage.removeItem(`cambiosPendientes_${usuarioActual}`);
            localStorage.removeItem(`numeroTransferencia_${usuarioActual}`);
            
            progresoTemporal = {};
            cambiosPendientes = {};
            cacheProgresos = {};
            numeroTransferencia = 1;
            
            mostrarMensaje('✅ Sistema reiniciado para nueva fecha', true);
        }
        
        localStorage.setItem('ultimaFechaEjecucion', fechaSistema);
        
    } catch (error) {
        console.error('Error limpiando datos anteriores:', error);
    }
}

// ✅ VALIDAR FECHA DE REGISTRO vs FECHA DEL SISTEMA
function validarFechaRegistro(registro) {
    const fechaRegistro = registro.fecha || registro.FECHA || '';
    
    if (!fechaRegistro) {
        console.warn('⚠️ Registro sin fecha:', registro);
        return false;
    }
    
    if (fechaRegistro !== fechaSistema) {
        console.warn(`❌ Fecha no coincide: Sistema=${fechaSistema}, Registro=${fechaRegistro}`);
        
        if (fechaRegistro !== fechaSistema) {
            console.error(`🚨 INCONSISTENCIA DE FECHAS - Reportar a James Jimenez`);
            console.error(`Sistema: ${fechaSistema} | Firebase: ${fechaRegistro}`);
            
            if (!localStorage.getItem('alertaFechaMostrada')) {
                mostrarMensaje(`🚨 INCONSISTENCIA: Datos de fecha ${fechaRegistro} en sistema. Reportar a James Jimenez.`, false);
                localStorage.setItem('alertaFechaMostrada', 'true');
                
                setTimeout(() => {
                    localStorage.removeItem('alertaFechaMostrada');
                }, 10000);
            }
        }
        return false;
    }
    
    return true;
}

// ✅ CARGAR PROGRESOS TEMPORALES DESDE localStorage (SOLO FECHA ACTUAL)
async function cargarProgresosTemporales() {
    try {
        const progresosGuardados = localStorage.getItem(`progresoTemporal_${usuarioActual}`);
        if (progresosGuardados) {
            const todosLosProgresos = JSON.parse(progresosGuardados);
            
            progresoTemporal = {};
            for (const key in todosLosProgresos) {
                if (todosLosProgresos[key].fecha === fechaSistema) {
                    progresoTemporal[key] = todosLosProgresos[key];
                }
            }
            console.log('📥 Progresos temporales cargados:', Object.keys(progresoTemporal).length);
        }
        
        const cambiosGuardados = localStorage.getItem(`cambiosPendientes_${usuarioActual}`);
        if (cambiosGuardados) {
            const todosLosCambios = JSON.parse(cambiosGuardados);
            
            cambiosPendientes = {};
            for (const key in todosLosCambios) {
                if (todosLosCambios[key].fechaSistema === fechaSistema) {
                    cambiosPendientes[key] = todosLosCambios[key];
                }
            }
            console.log('📥 Cambios pendientes cargados:', Object.keys(cambiosPendientes).length);
        }

        const transferenciaGuardada = localStorage.getItem(`numeroTransferencia_${usuarioActual}`);
        if (transferenciaGuardada) {
            const transferenciaData = JSON.parse(transferenciaGuardada);
            if (transferenciaData.fecha === fechaSistema) {
                numeroTransferencia = transferenciaData.numero;
            }
        }
        
    } catch (error) {
        console.error('Error cargando progresos temporales:', error);
        progresoTemporal = {};
        cambiosPendientes = {};
        numeroTransferencia = 1;
    }
}

// ✅ GUARDAR PROGRESOS TEMPORALES EN localStorage
function guardarProgresosTemporales() {
    try {
        for (const key in progresoTemporal) {
            if (!progresoTemporal[key].fecha) {
                progresoTemporal[key].fecha = fechaSistema;
            }
        }
        
        for (const key in cambiosPendientes) {
            if (!cambiosPendientes[key].fechaSistema) {
                cambiosPendientes[key].fechaSistema = fechaSistema;
            }
        }
        
        localStorage.setItem(`progresoTemporal_${usuarioActual}`, JSON.stringify(progresoTemporal));
        localStorage.setItem(`cambiosPendientes_${usuarioActual}`, JSON.stringify(cambiosPendientes));
        localStorage.setItem(`numeroTransferencia_${usuarioActual}`, JSON.stringify({
            numero: numeroTransferencia,
            fecha: fechaSistema
        }));
    } catch (error) {
        console.error('Error guardando progresos temporales:', error);
    }
}

// ✅ OBTENER PROGRESO ACTUAL (MEMORIA + FIREBASE) - SOLO FECHA ACTUAL
function obtenerProgresoActual(deposito, upc, indicador) {
    // ✅ CORRECCIÓN CLAVE: Incluir indicador para evitar mezclas
    const key = `${deposito}_${upc}_${indicador}`;
    
    if (progresoTemporal[key] && progresoTemporal[key].fecha === fechaSistema) {
        return progresoTemporal[key];
    }
    
    if (cacheProgresos[key] && cacheProgresos[key].fecha === fechaSistema) {
        return cacheProgresos[key];
    }
    
    return { recolectado: 0, no_encontrado: 0, fecha: fechaSistema };
}

// ✅ ACTUALIZAR PROGRESO TEMPORAL CON VALIDACIÓN ESTRICTA
function actualizarProgresoTemporal(deposito, upc, indicador, recolectado, no_encontrado = 0) {
    // ✅ CORRECCIÓN CLAVE: Incluir indicador para evitar mezclas
    const key = `${deposito}_${upc}_${indicador}`;
    
    // Buscar el item original para validar
    let itemOriginal = null;
    if (depositosActuales.length > 0) {
        itemOriginal = depositosActuales.find(item => 
            item.deposito === deposito && item.upc === upc && item.indicador === indicador
        );
    }
    
    // Validación estricta: no puede exceder cantidad planificada
    if (itemOriginal) {
        const total = recolectado + no_encontrado;
        if (total > itemOriginal.cantidad) {
            console.error(`❌ Error: Total ${total} excede cantidad planificada ${itemOriginal.cantidad}`);
            throw new Error(`No se puede exceder la cantidad planificada (${itemOriginal.cantidad})`);
        }
    }
    
    if (!progresoTemporal[key]) {
        progresoTemporal[key] = { 
            recolectado: 0, 
            no_encontrado: 0,
            fecha: fechaSistema,
            indicador: indicador // ✅ Guardar indicador en el progreso
        };
    }
    
    progresoTemporal[key].recolectado = recolectado;
    progresoTemporal[key].no_encontrado = no_encontrado;
    progresoTemporal[key].fecha = fechaSistema;
    
    cambiosPendientes[key] = {
        deposito: deposito,
        upc: upc,
        indicador: indicador, // ✅ Guardar indicador
        recolectado: recolectado,
        no_encontrado: no_encontrado,
        timestamp: Date.now(),
        fechaSistema: fechaSistema
    };
    
    guardarProgresosTemporales();
    return true;
}

// ✅ SINCRONIZAR CAMBIOS PENDIENTES CON FIREBASE
async function sincronizarCambiosPendientes() {
    if (Object.keys(cambiosPendientes).length === 0) {
        return;
    }
    
    console.log('🔄 Sincronizando cambios pendientes con Firebase...');
    
    try {
        const cambiosParaSincronizar = { ...cambiosPendientes };
        
        for (const key in cambiosParaSincronizar) {
            const cambio = cambiosParaSincronizar[key];
            
            if (cambio.fechaSistema !== fechaSistema) {
                console.warn(`⚠️ Cambio de fecha diferente omitido: ${cambio.fechaSistema} vs ${fechaSistema}`);
                continue;
            }
            
            await guardarProgresoFirebase(
                cambio.deposito,
                cambio.upc,
                cambio.indicador, // ✅ Pasar indicador
                cambio.recolectado,
                cambio.no_encontrado
            );
            
            // Actualizar cache
            cacheProgresos[key] = {
                recolectado: cambio.recolectado,
                no_encontrado: cambio.no_encontrado,
                fecha: fechaSistema,
                indicador: cambio.indicador
            };
            
            console.log(`✅ Sincronizado: ${key} - ${cambio.recolectado} unidades (${cambio.indicador})`);
        }
        
        // Limpiar solo los sincronizados
        for (const key in cambiosParaSincronizar) {
            delete cambiosPendientes[key];
        }
        
        guardarProgresosTemporales();
        
        console.log('✅ Todos los cambios sincronizados con Firebase');
        
    } catch (error) {
        console.error('❌ Error sincronizando cambios:', error);
        throw error;
    }
}

function inicializarFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        const isConnected = snap.val() === true;
        ['connectionIndicatorV1', 'connectionIndicatorV2', 'connectionIndicatorV3'].forEach(id => {
            const indicator = document.getElementById(id);
            if (indicator) {
                indicator.className = isConnected ? 'connection-indicator' : 'connection-indicator connection-disconnected';
            }
        });
        
        if (isConnected && Object.keys(cambiosPendientes).length > 0) {
            console.log('🌐 Conexión restaurada, sincronizando cambios...');
            sincronizarCambiosPendientes().catch(error => {
                console.error('Error en sincronización automática:', error);
            });
        }
    });
}

// ✅ CONFIGURACIÓN DE EVENT LISTENERS
function configurarEventListeners() {
    document.querySelectorAll('.tipo-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.tipo-button').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            tipoRecoleccionActual = this.getAttribute('data-tipo');
            document.getElementById('tipoActual').textContent = tipoRecoleccionActual;
            if (rutaActual) cargarColasParaRuta(rutaActual);
        });
    });

    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        upcInput.addEventListener('input', function(e) {
            const upc = e.target.value.trim();
            
            if (upc.length >= 7 && !procesandoEscaneo && !procesandoModoLote) {
                console.log('🔍 Código UPC escaneado:', upc);
                procesarEscaneoUPC(upc);
                e.target.value = '';
            }
        });
        
        // También escuchar tecla Enter para confirmar en modo lote
        upcInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const upc = e.target.value.trim();
                if (upc.length >= 7 && !procesandoEscaneo && !procesandoModoLote) {
                    console.log('🔍 Código UPC escaneado (Enter):', upc);
                    procesarEscaneoUPC(upc);
                    e.target.value = '';
                }
            }
        });
    }
    
    // Event listener para el input de cantidad manual
    const cantidadManualInput = document.getElementById('cantidadManualInput');
    if (cantidadManualInput) {
        cantidadManualInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                confirmarCantidadManual();
            }
        });
    }
}

// ================= VENTANA 1: RUTAS =================
async function cargarRutasDesdeFirebase() {
    try {
        mostrarMensaje('📥 Cargando datos...', true);
        
        const snapshot = await database.ref('recoleccion_rutas').once('value');
        const datos = snapshot.val();
        
        if (!datos) {
            console.log('📭 Firebase vacío - no hay datos de recolección');
            window.rutasData = {};
            mostrarOpcionesRutas();
            mostrarMensaje('📭 No hay datos en Firebase para hoy', false);
            return;
        }
        
        cacheRutas = datos;
        cacheTimestamp = Date.now();
        
        await procesarDatosFirebase(datos);
        mostrarOpcionesRutas();
        
    } catch (error) {
        console.error('Error cargando rutas:', error);
        mostrarMensaje('Error: ' + error.message, false);
    }
}

async function procesarDatosFirebase(datosFirebase) {
    const rutasData = {};
    let totalUnidades = 0;
    let registrosProcesados = 0;
    let registrosOmitidos = 0;

    const datosArray = Array.isArray(datosFirebase) ? datosFirebase : Object.values(datosFirebase);
    
    // ✅ CORRECCIÓN: Estructura mejorada para agrupar por ruta y luego por indicador
    datosArray.forEach(registro => {
        try {
            if (!validarFechaRegistro(registro)) {
                registrosOmitidos++;
                return;
            }

            const deposito = registro.DEPOSITO || registro.deposito || '';
            const upc = registro['CODIGO UPC'] || registro.upc || registro.UPC || '';
            const descripcion = registro.ARTICULO || registro.articulo || registro.DESCRIPCION || registro.descripcion || 'Artículo no especificado';
            const indicador = registro.INDICADOR || registro.indicador || 'REGULAR';
            
            let cantidad = 0;
            const cantidadRaw = registro.CANTIDAD || registro.cantidad;
            if (typeof cantidadRaw === 'number') {
                cantidad = Math.floor(cantidadRaw);
            } else if (typeof cantidadRaw === 'string') {
                cantidad = Math.floor(parseFloat(cantidadRaw)) || 0;
            }

            if (!deposito || !upc || cantidad <= 0) {
                registrosOmitidos++;
                return;
            }

            const rutaMatch = deposito.match(/^([A-Z]\d+)/);
            const ruta = rutaMatch ? rutaMatch[1] : 'SIN_RUTA';

            // ✅ CORRECCIÓN CRÍTICA: Crear estructura por ruta y por indicador
            if (!rutasData[ruta]) {
                rutasData[ruta] = {
                    REGULAR: [],
                    BACKORDER: [],
                    CYBER: [],
                    _totales: { REGULAR: 0, BACKORDER: 0, CYBER: 0 }
                };
            }

            const item = {
                deposito: deposito,
                upc: upc.toString(),
                descripcion: descripcion,
                cantidad: cantidad,
                recolectado: 0,
                no_encontrado: 0,
                completado: false,
                indicador: indicador,
                deposito_destino: registro.deposito_destino || '',
                cola_reposicion: registro.cola_reposicion || '',
                fecha: registro.fecha || registro.FECHA || fechaSistema,
                ruta: ruta
            };

            // ✅ Agregar al indicador correspondiente
            if (rutasData[ruta][indicador]) {
                rutasData[ruta][indicador].push(item);
                rutasData[ruta]._totales[indicador] += cantidad;
                totalUnidades += cantidad;
                registrosProcesados++;
            } else {
                console.warn(`⚠️ Indicador desconocido: ${indicador}`);
                registrosOmitidos++;
            }

        } catch (error) {
            console.warn('Registro inválido omitido:', error, registro);
            registrosOmitidos++;
        }
    });

    console.log(`📊 Procesamiento completado: ${registrosProcesados} registros procesados, ${registrosOmitidos} omitidos`);
    
    if (registrosProcesados === 0) {
        mostrarMensaje('❌ No hay datos para la fecha actual. Verificar con James Jimenez.', false);
    }

    window.rutasData = rutasData;
    document.getElementById('totalUnidades').textContent = totalUnidades;
    document.getElementById('tipoActual').textContent = tipoRecoleccionActual;
}

async function mostrarOpcionesRutas() {
    const container = document.getElementById('rutasGrid');
    
    if (!window.rutasData || Object.keys(window.rutasData).length === 0) {
        container.innerHTML = '<div class="loading">No hay rutas disponibles para hoy</div>';
        document.getElementById('totalUnidades').textContent = '0';
        return;
    }

    container.innerHTML = '';
    const rutas = Object.keys(window.rutasData).sort();
    
    if (rutas.length === 0) {
        container.innerHTML = '<div class="loading">No hay rutas disponibles para hoy</div>';
        return;
    }

    for (const ruta of rutas) {
        // ✅ Calcular progreso por ruta considerando solo el tipo actual
        const itemsRuta = window.rutasData[ruta][tipoRecoleccionActual] || [];
        const totalUnidadesRuta = window.rutasData[ruta]._totales[tipoRecoleccionActual] || 0;
        
        const progreso = await calcularProgresoRuta(ruta, tipoRecoleccionActual);
        const recolectado = Math.min(progreso.recolectado, totalUnidadesRuta);
        
        const button = document.createElement('button');
        button.className = 'ruta-button';
        button.innerHTML = `${ruta}<br>${recolectado}/${totalUnidadesRuta}<br><small>${tipoRecoleccionActual}</small>`;
        button.onclick = () => seleccionarRuta(ruta);
        
        container.appendChild(button);
    }
}

// ================= CONSULTAS OPTIMIZADAS =================
async function cargarTodosLosProgresos() {
    try {
        console.log('🔄 Cargando todos los progresos...');
        const snapshot = await database.ref('recolecciones').once('value');
        const todosLosProgresos = snapshot.val() || {};
        
        const nuevosCache = {};
        
        Object.values(todosLosProgresos).forEach(registro => {
            if (registro.fechaSistema === fechaSistema) {
                // ✅ CORRECCIÓN: Incluir indicador en la clave del cache
                const key = `${registro.deposito}_${registro.upc}_${registro.indicador || registro.tipoRecoleccion || 'REGULAR'}`;
                if (!nuevosCache[key]) {
                    nuevosCache[key] = { 
                        recolectado: 0, 
                        no_encontrado: 0,
                        fecha: fechaSistema,
                        indicador: registro.indicador || registro.tipoRecoleccion || 'REGULAR'
                    };
                }
                nuevosCache[key].recolectado += (registro.cantidad_recolectada || 0);
                nuevosCache[key].no_encontrado += (registro.no_encontrados || 0);
            }
        });
        
        cacheProgresos = nuevosCache;
        console.log('✅ Progresos cargados:', Object.keys(cacheProgresos).length, 'registros');
        return cacheProgresos;
    } catch (error) {
        console.error('Error cargando progresos:', error);
        return {};
    }
}

async function cargarColasEnUso() {
    try {
        console.log('🔄 Cargando colas en uso...');
        const snapshot = await database.ref('colasEnUso').once('value');
        cacheColasEnUso = snapshot.val() || {};
        console.log('✅ Colas en uso cargadas:', Object.keys(cacheColasEnUso).length);
        return cacheColasEnUso;
    } catch (error) {
        console.error('Error cargando colas en uso:', error);
        return {};
    }
}

// ✅ CORRECCIÓN: Función para calcular progreso por ruta e indicador
async function calcularProgresoRuta(ruta, indicador) {
    try {
        if (!window.rutasData || !window.rutasData[ruta] || !window.rutasData[ruta][indicador]) {
            return { recolectado: 0 };
        }
        
        if (Object.keys(cacheProgresos).length === 0) {
            await cargarTodosLosProgresos();
        }
        
        let totalRecolectado = 0;
        const itemsRuta = window.rutasData[ruta][indicador] || [];
        
        itemsRuta.forEach(item => {
            const key = `${item.deposito}_${item.upc}_${item.indicador}`;
            const progreso = obtenerProgresoActual(item.deposito, item.upc, item.indicador);
            totalRecolectado += progreso.recolectado;
        });

        return { recolectado: totalRecolectado };
    } catch (error) {
        console.error('Error calculando progreso:', error);
        return { recolectado: 0 };
    }
}

function seleccionarRuta(ruta) {
    if (!window.rutasData || !window.rutasData[ruta]) {
        mostrarMensaje('❌ Ruta no disponible para hoy', false);
        return;
    }
    
    // ✅ Verificar que haya datos para el tipo actual
    if (!window.rutasData[ruta][tipoRecoleccionActual] || window.rutasData[ruta][tipoRecoleccionActual].length === 0) {
        mostrarMensaje(`❌ No hay datos de ${tipoRecoleccionActual} para la ruta ${ruta}`, false);
        return;
    }
    
    rutaActual = ruta;
    document.getElementById('rutaSeleccionadaTitulo').textContent = `RUTA: ${ruta} (${tipoRecoleccionActual})`;
    cargarColasParaRuta(ruta);
    mostrarVentana(2);
}

// ================= VENTANA 2: COLAS =================
async function cargarColasParaRuta(ruta) {
    if (!window.rutasData || !window.rutasData[ruta]) {
        mostrarMensaje('❌ No hay datos para esta ruta', false);
        return;
    }
    
    // ✅ CORRECCIÓN: Obtener solo los items del indicador actual
    const itemsRuta = window.rutasData[ruta][tipoRecoleccionActual] || [];
    
    if (itemsRuta.length === 0) {
        mostrarMensaje(`❌ No hay colas para ${tipoRecoleccionActual} en esta ruta`, false);
        return;
    }
    
    itemsPorCola = agruparPorColas(itemsRuta);
    await mostrarOpcionesColas();
}

function agruparPorColas(items) {
    const colas = {};
    
    items.forEach(item => {
        const partes = item.deposito.split('-');
        if (partes.length < 3) return;
        
        const nivel = partes[2].charAt(0);
        let colaAgrupada;
        
        if (nivel === 'A' || nivel === 'B') colaAgrupada = 'A+B';
        else if (nivel === 'C' || nivel === 'D' || nivel === 'E') colaAgrupada = 'CDE';
        else if (nivel === 'F') colaAgrupada = 'F';
        else return;

        if (!colas[colaAgrupada]) colas[colaAgrupada] = [];
        colas[colaAgrupada].push(item);
    });

    for (const cola in colas) {
        colas[cola].sort((a, b) => a.deposito.localeCompare(b.deposito));
    }
    
    return colas;
}

async function mostrarOpcionesColas() {
    const container = document.getElementById('colasGrid');
    container.innerHTML = '<div class="loading">Cargando colas...</div>';

    await cargarColasEnUso();

    const colas = Object.keys(itemsPorCola).sort();
    
    if (colas.length === 0) {
        container.innerHTML = '<div class="loading">No hay colas para esta ruta/tipo</div>';
        return;
    }

    container.innerHTML = '';
    
    for (const cola of colas) {
        const itemsCola = itemsPorCola[cola];
        const totalUnidades = itemsCola.reduce((sum, item) => sum + item.cantidad, 0);
        
        const estadoCola = await verificarEstadoCola(cola);
        
        const button = document.createElement('button');
        button.className = `cola-button ${estadoCola.clase}`;
        button.innerHTML = `
            COLA: ${cola}<br>
            ${tipoRecoleccionActual}<br>
            ${estadoCola.recolectado}/${totalUnidades}<br>
            <small>${estadoCola.estado}</small>
        `;
        
        if (estadoCola.clase !== 'occupied') {
            button.onclick = () => seleccionarCola(cola);
        } else {
            button.disabled = true;
        }
        
        container.appendChild(button);
    }
}

async function verificarEstadoCola(cola) {
    try {
        const colaEnUso = await verificarColaEnUso(cola);
        if (colaEnUso && colaEnUso.usuario !== usuarioActual) {
            return { 
                clase: 'occupied', 
                estado: `OCUPADA POR ${colaEnUso.usuario}`, 
                recolectado: 0 
            };
        }

        const itemsCola = itemsPorCola[cola];
        let totalRecolectado = 0;
        
        itemsCola.forEach(item => {
            const progreso = obtenerProgresoActual(item.deposito, item.upc, item.indicador);
            totalRecolectado += Math.min(progreso.recolectado, item.cantidad);
        });

        const totalUnidades = itemsCola.reduce((sum, item) => sum + item.cantidad, 0);
        
        if (totalRecolectado >= totalUnidades) {
            return { clase: 'completed', estado: 'COMPLETADA', recolectado: totalRecolectado };
        } else if (totalRecolectado > 0) {
            return { clase: 'in-progress', estado: 'EN PROGRESO', recolectado: totalRecolectado };
        } else {
            return { clase: 'available', estado: 'SIN ASIGNAR', recolectado: totalRecolectado };
        }

    } catch (error) {
        return { clase: 'available', estado: 'SIN ASIGNAR', recolectado: 0 };
    }
}

// ================= GESTIÓN DE COLAS EN USO =================
async function verificarColaEnUso(cola) {
    try {
        const colaKey = `${rutaActual}_${cola}_${tipoRecoleccionActual}`; // ✅ Incluir tipo en la clave
        
        for (const key in cacheColasEnUso) {
            const sesion = cacheColasEnUso[key];
            if (sesion.colaKey === colaKey) {
                if (Date.now() - sesion.timestamp > TIMEOUT_MINUTOS) {
                    await database.ref(`colasEnUso/${key}`).remove();
                    delete cacheColasEnUso[key];
                    return null;
                }
                return sesion;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error verificando cola:', error);
        return null;
    }
}

async function seleccionarCola(cola) {
    try {
        await reservarCola(cola);
        colaActual = cola;
        document.getElementById('rutaPicking').textContent = rutaActual;
        document.getElementById('colaPicking').textContent = `${cola} (${tipoRecoleccionActual})`;
        await iniciarProcesoPicking();
        mostrarVentana(3);
    } catch (error) {
        mostrarMensaje(error.message, false);
    }
}

async function reservarCola(cola) {
    const colaKey = `${rutaActual}_${cola}_${tipoRecoleccionActual}`; // ✅ Incluir tipo en la clave
    const colaEnUso = await verificarColaEnUso(cola);
    
    if (colaEnUso && colaEnUso.usuario !== usuarioActual) {
        throw new Error(`Cola ocupada por ${colaEnUso.usuario} (${tipoRecoleccionActual})`);
    }
    
    const key = `${rutaActual}_${cola}_${tipoRecoleccionActual}_${usuarioActual}_${Date.now()}`;
    await database.ref(`colasEnUso/${key}`).set({
        usuario: usuarioActual,
        ruta: rutaActual,
        cola: cola,
        tipo: tipoRecoleccionActual, // ✅ Guardar tipo
        colaKey: colaKey,
        timestamp: Date.now()
    });

    cacheColasEnUso[key] = {
        usuario: usuarioActual,
        ruta: rutaActual,
        cola: cola,
        tipo: tipoRecoleccionActual,
        colaKey: colaKey,
        timestamp: Date.now()
    };
}

// ✅ LIBERAR COLA DE FORMA CONFIABLE
async function liberarColaConfiable() {
    if (!rutaActual || !colaActual || !usuarioActual) {
        console.warn('⚠️ No hay datos suficientes para liberar cola');
        return false;
    }
    
    try {
        // Buscar y eliminar todas las colas de este usuario para esta combinación
        const keysToDelete = [];
        for (const key in cacheColasEnUso) {
            const sesion = cacheColasEnUso[key];
            if (sesion.usuario === usuarioActual && 
                sesion.ruta === rutaActual && 
                sesion.cola === colaActual &&
                sesion.tipo === tipoRecoleccionActual) {
                keysToDelete.push(key);
            }
        }
        
        for (const key of keysToDelete) {
            await database.ref(`colasEnUso/${key}`).remove();
            delete cacheColasEnUso[key];
        }
        
        console.log('✅ Cola liberada correctamente en Firebase');
        return true;
        
    } catch (error) {
        console.error('❌ Error liberando cola:', error);
        return false;
    }
}

// ================= VENTANA 3: PICKING =================
async function iniciarProcesoPicking() {
    depositosActuales = itemsPorCola[colaActual] || [];
    depositoActualIndex = 0;
    
    // ✅ Asegurar que empezamos en modo unitario
    cambiarModoEscaneo('unitario');
    
    await cargarProgresoActual();
    const siguienteIndex = encontrarSiguienteDepositoNoCompletado();
    if (siguienteIndex !== -1) depositoActualIndex = siguienteIndex;
    
    await actualizarInterfazPicking();
}

async function cargarProgresoActual() {
    depositosActuales.forEach(item => {
        const progreso = obtenerProgresoActual(item.deposito, item.upc, item.indicador);
        item.recolectado = Math.min(progreso.recolectado, item.cantidad);
        item.no_encontrado = Math.min(progreso.no_encontrado, item.cantidad - item.recolectado);
        item.completado = (item.recolectado + item.no_encontrado) >= item.cantidad;
    });
}

async function actualizarInterfazPicking() {
    const item = depositosActuales[depositoActualIndex];
    if (!item) {
        await finalizarRecoleccionCompleta();
        return;
    }

    document.getElementById('depositoActualCodigo').textContent = item.deposito;
    document.getElementById('depositoActualDescripcion').textContent = `${item.descripcion} [${item.indicador}]`;
    
    const leida = item.recolectado + item.no_encontrado;
    const pendiente = Math.max(0, item.cantidad - leida);
    
    document.getElementById('cantidadTotal').textContent = item.cantidad;
    document.getElementById('cantidadLeida').textContent = leida;
    document.getElementById('cantidadPendiente').textContent = pendiente;

    actualizarListaDepositos();

    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        upcInput.focus();
        upcInput.value = '';
    }
    
    // ✅ Actualizar placeholder según modo
    if (modoEscaneo === 'lote') {
        upcInput.placeholder = "Escanea UPC luego ingresa cantidad";
    } else {
        upcInput.placeholder = "Escanea código UPC";
    }
}

function actualizarListaDepositos() {
    const container = document.getElementById('listaDepositos');
    container.innerHTML = '';

    depositosActuales.forEach((item, index) => {
        const leida = item.recolectado + item.no_encontrado;
        const pendiente = Math.max(0, item.cantidad - leida);
        const estado = `${leida}/${item.cantidad}`;
        
        const div = document.createElement('div');
        div.className = `deposito-item ${index === depositoActualIndex ? 'current' : ''} ${item.completado ? 'completed' : ''} ${item.no_encontrado === item.cantidad ? 'not-found' : ''}`;
        div.innerHTML = `
            <div>
                <div class="deposito-codigo-small">${item.deposito}</div>
                <div style="font-size:10px;color:#666;">${item.indicador}</div>
            </div>
            <div class="deposito-cantidad">${item.cantidad}</div>
            <div class="deposito-estado">${estado}</div>
        `;
        
        div.onclick = () => {
            if (!item.completado) {
                depositoActualIndex = index;
                cambiarModoEscaneo('unitario'); // Cambiar a modo unitario al seleccionar nuevo depósito
                actualizarInterfazPicking();
            }
        };
        
        container.appendChild(div);
    });
}

// ================= SISTEMA DUAL DE ESCANEO =================

// ✅ CAMBIAR MODO DE ESCANEO
function cambiarModoEscaneo(modo) {
    modoEscaneo = modo;
    
    // Actualizar botones
    document.getElementById('modoUnitario').classList.toggle('active', modo === 'unitario');
    document.getElementById('modoLote').classList.toggle('active', modo === 'lote');
    
    // Mostrar/ocultar campo de cantidad manual
    const campoCantidad = document.getElementById('cantidadManualContainer');
    const upcInput = document.getElementById('upcInput');
    
    if (modo === 'lote') {
        campoCantidad.classList.remove('hidden');
        upcInput.placeholder = "Escanea UPC luego ingresa cantidad";
        
        // Establecer valor máximo en el input de cantidad
        const item = depositosActuales[depositoActualIndex];
        if (item) {
            const pendiente = item.cantidad - (item.recolectado + item.no_encontrado);
            document.getElementById('cantidadManualInput').value = pendiente > 0 ? pendiente : 1;
            document.getElementById('cantidadManualInput').max = pendiente;
        }
    } else {
        campoCantidad.classList.add('hidden');
        upcInput.placeholder = "Escanea código UPC";
        upcEscaneadoModoLote = '';
        document.getElementById('cantidadManualInput').value = '1';
    }
    
    mostrarMensaje(`Modo ${modo === 'unitario' ? 'Unitario' : 'Lote'} activado`, true);
    upcInput.focus();
}

// ✅ CANCELAR MODO LOTE
function cancelarModoLote() {
    upcEscaneadoModoLote = '';
    document.getElementById('cantidadManualInput').value = '1';
    cambiarModoEscaneo('unitario');
    document.getElementById('upcInput').focus();
}

// ✅ VALIDACIÓN ESTRICTA DE CANTIDADES EN ESCANEO
function validarCantidadEstricta(item, nuevoRecolectado) {
    const MAXIMO_PERMITIDO = item.cantidad;
    const YA_RECOLECTADO = item.recolectado;
    const DIFERENCIA = nuevoRecolectado - YA_RECOLECTADO;
    
    if (nuevoRecolectado > MAXIMO_PERMITIDO) {
        throw new Error(`❌ Límite excedido: ${nuevoRecolectado} > ${MAXIMO_PERMITIDO}`);
    }
    
    // En modo unitario, solo permitir incremento de 1 unidad
    if (modoEscaneo === 'unitario' && DIFERENCIA > 1) {
        throw new Error(`❌ Incremento inválido: +${DIFERENCIA} unidades`);
    }
    
    return true;
}

// ✅ PROCESAR ESCANEO UPC (AMBOS MODOS)
async function procesarEscaneoUPC(upc) {
    if (procesandoEscaneo || procesandoModoLote) return;
    
    if (modoEscaneo === 'unitario') {
        await procesarEscaneoUnitario(upc);
    } else {
        await prepararModoLote(upc);
    }
}

// ✅ PROCESAR ESCANEO EN MODO UNITARIO
async function procesarEscaneoUnitario(upc) {
    procesandoEscaneo = true;

    try {
        const item = depositosActuales[depositoActualIndex];
        if (!item) {
            mostrarMensaje('❌ No hay depósito activo', false);
            return;
        }

        const upcEscaneado = upc.toString().trim();
        const upcEsperado = item.upc.toString().trim();
        
        let esValido = false;
        if (upcEscaneado === upcEsperado) {
            esValido = true;
        } else {
            const maxLength = Math.max(upcEscaneado.length, upcEsperado.length);
            const upcEscaneadoPadded = upcEscaneado.padStart(maxLength, '0');
            const upcEsperadoPadded = upcEsperado.padStart(maxLength, '0');
            if (upcEscaneadoPadded === upcEsperadoPadded) {
                esValido = true;
            }
        }

        if (!esValido) {
            mostrarMensaje('❌ UPC incorrecto. Esperado: ' + item.upc + ', Recibido: ' + upc, false);
            playErrorSound();
            return;
        }

        const nuevoRecolectado = item.recolectado + 1;
        
        // Validación estricta
        validarCantidadEstricta(item, nuevoRecolectado);
        
        // Actualizar progreso
        actualizarProgresoTemporal(item.deposito, item.upc, item.indicador, nuevoRecolectado, item.no_encontrado);
        
        item.recolectado = nuevoRecolectado;
        
        playSuccessSound();
        await actualizarInterfazPicking();
        
        if (item.recolectado >= item.cantidad) {
            item.completado = true;
            mostrarMensaje('✅ Depósito completado', true);
            
            setTimeout(() => {
                siguienteDeposito();
            }, 800);
        } else {
            mostrarMensaje('✓ Escaneo correcto', true);
        }

    } catch (error) {
        console.error('Error en modo unitario:', error);
        mostrarMensaje(error.message, false);
        playErrorSound();
    } finally {
        procesandoEscaneo = false;
        const upcInput = document.getElementById('upcInput');
        if (upcInput) upcInput.focus();
    }
}

// ✅ PREPARAR MODO LOTE - VALIDAR UPC
async function prepararModoLote(upc) {
    procesandoModoLote = true;
    
    try {
        const item = depositosActuales[depositoActualIndex];
        if (!item) {
            mostrarMensaje('❌ No hay depósito activo', false);
            return;
        }

        // Validar UPC (misma lógica que en modo unitario)
        const upcEscaneado = upc.toString().trim();
        const upcEsperado = item.upc.toString().trim();
        
        let esValido = false;
        if (upcEscaneado === upcEsperado) {
            esValido = true;
        } else {
            const maxLength = Math.max(upcEscaneado.length, upcEsperado.length);
            const upcEscaneadoPadded = upcEscaneado.padStart(maxLength, '0');
            const upcEsperadoPadded = upcEsperado.padStart(maxLength, '0');
            if (upcEscaneadoPadded === upcEsperadoPadded) {
                esValido = true;
            }
        }

        if (!esValido) {
            mostrarMensaje('❌ UPC incorrecto. Esperado: ' + item.upc, false);
            playErrorSound();
            return;
        }

        // Guardar UPC y preparar interfaz
        upcEscaneadoModoLote = upc;
        
        // Mostrar información del producto
        const pendiente = item.cantidad - (item.recolectado + item.no_encontrado);
        
        // Actualizar el input de cantidad
        const cantidadInput = document.getElementById('cantidadManualInput');
        cantidadInput.value = pendiente > 0 ? pendiente : 1;
        cantidadInput.max = pendiente;
        cantidadInput.min = 1;
        cantidadInput.focus();
        
        mostrarMensaje(`✅ UPC válido. Ingresa cantidad (máx: ${pendiente})`, true);
        playSuccessSound();
        
    } catch (error) {
        console.error('Error preparando modo lote:', error);
        mostrarMensaje(error.message, false);
        playErrorSound();
    } finally {
        procesandoModoLote = false;
    }
}

// ✅ CONFIRMAR CANTIDAD EN MODO LOTE
async function confirmarCantidadManual() {
    const cantidadInput = document.getElementById('cantidadManualInput');
    let cantidad = parseInt(cantidadInput.value);
    
    if (isNaN(cantidad) || cantidad <= 0) {
        mostrarMensaje('❌ Cantidad inválida', false);
        return;
    }
    
    const item = depositosActuales[depositoActualIndex];
    if (!item) {
        mostrarMensaje('❌ No hay depósito activo', false);
        return;
    }
    
    const pendiente = item.cantidad - (item.recolectado + item.no_encontrado);
    
    if (cantidad > pendiente) {
        cantidad = pendiente; // Ajustar automáticamente al máximo disponible
        mostrarMensaje(`⚠️ Ajustado a cantidad máxima: ${pendiente}`, true);
    }
    
    try {
        // Validación estricta
        const nuevoRecolectado = item.recolectado + cantidad;
        const total = nuevoRecolectado + item.no_encontrado;
        
        if (total > item.cantidad) {
            throw new Error(`❌ Total ${total} excede cantidad planificada ${item.cantidad}`);
        }
        
        // Actualizar progreso
        actualizarProgresoTemporal(item.deposito, item.upc, item.indicador, nuevoRecolectado, item.no_encontrado);
        item.recolectado = nuevoRecolectado;
        
        playSuccessSound();
        mostrarMensaje(`✅ ${cantidad} unidad(es) registrada(s) correctamente`, true);
        
        // Actualizar interfaz
        await actualizarInterfazPicking();
        
        // Verificar si se completó
        if (item.recolectado >= item.cantidad) {
            item.completado = true;
            setTimeout(() => {
                siguienteDeposito();
            }, 1000);
        }
        
        // Limpiar y volver a modo unitario por defecto
        cancelarModoLote();
        
    } catch (error) {
        console.error('Error en modo lote:', error);
        mostrarMensaje(error.message, false);
        playErrorSound();
    }
}

// ✅ MARCAR NO ENCONTRADO CON VALIDACIÓN
async function marcarNoEncontrado() {
    const item = depositosActuales[depositoActualIndex];
    if (!item) return;

    const cantidadFaltante = item.cantidad - (item.recolectado + item.no_encontrado);
    
    if (cantidadFaltante <= 0) {
        mostrarMensaje('⚠️ Este depósito ya está completado', false);
        return;
    }

    if (confirm(`¿Marcar ${cantidadFaltante} unidad(es) como no encontrada(s) en ${item.deposito} (${item.indicador})?`)) {
        const nuevoNoEncontrado = item.no_encontrado + cantidadFaltante;
        
        try {
            actualizarProgresoTemporal(item.deposito, item.upc, item.indicador, item.recolectado, nuevoNoEncontrado);
            
            item.no_encontrado = nuevoNoEncontrado;
            item.completado = true;
            
            mostrarMensaje(`❌ ${cantidadFaltante} unidad(es) marcada(s) como no encontrada(s)`, true);
            
            setTimeout(() => {
                siguienteDeposito();
            }, 800);
        } catch (error) {
            mostrarMensaje(error.message, false);
        }
    }
}

// ✅ TRANSFERIR PALET CON ACTUALIZACIÓN AUTOMÁTICA Y SIN DUPLICADOS
async function transferirPalet() {
    if (Object.keys(cambiosPendientes).length === 0) {
        mostrarMensaje('📭 No hay datos para transferir', true);
        return;
    }

    console.log(`🔄 Iniciando transferencia #${numeroTransferencia} con ${Object.keys(cambiosPendientes).length} registros`);
    mostrarMensaje(`🔄 Transferiendo datos...`, true);

    try {
        // 1. Sincronizar con Firebase
        await sincronizarCambiosPendientes();
        
        // 2. Actualizar cache local
        await cargarTodosLosProgresos();
        
        // 3. Actualizar interfaz
        await cargarProgresoActual();
        await actualizarInterfazPicking();
        
        // 4. Registrar transferencia
        transferenciasRealizadas.push({
            numero: numeroTransferencia,
            registros: Object.keys(cambiosPendientes).length,
            timestamp: Date.now(),
            cola: colaActual,
            ruta: rutaActual,
            tipo: tipoRecoleccionActual
        });
        
        numeroTransferencia++;
        guardarProgresosTemporales();
        
        console.log(`✅ Transferencia #${numeroTransferencia-1} completada`);
        mostrarMensaje(`✅ Transferencia completada - Datos actualizados`, true);
        
    } catch (error) {
        console.error('❌ Error en transferencia:', error);
        mostrarMensaje('❌ Error en transferencia: ' + error.message, false);
    }
}

// ✅ FINALIZAR RECOLECCIÓN COMPLETA CON TRANSFERENCIA AUTOMÁTICA
async function finalizarRecoleccionCompleta() {
    mostrarMensaje('🚪 Finalizando recolección...', true);
    
    // ✅ TRANSFERIR AUTOMÁTICAMENTE SI HAY CAMBIOS PENDIENTES
    if (Object.keys(cambiosPendientes).length > 0) {
        try {
            console.log('🔄 Transferencia automática al finalizar cola...');
            await sincronizarCambiosPendientes();
            mostrarMensaje('✅ Datos transferidos automáticamente', true);
        } catch (error) {
            console.error('❌ Error en transferencia automática:', error);
            mostrarMensaje('❌ Error al transferir datos automáticamente', false);
        }
    } else {
        console.log('📭 No hay cambios pendientes para transferir');
        mostrarMensaje('📭 No hay datos pendientes por transferir', true);
    }
    
    // ✅ LIBERAR COLA EN FIREBASE
    await liberarColaConfiable();
    
    // ✅ LIMPIAR VARIABLES DE SESIÓN
    colaActual = null;
    depositosActuales = [];
    depositoActualIndex = 0;
    
    // ✅ CANCELAR MODO LOTE SI ESTÁ ACTIVO
    cancelarModoLote();
    
    // ✅ PERMANECER EN VENTANA 3 PERO SIN COLA ACTIVA
    mostrarMensaje('✅ Cola finalizada - Puedes seleccionar otra cola o salir', true);
    
    // Actualizar interfaz para mostrar estado vacío
    document.getElementById('depositoActualCodigo').textContent = '-----';
    document.getElementById('depositoActualDescripcion').textContent = '-----';
    document.getElementById('cantidadTotal').textContent = '0';
    document.getElementById('cantidadLeida').textContent = '0';
    document.getElementById('cantidadPendiente').textContent = '0';
    document.getElementById('listaDepositos').innerHTML = '<div class="loading">Cola finalizada</div>';
}

async function siguienteDeposito() {
    const siguienteIndex = encontrarSiguienteDepositoNoCompletado();
    if (siguienteIndex !== -1) {
        depositoActualIndex = siguienteIndex;
        // ✅ Cambiar a modo unitario al pasar al siguiente depósito
        cambiarModoEscaneo('unitario');
        await actualizarInterfazPicking();
    } else {
        // ✅ NO SE CIERRA AUTOMÁTICAMENTE, SE QUEDA EN VENTANA 3
        await finalizarRecoleccionCompleta();
    }
}

function encontrarSiguienteDepositoNoCompletado() {
    for (let i = 0; i < depositosActuales.length; i++) {
        const index = (depositoActualIndex + i + 1) % depositosActuales.length;
        if (!depositosActuales[index].completado) {
            return index;
        }
    }
    return -1;
}

// ================= FIREBASE =================
async function guardarProgresoFirebase(deposito, upc, indicador, recolectado, no_encontrado) {
    try {
        const item = depositosActuales.find(d => d.deposito === deposito && d.upc === upc && d.indicador === indicador);
        if (!item) {
            throw new Error('Item no encontrado para guardar en Firebase');
        }

        // Validación final
        const total = recolectado + no_encontrado;
        if (total > item.cantidad) {
            console.warn(`⚠️ Ajustando: Total ${total} > Planificado ${item.cantidad}`);
            recolectado = Math.min(recolectado, item.cantidad);
            no_encontrado = Math.min(no_encontrado, item.cantidad - recolectado);
        }

        // ✅ CORRECCIÓN: Crear clave única que evite duplicados
        const claveUnica = `${fechaSistema}_${usuarioActual}_${deposito}_${upc}_${indicador}_${numeroTransferencia}`;
        const key = claveUnica.replace(/\//g, '_').replace(/:/g, '_');
        
        const registro = {
            usuario: usuarioActual,
            ruta: rutaActual,
            cola: colaActual,
            deposito: deposito,
            upc: upc,
            indicador: indicador, // ✅ Guardar indicador
            descripcion: item.descripcion,
            cantidad_planificada: item.cantidad,
            cantidad_recolectada: recolectado,
            no_encontrados: no_encontrado,
            fecha: new Date().toLocaleDateString(),
            hora: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            tipoRecoleccion: tipoRecoleccionActual,
            deposito_destino: item.deposito_destino,
            cola_reposicion: item.cola_reposicion,
            fechaSistema: fechaSistema,
            transferenciaNumero: numeroTransferencia,
            claveUnica: claveUnica // ✅ Para evitar duplicados
        };

        // ✅ Verificar si ya existe un registro similar para evitar duplicados
        const existingSnapshot = await database.ref('recolecciones').orderByChild('claveUnica').equalTo(claveUnica).once('value');
        if (!existingSnapshot.exists()) {
            await database.ref(`recolecciones/${key}`).set(registro);
            console.log(`✅ Guardado en Firebase: ${deposito} - ${recolectado}/${item.cantidad} (${indicador})`);
        } else {
            console.log(`⚠️ Registro ya existe, no se duplica: ${claveUnica}`);
        }
        
    } catch (error) {
        console.error('Error guardando en Firebase:', error);
        throw error;
    }
}

// ================= NAVEGACIÓN CON BLOQUEO =================
function mostrarVentana(numero) {
    // ✅ BLOQUEAR NAVEGACIÓN SI HAY CAMBIOS PENDIENTES
    if (numero !== 3 && Object.keys(cambiosPendientes).length > 0) {
        const confirmar = confirm(
            `⚠️ Tienes ${Object.keys(cambiosPendientes).length} registros sin transferir.\n\n` +
            '¿Estás seguro de que quieres salir? Se perderán los datos no transferidos.\n\n' +
            '• Aceptar: Salir sin transferir (PERDERÁS LOS DATOS)\n' +
            '• Cancelar: Permanecer y transferir primero'
        );
        
        if (!confirmar) {
            return; // Bloquear navegación
        }
    }
    
    // ✅ Cancelar modo lote si estamos cambiando de ventana
    if (modoEscaneo === 'lote') {
        cancelarModoLote();
    }
    
    document.querySelectorAll('.ventana').forEach(ventana => {
        ventana.style.display = 'none';
    });
    document.getElementById(`ventana${numero}`).style.display = 'block';
}

async function volverARutas() {
    if (Object.keys(cambiosPendientes).length > 0) {
        const transferir = confirm(
            `⚠️ Tienes ${Object.keys(cambiosPendientes).length} registros sin transferir.\n\n` +
            '¿Quieres transferir antes de salir?\n\n' +
            '• Aceptar: Transferir y salir\n' +
            '• Cancelar: Salir sin transferir (PERDERÁS LOS DATOS)'
        );
        
        if (transferir) {
            try {
                await sincronizarCambiosPendientes();
                mostrarMensaje('✅ Datos transferidos antes de salir', true);
            } catch (error) {
                console.error('Error transfiriendo al salir:', error);
                if (!confirm('Error al transferir. ¿Salir sin guardar?')) {
                    return;
                }
            }
        }
    }
    
    await liberarColaConfiable();
    mostrarVentana(1);
}

async function volverAColas() {
    if (Object.keys(cambiosPendientes).length > 0) {
        const transferir = confirm(
            `⚠️ Tienes ${Object.keys(cambiosPendientes).length} registros sin transferir.\n\n` +
            '¿Quieres transferir antes de salir?\n\n' +
            '• Aceptar: Transferir y salir\n' +
            '• Cancelar: Salir sin transferir (PERDERÁS LOS DATOS)'
        );
        
        if (transferir) {
            try {
                await sincronizarCambiosPendientes();
                mostrarMensaje('✅ Datos transferidos antes de salir', true);
            } catch (error) {
                console.error('Error transfiriendo al salir:', error);
                if (!confirm('Error al transferir. ¿Salir sin guardar?')) {
                    return;
                }
            }
        }
    }
    
    // ✅ Cancelar modo lote antes de salir
    if (modoEscaneo === 'lote') {
        cancelarModoLote();
    }
    
    await liberarColaConfiable();
    mostrarVentana(2);
}

async function volverInterfazPrincipal() {
    if (Object.keys(cambiosPendientes).length > 0) {
        const transferir = confirm(
            `⚠️ Tienes ${Object.keys(cambiosPendientes).length} registros sin transferir.\n\n` +
            '¿Quieres transferir antes de salir?\n\n' +
            '• Aceptar: Transferir y salir\n' +
            '• Cancelar: Salir sin transferir (PERDERÁS LOS DATOS)'
        );
        
        if (transferir) {
            try {
                await sincronizarCambiosPendientes();
            } catch (error) {
                console.error('Error transfiriendo al salir:', error);
                if (!confirm('Error al transferir. ¿Salir sin guardar?')) {
                    return;
                }
            }
        }
    }
    
    // ✅ Cancelar modo lote antes de salir
    if (modoEscaneo === 'lote') {
        cancelarModoLote();
    }
    
    await liberarColaConfiable();
    window.location.href = 'index.html';
}

// ================= UTILIDADES =================
function mostrarMensaje(mensaje, esExito) {
    const mensajeDiv = document.getElementById('mensajeTemporal');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = esExito ? 'mensaje-exito' : 'mensaje-error';
    mensajeDiv.style.display = 'block';

    setTimeout(() => {
        mensajeDiv.style.display = 'none';
    }, 3000);
}

function playSuccessSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.2);
        
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.2);
    } catch (error) {
        console.log('Audio no disponible');
    }
}

function playErrorSound() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        
        oscillator.frequency.value = 400;
        oscillator.type = 'sawtooth';
        
        gainNode.gain.setValueAtTime(0.3, context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);
        
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + 0.3);
    } catch (error) {
        console.log('Audio no disponible');
    }
}

function actualizarDatos() {
    cacheTimestamp = 0;
    cacheProgresos = {};
    cacheColasEnUso = {};
    cargarRutasDesdeFirebase();
}

function cargarRutas() {
    cacheTimestamp = 0;
    cacheProgresos = {};
    cacheColasEnUso = {};
    cargarRutasDesdeFirebase();
}

// ================= LIMPIEZA AUTOMÁTICA =================
setInterval(async () => {
    try {
        const snapshot = await database.ref('colasEnUso').once('value');
        const sesiones = snapshot.val();
        
        if (sesiones) {
            const ahora = Date.now();
            Object.keys(sesiones).forEach(async key => {
                if (ahora - sesiones[key].timestamp > TIMEOUT_MINUTOS) {
                    await database.ref(`colasEnUso/${key}`).remove();
                    delete cacheColasEnUso[key];
                }
            });
        }
    } catch (error) {
        console.error('Error en limpieza automática:', error);
    }
}, 60000);

// ================= INICIALIZACIÓN DE CACHÉ =================
setTimeout(() => {
    cargarTodosLosProgresos();
    cargarColasEnUso();
}, 2000);