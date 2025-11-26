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

// ================= INICIALIZACIÓN =================
document.addEventListener('DOMContentLoaded', function() {
    inicializarEventListeners();
    inicializarAplicacion();
});

function inicializarEventListeners() {
    document.getElementById('refreshButtonVentana1').addEventListener('click', cargarDatosReposicion);
    document.getElementById('refreshButtonVentana2').addEventListener('click', cargarDatosReposicion);
    document.getElementById('siguienteDepositoBtn').addEventListener('click', siguienteDeposito);
    document.getElementById('finalizarReposicionBtn').addEventListener('click', finalizarReposicion);
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
    console.log("🔧 INICIANDO MÓDULO DE REPOSICIÓN MULTIUSUARIO...");
    inicializarFirebase();
    inicializarListenersTiempoReal();
    verificarSesionActiva();
    
    // Cargar escaneos pendientes guardados localmente
    escaneosPendientes = JSON.parse(localStorage.getItem('escaneosPendientes') || '[]');
    
    // Cargar escaneos consolidados guardados localmente
    escaneosConsolidados = JSON.parse(localStorage.getItem('escaneosConsolidados') || '{}');
    
    // Cargar datos automáticamente al inicio
    setTimeout(() => {
        cargarDatosReposicion();
    }, 1000);

    // Intentar sincronizar escaneos pendientes cada 30 segundos
    setInterval(sincronizarEscaneosPendientes, 30000);
    
    // Verificar si hay colas en uso pero abandonadas
    setInterval(limpiarColasAbandonadas, 60000);
}

// ================= CONEXIÓN FIREBASE MEJORADA =================
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

// ================= LISTENERS EN TIEMPO REAL =================
function inicializarListenersTiempoReal() {
    // Escuchar cambios en colasEnUso
    database.ref('colasEnUso').on('value', (snapshot) => {
        colasEnUso = snapshot.val() || {};
        actualizarListaColas();
        
        // Verificar si nuestra cola fue tomada por otro usuario
        if (colaSeleccionada && colasEnUso[colaSeleccionada] && colasEnUso[colaSeleccionada].usuario !== usuarioActual) {
            mostrarError(`La cola ${colaSeleccionada} ha sido tomada por ${colasEnUso[colaSeleccionada].usuario}.`, 'ventana2');
            limpiarSesionActiva();
            mostrarVentanaColas();
        }
    });
}

// ================= GESTIÓN DE SESIÓN MEJORADA =================
async function verificarSesionActiva() {
    usuarioActual = localStorage.getItem('usuarioSokso') || 'Usuario';
    document.getElementById('usuarioHeader').textContent = usuarioActual;
    
    if (!usuarioActual) {
        window.location.href = 'index.html';
        return;
    }
    
    // Generar sessionId único
    sessionId = generarSessionId();
    
    const sesionGuardada = localStorage.getItem('sesionReposicionActiva');
    if (sesionGuardada) {
        try {
            sesionActiva = JSON.parse(sesionGuardada);
            colaSeleccionada = sesionActiva.cola;
            
            await cargarDatosReposicion();
            
            // Verificar integridad de la cola
            const verificacion = await verificarIntegridadCola(colaSeleccionada);
            if (!verificacion.valida) {
                mostrarError(`No se puede retomar la sesión: ${verificacion.motivo}`, 'ventana2');
                limpiarSesionActiva();
                mostrarVentanaColas();
                return;
            }
            
            // Reclamar la cola atómicamente
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

// ================= SISTEMA DE BLOQUEO ATÓMICO =================
async function marcarColaComoEnUso(cola) {
    try {
        const colaRef = database.ref(`colasEnUso/${cola}`);
        
        // TRANSACCIÓN ATÓMICA - evita condiciones de carrera
        const resultado = await colaRef.transaction((currentData) => {
            if (currentData === null) {
                // Cola libre - podemos tomarla
                return {
                    usuario: usuarioActual,
                    timestamp: Date.now(),
                    fecha: obtenerFechaActual(),
                    sessionId: sessionId
                };
            }
            
            // Cola ya está en uso
            if (currentData.usuario === usuarioActual && currentData.sessionId === sessionId) {
                // El mismo usuario y misma sesión - actualizar timestamp
                return {
                    ...currentData,
                    timestamp: Date.now()
                };
            }
            
            // Cola tomada por otro usuario - abortar transacción
            return; // Devolver undefined aborta la transacción
        });
        
        if (resultado.committed) {
            console.log(`✅ Cola ${cola} tomada exitosamente por ${usuarioActual}`);
            
            // Configurar listener para cambios en esta cola
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
        
        // Verificar si la sesión expiró (más de 10 minutos)
        const tiempoExpiracion = 10 * 60 * 1000; // 10 minutos
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

function generarSessionId() {
    return `${usuarioActual}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ================= CARGA DE DATOS MEJORADA =================
async function cargarDatosReposicion() {
    try {
        console.log("📥 CARGANDO DATOS DE RECOLECCIÓN Y REPOSICIÓN...");
        
        // Cargar datos de recolección y reposición en paralelo
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

// ================= PROCESAMIENTO DE DATOS CORREGIDO =================
async function procesarDatosReposicion(recoleccionData, reposicionesData) {
    const nuevosDatosReposicion = {};
    const nuevasColasDisponibles = [];
    const fechaActual = obtenerFechaActual();
    
    console.log("📅 Filtrando por fecha actual:", fechaActual);
    
    let registrosProcesados = 0;
    let registrosConColaReposicion = 0;

    // PRIMERO: Procesar datos de recolección para construir la estructura base
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
                        upcs: {},
                        cantidadTotal: 0,
                        articulo: descripcion,
                        cantidadEscaneada: 0 // Inicializar contador local
                    };
                }
                
                // Sumar la cantidad al depósito y a la cola
                nuevosDatosReposicion[colaReposicion].depositos[depositoDestino].cantidadTotal += cantidad;
                nuevosDatosReposicion[colaReposicion].cantidadTotal += cantidad;
                
                // Guardar información del UPC
                if (!nuevosDatosReposicion[colaReposicion].depositos[depositoDestino].upcs[upc]) {
                    nuevosDatosReposicion[colaReposicion].depositos[depositoDestino].upcs[upc] = {
                        articulo: descripcion,
                        cantidad: cantidad
                    };
                }
            }
        } catch (error) {
            console.error("❌ Error procesando registro:", error, registro);
        }
    });
    
    // SEGUNDO: Procesar datos de reposición para cargar contadores existentes
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
                
                if (cola && deposito && nuevosDatosReposicion[cola] && nuevosDatosReposicion[cola].depositos[deposito]) {
                    // Sumar al contador de cantidad escaneada
                    nuevosDatosReposicion[cola].depositos[deposito].cantidadEscaneada = 
                        (nuevosDatosReposicion[cola].depositos[deposito].cantidadEscaneada || 0) + 1;
                }
            } catch (error) {
                console.error("❌ Error procesando escaneo existente:", error, escaneo);
            }
        });
    }
    
    // Actualizar las variables globales
    datosReposicion = nuevosDatosReposicion;
    colasDisponibles = nuevasColasDisponibles.sort(ordenarColas);
    
    console.log("📊 RESUMEN PROCESAMIENTO:", {
        registrosProcesados,
        registrosConColaReposicion,
        colasDisponibles: colasDisponibles,
        reposicionesProcesadas: reposicionesData ? Object.keys(reposicionesData).length : 0
    });
    
    ultimaActualizacion = new Date();
    actualizarInfoCache();
    actualizarListaColas();
    
    // Si estamos en ventana de reposición, actualizar la interfaz
    if (document.getElementById('ventanaReposicion') && !document.getElementById('ventanaReposicion').classList.contains('hidden')) {
        actualizarListaDepositos();
        if (depositoActual) {
            actualizarInterfazDeposito();
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

function ordenarDepositos(a, b) {
    const partesA = a.split('-');
    const partesB = b.split('-');
    
    const colaA = partesA[0];
    const colaB = partesB[0];
    if (colaA !== colaB) return colaA.localeCompare(colaB);
    
    const numA = parseInt(partesA[1]) || 0;
    const numB = parseInt(partesB[1]) || 0;
    if (numA !== numB) return numA - numB;
    
    const nivelA = partesA[2] || '';
    const nivelB = partesB[2] || '';
    return nivelA.localeCompare(nivelB);
}

// ================= INTERFAZ DE COLAS MEJORADA =================
function mostrarVentanaColas() {
    document.getElementById('ventanaColas').classList.remove('hidden');
    document.getElementById('ventanaReposicion').classList.add('hidden');
    actualizarListaColas();
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
        
        // Calcular la cantidad escaneada total de la cola
        let cantidadEscaneadaCola = 0;
        if (datosCola && datosCola.depositos) {
            for (let deposito in datosCola.depositos) {
                cantidadEscaneadaCola += datosCola.depositos[deposito].cantidadEscaneada || 0;
            }
        }
        
        const cantidadTotalCola = datosCola.cantidadTotal || 0;
        
        // Verificar si la cola está completada
        const colaCompletada = cantidadEscaneadaCola >= cantidadTotalCola;
        
        const div = document.createElement('div');
        
        const colaEstaEnUso = colasEnUso[cola];
        const estaEnUsoPorOtro = colaEstaEnUso && colaEstaEnUso.usuario !== usuarioActual;
        
        // Aplicar clase completed si la cola está completada
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

async function seleccionarCola(cola) {
    // Verificar integridad primero
    const verificacion = await verificarIntegridadCola(cola);
    if (!verificacion.valida) {
        mostrarError(`No se puede acceder a la cola: ${verificacion.motivo}`);
        return;
    }
    
    // Intentar tomar la cola atómicamente
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
    
    // Verificar si la cola está completada
    let cantidadEscaneadaCola = 0;
    if (datosCola.depositos) {
        for (let deposito in datosCola.depositos) {
            cantidadEscaneadaCola += datosCola.depositos[deposito].cantidadEscaneada || 0;
        }
    }
    
    const cantidadTotalCola = datosCola.cantidadTotal || 0;
    
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

// ================= GESTIÓN DE SESIÓN =================
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

// ================= GESTIÓN DE DEPÓSITOS =================
function actualizarListaDepositos() {
    const grid = document.getElementById('depositosGrid');
    grid.innerHTML = '';
    
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada]) return;
    
    const depositosCola = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    
    depositosCola.forEach(deposito => {
        const datos = datosReposicion[colaSeleccionada].depositos[deposito];
        const cantidadEscaneada = datos.cantidadEscaneada || 0;
        const seleccionado = deposito === depositoActual;
        const completado = cantidadEscaneada >= datos.cantidadTotal;
        
        const row = document.createElement('div');
        row.className = `deposito-row ${seleccionado ? 'selected' : ''} ${completado ? 'completed' : ''}`;
        
        row.innerHTML = `
            <div>
                <span class="status-indicator ${completado ? 'status-completed' : (seleccionado ? 'status-selected' : 'status-pending')}"></span>
            </div>
            <div>
                <strong>${deposito}</strong><br>
                <small>${datos.articulo}</small>
            </div>
            <div>${datos.cantidadTotal}</div>
            <div>${cantidadEscaneada}</div>
        `;
        
        row.onclick = () => seleccionarDepositoManual(deposito);
        grid.appendChild(row);
    });
}

function seleccionarPrimerDepositoPendiente() {
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada]) return;
    
    const depositosCola = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    
    for (let deposito of depositosCola) {
        const datos = datosReposicion[colaSeleccionada].depositos[deposito];
        const cantidadEscaneada = datos.cantidadEscaneada || 0;
        
        if (cantidadEscaneada < datos.cantidadTotal) {
            seleccionarDepositoManual(deposito);
            return;
        }
    }
    
    if (depositosCola.length > 0) {
        seleccionarDepositoManual(depositosCola[0]);
        mostrarFinDeCola();
    } else {
        mostrarFinDeCola();
    }
}

function seleccionarDepositoManual(deposito) {
    depositoActual = deposito;
    actualizarInterfazDeposito();
    document.getElementById('depositoInput').value = '';
    document.getElementById('depositoInput').classList.remove('error');
    document.getElementById('upcInput').disabled = false;
    document.getElementById('upcInput').focus();
}

function actualizarInterfazDeposito() {
    if (!depositoActual || !colaSeleccionada || !datosReposicion[colaSeleccionada].depositos[depositoActual]) return;
    
    const datos = datosReposicion[colaSeleccionada].depositos[depositoActual];
    const cantidadEscaneada = datos.cantidadEscaneada || 0;
    
    const pendiente = Math.max(0, datos.cantidadTotal - cantidadEscaneada);
    
    document.getElementById('currentDeposito').textContent = depositoActual;
    document.getElementById('currentArticulo').textContent = datos.articulo;
    document.getElementById('counterSolicitada').textContent = datos.cantidadTotal;
    document.getElementById('counterRepuesta').textContent = cantidadEscaneada;
    document.getElementById('counterPendiente').textContent = pendiente;
    
    actualizarListaDepositos();
}

function validarDeposito(deposito) {
    if (!colaSeleccionada || !datosReposicion[colaSeleccionada].depositos[deposito]) {
        mostrarError('Depósito incorrecto. Escanea un depósito válido para esta cola.', 'ventana2');
        document.getElementById('depositoInput').classList.add('error');
        document.getElementById('depositoInput').value = '';
        return;
    }
    seleccionarDepositoManual(deposito);
}

// ================= SISTEMA DE ESCANEO CORREGIDO =================
async function validarUPC(upc) {
    if (!depositoActual || !colaSeleccionada) return;
    
    const datos = datosReposicion[colaSeleccionada].depositos[depositoActual];
    const cantidadEscaneada = datos.cantidadEscaneada || 0;
    
    // Verificar si ya se completó antes de permitir escanear
    if (cantidadEscaneada >= datos.cantidadTotal) {
        mostrarError('Este depósito ya ha sido completado.', 'ventana2');
        document.getElementById('upcInput').value = '';
        return;
    }
    
    const upcsValidos = Object.keys(datos.upcs);
    if (!upcsValidos.includes(upc)) {
        mostrarError('UPC incorrecto. Escanea un código válido para este depósito.', 'ventana2');
        document.getElementById('upcInput').classList.add('error');
        document.getElementById('upcInput').value = '';
        return;
    }
    
    document.getElementById('upcInput').classList.remove('error');
    
    // Verificar que todavía tenemos control de la cola
    const verificacion = await verificarIntegridadCola(colaSeleccionada);
    if (!verificacion.valida) {
        mostrarError(`Perdiste el control de la cola: ${verificacion.motivo}`, 'ventana2');
        return;
    }
    
    await registrarEscaneoIndividual(upc);
    document.getElementById('upcInput').value = '';
    mostrarEscaneoExitoso();
    
    // Verificar si se completó con los escaneos
    const totalEscaneado = calcularTotalEscaneado();
    if (totalEscaneado >= datos.cantidadTotal) {
        mostrarCompletado();
        setTimeout(() => {
            siguienteDeposito();
        }, 1000);
    }
}

// ================= REGISTRO INDIVIDUAL DE ESCANEOS =================
async function registrarEscaneoIndividual(upc) {
    if (!depositoActual || !colaSeleccionada) return;
    
    const datos = datosReposicion[colaSeleccionada].depositos[depositoActual];
    const fechaHora = new Date();
    
    const escaneo = {
        usuario: usuarioActual,
        cola: colaSeleccionada,
        deposito: depositoActual,
        upc: upc,
        descripcion: datos.articulo,
        cantidad: 1, // SIEMPRE 1 por escaneo individual
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
        
        // Guardar el escaneo individual en Firebase
        const registroKey = database.ref().child('reposiciones').push().key;
        await database.ref(`reposiciones/${registroKey}`).set(escaneo);
        
        // Actualizar contador local inmediatamente
        datos.cantidadEscaneada = (datos.cantidadEscaneada || 0) + 1;
        
        if (saveIndicator) {
            saveIndicator.textContent = '✅ Guardado';
            setTimeout(() => {
                saveIndicator.textContent = '';
            }, 2000);
        }
        
        actualizarInterfazDeposito();
        actualizarListaColas(); // Actualizar también la vista de colas
        
    } catch (error) {
        console.error('Error guardando escaneo individual:', error);
        
        // Si falla, guardar en escaneos pendientes
        escaneosPendientes.push(escaneo);
        localStorage.setItem('escaneosPendientes', JSON.stringify(escaneosPendientes));
        
        mostrarError('Error de conexión. Escaneo guardado localmente.', 'ventana2');
        
        const saveIndicator = document.getElementById('saveIndicator');
        if (saveIndicator) {
            saveIndicator.textContent = '❌ Error';
        }
    }
}

function calcularTotalEscaneado() {
    if (!depositoActual || !colaSeleccionada) return 0;
    
    const datos = datosReposicion[colaSeleccionada].depositos[depositoActual];
    return datos.cantidadEscaneada || 0;
}

// ================= SINCRONIZACIÓN MEJORADA =================
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
                
                // Actualizar contador local
                if (escaneo.cola && escaneo.deposito && datosReposicion[escaneo.cola] && datosReposicion[escaneo.cola].depositos[escaneo.deposito]) {
                    datosReposicion[escaneo.cola].depositos[escaneo.deposito].cantidadEscaneada = 
                        (datosReposicion[escaneo.cola].depositos[escaneo.deposito].cantidadEscaneada || 0) + 1;
                }
                
                escaneosABorrar.push(i);
                
            } catch (error) {
                console.error(`Error sincronizando escaneo ${i}:`, error);
                // Continuar con el siguiente escaneo
            }
        }
        
        // Eliminar escaneos sincronizados
        escaneosABorrar.reverse().forEach(index => {
            escaneosPendientes.splice(index, 1);
        });
        
        localStorage.setItem('escaneosPendientes', JSON.stringify(escaneosPendientes));
        actualizarInterfazDeposito();
        actualizarListaColas(); // Actualizar también la vista de colas
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

// ================= LIMPIEZA MEJORADA =================
async function limpiarColasAbandonadas() {
    const ahora = Date.now();
    const tiempoMaximoInactividad = 10 * 60 * 1000; // 10 minutos
    
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

// ================= FUNCIONES PRINCIPALES =================
async function siguienteDeposito() {
    if (!colaSeleccionada) return;
    
    const depositos = Object.keys(datosReposicion[colaSeleccionada].depositos).sort(ordenarDepositos);
    const currentIndex = depositos.indexOf(depositoActual);
    
    for (let i = currentIndex + 1; i < depositos.length; i++) {
        const deposito = depositos[i];
        const datos = datosReposicion[colaSeleccionada].depositos[deposito];
        const cantidadEscaneada = datos.cantidadEscaneada || 0;
        
        if (cantidadEscaneada < datos.cantidadTotal) {
            seleccionarDepositoManual(deposito);
            return;
        }
    }
    
    mostrarFinDeCola();
}

async function volverAColas() {
    await sincronizarEscaneosPendientes();
    
    if (confirm('¿Volver a la selección de colas?')) {
        await liberarColaEnUso(colaSeleccionada);
        limpiarSesionActiva();
        mostrarVentanaColas();
    }
}

async function finalizarReposicion() {
    await sincronizarEscaneosPendientes();
    
    if (confirm('¿Finalizar reposición de la cola ' + colaSeleccionada + '?')) {
        await liberarColaEnUso(colaSeleccionada);
        limpiarSesionActiva();
        location.reload();
    }
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

function volverAlPrincipal() {
    if (escaneosPendientes.length > 0) {
        if (!confirm('Tienes escaneos pendientes de guardar. Si sales ahora, podrías perder datos. ¿Estás seguro de que quieres salir?')) {
            return;
        }
    }
    
    if (colaSeleccionada) {
        liberarColaEnUso(colaSeleccionada);
    }
    window.location.href = 'index.html';
}

// ================= FUNCIONES VISUALES =================
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
        document.querySelector('.btn-success').style.background = '#ffc107';
        document.querySelector('.btn-success').style.color = '#212529';
        document.querySelector('.btn-success').textContent = '🏁 FINALIZAR COLA';
    }, 3000);
}

// ================= FUNCIONES DE MENSAJES =================
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
        const clase = tipo === 'success' ? 'status-success' : 'status-warning';
        container.innerHTML = `<div class="${clase}">${mensaje}</div>`;
        setTimeout(() => {
            container.innerHTML = '';
        }, 3000);
    }
}