// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAl6wzWg_opgBrZ4fe0golJ-fe-civk7RE",
    authDomain: "reabastecimiento-d71a1.firebaseapp.com",
    databaseURL: "https://reabastecimiento-d71a1-default-rtdb.firebaseio.com",
    projectId: "reabastecimiento-d71a1",
    storageBucket: "reabastecimiento-d71a1.firebasestorage.app",
    messagingSenderId: "107012533068",
    appId: "1:107012533068:web:3576d5e3a18a42dcaefde9"
};

const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Variables globales
let usuarioActual = localStorage.getItem('usuarioSokso');
let datosReposicion = {};
let colasData = {};
let reposicionesData = {};
let colaActual = '';
let depositosConTallas = [];
let depositoActual = null;
let tallaActual = null;
let depositoActualIndex = -1;
let tallaActualIndex = -1;
let depositoEscaneadoCorrectamente = false;
let sessionId = null;
let colasEnUso = {};
let heartBeatInterval = null;
let sesionActiva = null;
let depositosExpandidos = {};

// =============================================
// FUNCIONES AUXILIARES CORREGIDAS
// =============================================

function obtenerFechaActual() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = hoy.getFullYear();
    return `${dia}/${mes}/${año}`;
}

function normalizarFecha(fecha) {
    if (!fecha) return null;
    
    if (typeof fecha === 'string') {
        // Formato dd/mm/yyyy
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(fecha)) {
            const partes = fecha.split('/');
            if (partes.length === 3) {
                const dia = partes[0].padStart(2, '0');
                const mes = partes[1].padStart(2, '0');
                const año = partes[2];
                return `${dia}/${mes}/${año}`;
            }
        }
        // Formato yyyy-mm-dd
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(fecha)) {
            const partes = fecha.split('-');
            if (partes.length === 3) {
                const dia = partes[2].padStart(2, '0');
                const mes = partes[1].padStart(2, '0');
                const año = partes[0];
                return `${dia}/${mes}/${año}`;
            }
        }
    }
    
    if (typeof fecha === 'number' || (typeof fecha === 'string' && !isNaN(fecha))) {
        const fechaObj = new Date(parseInt(fecha));
        if (!isNaN(fechaObj.getTime())) {
            const dia = String(fechaObj.getDate()).padStart(2, '0');
            const mes = String(fechaObj.getMonth() + 1).padStart(2, '0');
            const año = fechaObj.getFullYear();
            return `${dia}/${mes}/${año}`;
        }
    }
    
    return null;
}

// =============================================
// FUNCIÓN PROCESAR DATOS - MEJORADA DEFINITIVAMENTE
// =============================================

function procesarDatosRecoleccion(recoleccionData, reposicionesData) {
    const nuevosDatosReposicion = {};
    const fechaActual = obtenerFechaActual();
    
    console.log('Procesando datos para fecha:', fechaActual);
    
    // Paso 1: Procesar recolecciones para obtener lo planificado
    const planificacionPorUPC = {}; // clave: cola_deposito_upc
    
    Object.values(recoleccionData).forEach(registro => {
        try {
            const fechaRegistro = normalizarFecha(registro.fecha);
            if (fechaRegistro !== fechaActual) return;
            
            const cola = registro.cola_reposicion;
            const deposito = registro.deposito_destino;
            const upc = registro.upc;
            const cantidad = parseInt(registro.cantidad_recolectada) || 0;
            const descripcion = registro.descripcion;
            
            if (!cola || !deposito || !upc || cantidad <= 0) return;
            
            const clave = `${cola}|${deposito}|${upc}`;
            
            if (!planificacionPorUPC[clave]) {
                planificacionPorUPC[clave] = {
                    cola: cola,
                    deposito: deposito,
                    upc: upc,
                    articulo: descripcion || 'Sin descripción',
                    cantidadPlanificada: cantidad  // CORRECCIÓN: Asignar directamente
                };
            } else {
                // CORRECCIÓN: SUMAR las cantidades, no tomar el mayor
                planificacionPorUPC[clave].cantidadPlanificada += cantidad;
            }
            
        } catch (error) {
            console.error('Error procesando recolección:', error);
        }
    });
    
    // Paso 2: Procesar reposiciones para ver lo ya escaneado
    const escaneosPorUPC = {}; // clave: cola_deposito_upc
    
    Object.values(reposicionesData).forEach(escaneo => {
        try {
            const fechaEscaneo = normalizarFecha(escaneo.fecha);
            if (fechaEscaneo !== fechaActual) return;
            
            const cola = escaneo.cola;
            const deposito = escaneo.deposito;
            const upc = escaneo.upc;
            const cantidad = parseInt(escaneo.cantidad) || 1;
            
            const clave = `${cola}|${deposito}|${upc}`;
            
            if (!escaneosPorUPC[clave]) {
                escaneosPorUPC[clave] = 0;
            }
            
            escaneosPorUPC[clave] += cantidad;
            
        } catch (error) {
            console.error('Error procesando escaneo:', error);
        }
    });
    
    // Paso 3: Construir estructura final
    Object.values(planificacionPorUPC).forEach(item => {
        const cola = item.cola;
        const deposito = item.deposito;
        const clave = `${cola}|${deposito}|${item.upc}`;
        
        if (!nuevosDatosReposicion[cola]) {
            nuevosDatosReposicion[cola] = {
                depositos: {},
                totalPlanificado: 0,
                totalRepuesto: 0
            };
        }
        
        if (!nuevosDatosReposicion[cola].depositos[deposito]) {
            nuevosDatosReposicion[cola].depositos[deposito] = {
                totalPlanificado: 0,
                totalRepuesto: 0,
                completado: false,
                tallas: []
            };
        }
        
        const cantidadRepuesta = escaneosPorUPC[clave] || 0;
        const completado = cantidadRepuesta >= item.cantidadPlanificada;
        
        // Verificar que no exista ya este UPC en este depósito
        const depositoData = nuevosDatosReposicion[cola].depositos[deposito];
        const existeTalla = depositoData.tallas.find(t => t.upc === item.upc);
        
        if (!existeTalla) {
            depositoData.tallas.push({
                upc: item.upc,
                articulo: item.articulo,
                cantidadPlanificada: item.cantidadPlanificada,
                cantidadRepuesta: cantidadRepuesta,
                completado: completado
            });
            
            depositoData.totalPlanificado += item.cantidadPlanificada;
            depositoData.totalRepuesto += cantidadRepuesta;
            
            nuevosDatosReposicion[cola].totalPlanificado += item.cantidadPlanificada;
            nuevosDatosReposicion[cola].totalRepuesto += cantidadRepuesta;
        }
        
        // Actualizar estado completado del depósito
        depositoData.completado = depositoData.totalRepuesto >= depositoData.totalPlanificado;
    });
    
    datosReposicion = nuevosDatosReposicion;
    localStorage.setItem('cacheReposicion', JSON.stringify(datosReposicion));
    
    console.log('Datos procesados:', datosReposicion);
    
    const totalUnidades = document.getElementById('totalUnidades');
    if (totalUnidades) {
        totalUnidades.textContent = `Colas: ${Object.keys(datosReposicion).length}`;
    }
    
    procesarDatosColas();
}

// =============================================
// FUNCIÓN ORDENAR DEPÓSITOS - CORREGIDA DEFINITIVAMENTE
// =============================================

function ordenarDepositosNaturalmente(depositos) {
    return depositos.sort((a, b) => {
        // Extraer partes del código del depósito (ej: "P14-016-D")
        const regex = /^([A-Z]+)(\d+)-(\d+)-([A-Z])$/;
        const matchA = a.deposito.match(regex);
        const matchB = b.deposito.match(regex);
        
        if (!matchA || !matchB) {
            return a.deposito.localeCompare(b.deposito);
        }
        
        // Comparar prefijo (P, PAS, etc)
        const prefijoA = matchA[1];
        const prefijoB = matchB[1];
        if (prefijoA !== prefijoB) {
            return prefijoA.localeCompare(prefijoB);
        }
        
        // Comparar primer número (14, 02, etc)
        const num1A = parseInt(matchA[2]);
        const num1B = parseInt(matchB[2]);
        if (num1A !== num1B) {
            return num1A - num1B;
        }
        
        // Comparar segundo número (001, 016, 022, etc)
        const num2A = parseInt(matchA[3]);
        const num2B = parseInt(matchB[3]);
        if (num2A !== num2B) {
            return num2A - num2B;
        }
        
        // Comparar letra final (A, B, C, D)
        const letraA = matchA[4];
        const letraB = matchB[4];
        return letraA.localeCompare(letraB);
    });
}

// =============================================
// FUNCIÓN PREPARAR DEPÓSITOS CON TALLAS - CORREGIDA DEFINITIVAMENTE
// =============================================

function prepararDepositosConTallas() {
    depositosConTallas = [];
    
    if (!colasData[colaActual] || !colasData[colaActual].depositos) {
        console.error('No hay datos para la cola:', colaActual);
        return;
    }
    
    Object.keys(colasData[colaActual].depositos).forEach(depositoKey => {
        const depositoData = colasData[colaActual].depositos[depositoKey];
        
        // CONSOLIDACIÓN: Agrupar duplicados por UPC y sumar cantidades
        const tallasConsolidadas = {};
        
        (depositoData.tallas || []).forEach(talla => {
            const upc = talla.upc;
            
            if (!tallasConsolidadas[upc]) {
                // Primer registro para este UPC
                tallasConsolidadas[upc] = {
                    upc: talla.upc,
                    articulo: talla.articulo,
                    cantidadPlanificada: talla.cantidadPlanificada || 0,
                    cantidadRepuesta: talla.cantidadRepuesta || 0,
                    completado: talla.completado || false
                };
            } else {
                // Duplicado: SUMAR las cantidades
                tallasConsolidadas[upc].cantidadPlanificada += (talla.cantidadPlanificada || 0);
                tallasConsolidadas[upc].cantidadRepuesta += (talla.cantidadRepuesta || 0);
                tallasConsolidadas[upc].completado = tallasConsolidadas[upc].cantidadRepuesta >= tallasConsolidadas[upc].cantidadPlanificada;
            }
        });
        
        // Convertir objeto de consolidación a array
        const tallasFiltradas = Object.values(tallasConsolidadas);
        
        // Ordenar tallas por artículo
        const tallasOrdenadas = tallasFiltradas.sort((a, b) => {
            return (a.articulo || '').localeCompare(b.articulo || '');
        });
        
        depositosConTallas.push({
            deposito: depositoKey,
            totalPlanificado: depositoData.totalPlanificado || 0,
            totalRepuesto: depositoData.totalRepuesto || 0,
            completado: depositoData.completado || false,
            tallas: tallasOrdenadas
        });
    });
    
    // **SOLUCIÓN: ORDENAR DEPÓSITOS NATURALMENTE**
    depositosConTallas = ordenarDepositosNaturalmente(depositosConTallas);
    
    console.log('Depósitos ordenados:', depositosConTallas.map(d => d.deposito));
}

// =============================================
// FUNCIÓN SIGUIENTE DEPÓSITO - CORREGIDA DEFINITIVAMENTE
// =============================================

function siguienteDeposito() {
    console.log('Buscando siguiente depósito...');
    
    // Crear lista de depósitos pendientes en orden
    const depositosPendientes = [];
    
    for (let i = depositoActualIndex + 1; i < depositosConTallas.length; i++) {
        const deposito = depositosConTallas[i];
        
        // Verificar si el depósito tiene tallas pendientes
        let tienePendientes = false;
        let primeraTallaPendiente = -1;
        
        if (deposito.tallas && deposito.tallas.length > 0) {
            for (let j = 0; j < deposito.tallas.length; j++) {
                const talla = deposito.tallas[j];
                if (!talla.completado && talla.cantidadRepuesta < talla.cantidadPlanificada) {
                    tienePendientes = true;
                    primeraTallaPendiente = j;
                    break;
                }
            }
        }
        
        if (tienePendientes) {
            depositosPendientes.push({
                depositoIndex: i,
                tallaIndex: primeraTallaPendiente
            });
        }
    }
    
    // Tomar el PRIMERO de los pendientes (ya están en orden)
    if (depositosPendientes.length > 0) {
        const siguiente = depositosPendientes[0];
        establecerDepositoYTallActual(siguiente.depositoIndex, siguiente.tallaIndex);
        return;
    }
    
    // Si no hay más pendientes
    mostrarMensajeDetalle('¡Todos los depósitos completados!', true);
    
    // Resetear interfaz
    const elementos = {
        'currentDepositoDisplay': '----',
        'currentArticuloDisplay': '----',
        'currentTallaDisplay': '----',
        'cantidadTotal': '0',
        'cantidadLeida': '0',
        'cantidadPendiente': '0'
    };
    
    Object.keys(elementos).forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = elementos[id];
    });
    
    depositoActual = null;
    tallaActual = null;
    depositoActualIndex = -1;
    tallaActualIndex = -1;
    depositoEscaneadoCorrectamente = false;
    
    actualizarListaDepositosConTallas();
    
    // Actualizar vista de colas
    setTimeout(() => {
        procesarDatosColas();
    }, 1000);
}

// =============================================
// FUNCIÓN GUARDAR ESCANEO - CORREGIDA DEFINITIVAMENTE
// =============================================

async function guardarEscaneoIndividual() {
    const ref = database.ref('reposiciones');
    const now = new Date();
    const fecha = now.toLocaleDateString('es-ES');
    const hora = now.toLocaleTimeString('es-ES', { hour12: false });
    
    // **SOLUCIÓN: GUARDAR SOLO UNA VEZ CON CANTIDAD 1**
    await ref.push({
        usuario: usuarioActual,
        cola: colaActual,
        deposito: depositoActual.deposito,
        descripcion: tallaActual.articulo,
        upc: tallaActual.upc,
        cantidad: 1, // **¡SIEMPRE 1!**
        fecha: fecha,
        hora: hora,
        timestamp: now.getTime(),
        sessionId: sessionId
    });
    
    console.log('Escaneo ÚNICO guardado en Firebase');
}

// =============================================
// FUNCIÓN PROCESAR ESCANEO UPC - CORREGIDA DEFINITIVAMENTE
// =============================================

async function procesarEscaneoUPC(upc) {
    console.log('Procesando UPC:', upc);
    
    if (!depositoActual || !tallaActual) {
        mostrarMensajeDetalle('Primero escanea un depósito válido', false);
        return;
    }
    
    if (!depositoEscaneadoCorrectamente) {
        mostrarMensajeDetalle('Primero debes escanear el depósito correctamente', false);
        return;
    }
    
    // Validar UPC
    if (tallaActual.upc !== upc) {
        mostrarMensajeDetalle(`ERROR: UPC incorrecto. Esperado: ${tallaActual.upc}`, false);
        const upcInput = document.getElementById('upcInput');
        if (upcInput) {
            upcInput.value = '';
            setTimeout(() => {
                upcInput.focus();
                upcInput.select();
            }, 50);
        }
        return;
    }
    
    // Verificar límites
    const nuevoTotal = tallaActual.cantidadRepuesta + 1;
    
    if (nuevoTotal > tallaActual.cantidadPlanificada) {
        mostrarMensajeDetalle(`¡Cantidad excedida! Máximo: ${tallaActual.cantidadPlanificada}`, false);
        const upcInput = document.getElementById('upcInput');
        if (upcInput) {
            upcInput.value = '';
            setTimeout(() => {
                upcInput.focus();
                upcInput.select();
            }, 50);
        }
        return;
    }
    
    // **SOLUCIÓN: GUARDAR SOLO UNA VEZ**
    try {
        await guardarEscaneoIndividual();
        
        // Actualizar datos locales (SOLO +1)
        tallaActual.cantidadRepuesta = nuevoTotal;
        depositoActual.totalRepuesto += 1;
        
        // Actualizar completado
        tallaActual.completado = nuevoTotal >= tallaActual.cantidadPlanificada;
        depositoActual.completado = depositoActual.totalRepuesto >= depositoActual.totalPlanificado;
        
        // Actualizar colasData
        if (colasData[colaActual] && colasData[colaActual].depositos[depositoActual.deposito]) {
            const depositoEnColasData = colasData[colaActual].depositos[depositoActual.deposito];
            depositoEnColasData.totalRepuesto = depositoActual.totalRepuesto;
            depositoEnColasData.completado = depositoActual.completado;
            
            // Actualizar la talla específica
            const tallaEnColasData = depositoEnColasData.tallas.find(t => t.upc === tallaActual.upc);
            if (tallaEnColasData) {
                tallaEnColasData.cantidadRepuesta = nuevoTotal;
                tallaEnColasData.completado = tallaActual.completado;
            }
            
            // Actualizar total de la cola
            colasData[colaActual].totalRepuesto += 1;
        }
        
        // Actualizar interfaz
        const cantidadLeida = document.getElementById('cantidadLeida');
        const cantidadPendiente = document.getElementById('cantidadPendiente');
        
        if (cantidadLeida) cantidadLeida.textContent = nuevoTotal;
        if (cantidadPendiente) {
            cantidadPendiente.textContent = tallaActual.cantidadPlanificada - nuevoTotal;
        }
        
        // Verificar si se completó
        if (nuevoTotal >= tallaActual.cantidadPlanificada) {
            mostrarMensajeDetalle('¡Cantidad completada!', true);
            
            setTimeout(() => {
                siguienteTalla();
            }, 1000);
        } else {
            mostrarMensajeDetalle(`Escaneado: ${nuevoTotal}/${tallaActual.cantidadPlanificada}`, true);
            
            // Continuar escaneando
            const upcInput = document.getElementById('upcInput');
            if (upcInput) {
                upcInput.value = '';
                setTimeout(() => {
                    upcInput.focus();
                    upcInput.select();
                }, 50);
            }
        }
        
        actualizarListaDepositosConTallas();
        
    } catch (error) {
        console.error('Error al guardar escaneo:', error);
        mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
    }
}

// =============================================
// CÓDIGO RESTANTE (CON FUNCIONES FALTANTES)
// =============================================

function mostrarLoading(mostrar) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = mostrar ? 'flex' : 'none';
}

function mostrarMensaje(mensaje, esExito) {
    const statusDiv = document.getElementById('statusMessage');
    if (statusDiv) {
        statusDiv.textContent = mensaje;
        statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}

function mostrarMensajeDetalle(mensaje, esExito) {
    const statusDiv = document.getElementById('statusMessageDetalle');
    if (statusDiv) {
        statusDiv.textContent = mensaje;
        statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
        statusDiv.style.display = 'block';
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 3000);
    }
}

window.addEventListener('load', function() {
    if (!usuarioActual) {
        window.location.href = 'index.html';
        return;
    }
    
    const totalUnidades = document.getElementById('totalUnidades');
    if (totalUnidades) totalUnidades.textContent = `Colas: 0`;
    
    verificarConexionFirebase();
    inicializarEventosSalida();
    cargarDatosDesdeCache();
    
    mostrarVistaListaColas();
});

function inicializarEventosSalida() {
    window.addEventListener('beforeunload', manejarSalida);
    window.addEventListener('pagehide', manejarSalida);
    window.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            manejarSalidaSuave();
        }
    });
    
    heartBeatInterval = setInterval(mantenerSesionActiva, 30000);
}

async function manejarSalida() {
    if (colaActual) {
        await liberarColaEnUso(colaActual);
    }
    clearInterval(heartBeatInterval);
}

async function manejarSalidaSuave() {
    if (colaActual && colasEnUso[colaActual] && colasEnUso[colaActual].usuario === usuarioActual) {
        await actualizarTimestampCola(colaActual);
    }
}

async function mantenerSesionActiva() {
    if (colaActual && colasEnUso[colaActual] && colasEnUso[colaActual].usuario === usuarioActual) {
        await actualizarTimestampCola(colaActual);
    }
}

async function actualizarTimestampCola(cola) {
    try {
        await database.ref(`colasEnUso/${cola}`).update({
            timestamp: Date.now(),
            lastHeartbeat: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error actualizando timestamp:', error);
    }
}

function verificarConexionFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        const estado = snap.val() === true ? 'connected' : 'disconnected';
        const indicator = document.getElementById('firebaseIndicator');
        const indicatorDetalle = document.getElementById('firebaseIndicatorDetalle');
        
        if (indicator) indicator.className = `connection-indicator ${estado}`;
        if (indicatorDetalle) indicatorDetalle.className = `connection-indicator ${estado}`;
        
        if (estado === 'connected') {
            console.log('Conectado a Firebase');
        }
    });
}

function cargarDatosDesdeCache() {
    const cache = localStorage.getItem('cacheReposicion');
    if (cache) {
        try {
            const datos = JSON.parse(cache);
            datosReposicion = datos;
            console.log('Datos cargados desde cache:', datosReposicion);
            procesarDatosColas();
        } catch (error) {
            console.error('Error parseando cache:', error);
        }
    }
    
    const sesionGuardada = localStorage.getItem('sesionReposicionActiva');
    if (sesionGuardada) {
        try {
            sesionActiva = JSON.parse(sesionGuardada);
            colaActual = sesionActiva.cola;
            sessionId = sesionActiva.sessionId || generarSessionId();
            
            setTimeout(() => {
                verificarSesionActiva();
            }, 1000);
        } catch (error) {
            console.error('Error parseando sesión:', error);
        }
    } else {
        sessionId = generarSessionId();
    }
    
    cargarReposicionesDesdeFirebase();
}

async function cargarReposicionesDesdeFirebase() {
    mostrarLoading(true);
    
    try {
        const [recoleccionSnapshot, reposicionesSnapshot, colasEnUsoSnapshot] = await Promise.all([
            database.ref('recolecciones').once('value'),
            database.ref('reposiciones').once('value'),
            database.ref('colasEnUso').once('value')
        ]);
        
        const recoleccionData = recoleccionSnapshot.val();
        const reposicionesData = reposicionesSnapshot.val();
        const colasEnUsoData = colasEnUsoSnapshot.val();
        
        if (recoleccionData) {
            procesarDatosRecoleccion(recoleccionData, reposicionesData || {});
        }
        
        if (colasEnUsoData) {
            colasEnUso = colasEnUsoData;
        }
        
        iniciarListenerColasEnUso();
        
        mostrarLoading(false);
        mostrarMensaje('Datos cargados correctamente', true);
    } catch (error) {
        console.error('Error cargando datos:', error);
        mostrarMensaje('Error cargando datos: ' + error.message, false);
        mostrarLoading(false);
    }
}

function iniciarListenerColasEnUso() {
    database.ref('colasEnUso').on('value', (snapshot) => {
        colasEnUso = snapshot.val() || {};
        actualizarVistaColas();
        
        if (colaActual && colasEnUso[colaActual] && 
            colasEnUso[colaActual].usuario !== usuarioActual) {
            mostrarColaOcupadaModal();
            volverAColasForzado();
        }
    });
}

function procesarDatosColas() {
    colasData = {};
    
    const colasOrdenadas = Object.keys(datosReposicion).sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
    });
    
    colasOrdenadas.forEach(cola => {
        const datosCola = datosReposicion[cola];
        if (!datosCola) return;
        
        colasData[cola] = {
            totalPlanificado: datosCola.totalPlanificado || 0,
            totalRepuesto: datosCola.totalRepuesto || 0,
            depositos: datosCola.depositos || {}
        };
    });
    
    actualizarVistaColas();
}

function actualizarVistaColas() {
    const grid = document.getElementById('colasGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (Object.keys(colasData).length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">No hay colas activas para reponer hoy</div>';
        return;
    }
    
    Object.keys(colasData).forEach(cola => {
        const button = document.createElement('button');
        button.className = 'cola-button';
        
        const data = colasData[cola];
        const porcentaje = data.totalPlanificado > 0 ? (data.totalRepuesto / data.totalPlanificado) * 100 : 0;
        
        if (porcentaje >= 100) {
            button.classList.add('completo');
        }
        
        const colaEnUso = colasEnUso[cola];
        const estaEnUsoPorOtro = colaEnUso && colaEnUso.usuario !== usuarioActual;
        
        if (estaEnUsoPorOtro) {
            button.classList.add('disabled');
        }
        
        button.textContent = `${cola} ${data.totalRepuesto}/${data.totalPlanificado}`;
        
        if (!estaEnUsoPorOtro && porcentaje < 100) {
            button.onclick = () => seleccionarCola(cola);
        } else if (estaEnUsoPorOtro) {
            button.title = `En uso por: ${colaEnUso.usuario}`;
        } else {
            button.title = 'Cola completada';
        }
        
        grid.appendChild(button);
    });
}

async function seleccionarCola(cola) {
    if (colasEnUso[cola] && colasEnUso[cola].usuario !== usuarioActual) {
        mostrarColaOcupadaModal();
        return;
    }
    
    const exito = await tomarColaEnUso(cola);
    if (!exito) {
        mostrarMensaje('No se pudo acceder a la cola. Intenta nuevamente.', false);
        return;
    }
    
    colaActual = cola;
    depositosConTallas = [];
    depositoActual = null;
    tallaActual = null;
    depositoActualIndex = -1;
    tallaActualIndex = -1;
    depositoEscaneadoCorrectamente = false;
    depositosExpandidos = {};
    
    guardarSesionActiva();
    
    mostrarVistaDetalleCola();
    
    setTimeout(() => {
        const currentColaDisplay = document.getElementById('currentColaDisplay');
        if (currentColaDisplay) currentColaDisplay.textContent = cola;
        
        inicializarDetalleCola();
    }, 50);
}

async function tomarColaEnUso(cola) {
    try {
        const colaRef = database.ref(`colasEnUso/${cola}`);
        
        const resultado = await colaRef.transaction((currentData) => {
            if (currentData === null) {
                return {
                    usuario: usuarioActual,
                    timestamp: Date.now(),
                    fecha: obtenerFechaActual(),
                    sessionId: sessionId
                };
            }
            
            if (currentData.usuario === usuarioActual && currentData.sessionId === sessionId) {
                return {
                    ...currentData,
                    timestamp: Date.now()
                };
            }
            
            return currentData;
        });
        
        return resultado.committed;
    } catch (error) {
        console.error('Error tomando cola:', error);
        return false;
    }
}

function guardarSesionActiva() {
    if (colaActual && usuarioActual) {
        sesionActiva = {
            usuario: usuarioActual,
            cola: colaActual,
            timestamp: Date.now(),
            sessionId: sessionId
        };
        localStorage.setItem('sesionReposicionActiva', JSON.stringify(sesionActiva));
    }
}

function mostrarVistaListaColas() {
    const vistaLista = document.getElementById('vistaListaColas');
    const vistaDetalle = document.getElementById('vistaDetalleCola');
    
    if (vistaLista) vistaLista.style.display = 'flex';
    if (vistaDetalle) vistaDetalle.style.display = 'none';
}

function mostrarVistaDetalleCola() {
    const vistaLista = document.getElementById('vistaListaColas');
    const vistaDetalle = document.getElementById('vistaDetalleCola');
    
    if (vistaLista) vistaLista.style.display = 'none';
    if (vistaDetalle) vistaDetalle.style.display = 'flex';
}

function inicializarDetalleCola() {
    if (!colaActual || !colasData[colaActual]) {
        mostrarMensajeDetalle('No se ha seleccionado una cola válida', false);
        setTimeout(() => mostrarVistaListaColas(), 2000);
        return;
    }
    
    prepararDepositosConTallas();
    inicializarInterfazDetalle();
    
    // Encontrar el PRIMER depósito con tallas pendientes
    let primerDepositoPendiente = -1;
    let primerTallaPendiente = -1;
    
    for (let i = 0; i < depositosConTallas.length; i++) {
        const deposito = depositosConTallas[i];
        
        if (!deposito.completado && deposito.tallas && deposito.tallas.length > 0) {
            for (let j = 0; j < deposito.tallas.length; j++) {
                const talla = deposito.tallas[j];
                if (!talla.completado && talla.cantidadRepuesta < talla.cantidadPlanificada) {
                    primerDepositoPendiente = i;
                    primerTallaPendiente = j;
                    break;
                }
            }
            if (primerDepositoPendiente !== -1) break;
        }
    }
    
    if (primerDepositoPendiente !== -1 && primerTallaPendiente !== -1) {
        establecerDepositoYTallActual(primerDepositoPendiente, primerTallaPendiente);
    } else {
        // Si no hay pendientes
        mostrarMensajeDetalle('No hay artículos pendientes en esta cola', true);
    }
}

function inicializarInterfazDetalle() {
    actualizarListaDepositosConTallas();
    
    const depositoInput = document.getElementById('depositoInput');
    const upcInput = document.getElementById('upcInput');
    
    if (depositoInput) {
        depositoInput.addEventListener('input', function(e) {
            const deposito = this.value.trim();
            if (deposito.length >= 5) {
                validarDeposito(deposito);
            }
        });
    }
    
    if (upcInput) {
        upcInput.addEventListener('input', function(e) {
            const upc = this.value.trim();
            if (upc.length >= 10) {
                setTimeout(() => {
                    procesarEscaneoUPC(upc);
                    this.value = '';
                }, 100);
            }
        });
    }
    
    setTimeout(() => {
        if (depositoInput) {
            depositoInput.focus();
            depositoInput.select();
        }
    }, 100);
}

function establecerDepositoYTallActual(depositoIndex, tallaIndex) {
    if (depositoIndex < 0 || depositoIndex >= depositosConTallas.length) return;
    if (tallaIndex < 0 || tallaIndex >= depositosConTallas[depositoIndex].tallas.length) return;
    
    depositoActual = depositosConTallas[depositoIndex];
    tallaActual = depositoActual.tallas[tallaIndex];
    depositoActualIndex = depositoIndex;
    tallaActualIndex = tallaIndex;
    depositoEscaneadoCorrectamente = false;
    
    console.log('Estableciendo actual:', {
        deposito: depositoActual.deposito,
        talla: tallaActual.articulo,
        planificado: tallaActual.cantidadPlanificada,
        repuesto: tallaActual.cantidadRepuesta
    });
    
    // Actualizar interfaz
    const elementos = {
        'currentDepositoDisplay': depositoActual.deposito,
        'currentArticuloDisplay': tallaActual.articulo || 'Artículo',
        'currentTallaDisplay': tallaActual.articulo,
        'cantidadTotal': tallaActual.cantidadPlanificada,
        'cantidadLeida': tallaActual.cantidadRepuesta,
        'cantidadPendiente': tallaActual.cantidadPlanificada - tallaActual.cantidadRepuesta
    };
    
    Object.keys(elementos).forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.textContent = elementos[id];
        }
    });
    
    const depositoInput = document.getElementById('depositoInput');
    const upcInput = document.getElementById('upcInput');
    
    if (depositoInput && upcInput) {
        depositoInput.value = '';
        depositoInput.className = 'scan-input cursor-blink';
        depositoInput.disabled = false;
        upcInput.value = '';
        upcInput.disabled = true;
        upcInput.className = 'scan-input';
        
        setTimeout(() => {
            depositoInput.focus();
            depositoInput.select();
        }, 50);
    }
    
    actualizarInfoSiguienteDeposito();
    actualizarListaDepositosConTallas();
    
    mostrarMensajeDetalle(`Listo para escanear: ${depositoActual.deposito} - ${tallaActual.articulo}`, true);
}

function actualizarInfoSiguienteDeposito() {
    const nextInfo = document.getElementById('nextDepositoInfo');
    if (!nextInfo) return;
    
    // Buscar siguiente depósito no completado
    for (let i = depositoActualIndex + 1; i < depositosConTallas.length; i++) {
        const deposito = depositosConTallas[i];
        if (!deposito.completado) {
            // Verificar si tiene tallas pendientes
            for (let j = 0; j < deposito.tallas.length; j++) {
                if (!deposito.tallas[j].completado) {
                    nextInfo.textContent = `Siguiente: ${deposito.deposito}`;
                    return;
                }
            }
        }
    }
    
    nextInfo.textContent = 'Último depósito de la cola';
}

function validarDeposito(deposito) {
    if (!depositoActual) {
        mostrarMensajeDetalle('Primero selecciona un depósito', false);
        return;
    }
    
    if (deposito === depositoActual.deposito) {
        depositoEscaneadoCorrectamente = true;
        const depositoInput = document.getElementById('depositoInput');
        const upcInput = document.getElementById('upcInput');
        
        if (depositoInput && upcInput) {
            depositoInput.className = 'scan-input deposito-escaneado';
            depositoInput.disabled = true;
            
            upcInput.disabled = false;
            upcInput.className = 'scan-input cursor-blink';
            
            setTimeout(() => {
                upcInput.focus();
                upcInput.select();
            }, 50);
        }
        
        mostrarMensajeDetalle(`Depósito ${deposito} escaneado correctamente`, true);
        
        setTimeout(() => {
            if (depositoInput) depositoInput.value = '';
        }, 300);
    } else {
        mostrarMensajeDetalle(`ERROR: Depósito incorrecto. Se esperaba: ${depositoActual.deposito}`, false);
        const depositoInput = document.getElementById('depositoInput');
        if (depositoInput) {
            depositoInput.value = '';
            setTimeout(() => {
                depositoInput.focus();
                depositoInput.select();
            }, 50);
        }
    }
}

function actualizarListaDepositosConTallas() {
    const lista = document.getElementById('depositosList');
    if (!lista) return;
    
    lista.innerHTML = '';
    
    if (depositosConTallas.length === 0) {
        lista.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">No hay depósitos para esta cola</div>';
        return;
    }
    
    depositosConTallas.forEach((deposito, depositoIndex) => {
        const estaExpandido = depositosExpandidos[depositoIndex] || false;
        const esActivo = depositoActual && deposito.deposito === depositoActual.deposito;
        
        let estadoClase = '';
        if (deposito.completado) {
            estadoClase = 'completado';
        } else if (deposito.totalRepuesto > 0) {
            estadoClase = 'parcial';
        } else {
            estadoClase = 'pendiente';
        }
        
        if (esActivo) {
            estadoClase += ' activo';
        }
        
        const depositoGroup = document.createElement('div');
        depositoGroup.className = 'deposito-con-tallas';
        depositoGroup.id = `deposito-${depositoIndex}`;
        
        const headerRow = document.createElement('div');
        headerRow.className = `deposito-header-row ${estaExpandido ? 'expanded' : ''} ${estadoClase}`;
        headerRow.innerHTML = `
            <div class="expand-icon ${estaExpandido ? 'expanded' : ''}">▶</div>
            <div>
                <strong>${deposito.deposito}</strong>
                <span class="talla-info">${deposito.tallas.length} artículos</span>
            </div>
            <div>${deposito.totalPlanificado}</div>
            <div>${deposito.totalRepuesto}</div>
        `;
        
        headerRow.onclick = (e) => {
            if (!e.target.classList.contains('status-indicator')) {
                toggleExpandirDeposito(depositoIndex);
            }
        };
        
        const tallasContainer = document.createElement('div');
        tallasContainer.className = `tallas-container ${estaExpandido ? 'expanded' : ''}`;
        
        if (deposito.tallas && deposito.tallas.length > 0) {
            deposito.tallas.forEach((talla, tallaIndex) => {
                const esTallaSeleccionada = esActivo && tallaActual && talla.upc === tallaActual.upc;
                const tallaCompletada = talla.completado;
                const tallaEstadoClase = tallaCompletada ? 'completada' : 'pendiente';
                
                const tallaRow = document.createElement('div');
                tallaRow.className = `talla-item ${esTallaSeleccionada ? 'seleccionada' : ''} ${tallaEstadoClase}`;
                
                tallaRow.innerHTML = `
                    <div>
                        <span class="status-indicator ${tallaCompletada ? 'status-completed' : (esTallaSeleccionada ? 'status-selected' : 'status-pending')}"></span>
                    </div>
                    <div>
                        <small>${talla.articulo}</small>
                    </div>
                    <div>${talla.cantidadPlanificada}</div>
                    <div>${talla.cantidadRepuesta}</div>
                `;
                
                tallaRow.onclick = () => seleccionarTalla(depositoIndex, tallaIndex);
                tallasContainer.appendChild(tallaRow);
            });
        }
        
        depositoGroup.appendChild(headerRow);
        depositoGroup.appendChild(tallasContainer);
        lista.appendChild(depositoGroup);
    });
}

function toggleExpandirDeposito(depositoIndex) {
    depositosExpandidos[depositoIndex] = !depositosExpandidos[depositoIndex];
    actualizarListaDepositosConTallas();
}

function seleccionarTalla(depositoIndex, tallaIndex) {
    establecerDepositoYTallActual(depositoIndex, tallaIndex);
}

function siguienteTalla() {
    if (!depositoActual || !depositoActual.tallas) {
        siguienteDeposito();
        return;
    }
    
    // Buscar siguiente talla pendiente en el MISMO depósito
    for (let i = tallaActualIndex + 1; i < depositoActual.tallas.length; i++) {
        const talla = depositoActual.tallas[i];
        if (!talla.completado && talla.cantidadRepuesta < talla.cantidadPlanificada) {
            establecerDepositoYTallActual(depositoActualIndex, i);
            return;
        }
    }
    
    // Si no hay más tallas pendientes en este depósito, ir al siguiente
    siguienteDeposito();
}

async function volverAColas() {
    // Guardar cualquier cambio pendiente
    if (depositoEscaneadoCorrectamente) {
        const upcInput = document.getElementById('upcInput');
        if (upcInput && upcInput.value.trim().length >= 10) {
            await procesarEscaneoUPC(upcInput.value.trim());
        }
    }
    
    // Liberar la cola
    await liberarColaEnUso(colaActual);
    
    // Limpiar estado
    limpiarSesionActiva();
    colaActual = '';
    depositosConTallas = [];
    depositoActual = null;
    tallaActual = null;
    depositoActualIndex = -1;
    tallaActualIndex = -1;
    depositoEscaneadoCorrectamente = false;
    depositosExpandidos = {};
    
    mostrarVistaListaColas();
}

async function liberarColaEnUso(cola) {
    if (!cola) return;
    
    try {
        const colaRef = database.ref(`colasEnUso/${cola}`);
        const snapshot = await colaRef.once('value');
        
        if (snapshot.exists()) {
            const colaData = snapshot.val();
            if (colaData.usuario === usuarioActual && colaData.sessionId === sessionId) {
                await colaRef.remove();
                console.log(`✅ Cola ${cola} liberada por ${usuarioActual}`);
            }
        }
    } catch (error) {
        console.error('Error liberando cola:', error);
    }
}

function limpiarSesionActiva() {
    localStorage.removeItem('sesionReposicionActiva');
    sesionActiva = null;
}

function generarSessionId() {
    return `${usuarioActual}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function mostrarColaOcupadaModal() {
    const modal = document.getElementById('colaOcupadaModal');
    if (modal) modal.style.display = 'flex';
}

function cerrarColaOcupadaModal() {
    const modal = document.getElementById('colaOcupadaModal');
    if (modal) modal.style.display = 'none';
}

function mostrarSesionRecuperadaModal() {
    const modal = document.getElementById('sesionRecuperadaModal');
    if (modal) modal.style.display = 'flex';
}

function cerrarSesionRecuperadaModal() {
    const modal = document.getElementById('sesionRecuperadaModal');
    if (modal) modal.style.display = 'none';
}

function mostrarPantallaExito() {
    const successScreen = document.getElementById('successScreen');
    if (successScreen) {
        successScreen.style.display = 'flex';
        setTimeout(() => {
            successScreen.style.display = 'none';
        }, 1000);
    }
}

function volverAColasForzado() {
    if (colaActual) {
        liberarColaEnUso(colaActual);
    }
    limpiarSesionActiva();
    colaActual = '';
    mostrarVistaListaColas();
}

function cargarDatosReposicion() {
    cargarReposicionesDesdeFirebase();
    mostrarMensaje('Datos actualizados', true);
}

function volverAlPrincipal() {
    window.location.href = 'index.html';
}