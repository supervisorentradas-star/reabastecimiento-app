// ================= CONFIGURACIÓN =================
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
let datosReposicion = {};
let colasDisponibles = [];
let depositoActual = null;
let usuarioActual = null;
let colaSeleccionada = null;
let escaneosReposicion = {};
let ultimaActualizacion = null;
let sesionActiva = null;
let escaneosPendientes = [];
let colaEnUsoRef = null;
let estaSincronizando = false;
let colasEnUso = {};
let escaneosConsolidados = {};
let sessionId = null;

// VARIABLES PARA GESTIÓN DE DEPÓSITOS
let itemActualKey = null;
let depositosExpandidos = {};

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', function() {
    inicializarEventListeners();
    inicializarAplicacion();
});

function inicializarEventListeners() {
    document.getElementById('refreshButtonVentana1').addEventListener('click', cargarDatosReposicion);
    document.getElementById('refreshButtonVentana2').addEventListener('click', cargarDatosReposicion);
    document.getElementById('siguienteDepositoBtn').addEventListener('click', siguienteDeposito);
    document.getElementById('volverAColasBtn').addEventListener('click', volverAColas);
    document.getElementById('volverAlPrincipalBtn').addEventListener('click', volverAlPrincipal);
    document.getElementById('volverAlPrincipalBtnVentana2').addEventListener('click', volverAlPrincipal);
    
    document.getElementById('depositoInput').addEventListener('input', function(e) {
        const deposito = e.target.value.trim();
        if (deposito) {
            validarDeposito(deposito);
        }
    });

    document.getElementById('upcInput').addEventListener('input', function(e) {
        const upc = e.target.value.trim();
        if (upc.length >= 8) {
            validarUPC(upc);
        }
    });
}

async function inicializarAplicacion() {
    console.log("🔧 INICIANDO MÓDULO DE REPOSICIÓN...");
    inicializarFirebase();
    inicializarListenersTiempoReal();
    verificarSesionActiva();
    
    escaneosPendientes = JSON.parse(localStorage.getItem('escaneosPendientes') || '[]');
    escaneosConsolidados = JSON.parse(localStorage.getItem('escaneosConsolidados') || '{}');
    
    setTimeout(() => {
        cargarDatosReposicion();
    }, 1000);

    setInterval(sincronizarEscaneosPendientes, 30000);
    setInterval(limpiarColasAbandonadas, 60000);
}

// ================= CONEXIÓN FIREBASE =================
function inicializarFirebase() {
    try {
        const connectedRef = database.ref(".info/connected");
        connectedRef.on("value", function(snap) {
            if (snap.val() === true) {
                document.getElementById('firebaseIndicator').className = 'connection-indicator connected';
                document.getElementById('firebaseIndicatorVentana2').className = 'connection-indicator connected';
                sincronizarEscaneosPendientes();
            } else {
                document.getElementById('firebaseIndicator').className = 'connection-indicator disconnected';
                document.getElementById('firebaseIndicatorVentana2').className = 'connection-indicator disconnected';
            }
        });

    } catch (error) {
        console.error("Error inicializando Firebase:", error);
    }
}

function inicializarListenersTiempoReal() {
    database.ref('colasEnUso').on('value', (snapshot) => {
        colasEnUso = snapshot.val() || {};
        actualizarListaColas();
        
        if (colaSeleccionada && colasEnUso[colaSeleccionada] && colasEnUso[colaSeleccionada].usuario !== usuarioActual) {
            mostrarError(`La cola ${colaSeleccionada} ha sido tomada por ${colasEnUso[colaSeleccionada].usuario}.`, 'ventana2');
            limpiarSesionActiva();
            mostrarVentanaColas();
        }
    });
}

// ================= ESTRUCTURA DE DATOS =================
async function procesarDatosReposicion(recoleccionData, reposicionesData) {
    const nuevosDatosReposicion = {};
    const nuevasColasDisponibles = [];
    const fechaActual = obtenerFechaActual();
    
    console.log("📅 Filtrando por fecha actual:", fechaActual);
    
    let registrosProcesados = 0;
    let registrosConColaReposicion = 0;

    Object.values(recoleccionData).forEach(registro => {
        try {
            registrosProcesados++;
            
            const fechaRegistro = normalizarFecha(registro.fecha);
            if (fechaRegistro !== fechaActual) {
                return;
            }

            const depositoDestino = registro.deposito_destino;
            const colaReposicion = registro.cola_reposicion;
            const cantidad = parseInt(registro.cantidad_recolectada) || parseInt(registro.recolectado) || 0;
            const descripcion = registro.descripcion;
            const upc = registro.upc;
            
            if (depositoDestino && colaReposicion && cantidad > 0) {
                registrosConColaReposicion++;
                
                if (!nuevosDatosReposicion[colaReposicion]) {
                    nuevosDatosReposicion[colaReposicion] = {
                        depositos: {},
                        cantidadTotal: 0,
                        nombre: `Cola ${colaReposicion}`
                    };
                    
                    if (!nuevasColasDisponibles.includes(colaReposicion)) {
                        nuevasColasDisponibles.push(colaReposicion);
                    }
                }
                
                if (!nuevosDatosReposicion[colaReposicion].depositos[depositoDestino]) {
                    nuevosDatosReposicion[colaReposicion].depositos[depositoDestino] = {
                        items: {},
                        cantidadTotal: 0,
                        cantidadEscaneada: 0,
                        completado: false
                    };
                }
                
                const deposito = nuevosDatosReposicion[colaReposicion].depositos[depositoDestino];
                
                if (!deposito.items[upc]) {
                    deposito.items[upc] = {
                        upc: upc,
                        articulo: descripcion,
                        cantidad: 0,
                        cantidadEscaneada: 0,
                        completado: false
                    };
                }
                
                deposito.items[upc].cantidad += cantidad;
                deposito.cantidadTotal += cantidad;
                nuevosDatosReposicion[colaReposicion].cantidadTotal += cantidad;
            }
        } catch (error) {
            console.error("❌ Error procesando registro:", error, registro);
        }
    });
    
    if (reposicionesData) {
        console.log("📊 Procesando escaneos existentes de reposiciones...");
        
        Object.values(reposicionesData).forEach(escaneo => {
            try {
                const fechaEscaneo = normalizarFecha(escaneo.fecha);
                if (fechaEscaneo !== fechaActual) {
                    return;
                }

                const cola = escaneo.cola;
                const deposito = escaneo.deposito;
                const upc = escaneo.upc;
                
                if (cola && deposito && upc && nuevosDatosReposicion[cola] && nuevosDatosReposicion[cola].depositos[deposito]) {
                    const depositoData = nuevosDatosReposicion[cola].depositos[deposito];
                    
                    if (depositoData.items[upc]) {
                        depositoData.items[upc].cantidadEscaneada = (depositoData.items[upc].cantidadEscaneada || 0) + 1;
                        depositoData.cantidadEscaneada = (depositoData.cantidadEscaneada || 0) + 1;
                        
                        if (depositoData.items[upc].cantidadEscaneada > depositoData.items[upc].cantidad) {
                            depositoData.items[upc].cantidadEscaneada = depositoData.items[upc].cantidad;
                        }
                        if (depositoData.cantidadEscaneada > depositoData.cantidadTotal) {
                            depositoData.cantidadEscaneada = depositoData.cantidadTotal;
                        }
                        
                        depositoData.items[upc].completado = depositoData.items[upc].cantidadEscaneada >= depositoData.items[upc].cantidad;
                        depositoData.completado = depositoData.cantidadEscaneada >= depositoData.cantidadTotal;
                    }
                }
            } catch (error) {
                console.error("❌ Error procesando escaneo existente:", error, escaneo);
            }
        });
    }
    
    datosReposicion = nuevosDatosReposicion;
    colasDisponibles = nuevasColasDisponibles.sort(ordenarColas);
    
    console.log("📊 RESUMEN PROCESAMIENTO:", {
        registrosProcesados,
        registrosConColaReposicion,
        colasDisponibles: colasDisponibles,
        depositosProcesados: Object.keys(nuevosDatosReposicion).reduce((acc, cola) => acc + Object.keys(nuevosDatosReposicion[cola].depositos).length, 0)
    });
    
    ultimaActualizacion = new Date();
    actualizarInfoCache();
    actualizarListaColas();
    
    if (document.getElementById('ventanaReposicion') && !document.getElementById('ventanaReposicion').classList.contains('hidden')) {
        actualizarListaDepositos();
        if (depositoActual && itemActualKey) {
            actualizarInterfazDeposito();
        } else {
            seleccionarPrimerDepositoPendiente();
        }
    }
}

// ================= FUNCIONES DE APOYO =================
function obtenerFechaActual() {
    const ahora = new Date();
    const dia = String(ahora.getDate()).padStart(2, '0');
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const año = ahora.getFullYear();
    return `${dia}/${mes}/${año}`;
}

function normalizarFecha(fecha) {
    if (!fecha) return null;
    
    if (typeof fecha === 'string' && fecha.includes('/')) {
        const partes = fecha.split('/');
        if (partes.length === 3) {
            const dia = partes[0].padStart(2, '0');
            const mes = partes[1].padStart(2, '0');
            const año = partes[2];
            return `${dia}/${mes}/${año}`;
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

function ordenarColas(a, b) {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
}

// FUNCIÓN MEJORADA PARA ORDENAR DEPÓSITOS
function ordenarDepositos(a, b) {
    // Separar las partes del depósito: P01-001-A -> [P01, 001, A]
    const partesA = a.split('-');
    const partesB = b.split('-');
    
    // Comparar la primera parte (P01 vs P01)
    if (partesA[0] !== partesB[0]) {
        return partesA[0].localeCompare(partesB[0]);
    }
    
    // Comparar la segunda parte numérica (001 vs 002)
    const numA = parseInt(partesA[1]) || 0;
    const numB = parseInt(partesB[1]) || 0;
    if (numA !== numB) {
        return numA - numB;
    }
    
    // Comparar la tercera parte (A vs B)
    if (partesA[2] && partesB[2]) {
        return partesA[2].localeCompare(partesB[2]);
    }
    
    return 0;
}

// ================= INTERFAZ DE COLAS =================
function mostrarVentanaColas() {
    document.getElementById('ventanaColas').classList.remove('hidden');
    document.getElementById('ventanaReposicion').classList.add('hidden');
    cargarDatosReposicion();
}

function mostrarVentanaReposicion() {
    document.getElementById('ventanaColas').classList.add('hidden');
    document.getElementById('ventanaReposicion').classList.remove('hidden');
    actualizarListaDepositos();
    seleccionarPrimerDepositoPendiente();
    document.getElementById('depositoInput').focus();
}

function actualizarListaColas() {
    const container = document.getElementById('rutasContainer');
    container.innerHTML = '';
    
    if (colasDisponibles.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #7f8c8d; grid-column: 1 / -1;">
                <p>No hay colas activas para reponer hoy</p>
                <p style="font-size: 10px; margin-top: 8px;">
                    Fecha actual: ${obtenerFechaActual()}
                </p>
            </div>
        `;
        return;
    }
    
    colasDisponibles.forEach(cola => {
        const datosCola = datosReposicion[cola];
        
        if (!datosCola) return;
        
        let cantidadEscaneadaCola = 0;
        let cantidadTotalCola = 0;
        
        if (datosCola && datosCola.depositos) {
            for (let deposito in datosCola.depositos) {
                cantidadEscaneadaCola += datosCola.depositos[deposito].cantidadEscaneada || 0;
                cantidadTotalCola += datosCola.depositos[deposito].cantidadTotal || 0;
            }
        }
        
        const colaCompletada = cantidadEscaneadaCola >= cantidadTotalCola;
        
        const div = document.createElement('div');
        
        const colaEstaEnUso = colasEnUso[cola];
        const estaEnUsoPorOtro = colaEstaEnUso && colaEstaEnUso.usuario !== usuarioActual;
        
        div.className = `cola-button ${estaEnUsoPorOtro ? 'disabled' : ''} ${colaCompletada ? 'completed' : ''}`;
        
        div.innerHTML = `
            <strong>COLA ${cola}</strong><br>
            <span style="font-size: 11px;">
                ${cantidadEscaneadaCola}/${cantidadTotalCola} unidades
            </span>
            ${colaCompletada ? '<br><small style="color:#27ae60;">COMPLETADA</small>' : ''}
            ${estaEnUsoPorOtro ? '<br><small style="color:#e74c3c;">EN USO</small>' : ''}
        `;
        
        if (!estaEnUsoPorOtro && !colaCompletada) {
            div.onclick = () => seleccionarCola(cola);
        } else if (colaCompletada) {
            div.title = 'Esta cola ya está completada';
        } else {
            div.title = `Esta cola está siendo trabajada por ${colaEstaEnUso.usuario}`;
        }
        
        container.appendChild(div);
    });
}

// ================= GESTIÓN DE DEPÓSITOS MEJORADA =================
function actualizarListaDepositos() {
    const grid = document.getElementById('depositosGrid');
    grid.innerHTML = '';
    
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada]) return;
    
    // OBTENER DEPÓSITOS ORDENADOS CORRELATIVAMENTE
    const depositosCola = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    
    depositosCola.forEach(deposito => {
        const depositoData = datosReposicion[colaSeleccionada].depositos[deposito];
        const items = depositoData.items;
        const itemKeys = Object.keys(items);
        
        let estadoClase = '';
        if (depositoData.completado) {
            estadoClase = 'completado';
        } else if (depositoData.cantidadEscaneada > 0) {
            estadoClase = 'parcial';
        } else {
            estadoClase = 'pendiente';
        }
        
        // RESALTAR DEPÓSITO ACTUAL
        if (deposito === depositoActual) {
            estadoClase += ' deposito-activo';
        }
        
        const estaExpandido = depositosExpandidos[deposito] || false;
        
        const depositoGroup = document.createElement('div');
        depositoGroup.className = 'deposito-group';
        depositoGroup.id = `deposito-${deposito.replace(/\s+/g, '-')}`;
        
        const headerRow = document.createElement('div');
        headerRow.className = `deposito-header-row ${estaExpandido ? 'expanded' : ''} ${estadoClase}`;
        headerRow.innerHTML = `
            <div class="expand-icon ${estaExpandido ? 'expanded' : ''}">▶</div>
            <div>
                <strong>${deposito}</strong>
                <span class="talla-info">${itemKeys.length} tallas</span>
            </div>
            <div>${depositoData.cantidadTotal}</div>
            <div>${depositoData.cantidadEscaneada}</div>
        `;
        
        headerRow.onclick = (e) => {
            if (!e.target.classList.contains('status-indicator')) {
                toggleExpandirDeposito(deposito);
            }
        };
        
        const itemsContainer = document.createElement('div');
        itemsContainer.className = `deposito-items ${estaExpandido ? 'expanded' : ''}`;
        
        itemKeys.forEach(itemKey => {
            const item = items[itemKey];
            const itemSeleccionado = (deposito === depositoActual && itemKey === itemActualKey);
            const itemCompletado = item.completado;
            const itemEstadoClase = itemCompletado ? 'completed' : 'pendiente';
            
            const itemRow = document.createElement('div');
            itemRow.className = `deposito-item-row ${itemSeleccionado ? 'selected' : ''} ${itemEstadoClase}`;
            
            itemRow.innerHTML = `
                <div>
                    <span class="status-indicator ${itemCompletado ? 'status-completed' : (itemSeleccionado ? 'status-selected' : 'status-pending')}"></span>
                </div>
                <div>
                    <small>${item.articulo}</small>
                </div>
                <div>${item.cantidad}</div>
                <div>${item.cantidadEscaneada}</div>
            `;
            
            itemRow.onclick = () => seleccionarItem(deposito, itemKey);
            itemsContainer.appendChild(itemRow);
        });
        
        depositoGroup.appendChild(headerRow);
        depositoGroup.appendChild(itemsContainer);
        grid.appendChild(depositoGroup);
    });
}

function toggleExpandirDeposito(deposito) {
    depositosExpandidos[deposito] = !depositosExpandidos[deposito];
    actualizarListaDepositos();
}

// FUNCIÓN PARA SELECCIONAR ITEM DESDE LA LISTA - CORREGIDA
function seleccionarItem(deposito, itemKey) {
    depositoActual = deposito;
    itemActualKey = itemKey;
    
    // NO AUTORELLENAR EL CAMPO DE DEPÓSITO - DEBE ESCANEARSE
    // document.getElementById('depositoInput').value = ''; // Esto se mantiene vacío
    
    actualizarInterfazDeposito();
    document.getElementById('upcInput').disabled = false;
    document.getElementById('depositoInput').focus(); // Enfocar el campo para escanear
    
    // ACTUALIZAR LA LISTA PARA MOSTRAR EL DEPÓSITO SELECCIONADO
    actualizarListaDepositos();
}

function obtenerItemActual() {
    if (!depositoActual || !itemActualKey || !colaSeleccionada) return null;
    
    const depositoData = datosReposicion[colaSeleccionada].depositos[depositoActual];
    return depositoData ? depositoData.items[itemActualKey] : null;
}

function actualizarInterfazDeposito() {
    const itemActual = obtenerItemActual();
    
    if (!itemActual) {
        document.getElementById('currentDeposito').textContent = '-';
        document.getElementById('currentArticulo').textContent = '-';
        document.getElementById('counterSolicitada').textContent = '0';
        document.getElementById('counterRepuesta').textContent = '0';
        document.getElementById('counterPendiente').textContent = '0';
        return;
    }
    
    const pendiente = Math.max(0, itemActual.cantidad - itemActual.cantidadEscaneada);
    
    document.getElementById('currentDeposito').textContent = depositoActual;
    document.getElementById('currentArticulo').textContent = itemActual.articulo;
    document.getElementById('counterSolicitada').textContent = itemActual.cantidad;
    document.getElementById('counterRepuesta').textContent = itemActual.cantidadEscaneada;
    document.getElementById('counterPendiente').textContent = pendiente;
    
    actualizarListaDepositos();
}

function seleccionarPrimerDepositoPendiente() {
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada]) return;
    
    const depositosCola = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    
    for (let deposito of depositosCola) {
        const depositoData = datosReposicion[colaSeleccionada].depositos[deposito];
        const items = depositoData.items;
        const itemKeys = Object.keys(items);
        
        for (let itemKey of itemKeys) {
            const item = items[itemKey];
            if (!item.completado && item.cantidadEscaneada < item.cantidad) {
                depositoActual = deposito;
                itemActualKey = itemKey;
                actualizarInterfazDeposito();
                return;
            }
        }
    }
    
    if (depositosCola.length > 0) {
        depositoActual = depositosCola[0];
        const primerItemKey = Object.keys(datosReposicion[colaSeleccionada].depositos[depositoActual].items)[0];
        itemActualKey = primerItemKey;
        actualizarInterfazDeposito();
    }
}

// ================= SISTEMA DE ESCANEO =================
function validarDeposito(deposito) {
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada].depositos[deposito]) {
        mostrarError('Depósito incorrecto. Escanea un depósito válido para esta cola.', 'ventana2');
        document.getElementById('depositoInput').classList.add('error');
        document.getElementById('depositoInput').value = '';
        return;
    }
    
    const depositoData = datosReposicion[colaSeleccionada].depositos[deposito];
    const items = depositoData.items;
    const itemKeys = Object.keys(items);
    
    for (let itemKey of itemKeys) {
        const item = items[itemKey];
        if (!item.completado && item.cantidadEscaneada < item.cantidad) {
            depositoActual = deposito;
            itemActualKey = itemKey;
            
            actualizarInterfazDeposito();
            document.getElementById('depositoInput').value = deposito;
            document.getElementById('depositoInput').classList.remove('error');
            document.getElementById('upcInput').disabled = false;
            document.getElementById('upcInput').focus();
            return;
        }
    }
    
    mostrarError('Este depósito ya está completado.', 'ventana2');
    document.getElementById('depositoInput').value = '';
}

async function validarUPC(upc) {
    if (!depositoActual || !colaSeleccionada || !itemActualKey) return;
    
    const itemActual = obtenerItemActual();
    if (!itemActual) return;
    
    if (itemActual.completado) {
        mostrarError('Esta talla ya ha sido completada.', 'ventana2');
        document.getElementById('upcInput').value = '';
        return;
    }
    
    if (upc !== itemActual.upc) {
        mostrarError('UPC incorrecto. Escanea el código de la talla actual.', 'ventana2');
        document.getElementById('upcInput').classList.add('error');
        document.getElementById('upcInput').value = '';
        return;
    }
    
    document.getElementById('upcInput').classList.remove('error');
    
    await registrarEscaneoIndividual(upc);
    document.getElementById('upcInput').value = '';
    mostrarEscaneoExitoso();
    
    const nuevoItemActual = obtenerItemActual();
    if (nuevoItemActual.cantidadEscaneada >= nuevoItemActual.cantidad) {
        nuevoItemActual.completado = true;
        mostrarCompletado();
        setTimeout(() => {
            siguienteItem();
        }, 1000);
    }
}

function siguienteItem() {
    if (!depositoActual || !colaSeleccionada) return;
    
    const depositoData = datosReposicion[colaSeleccionada].depositos[depositoActual];
    const items = depositoData.items;
    const itemKeys = Object.keys(items);
    const currentIndex = itemKeys.indexOf(itemActualKey);
    
    for (let i = currentIndex + 1; i < itemKeys.length; i++) {
        const itemKey = itemKeys[i];
        const item = items[itemKey];
        if (!item.completado && item.cantidadEscaneada < item.cantidad) {
            itemActualKey = itemKey;
            actualizarInterfazDeposito();
            return;
        }
    }
    
    siguienteDeposito();
}

// ================= REGISTRO EN FIREBASE =================
async function registrarEscaneoIndividual(upc) {
    if (!depositoActual || !colaSeleccionada || !itemActualKey) return;
    
    const itemActual = obtenerItemActual();
    const depositoData = datosReposicion[colaSeleccionada].depositos[depositoActual];
    const fechaHora = new Date();
    
    const escaneo = {
        usuario: usuarioActual,
        cola: colaSeleccionada,
        deposito: depositoActual,
        upc: upc,
        descripcion: itemActual.articulo,
        cantidad: 1,
        fecha: fechaHora.toLocaleDateString(),
        hora: fechaHora.toLocaleTimeString(),
        timestamp: fechaHora.getTime(),
        sessionId: sessionId
    };
    
    try {
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            saveIndicator.textContent = 'Guardando...';
        }
        
        const registroKey = database.ref().child('reposiciones').push().key;
        await database.ref(`reposiciones/${registroKey}`).set(escaneo);
        
        const nuevaCantidadEscaneada = itemActual.cantidadEscaneada + 1;
        itemActual.cantidadEscaneada = Math.min(nuevaCantidadEscaneada, itemActual.cantidad);
        depositoData.cantidadEscaneada = Math.min(depositoData.cantidadEscaneada + 1, depositoData.cantidadTotal);
        
        itemActual.completado = itemActual.cantidadEscaneada >= itemActual.cantidad;
        depositoData.completado = depositoData.cantidadEscaneada >= depositoData.cantidadTotal;
        
        if (saveIndicator) {
            saveIndicator.textContent = '✅ Guardado';
            setTimeout(() => {
                saveIndicator.textContent = '';
            }, 2000);
        }
        
        actualizarInterfazDeposito();
        actualizarListaColas();
        
    } catch (error) {
        console.error('Error guardando escaneo individual:', error);
        
        escaneosPendientes.push(escaneo);
        localStorage.setItem('escaneosPendientes', JSON.stringify(escaneosPendientes));
        
        mostrarError('Error de conexión. Escaneo guardado localmente.', 'ventana2');
        
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            saveIndicator.textContent = '❌ Error';
        }
    }
}

// ================= FUNCIONES PRINCIPALES =================
async function siguienteDeposito() {
    if (!colaSeleccionada) return;
    
    const depositos = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    const currentIndex = depositos.indexOf(depositoActual);
    
    for (let i = currentIndex + 1; i < depositos.length; i++) {
        const deposito = depositos[i];
        const depositoData = datosReposicion[colaSeleccionada].depositos[deposito];
        const items = depositoData.items;
        const itemKeys = Object.keys(items);
        
        for (let itemKey of itemKeys) {
            const item = items[itemKey];
            if (!item.completado && item.cantidadEscaneada < item.cantidad) {
                depositoActual = deposito;
                itemActualKey = itemKey;
                
                // LIMPIAR EL CAMPO DE DEPÓSITO AL CAMBIAR
                document.getElementById('depositoInput').value = '';
                
                actualizarInterfazDeposito();
                return;
            }
        }
    }
    
    mostrarFinDeCola();
}

// ================= FUNCIONES DE NAVEGACIÓN =================
async function volverAColas() {
    await sincronizarEscaneosPendientes();
    
    await liberarColaEnUso(colaSeleccionada);
    
    limpiarSesionActiva();
    
    mostrarVentanaColas();
}

async function volverAlPrincipal() {
    await sincronizarEscaneosPendientes();
    
    if (colaSeleccionada) {
        await liberarColaEnUso(colaSeleccionada);
    }
    window.location.href = 'index.html';
}

// ================= FUNCIONES AUXILIARES =================
async function cargarDatosReposicion() {
    try {
        console.log("📥 CARGANDO DATOS DE RECOLECCIÓN Y REPOSICIÓN...");
        
        const [recoleccionSnapshot, reposicionesSnapshot] = await Promise.all([
            database.ref('recolecciones').once('value'),
            database.ref('reposiciones').once('value')
        ]);
        
        const recoleccionData = recoleccionSnapshot.val();
        const reposicionesData = reposicionesSnapshot.val();
        
        if (!recoleccionData) {
            mostrarMensaje('No se encontraron datos en recolecciones', 'warning');
            return;
        }
        
        await procesarDatosReposicion(recoleccionData, reposicionesData);
        
    } catch (error) {
        console.error('❌ ERROR CRÍTICO:', error);
        mostrarError('Error cargando datos: ' + error.message);
    }
}

async function seleccionarCola(cola) {
    const verificacion = await verificarIntegridadCola(cola);
    if (!verificacion.valida) {
        mostrarError(`No se puede acceder a la cola: ${verificacion.motivo}`);
        return;
    }
    
    const exito = await marcarColaComoEnUso(cola);
    if (!exito) {
        mostrarError('La cola fue tomada por otro usuario justo ahora.');
        return;
    }
    
    const datosCola = datosReposicion[cola];
    if (!datosCola) {
        mostrarError('No se encontraron datos para esta cola.');
        await liberarColaEnUso(cola);
        return;
    }
    
    let cantidadEscaneadaCola = 0;
    let cantidadTotalCola = 0;
    
    if (datosCola.depositos) {
        for (let deposito in datosCola.depositos) {
            cantidadEscaneadaCola += datosCola.depositos[deposito].cantidadEscaneada || 0;
            cantidadTotalCola += datosCola.depositos[deposito].cantidadTotal || 0;
        }
    }
    
    if (cantidadEscaneadaCola >= cantidadTotalCola) {
        mostrarError('Esta cola ya está completada.', 'ventana1');
        await liberarColaEnUso(cola);
        return;
    }
    
    colaSeleccionada = cola;
    guardarSesionActiva();
    
    document.getElementById('tituloCola').textContent = `COLA: ${cola}`;
    mostrarVentanaReposicion();
}

function actualizarInfoCache() {
    const infoDiv = document.getElementById('cacheInfo');
    const infoDivVentana2 = document.getElementById('cacheInfoVentana2');
    
    if (ultimaActualizacion) {
        const infoText = `Última actualización: ${ultimaActualizacion.toLocaleTimeString()} | ${colasDisponibles.length} colas | Escaneos pendientes: ${escaneosPendientes.length}`;
        
        if (infoDiv) infoDiv.textContent = infoText;
        if (infoDivVentana2) infoDivVentana2.textContent = infoText;
    }
}

function mostrarEscaneoExitoso() {
    const upcInput = document.getElementById('upcInput');
    upcInput.classList.add('scan-success');
    setTimeout(() => {
        upcInput.classList.remove('scan-success');
    }, 1000);
}

function mostrarCompletado() {
    const overlay = document.getElementById('completionOverlay');
    overlay.classList.add('show');
    setTimeout(() => {
        overlay.classList.remove('show');
    }, 1000);
}

function mostrarFinDeCola() {
    const overlay = document.getElementById('finColaOverlay');
    overlay.classList.add('show');
    setTimeout(() => {
        overlay.classList.remove('show');
    }, 3000);
}

function mostrarError(mensaje, ventana = 'ventana1') {
    const containerId = ventana === 'ventana2' ? 'messageContainerVentana2' : 'messageContainer';
    const container = document.getElementById(containerId);
    
    if (container) {
        container.innerHTML = `<div class="error-message">${mensaje}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

function mostrarMensaje(mensaje, tipo = 'success', ventana = 'ventana1') {
    const containerId = ventana === 'ventana2' ? 'messageContainerVentana2' : 'messageContainer';
    const container = document.getElementById(containerId);
    
    if (container) {
        const clase = tipo === 'success' ? 'warning-message' : 'error-message';
        container.innerHTML = `<div class="${clase}">${mensaje}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}

// ================= GESTIÓN DE SESIÓN Y FIREBASE =================
async function verificarSesionActiva() {
    usuarioActual = localStorage.getItem('usuarioSokso') || 'Usuario';
    document.getElementById('usuarioHeader').textContent = usuarioActual;
    
    if (!usuarioActual) {
        window.location.href = 'index.html';
        return;
    }
    
    sessionId = generarSessionId();
    
    const sesionGuardada = localStorage.getItem('sesionReposicionActiva');
    if (sesionGuardada) {
        try {
            sesionActiva = JSON.parse(sesionGuardada);
            colaSeleccionada = sesionActiva.cola;
            
            await cargarDatosReposicion();
            
            const verificacion = await verificarIntegridadCola(colaSeleccionada);
            if (!verificacion.valida) {
                mostrarError(`No se puede retomar la sesión: ${verificacion.motivo}`, 'ventana2');
                limpiarSesionActiva();
                mostrarVentanaColas();
                return;
            }
            
            const exito = await marcarColaComoEnUso(colaSeleccionada);
            if (!exito) {
                mostrarError('No se pudo retomar el control de la cola.', 'ventana2');
                limpiarSesionActiva();
                mostrarVentanaColas();
                return;
            }
            
            mostrarVentanaReposicion();
            
        } catch (error) {
            console.error('Error recuperando sesión:', error);
            limpiarSesionActiva();
        }
    }
}

function generarSessionId() {
    return `${usuarioActual}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function marcarColaComoEnUso(cola) {
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
            
            return;
        });
        
        if (resultado.committed) {
            console.log(`✅ Cola ${cola} tomada exitosamente por ${usuarioActual}`);
            
            if (colaEnUsoRef) {
                colaEnUsoRef.off();
            }
            
            colaEnUsoRef = database.ref(`colasEnUso/${cola}`);
            colaEnUsoRef.on('value', (snapshot) => {
                if (!snapshot.exists()) {
                    mostrarError('La cola ha sido liberada.', 'ventana2');
                    limpiarSesionActiva();
                    mostrarVentanaColas();
                }
            });
            
            return true;
        } else {
            console.log(`❌ Cola ${cola} ya está en uso por otro usuario`);
            return false;
        }
        
    } catch (error) {
        console.error("Error en transacción de cola:", error);
        return false;
    }
}

async function verificarIntegridadCola(cola) {
    try {
        const colaSnapshot = await database.ref(`colasEnUso/${cola}`).once('value');
        const datosCola = colaSnapshot.val();
        
        if (!datosCola) {
            return { valida: true, motivo: 'Cola libre' };
        }
        
        const tiempoExpiracion = 10 * 60 * 1000;
        if (Date.now() - datosCola.timestamp > tiempoExpiracion) {
            return { valida: true, motivo: 'Cola liberada por expiración' };
        }
        
        if (datosCola.usuario === usuarioActual && datosCola.sessionId === sessionId) {
            return { valida: true, motivo: 'Cola pertenece al usuario actual' };
        }
        
        return { 
            valida: false, 
            motivo: `Cola en uso por ${datosCola.usuario}` 
        };
        
    } catch (error) {
        console.error("Error verificando integridad de cola:", error);
        return { valida: false, motivo: 'Error de verificación' };
    }
}

function guardarSesionActiva() {
    if (colaSeleccionada && usuarioActual) {
        sesionActiva = {
            usuario: usuarioActual,
            cola: colaSeleccionada,
            timestamp: new Date().getTime(),
            sessionId: sessionId
        };
        localStorage.setItem('sesionReposicionActiva', JSON.stringify(sesionActiva));
    }
}

function limpiarSesionActiva() {
    localStorage.removeItem('sesionReposicionActiva');
    sesionActiva = null;
}

async function liberarColaEnUso(cola) {
    if (colaEnUsoRef) {
        colaEnUsoRef.off();
        colaEnUsoRef = null;
    }
    
    if (cola) {
        try {
            const colaEnUsoSnapshot = await database.ref(`colasEnUso/${cola}`).once('value');
            if (colaEnUsoSnapshot.exists() && 
                colaEnUsoSnapshot.val().usuario === usuarioActual && 
                colaEnUsoSnapshot.val().sessionId === sessionId) {
                await database.ref(`colasEnUso/${cola}`).remove();
            }
        } catch (error) {
            console.error("Error liberando cola:", error);
        }
    }
}

async function sincronizarEscaneosPendientes() {
    if (escaneosPendientes.length === 0 || estaSincronizando) return;
    
    estaSincronizando = true;
    
    try {
        const escaneosABorrar = [];
        
        for (let i = 0; i < escaneosPendientes.length; i++) {
            const escaneo = escaneosPendientes[i];
            
            try {
                const registroKey = database.ref().child('reposiciones').push().key;
                await database.ref(`reposiciones/${registroKey}`).set(escaneo);
                
                escaneosABorrar.push(i);
                
            } catch (error) {
                console.error(`Error sincronizando escaneo ${i}:`, error);
            }
        }
        
        escaneosABorrar.reverse().forEach(index => {
            escaneosPendientes.splice(index, 1);
        });
        
        localStorage.setItem('escaneosPendientes', JSON.stringify(escaneosPendientes));
        actualizarInterfazDeposito();
        actualizarListaColas();
        actualizarInfoCache();
        
        if (escaneosPendientes.length === 0) {
            console.log('✅ Todos los escaneos pendientes sincronizados');
        }
        
    } catch (error) {
        console.error('Error general sincronizando escaneos pendientes:', error);
    } finally {
        estaSincronizando = false;
    }
}

async function limpiarColasAbandonadas() {
    const ahora = Date.now();
    const tiempoMaximoInactividad = 10 * 60 * 1000;
    
    try {
        const colasSnapshot = await database.ref('colasEnUso').once('value');
        const colas = colasSnapshot.val() || {};
        
        for (const cola in colas) {
            const colaData = colas[cola];
            if (ahora - colaData.timestamp > tiempoMaximoInactividad) {
                await database.ref(`colasEnUso/${cola}`).remove();
                console.log(`🔄 Cola ${cola} liberada por inactividad`);
            }
        }
    } catch (error) {
        console.error("Error limpiando colas abandonadas:", error);
    }
}