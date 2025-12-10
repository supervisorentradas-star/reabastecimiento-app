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

// CONTRASEÑAS
const PASSWORD_SLOTING = 'E123456';
const PASSWORD_RUTAS = 'E123456';

// ================= INICIALIZAR FIREBASE =================
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ================= VARIABLES GLOBALES =================
let moduloActual = 'recoleccion';
let estadoDesdeFirebase = {};
let registrosRecoleccion = [];
let registrosReposicion = [];
let slotingData = {};
let recoleccionData = {};
let reposicionData = {};
let filtroEstadoActual = 'all'; // 'all', 'pending', 'in-progress', 'completed'

// Variables para subida de rutas
let tipoRutaActual = ''; // 'recoleccion' o 'reposicion'
let modoSubidaActual = 'replace'; // 'replace' o 'add'

// ================= INICIALIZACIÓN =================
window.addEventListener('load', function() {
    inicializarFirebase();
    cargarDashboard();
    cargarSlotingDesdeFirebase();
    cargarRutasDesdeFirebase();
});

// ================= CONEXIÓN FIREBASE =================
function inicializarFirebase() {
    try {
        verificarConexionFirebase();
    } catch (error) {
        console.error('Error inicializando Firebase:', error);
    }
}

function verificarConexionFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        console.log('Estado de conexión Firebase:', snap.val());
    });
}

// ================= CAMBIO DE MÓDULO =================
function cambiarModulo(modulo, boton) {
    moduloActual = modulo;
    
    // Actualizar pestañas activas
    document.querySelectorAll('.module-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    boton.classList.add('active');
    
    // Mostrar/ocultar paneles según el módulo
    document.getElementById('adminRutasPanel').classList.add('hidden');
    document.getElementById('adminSlotingPanel').classList.add('hidden');
    document.getElementById('routesPanel').classList.add('hidden');
    document.getElementById('rutasPanel').classList.add('hidden');
    document.getElementById('slotingPanel').classList.add('hidden');
    document.getElementById('filterControls').style.display = 'none';
    
    if (modulo === 'sloting') {
        document.getElementById('adminSlotingPanel').classList.remove('hidden');
        document.getElementById('slotingPanel').classList.remove('hidden');
    } else if (modulo === 'rutas') {
        document.getElementById('adminRutasPanel').classList.remove('hidden');
        document.getElementById('rutasPanel').classList.remove('hidden');
    } else {
        document.getElementById('routesPanel').classList.remove('hidden');
        document.getElementById('filterControls').style.display = 'flex';
        
        // Actualizar título del panel
        document.getElementById('panelTitulo').textContent = 
            `Estado de Rutas - ${modulo === 'recoleccion' ? 'Recolección' : 'Reposición'}`;
        
        // Actualizar etiquetas según el módulo
        if (modulo === 'recoleccion') {
            document.getElementById('labelRegistros').textContent = 'Planificado/Procesado';
            document.getElementById('labelOperarios').textContent = 'Picado/Repuesto';
        } else {
            document.getElementById('labelRegistros').textContent = 'Picado/Repuesto';
            document.getElementById('labelOperarios').textContent = 'Operarios Activos';
        }
        
        // Recargar datos del módulo seleccionado
        cargarDashboard();
    }
}

// ================= FUNCIONES DE AGRUPACIÓN POR COLAS =================

// Función para obtener la cola de recolección a partir del depósito
function obtenerColaRecoleccion(deposito) {
    if (!deposito) return 'OTROS';
    
    const partes = deposito.split('-');
    if (partes.length < 3) return 'OTROS';
    
    const nivel = partes[2].charAt(0);
    
    if (nivel === 'A' || nivel === 'B') return 'AB';
    if (nivel === 'C' || nivel === 'D' || nivel === 'E') return 'CDE';
    if (nivel === 'F') return 'F';
    
    return 'OTROS';
}

// Función para obtener la cola de reposición a partir del deposito_destino
function obtenerColaReposicion(deposito_destino) {
    if (!deposito_destino) return 'OTROS';
    
    const partes = deposito_destino.split('-');
    if (partes.length < 1) return 'OTROS';
    
    return partes[0];
}

// ================= GESTIÓN DE RUTAS & COLAS =================
function solicitarSubirRutas(tipo) {
    tipoRutaActual = tipo;
    
    if (tipo === 'recoleccion') {
        document.getElementById('rutasModalTitle').textContent = 'Subir Rutas de Recolección';
        document.getElementById('rutasModalDescription').textContent = 'Selecciona el archivo CSV con los datos de recolección:';
        document.getElementById('rutasColumnasEsperadas').innerHTML = 
            '- Columnas: DEPOSITO, CODIGO UPC, ARTICULO, CANTIDAD, INDICADOR, FECHA, DEPOSITO DESTINO, COLA<br>' +
            '- Separador: tabulación<br>' +
            '- Codificación: UTF-8';
    } else {
        document.getElementById('rutasModalTitle').textContent = 'Subir Rutas de Reposición';
        document.getElementById('rutasModalDescription').textContent = 'Selecciona el archivo CSV con los datos de reposición:';
        document.getElementById('rutasColumnasEsperadas').innerHTML = 
            '- Columnas: DEPOSITO, CODIGO_UPC, ARTICULO, CANTIDAD, FECHA<br>' +
            '- Separador: tabulación<br>' +
            '- Codificación: UTF-8';
    }
    
    document.getElementById('rutasModal').style.display = 'flex';
    document.getElementById('uploadProgressBar').style.display = 'none';
    document.getElementById('uploadStatus').textContent = '';
    document.getElementById('rutasFile').value = '';
    document.getElementById('rutasPassword').value = '';
    
    seleccionarModo('replace');
}

function seleccionarModo(modo) {
    modoSubidaActual = modo;
    
    document.getElementById('modeReplace').classList.remove('selected');
    document.getElementById('modeAdd').classList.remove('selected');
    
    if (modo === 'replace') {
        document.getElementById('modeReplace').classList.add('selected');
    } else {
        document.getElementById('modeAdd').classList.add('selected');
    }
}

function cerrarRutasModal() {
    document.getElementById('rutasModal').style.display = 'none';
}

async function procesarRutas() {
    const fileInput = document.getElementById('rutasFile');
    const file = fileInput.files[0];
    const password = document.getElementById('rutasPassword').value;
    
    if (password !== PASSWORD_RUTAS) {
        mostrarMensaje('❌ Contraseña incorrecta. No tienes permisos para subir rutas.', false);
        return;
    }
    
    if (!file) {
        mostrarMensaje('Por favor, selecciona un archivo CSV', false);
        return;
    }
    
    document.getElementById('uploadProgressBar').style.display = 'block';
    document.getElementById('uploadProgressFill').style.width = '10%';
    document.getElementById('uploadStatus').textContent = 'Leyendo archivo...';
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const csvText = e.target.result;
            document.getElementById('uploadProgressFill').style.width = '30%';
            document.getElementById('uploadStatus').textContent = 'Procesando datos...';
            
            let datosProcesados;
            if (tipoRutaActual === 'recoleccion') {
                datosProcesados = procesarCSVRecoleccion(csvText);
            } else {
                datosProcesados = procesarCSVReposicion(csvText);
            }
            
            document.getElementById('uploadProgressFill').style.width = '60%';
            document.getElementById('uploadStatus').textContent = 'Subiendo a Firebase...';
            
            const rutaFirebase = tipoRutaActual === 'recoleccion' ? 'recoleccion_rutas' : 'reposicion_rutas';
            
            if (modoSubidaActual === 'replace') {
                await database.ref(rutaFirebase).set(datosProcesados);
            } else {
                const snapshot = await database.ref(rutaFirebase).once('value');
                const datosExistentes = snapshot.val() || {};
                const datosCombinados = { ...datosExistentes, ...datosProcesados };
                await database.ref(rutaFirebase).set(datosCombinados);
            }

            await database.ref(`estado/${rutaFirebase}_lastUpdate`).set(new Date().toISOString());
            
            document.getElementById('uploadProgressFill').style.width = '100%';
            document.getElementById('uploadStatus').textContent = '✅ Datos subidos correctamente';
            
            setTimeout(() => {
                cerrarRutasModal();
                cargarRutasDesdeFirebase();
                mostrarMensaje(`✅ ${tipoRutaActual === 'recoleccion' ? 'Recolección' : 'Reposición'} actualizada correctamente. Modo: ${modoSubidaActual === 'replace' ? 'REEMPLAZAR' : 'AÑADIR'}.`, true);
            }, 1000);
            
        } catch (error) {
            console.error('Error procesando rutas:', error);
            document.getElementById('uploadStatus').textContent = `❌ Error: ${error.message}`;
            document.getElementById('uploadProgressFill').style.width = '0%';
            mostrarMensaje(`❌ Error procesando archivo: ${error.message}`, false);
        }
    };
    
    reader.onerror = function() {
        document.getElementById('uploadStatus').textContent = '❌ Error al leer el archivo';
        document.getElementById('uploadProgressFill').style.width = '0%';
        mostrarMensaje('❌ Error al leer el archivo seleccionado', false);
    };
    
    reader.readAsText(file, 'UTF-8');
}

function procesarCSVRecoleccion(csvText) {
    const datos = {};
    const lineas = csvText.split('\n').filter(linea => linea.trim());
    
    if (lineas.length < 2) {
        throw new Error('El archivo CSV está vacío');
    }
    
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    if (encabezados.length < 5) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: DEPOSITO, CODIGO UPC, ARTICULO, CANTIDAD, INDICADOR, FECHA, DEPOSITO DESTINO, COLA');
    }
    
    let registrosProcesados = 0;
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;
        
        const partes = linea.split(separador).map(part => part.trim().replace(/^"|"$/g, ''));
        
        if (partes.length >= 5) {
            const deposito = partes[0];
            const upc = partes[1];
            const articulo = partes[2];
            const cantidad = parseInt(partes[3]) || 0;
            const indicador = partes[4] || 'Regular';
            const fecha = partes[5] || new Date().toLocaleDateString();
            const deposito_destino = partes[6] || '';
            const cola_reposicion = partes[7] || '';
            
            if (deposito && upc) {
                const id = `${deposito}_${upc}_${indicador}`;
                
                datos[id] = {
                    deposito: deposito,
                    upc: upc,
                    articulo: articulo,
                    cantidad: cantidad,
                    indicador: indicador,
                    fecha: fecha,
                    deposito_destino: deposito_destino,
                    cola_reposicion: cola_reposicion
                };
                registrosProcesados++;
            }
        }
    }
    
    if (registrosProcesados === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
    }
    
    return datos;
}

function procesarCSVReposicion(csvText) {
    const datos = {};
    const lineas = csvText.split('\n').filter(linea => linea.trim());
    
    if (lineas.length < 2) {
        throw new Error('El archivo CSV está vacío');
    }
    
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    if (encabezados.length < 4) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: DEPOSITO, CODIGO_UPC, ARTICULO, CANTIDAD, FECHA');
    }
    
    let registrosProcesados = 0;
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;
        
        const partes = linea.split(separador).map(part => part.trim().replace(/^"|"$/g, ''));
        
        if (partes.length >= 4) {
            const deposito = partes[0];
            const upc = partes[1];
            const articulo = partes[2];
            const cantidad = parseInt(partes[3]) || 0;
            
            if (deposito && upc) {
                const id = `${deposito}_${upc}`;
                
                datos[id] = {
                    deposito: deposito,
                    upc: upc,
                    articulo: articulo,
                    cantidad: cantidad,
                    fecha: partes[4] || new Date().toLocaleDateString()
                };
                registrosProcesados++;
            }
        }
    }
    
    if (registrosProcesados === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
    }
    
    return datos;
}

async function cargarRutasDesdeFirebase() {
    try {
        const snapshotRecoleccion = await database.ref('recoleccion_rutas').once('value');
        recoleccionData = snapshotRecoleccion.val() || {};
        
        const snapshotReposicion = await database.ref('reposicion_rutas').once('value');
        reposicionData = snapshotReposicion.val() || {};
        
        const lastUpdateRecoleccion = await database.ref('estado/recoleccion_rutas_lastUpdate').once('value');
        const lastUpdateRecoleccionDate = lastUpdateRecoleccion.val() ? new Date(lastUpdateRecoleccion.val()).toLocaleString() : '-';

        document.getElementById('recoleccionTotalRecords').textContent = Object.keys(recoleccionData).length;
        document.getElementById('recoleccionLastUpdate').textContent = lastUpdateRecoleccionDate;
        
        if (Object.keys(recoleccionData).length > 0) {
            document.getElementById('recoleccionStatus').textContent = 'Datos cargados';
            document.getElementById('recoleccionStatus').style.color = '#27ae60';
            mostrarVistaPreviaRecoleccion();
        } else {
            document.getElementById('recoleccionStatus').textContent = 'No hay datos cargados';
            document.getElementById('recoleccionStatus').style.color = '#e74c3c';
            document.getElementById('recoleccionPreview').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error cargando rutas:', error);
        document.getElementById('recoleccionStatus').textContent = 'Error al cargar datos';
        document.getElementById('recoleccionStatus').style.color = '#e74c3c';
    }
}

function mostrarVistaPreviaRecoleccion() {
    const previewBody = document.getElementById('recoleccionPreviewBody');
    previewBody.innerHTML = '';
    
    const ids = Object.keys(recoleccionData);
    const registrosMostrar = Math.min(5, ids.length);
    
    for (let i = 0; i < registrosMostrar; i++) {
        const id = ids[i];
        const registro = recoleccionData[id];
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${registro.deposito}</td>
            <td>${registro.upc}</td>
            <td>${registro.articulo}</td>
            <td>${registro.cantidad}</td>
            <td>${registro.indicador}</td>
        `;
        previewBody.appendChild(row);
    }
    
    document.getElementById('recoleccionPreview').style.display = 'block';
}

// ================= GESTIÓN DE SLOTING =================
function solicitarSubirSloting() {
    document.getElementById('slotingModal').style.display = 'flex';
    document.getElementById('slotingProgressBar').style.display = 'none';
    document.getElementById('slotingUploadStatus').textContent = '';
    document.getElementById('slotingFile').value = '';
    document.getElementById('slotingPassword').value = '';
}

function cerrarSlotingModal() {
    document.getElementById('slotingModal').style.display = 'none';
}

async function procesarSloting() {
    const fileInput = document.getElementById('slotingFile');
    const file = fileInput.files[0];
    const password = document.getElementById('slotingPassword').value;
    
    if (password !== PASSWORD_SLOTING) {
        mostrarMensaje('❌ Contraseña incorrecta. No tienes permisos para subir sloting.', false);
        return;
    }
    
    if (!file) {
        mostrarMensaje('Por favor, selecciona un archivo CSV', false);
        return;
    }
    
    document.getElementById('slotingProgressBar').style.display = 'block';
    document.getElementById('slotingProgressFill').style.width = '10%';
    document.getElementById('slotingUploadStatus').textContent = 'Leyendo archivo...';
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const csvText = e.target.result;
            document.getElementById('slotingProgressFill').style.width = '30%';
            document.getElementById('slotingUploadStatus').textContent = 'Procesando datos...';
            
            const datosProcesados = procesarCSVSloting(csvText);
            document.getElementById('slotingProgressFill').style.width = '60%';
            document.getElementById('slotingUploadStatus').textContent = 'Subiendo a Firebase...';
            
            await database.ref('sloting').set(datosProcesados);
            await database.ref('estado/sloting_lastUpdate').set(new Date().toISOString());
            
            document.getElementById('slotingProgressFill').style.width = '100%';
            document.getElementById('slotingUploadStatus').textContent = '✅ Sloting subido correctamente';
            
            setTimeout(() => {
                cerrarSlotingModal();
                cargarSlotingDesdeFirebase();
                mostrarMensaje(`✅ Sloting actualizado correctamente. ${Object.keys(datosProcesados).length} registros procesados.`, true);
            }, 1000);
            
        } catch (error) {
            console.error('Error procesando sloting:', error);
            document.getElementById('slotingUploadStatus').textContent = `❌ Error: ${error.message}`;
            document.getElementById('slotingProgressFill').style.width = '0%';
            mostrarMensaje(`❌ Error procesando archivo: ${error.message}`, false);
        }
    };
    
    reader.onerror = function() {
        document.getElementById('slotingUploadStatus').textContent = '❌ Error al leer el archivo';
        document.getElementById('slotingProgressFill').style.width = '0%';
        mostrarMensaje('❌ Error al leer el archivo seleccionado', false);
    };
    
    reader.readAsText(file, 'UTF-8');
}

function procesarCSVSloting(csvText) {
    const datos = {};
    const lineas = csvText.split('\n').filter(linea => linea.trim());
    
    if (lineas.length < 2) {
        throw new Error('El archivo CSV está vacío');
    }
    
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    if (encabezados.length < 3 || 
        !encabezados[0].includes('UPC') || 
        !encabezados[1].includes('ARTICULO') || 
        !encabezados[2].includes('DEPOSITO')) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: CODIGO_UPC, ARTICULO, DEPOSITO FINAL');
    }
    
    let registrosProcesados = 0;
    for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;
        
        const partes = linea.split(separador).map(part => part.trim().replace(/^"|"$/g, ''));
        
        if (partes.length >= 3) {
            const upc = partes[0];
            const articulo = partes[1];
            const deposito = partes[2];
            
            if (upc && articulo && deposito) {
                datos[upc] = {
                    articulo: articulo,
                    deposito: deposito
                };
                registrosProcesados++;
            }
        }
    }
    
    if (registrosProcesados === 0) {
        throw new Error('No se encontraron datos válidos en el archivo');
    }
    
    return datos;
}

async function cargarSlotingDesdeFirebase() {
    try {
        const snapshot = await database.ref('sloting').once('value');
        slotingData = snapshot.val() || {};

        const lastUpdateSloting = await database.ref('estado/sloting_lastUpdate').once('value');
        const lastUpdateSlotingDate = lastUpdateSloting.val() ? new Date(lastUpdateSloting.val()).toLocaleString() : '-';
        
        document.getElementById('slotingTotalRecords').textContent = Object.keys(slotingData).length;
        document.getElementById('slotingLastUpdate').textContent = lastUpdateSlotingDate;
        
        if (Object.keys(slotingData).length > 0) {
            document.getElementById('slotingStatus').textContent = 'Datos cargados';
            document.getElementById('slotingStatus').style.color = '#27ae60';
            mostrarVistaPreviaSloting();
        } else {
            document.getElementById('slotingStatus').textContent = 'No hay datos cargados';
            document.getElementById('slotingStatus').style.color = '#e74c3c';
            document.getElementById('slotingPreview').style.display = 'none';
        }
        
    } catch (error) {
        console.error('Error cargando sloting:', error);
        document.getElementById('slotingStatus').textContent = 'Error al cargar datos';
        document.getElementById('slotingStatus').style.color = '#e74c3c';
    }
}

function mostrarVistaPreviaSloting() {
    const previewBody = document.getElementById('slotingPreviewBody');
    previewBody.innerHTML = '';
    
    const upcs = Object.keys(slotingData);
    const registrosMostrar = Math.min(5, upcs.length);
    
    for (let i = 0; i < registrosMostrar; i++) {
        const upc = upcs[i];
        const registro = slotingData[upc];
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${upc}</td>
            <td>${registro.articulo}</td>
            <td>${registro.deposito}</td>
        `;
        previewBody.appendChild(row);
    }
    
    document.getElementById('slotingPreview').style.display = 'block';
}

// ================= FUNCIONES PRINCIPALES DEL ADMINISTRADOR =================
async function cargarDashboard() {
    try {
        mostrarMensaje('Cargando datos del sistema...', true);
        
        await cargarDatosFirebase();
        actualizarEstadisticas();
        actualizarTablaEstadoRutas();
        
        mostrarMensaje('Dashboard actualizado correctamente', true);
        
    } catch (error) {
        console.error('Error cargando dashboard:', error);
        mostrarMensaje('Error al cargar el dashboard: ' + error.message, false);
    }
}

async function cargarDatosFirebase() {
    return new Promise((resolve, reject) => {
        database.ref('estado').once('value')
            .then(snapshot => {
                estadoDesdeFirebase = snapshot.val() || {};
                return database.ref('recoleccion_rutas').once('value');
            })
            .then(snapshot => {
                recoleccionData = snapshot.val() || {};
                return database.ref('reposicion_rutas').once('value');
            })
            .then(snapshot => {
                reposicionData = snapshot.val() || {};
                return database.ref('recolecciones').once('value');
            })
            .then(snapshot => {
                const registros = snapshot.val();
                registrosRecoleccion = registros ? Object.values(registros) : [];
                return database.ref('reposiciones').once('value');
            })
            .then(snapshot => {
                const registros = snapshot.val();
                registrosReposicion = registros ? Object.values(registros) : [];
                resolve();
            })
            .catch(error => {
                console.error('Error cargando datos de Firebase:', error);
                reject(error);
            });
    });
}

function actualizarEstadisticas() {
    const fechaActual = new Date().toISOString().split('T')[0];
    
    let totalPlanificado = 0, totalProcesado = 0, totalPicado = 0, totalRepuesto = 0, operariosUnicos = new Set();
    
    const registrosHoyRecoleccion = registrosRecoleccion.filter(reg => {
        const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
        return fechaReg === fechaActual;
    });
    
    const registrosHoyReposicion = registrosReposicion.filter(reg => {
        const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
        return fechaReg === fechaActual;
    });
    
    if (moduloActual === 'recoleccion') {
        // Calcular total planificado desde recoleccionData
        totalPlanificado = Object.values(recoleccionData).reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        
        // Calcular total procesado (recolectado + no_encontrados)
        totalProcesado = registrosHoyRecoleccion.reduce((sum, reg) => {
            return sum + (reg.cantidad_recolectada || 0) + (reg.no_encontrados || 0);
        }, 0);
        
        // Calcular picado y repuesto
        totalPicado = registrosHoyRecoleccion.reduce((sum, reg) => sum + (reg.cantidad_recolectada || 0), 0);
        totalRepuesto = registrosHoyReposicion.reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        
    } else {
        // Calcular picado y repuesto
        totalPicado = registrosHoyRecoleccion.reduce((sum, reg) => sum + (reg.cantidad_recolectada || 0), 0);
        totalRepuesto = registrosHoyReposicion.reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        
        // Operarios únicos
        registrosHoyReposicion.forEach(registro => {
            if (registro.usuario) operariosUnicos.add(registro.usuario);
        });
    }
    
    // Actualizar UI según el módulo
    if (moduloActual === 'recoleccion') {
        document.getElementById('totalRegistros').textContent = `${totalPlanificado}/${totalProcesado}`;
        document.getElementById('totalOperarios').textContent = `${totalPicado}/${totalRepuesto}`;
    } else {
        document.getElementById('totalRegistros').textContent = `${totalPicado}/${totalRepuesto}`;
        document.getElementById('totalOperarios').textContent = operariosUnicos.size;
    }
}

// Función para agrupar registros de recolección por ruta y cola - MEJORADA
function agruparRecoleccionPorRutaYCola(registros) {
    const grupos = {};
    
    // Primero, calcular el total planificado desde recoleccionData
    Object.values(recoleccionData).forEach(registroRuta => {
        const ruta = registroRuta.deposito ? registroRuta.deposito.split('-')[0] : 'SIN_RUTA';
        const cola = obtenerColaRecoleccion(registroRuta.deposito);
        const clave = `${ruta}-${cola}`;
        
        if (!grupos[clave]) {
            grupos[clave] = {
                ruta: ruta,
                cola: cola,
                total: 0,
                procesado: 0,
                recolector: ''
            };
        }
        
        grupos[clave].total += registroRuta.cantidad || 0;
    });
    
    // Procesar registros de recolección para calcular el procesado
    const registrosProcesados = new Map();
    
    registros.forEach(registro => {
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        
        if (registrosProcesados.has(registroKey)) {
            return;
        }
        
        registrosProcesados.set(registroKey, true);
        
        const ruta = registro.deposito ? registro.deposito.split('-')[0] : 'SIN_RUTA';
        const cola = obtenerColaRecoleccion(registro.deposito);
        const clave = `${ruta}-${cola}`;
        
        if (grupos[clave]) {
            // Sumar cantidad procesada (recolectada + no_encontrados)
            const cantidadRecolectada = registro.cantidad_recolectada || 0;
            const noEncontrados = registro.no_encontrados || 0;
            grupos[clave].procesado += cantidadRecolectada + noEncontrados;
            
            if (registro.usuario && !grupos[clave].recolector) {
                grupos[clave].recolector = registro.usuario;
            }
        }
    });
    
    return grupos;
}

// Función para agrupar registros de reposición por cola - MEJORADA
function agruparReposicionPorCola(registrosRecoleccion, registrosReposicion) {
    const grupos = {};
    
    // Procesar recolecciones para obtener lo picado
    registrosRecoleccion.forEach(registro => {
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        
        const cola = obtenerColaReposicion(registro.deposito_destino);
        
        if (!cola || cola === 'OTROS') return;
        
        if (!grupos[cola]) {
            grupos[cola] = {
                cola: cola,
                total: 0,
                procesado: 0,
                recolector: ''
            };
        }
        
        grupos[cola].total += registro.cantidad_recolectada || 0;
    });
    
    // Procesar reposiciones para obtener lo repuesto
    registrosReposicion.forEach(registro => {
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        
        const cola = registro.cola;
        
        if (!cola || cola === 'OTROS') return;
        
        if (!grupos[cola]) {
            grupos[cola] = {
                cola: cola,
                total: 0,
                procesado: 0,
                recolector: ''
            };
        }
        
        grupos[cola].procesado += registro.cantidad || 0;
        
        // Solo asignar recolector si hay un usuario en la reposición
        if (registro.usuario) {
            grupos[cola].recolector = registro.usuario;
        }
    });
    
    return grupos;
}

function filtrarPorEstado() {
    filtroEstadoActual = document.getElementById('statusFilter').value;
    actualizarTablaEstadoRutas();
}

function actualizarTablaEstadoRutas() {
    const tbody = document.getElementById('dashboardTableBody');
    const thead = document.getElementById('dashboardTableHead');
    tbody.innerHTML = '';
    
    const fechaActual = new Date().toISOString().split('T')[0];
    
    let grupos;
    if (moduloActual === 'recoleccion') {
        thead.innerHTML = `
            <tr>
                <th>Ruta</th>
                <th>Cola</th>
                <th>Estado</th>
                <th>Recolector</th>
                <th>Progreso</th>
            </tr>
        `;
        
        const registrosHoy = registrosRecoleccion.filter(reg => {
            const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
            return fechaReg === fechaActual;
        });
        
        grupos = agruparRecoleccionPorRutaYCola(registrosHoy);
    } else {
        thead.innerHTML = `
            <tr>
                <th>Cola</th>
                <th>Estado</th>
                <th>Recolector</th>
                <th>Progreso</th>
            </tr>
        `;
        
        const registrosHoyRecoleccion = registrosRecoleccion.filter(reg => {
            const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
            return fechaReg === fechaActual;
        });
        
        const registrosHoyReposicion = registrosReposicion.filter(reg => {
            const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
            return fechaReg === fechaActual;
        });
        
        grupos = agruparReposicionPorCola(registrosHoyRecoleccion, registrosHoyReposicion);
    }
    
    if (Object.keys(grupos).length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No hay datos disponibles para este módulo</td></tr>';
    } else {
        const gruposOrdenados = Object.values(grupos).sort((a, b) => {
            if (moduloActual === 'recoleccion') {
                if (a.ruta !== b.ruta) {
                    return a.ruta.localeCompare(b.ruta);
                }
                return a.cola.localeCompare(b.cola);
            } else {
                return a.cola.localeCompare(b.cola);
            }
        });
        
        let gruposFiltrados = gruposOrdenados;
        
        if (filtroEstadoActual !== 'all') {
            gruposFiltrados = gruposOrdenados.filter(grupo => {
                const porcentaje = grupo.total > 0 ? Math.round((grupo.procesado / grupo.total) * 100) : 0;
                
                if (filtroEstadoActual === 'pending') {
                    return porcentaje === 0;
                } else if (filtroEstadoActual === 'in-progress') {
                    return porcentaje > 0 && porcentaje < 100;
                } else if (filtroEstadoActual === 'completed') {
                    return porcentaje >= 100;
                }
                return true;
            });
        }
        
        if (gruposFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No hay resultados para el filtro aplicado</td></tr>';
        } else {
            gruposFiltrados.forEach(grupo => {
                const porcentaje = grupo.total > 0 ? Math.round((grupo.procesado / grupo.total) * 100) : 0;
                let estadoClass, estadoText;
                
                if (porcentaje >= 100) {
                    estadoClass = 'status-completed';
                    estadoText = 'COMPLETADA';
                } else if (porcentaje > 0) {
                    estadoClass = 'status-in-progress';
                    estadoText = 'EN PROGRESO';
                } else {
                    estadoClass = 'status-pending';
                    estadoText = 'PENDIENTE';
                }
                
                const row = document.createElement('tr');
                
                if (moduloActual === 'recoleccion') {
                    row.innerHTML = `
                        <td>${grupo.ruta}</td>
                        <td>${grupo.cola}</td>
                        <td class="${estadoClass}">${estadoText}</td>
                        <td>${grupo.recolector || '-'}</td>
                        <td>${Math.min(grupo.procesado, grupo.total)}/${grupo.total}</td>
                    `;
                } else {
                    row.innerHTML = `
                        <td>${grupo.cola}</td>
                        <td class="${estadoClass}">${estadoText}</td>
                        <td>${grupo.recolector || '-'}</td>
                        <td>${Math.min(grupo.procesado, grupo.total)}/${grupo.total}</td>
                    `;
                }
                tbody.appendChild(row);
            });
        }
    }
    
    document.getElementById('dashboardLoading').style.display = 'none';
    document.getElementById('dashboardTable').style.display = 'table';
}

// ================= FUNCIONES GENERALES =================
function volverInterfazPrincipal() {
    window.location.href = 'index.html';
}

function mostrarMensaje(mensaje, esExito) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = mensaje;
    statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}