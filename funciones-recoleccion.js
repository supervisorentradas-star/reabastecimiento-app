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

// ================= VARIABLES GLOBALES OPTIMIZADAS =================
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

// ✅ ALMACENAMIENTO TEMPORAL EN MEMORIA
let progresoTemporal = {};
let cambiosPendientes = {};

// ✅ FECHA ACTUAL DEL SISTEMA
let fechaSistema = '';

// ================= INICIALIZACIÓN RÁPIDA =================
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

// ✅ LIMPIAR DATOS DE DÍAS ANTERIORES
async function limpiarDatosDiasAnteriores() {
    try {
        console.log('🧹 Verificando datos de días anteriores...');
        
        // Verificar si hay datos guardados de días anteriores
        const ultimaFecha = localStorage.getItem('ultimaFechaEjecucion');
        
        if (ultimaFecha && ultimaFecha !== fechaSistema) {
            console.log('🗑️ Limpiando datos de fecha anterior:', ultimaFecha);
            
            // Limpiar todos los datos temporales
            localStorage.removeItem(`progresoTemporal_${usuarioActual}`);
            localStorage.removeItem(`cambiosPendientes_${usuarioActual}`);
            
            progresoTemporal = {};
            cambiosPendientes = {};
            cacheProgresos = {};
            
            mostrarMensaje('✅ Sistema reiniciado para nueva fecha', true);
        }
        
        // Guardar la fecha actual
        localStorage.setItem('ultimaFechaEjecucion', fechaSistema);
        
    } catch (error) {
        console.error('Error limpiando datos anteriores:', error);
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

// ✅ VALIDAR FECHA DE REGISTRO vs FECHA DEL SISTEMA
function validarFechaRegistro(registro) {
    const fechaRegistro = registro.fecha || registro.FECHA || '';
    
    if (!fechaRegistro) {
        console.warn('⚠️ Registro sin fecha:', registro);
        return false;
    }
    
    if (fechaRegistro !== fechaSistema) {
        console.warn(`❌ Fecha no coincide: Sistema=${fechaSistema}, Registro=${fechaRegistro}`);
        
        // Reportar a James Jimenez si es un día diferente
        if (fechaRegistro !== fechaSistema) {
            console.error(`🚨 INCONSISTENCIA DE FECHAS - Reportar a James Jimenez`);
            console.error(`Sistema: ${fechaSistema} | Firebase: ${fechaRegistro}`);
            
            // Mostrar alerta al usuario
            if (!localStorage.getItem('alertaFechaMostrada')) {
                mostrarMensaje(`🚨 INCONSISTENCIA: Datos de fecha ${fechaRegistro} en sistema. Reportar a James Jimenez.`, false);
                localStorage.setItem('alertaFechaMostrada', 'true');
                
                // Limpiar la alerta después de 10 segundos
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
            
            // ✅ FILTRAR SOLO PROGRESOS DE LA FECHA ACTUAL
            progresoTemporal = {};
            for (const key in todosLosProgresos) {
                if (todosLosProgresos[key].fecha === fechaSistema) {
                    progresoTemporal[key] = todosLosProgresos[key];
                }
            }
            console.log('📥 Progresos temporales cargados (filtrados por fecha):', Object.keys(progresoTemporal).length);
        }
        
        const cambiosGuardados = localStorage.getItem(`cambiosPendientes_${usuarioActual}`);
        if (cambiosGuardados) {
            const todosLosCambios = JSON.parse(cambiosGuardados);
            
            // ✅ FILTRAR SOLO CAMBIOS DE LA FECHA ACTUAL
            cambiosPendientes = {};
            for (const key in todosLosCambios) {
                if (todosLosCambios[key].fechaSistema === fechaSistema) {
                    cambiosPendientes[key] = todosLosCambios[key];
                }
            }
            console.log('📥 Cambios pendientes cargados (filtrados por fecha):', Object.keys(cambiosPendientes).length);
        }
    } catch (error) {
        console.error('Error cargando progresos temporales:', error);
        progresoTemporal = {};
        cambiosPendientes = {};
    }
}

// ✅ GUARDAR PROGRESOS TEMPORALES EN localStorage
function guardarProgresosTemporales() {
    try {
        // ✅ INCLUIR FECHA EN CADA REGISTRO
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
    } catch (error) {
        console.error('Error guardando progresos temporales:', error);
    }
}

// ✅ OBTENER PROGRESO ACTUAL (MEMORIA + FIREBASE) - SOLO FECHA ACTUAL
function obtenerProgresoActual(deposito, upc) {
    const key = `${deposito}_${upc}`;
    
    // ✅ SOLO USAR PROGRESOS TEMPORALES DE LA FECHA ACTUAL
    if (progresoTemporal[key] && progresoTemporal[key].fecha === fechaSistema) {
        return progresoTemporal[key];
    }
    
    // ✅ SOLO USAR CACHE DE PROGRESOS DE LA FECHA ACTUAL
    if (cacheProgresos[key] && cacheProgresos[key].fecha === fechaSistema) {
        return cacheProgresos[key];
    }
    
    return { recolectado: 0, no_encontrado: 0, fecha: fechaSistema };
}

// ✅ ACTUALIZAR PROGRESO TEMPORAL (SIEMPRE CON FECHA)
function actualizarProgresoTemporal(deposito, upc, recolectado, no_encontrado = 0) {
    const key = `${deposito}_${upc}`;
    
    if (!progresoTemporal[key]) {
        progresoTemporal[key] = { 
            recolectado: 0, 
            no_encontrado: 0,
            fecha: fechaSistema // ✅ SIEMPRE INCLUIR FECHA
        };
    }
    
    progresoTemporal[key].recolectado = recolectado;
    progresoTemporal[key].no_encontrado = no_encontrado;
    progresoTemporal[key].fecha = fechaSistema; // ✅ ACTUALIZAR FECHA
    
    cambiosPendientes[key] = {
        deposito: deposito,
        upc: upc,
        recolectado: recolectado,
        no_encontrado: no_encontrado,
        timestamp: Date.now(),
        fechaSistema: fechaSistema // ✅ INCLUIR FECHA DEL SISTEMA
    };
    
    guardarProgresosTemporales();
}

// ✅ SINCRONIZAR CAMBIOS PENDIENTES CON FIREBASE
async function sincronizarCambiosPendientes() {
    if (Object.keys(cambiosPendientes).length === 0) {
        return;
    }
    
    console.log('🔄 Sincronizando cambios pendientes con Firebase...');
    
    try {
        for (const key in cambiosPendientes) {
            const cambio = cambiosPendientes[key];
            
            // ✅ Validar que el cambio corresponde a la fecha actual
            if (cambio.fechaSistema !== fechaSistema) {
                console.warn(`⚠️ Cambio de fecha diferente omitido: ${cambio.fechaSistema} vs ${fechaSistema}`);
                continue;
            }
            
            await guardarProgresoFirebase(
                cambio.deposito,
                cambio.upc,
                cambio.recolectado,
                cambio.no_encontrado
            );
            
            cacheProgresos[key] = {
                recolectado: cambio.recolectado,
                no_encontrado: cambio.no_encontrado,
                fecha: fechaSistema // ✅ INCLUIR FECHA EN CACHE
            };
            
            console.log(`✅ Sincronizado: ${key} - ${cambio.recolectado} unidades`);
        }
        
        cambiosPendientes = {};
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

function configurarEventListeners() {
    document.querySelectorAll('.tipo-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.tipo-button').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            tipoRecoleccionActual = this.getAttribute('data-tipo');
            if (rutaActual) cargarColasParaRuta(rutaActual);
        });
    });

    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        upcInput.removeEventListener('keypress', handleEnterKey);
        
        upcInput.addEventListener('input', function(e) {
            const upc = e.target.value.trim();
            
            if (upc.length >= 7 && !procesandoEscaneo) {
                console.log('🔍 Código detectado (longitud ' + upc.length + '):', upc);
                
                setTimeout(() => {
                    if (!procesandoEscaneo) {
                        procesarEscaneoUPC(upc);
                        e.target.value = '';
                    }
                }, 100);
            }
        });

        upcInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const upc = e.target.value.trim();
                if (upc && upc.length >= 7 && !procesandoEscaneo) {
                    e.preventDefault();
                    procesarEscaneoUPC(upc);
                    e.target.value = '';
                }
            }
        });

        upcInput.addEventListener('paste', function(e) {
            console.log('📋 Pegado permitido para pruebas');
        });
    }
}

// ================= VENTANA 1: RUTAS OPTIMIZADAS =================
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
    
    datosArray.forEach(registro => {
        try {
            // ✅ VALIDACIÓN CRÍTICA: FECHA DEL SISTEMA vs FECHA DEL REGISTRO
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

            if (!rutasData[ruta]) rutasData[ruta] = [];

            rutasData[ruta].push({
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
                fecha: registro.fecha || registro.FECHA || fechaSistema
            });

            totalUnidades += cantidad;
            registrosProcesados++;

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

function mostrarOpcionesRutas() {
    const container = document.getElementById('rutasGrid');
    
    // ✅ SI NO HAY DATOS, MOSTRAR MENSAJE CLARO
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

    rutas.forEach(ruta => {
        const itemsRuta = window.rutasData[ruta];
        const totalUnidades = itemsRuta.reduce((sum, item) => sum + item.cantidad, 0);
        
        // ✅ CALCULAR PROGRESO SIEMPRE DESDE CERO PARA NUEVO DÍA
        calcularProgresoRuta(ruta).then(progreso => {
            const button = document.createElement('button');
            button.className = 'ruta-button';
            button.innerHTML = `${ruta}<br>${progreso.recolectado}/${totalUnidades}`;
            button.onclick = () => seleccionarRuta(ruta);
            
            container.appendChild(button);
        });
    });
}

// ================= CONSULTAS OPTIMIZADAS PARA FIREBASE =================
async function cargarTodosLosProgresos() {
    try {
        console.log('🔄 Cargando todos los progresos...');
        const snapshot = await database.ref('recolecciones').once('value');
        const todosLosProgresos = snapshot.val() || {};
        
        cacheProgresos = {};
        
        Object.values(todosLosProgresos).forEach(registro => {
            // ✅ FILTRAR SOLO PROGRESOS DE LA FECHA ACTUAL
            if (registro.fechaSistema === fechaSistema) {
                const key = `${registro.deposito}_${registro.upc}`;
                if (!cacheProgresos[key]) {
                    cacheProgresos[key] = { 
                        recolectado: 0, 
                        no_encontrado: 0,
                        fecha: fechaSistema 
                    };
                }
                cacheProgresos[key].recolectado += (registro.cantidad_recolectada || 0);
                cacheProgresos[key].no_encontrado += (registro.no_encontrados || 0);
            }
        });
        
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

async function calcularProgresoRuta(ruta) {
    try {
        // ✅ SI NO HAY DATOS, PROGRESO CERO
        if (!window.rutasData || !window.rutasData[ruta]) {
            return { recolectado: 0 };
        }
        
        if (Object.keys(cacheProgresos).length === 0) {
            await cargarTodosLosProgresos();
        }
        
        let totalRecolectado = 0;
        const itemsRuta = window.rutasData[ruta] || [];
        
        itemsRuta.forEach(item => {
            const key = `${item.deposito}_${item.upc}`;
            const progreso = obtenerProgresoActual(item.deposito, item.upc);
            totalRecolectado += progreso.recolectado;
        });

        return { recolectado: totalRecolectado };
    } catch (error) {
        return { recolectado: 0 };
    }
}

function seleccionarRuta(ruta) {
    // ✅ VERIFICAR QUE LA RUTA EXISTE EN LOS DATOS ACTUALES
    if (!window.rutasData || !window.rutasData[ruta]) {
        mostrarMensaje('❌ Ruta no disponible para hoy', false);
        return;
    }
    
    rutaActual = ruta;
    document.getElementById('rutaSeleccionadaTitulo').textContent = `RUTA: ${ruta}`;
    cargarColasParaRuta(ruta);
    mostrarVentana(2);
}

// ================= VENTANA 2: COLAS OPTIMIZADAS =================
async function cargarColasParaRuta(ruta) {
    if (!window.rutasData || !window.rutasData[ruta]) {
        mostrarMensaje('❌ No hay datos para esta ruta', false);
        return;
    }
    
    const itemsRuta = window.rutasData[ruta];
    const itemsFiltrados = itemsRuta.filter(item => item.indicador === tipoRecoleccionActual);
    
    if (itemsFiltrados.length === 0) {
        mostrarMensaje('❌ No hay colas para este tipo de recolección', false);
        return;
    }
    
    itemsPorCola = agruparPorColas(itemsFiltrados);
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

    const colasUnicas = [...new Set(colas)];
    container.innerHTML = '';
    
    for (const cola of colasUnicas) {
        const itemsCola = itemsPorCola[cola];
        const totalUnidades = itemsCola.reduce((sum, item) => sum + item.cantidad, 0);
        
        const estadoCola = await verificarEstadoCola(cola);
        
        const button = document.createElement('button');
        button.className = `cola-button ${estadoCola.clase}`;
        button.innerHTML = `
            COLA: ${cola}<br>
            ${estadoCola.recolectado}/${totalUnidades}<br>
            <small>${estadoCola.estado}</small>
        `;
        
        if (estadoCola.clase !== 'occupied') {
            button.onclick = () => seleccionarCola(cola);
        }
        
        container.appendChild(button);
    }
}

async function verificarEstadoCola(cola) {
    try {
        const colaEnUso = await verificarColaEnUso(cola);
        if (colaEnUso && colaEnUso.usuario !== usuarioActual) {
            return { clase: 'occupied', estado: `OCUPADA`, recolectado: 0 };
        }

        const itemsCola = itemsPorCola[cola];
        let totalRecolectado = 0;
        
        itemsCola.forEach(item => {
            const progreso = obtenerProgresoActual(item.deposito, item.upc);
            totalRecolectado += progreso.recolectado;
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

// ================= GESTIÓN DE COLAS EN USO OPTIMIZADA =================
async function verificarColaEnUso(cola) {
    try {
        const colaKey = `${rutaActual}_${cola}`;
        
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
        document.getElementById('colaPicking').textContent = cola;
        await iniciarProcesoPicking();
        mostrarVentana(3);
    } catch (error) {
        mostrarMensaje(error.message, false);
    }
}

async function reservarCola(cola) {
    const colaKey = `${rutaActual}_${cola}`;
    const colaEnUso = await verificarColaEnUso(cola);
    
    if (colaEnUso && colaEnUso.usuario !== usuarioActual) {
        throw new Error(`Cola ocupada por ${colaEnUso.usuario}`);
    }
    
    const key = `${rutaActual}_${cola}_${usuarioActual}`;
    await database.ref(`colasEnUso/${key}`).set({
        usuario: usuarioActual,
        ruta: rutaActual,
        cola: cola,
        colaKey: colaKey,
        timestamp: Date.now()
    });

    cacheColasEnUso[key] = {
        usuario: usuarioActual,
        ruta: rutaActual,
        cola: cola,
        colaKey: colaKey,
        timestamp: Date.now()
    };
}

// ================= VENTANA 3: PICKING MEJORADO =================
async function iniciarProcesoPicking() {
    depositosActuales = itemsPorCola[colaActual] || [];
    depositoActualIndex = 0;
    
    await cargarProgresoActual();
    const siguienteIndex = encontrarSiguienteDepositoNoCompletado();
    if (siguienteIndex !== -1) depositoActualIndex = siguienteIndex;
    
    await actualizarInterfazPicking();
}

async function cargarProgresoActual() {
    depositosActuales.forEach(item => {
        const progreso = obtenerProgresoActual(item.deposito, item.upc);
        item.recolectado = progreso.recolectado;
        item.no_encontrado = progreso.no_encontrado;
        item.completado = (progreso.recolectado + progreso.no_encontrado) >= item.cantidad;
    });
}

async function actualizarInterfazPicking() {
    const item = depositosActuales[depositoActualIndex];
    if (!item) {
        await finalizarRecoleccion();
        return;
    }

    document.getElementById('depositoActualCodigo').textContent = item.deposito;
    document.getElementById('depositoActualDescripcion').textContent = item.descripcion;
    
    const leida = item.recolectado + item.no_encontrado;
    const pendiente = item.cantidad - leida;
    
    document.getElementById('cantidadTotal').textContent = item.cantidad;
    document.getElementById('cantidadLeida').textContent = leida;
    document.getElementById('cantidadPendiente').textContent = pendiente;

    actualizarListaDepositos();

    const upcInput = document.getElementById('upcInput');
    if (upcInput) {
        upcInput.focus();
        upcInput.value = '';
    }
}

function actualizarListaDepositos() {
    const container = document.getElementById('listaDepositos');
    container.innerHTML = '';

    depositosActuales.forEach((item, index) => {
        const leida = item.recolectado + item.no_encontrado;
        const estado = `${leida}/${item.cantidad}`;
        
        const div = document.createElement('div');
        div.className = `deposito-item ${index === depositoActualIndex ? 'current' : ''} ${item.completado ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="deposito-codigo-small">${item.deposito}</div>
            <div class="deposito-cantidad">${item.cantidad}</div>
            <div class="deposito-estado">${estado}</div>
        `;
        
        div.onclick = () => {
            if (!item.completado) {
                depositoActualIndex = index;
                actualizarInterfazPicking();
            }
        };
        
        container.appendChild(div);
    });
}

// ✅ CORRECCIÓN: PROCESAMIENTO CON ALMACENAMIENTO TEMPORAL
async function procesarEscaneoUPC(upc) {
    if (procesandoEscaneo) {
        console.log('⏳ Escaneo en progreso, ignorando...');
        return;
    }

    procesandoEscaneo = true;

    try {
        const item = depositosActuales[depositoActualIndex];
        if (!item) {
            mostrarMensaje('❌ No hay depósito activo', false);
            return;
        }

        console.log('🔍 Procesando UPC:', upc);
        console.log('📦 UPC esperado:', item.upc);

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
        actualizarProgresoTemporal(item.deposito, item.upc, nuevoRecolectado, item.no_encontrado);
        
        item.recolectado = nuevoRecolectado;
        
        playSuccessSound();
        
        await actualizarInterfazPicking();
        
        if (item.recolectado >= item.cantidad) {
            item.completado = true;
            mostrarMensaje('✅ Depósito completado', true);
            
            setTimeout(async () => {
                try {
                    await sincronizarCambiosPendientes();
                    siguienteDeposito();
                } catch (error) {
                    console.error('Error sincronizando al completar depósito:', error);
                    siguienteDeposito();
                }
            }, 800);
        } else {
            mostrarMensaje('✓ Escaneo correcto (guardado temporalmente)', true);
        }

    } catch (error) {
        console.error('Error en escaneo:', error);
        mostrarMensaje('❌ Error en escaneo: ' + error.message, false);
        playErrorSound();
    } finally {
        procesandoEscaneo = false;
        
        const upcInput = document.getElementById('upcInput');
        if (upcInput) {
            upcInput.value = '';
            upcInput.focus();
        }
    }
}

// ✅ FUNCIONES DE SONIDO
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

function handleEnterKey(e) {
    if (e.key === 'Enter') {
        const upc = e.target.value.trim();
        if (upc && upc.length >= 7 && !procesandoEscaneo) {
            e.preventDefault();
            procesarEscaneoUPC(upc);
            e.target.value = '';
        }
    }
}

// ✅ CORRECCIÓN CRÍTICA: MARCAR SOLO LA DIFERENCIA COMO NO ENCONTRADA
async function marcarNoEncontrado() {
    const item = depositosActuales[depositoActualIndex];
    if (!item) return;

    // Calcular la diferencia faltante
    const cantidadFaltante = item.cantidad - (item.recolectado + item.no_encontrado);
    
    if (cantidadFaltante <= 0) {
        mostrarMensaje('⚠️ Este depósito ya está completado', false);
        return;
    }

    if (confirm(`¿Marcar ${cantidadFaltante} unidad(es) como no encontrada(s) en ${item.deposito}?`)) {
        // ✅ CORRECCIÓN: Solo agregar la diferencia faltante, no la cantidad total
        const nuevoNoEncontrado = item.no_encontrado + cantidadFaltante;
        
        actualizarProgresoTemporal(item.deposito, item.upc, item.recolectado, nuevoNoEncontrado);
        
        item.no_encontrado = nuevoNo_encontrado;
        item.completado = true;
        
        mostrarMensaje(`❌ ${cantidadFaltante} unidad(es) marcada(s) como no encontrada(s)`, true);
        
        setTimeout(async () => {
            try {
                await sincronizarCambiosPendientes();
                setTimeout(() => {
                    siguienteDeposito();
                }, 500);
            } catch (error) {
                console.error('Error sincronizando no encontrado:', error);
                setTimeout(() => {
                    siguienteDeposito();
                }, 500);
            }
        }, 500);
    }
}

async function siguienteDeposito() {
    if (Object.keys(cambiosPendientes).length > 0) {
        try {
            await sincronizarCambiosPendientes();
        } catch (error) {
            console.error('Error sincronizando al cambiar depósito:', error);
        }
    }
    
    const siguienteIndex = encontrarSiguienteDepositoNoCompletado();
    if (siguienteIndex !== -1) {
        depositoActualIndex = siguienteIndex;
        await actualizarInterfazPicking();
    } else {
        await finalizarRecoleccion();
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

async function finalizarRecoleccion() {
    if (Object.keys(cambiosPendientes).length > 0) {
        try {
            await sincronizarCambiosPendientes();
        } catch (error) {
            console.error('Error sincronizando al finalizar:', error);
            mostrarMensaje('⚠️ Recolección completada, pero hay cambios pendientes por sincronizar', true);
        }
    }
    
    mostrarMensaje('🎉 ¡Recolección completada!', true);
    await liberarCola();
    cacheTimestamp = 0;
    
    progresoTemporal = {};
    cambiosPendientes = {};
    guardarProgresosTemporales();
    
    setTimeout(() => {
        mostrarVentana(2);
    }, 1500);
}

// ================= FIREBASE OPTIMIZADO =================
async function guardarProgresoFirebase(deposito, upc, recolectado, no_encontrado) {
    try {
        const item = depositosActuales.find(d => d.deposito === deposito && d.upc === upc);
        if (!item) {
            throw new Error('Item no encontrado para guardar en Firebase');
        }

        const registro = {
            usuario: usuarioActual,
            ruta: rutaActual,
            cola: colaActual,
            deposito: deposito,
            upc: upc,
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
            fechaSistema: fechaSistema // ✅ INCLUIR FECHA DEL SISTEMA PARA FILTROS
        };

        const key = `${deposito}_${upc}_${usuarioActual}_${Date.now()}`;
        await database.ref(`recolecciones/${key}`).set(registro);
        
        console.log(`✅ Guardado en Firebase: ${deposito} - ${recolectado}/${item.cantidad}`);
        
    } catch (error) {
        console.error('Error guardando en Firebase:', error);
        throw error;
    }
}

async function liberarCola() {
    if (rutaActual && colaActual && usuarioActual) {
        try {
            const key = `${rutaActual}_${colaActual}_${usuarioActual}`;
            await database.ref(`colasEnUso/${key}`).remove();
            
            delete cacheColasEnUso[key];
            
        } catch (error) {
            console.error('Error liberando cola:', error);
        }
    }
}

// ================= NAVEGACIÓN =================
function mostrarVentana(numero) {
    document.querySelectorAll('.ventana').forEach(ventana => {
        ventana.style.display = 'none';
    });
    document.getElementById(`ventana${numero}`).style.display = 'block';
}

async function volverARutas() {
    if (Object.keys(cambiosPendientes).length > 0) {
        try {
            await sincronizarCambiosPendientes();
        } catch (error) {
            console.error('Error sincronizando al salir:', error);
            if (!confirm('Hay cambios pendientes por sincronizar. ¿Estás seguro de que quieres salir?')) {
                return;
            }
        }
    }
    
    liberarCola();
    mostrarVentana(1);
}

async function volverAColas() {
    if (Object.keys(cambiosPendientes).length > 0) {
        try {
            await sincronizarCambiosPendientes();
        } catch (error) {
            console.error('Error sincronizando al salir:', error);
            if (!confirm('Hay cambios pendientes por sincronizar. ¿Estás seguro de que quieres salir?')) {
                return;
            }
        }
    }
    
    liberarCola();
    mostrarVentana(2);
}

async function volverInterfazPrincipal() {
    if (confirm('¿Salir al menú principal?')) {
        if (Object.keys(cambiosPendientes).length > 0) {
            try {
                await sincronizarCambiosPendientes();
            } catch (error) {
                console.error('Error sincronizando al salir:', error);
                if (!confirm('Hay cambios pendientes por sincronizar. ¿Estás seguro de que quieres salir?')) {
                    return;
                }
            }
        }
        
        liberarCola();
        window.location.href = 'index.html';
    }
}

// ================= UTILIDADES =================
function mostrarMensaje(mensaje, esExito) {
    const mensajeDiv = document.getElementById('mensajeTemporal');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = esExito ? 'mensaje-exito' : 'mensaje-error';
    mensajeDiv.style.display = 'block';

    setTimeout(() => {
        mensajeDiv.style.display = 'none';
    }, 2000);
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

function establecerFechaActual() {
    const fecha = new Date();
    const dia = fecha.getDate().toString().padStart(2, '0');
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const anio = fecha.getFullYear();
    fechaSistema = `${dia}/${mes}/${anio}`;
    
    document.getElementById('fechaActual').textContent = fechaSistema;
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