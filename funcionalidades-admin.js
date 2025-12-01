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
let rutasRecoleccionDesdeFirebase = {};
let rutasReposicionDesdeFirebase = {};
let estadoDesdeFirebase = {};
let registrosRecoleccion = [];
let registrosReposicion = [];
let usuariosConectados = {};
let slotingData = {};
let recoleccionData = {};
let reposicionData = {};

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
        document.getElementById('firebaseIndicator').className = 'connection-indicator disconnected';
    }
}

function verificarConexionFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        if (snap.val() === true) {
            document.getElementById('firebaseIndicator').className = 'connection-indicator connected';
        } else {
            document.getElementById('firebaseIndicator').className = 'connection-indicator disconnected';
        }
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
    document.getElementById('adminMainPanel').classList.add('hidden');
    document.getElementById('adminRutasPanel').classList.add('hidden');
    document.getElementById('adminSlotingPanel').classList.add('hidden');
    document.getElementById('routesPanel').classList.add('hidden');
    document.getElementById('rutasPanel').classList.add('hidden');
    document.getElementById('slotingPanel').classList.add('hidden');
    document.getElementById('usuariosPanel').classList.add('hidden');
    
    if (modulo === 'sloting') {
        document.getElementById('adminSlotingPanel').classList.remove('hidden');
        document.getElementById('slotingPanel').classList.remove('hidden');
    } else if (modulo === 'rutas') {
        document.getElementById('adminRutasPanel').classList.remove('hidden');
        document.getElementById('rutasPanel').classList.remove('hidden');
    } else if (modulo === 'usuarios') {
        document.getElementById('usuariosPanel').classList.remove('hidden');
        cargarUsuariosConectados();
    } else {
        document.getElementById('adminMainPanel').classList.remove('hidden');
        document.getElementById('routesPanel').classList.remove('hidden');
        
        // Actualizar título del panel
        document.getElementById('panelTitulo').textContent = 
            `Estado de Rutas - ${modulo === 'recoleccion' ? 'Recolección' : 'Reposición'}`;
        
        // Actualizar etiquetas según el módulo
        if (modulo === 'recoleccion') {
            document.getElementById('labelRegistros').textContent = 'Planificado/Recolectado';
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
    
    // Ejemplo: "A01-008-F0027" -> extraemos "F"
    const partes = deposito.split('-');
    if (partes.length < 3) return 'OTROS';
    
    const nivel = partes[2].charAt(0); // Tomamos la primera letra del tercer segmento
    
    // Agrupamos según las reglas proporcionadas
    if (nivel === 'A' || nivel === 'B') return 'AB';
    if (nivel === 'C' || nivel === 'D' || nivel === 'E') return 'CDE';
    if (nivel === 'F') return 'F';
    
    return 'OTROS';
}

// Función para obtener la cola de reposición a partir del deposito_destino
function obtenerColaReposicion(deposito_destino) {
    if (!deposito_destino) return 'OTROS';
    
    // Ejemplo: "P01-005-A" -> extraemos "P01"
    const partes = deposito_destino.split('-');
    if (partes.length < 1) return 'OTROS';
    
    return partes[0]; // Retornamos la primera parte como cola
}

// ================= GESTIÓN DE RUTAS & COLAS =================
function solicitarSubirRutas(tipo) {
    tipoRutaActual = tipo;
    
    // Configurar el modal según el tipo
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
    
    // Resetear modo a "reemplazar" por defecto
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
    
    // VERIFICAR CONTRASEÑA
    if (password !== PASSWORD_RUTAS) {
        mostrarMensaje('❌ Contraseña incorrecta. No tienes permisos para subir rutas.', false);
        return;
    }
    
    if (!file) {
        mostrarMensaje('Por favor, selecciona un archivo CSV', false);
        return;
    }
    
    // Mostrar progreso
    document.getElementById('uploadProgressBar').style.display = 'block';
    document.getElementById('uploadProgressFill').style.width = '10%';
    document.getElementById('uploadStatus').textContent = 'Leyendo archivo...';
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const csvText = e.target.result;
            document.getElementById('uploadProgressFill').style.width = '30%';
            document.getElementById('uploadStatus').textContent = 'Procesando datos...';
            
            // Procesar CSV según el tipo
            let datosProcesados;
            if (tipoRutaActual === 'recoleccion') {
                datosProcesados = procesarCSVRecoleccion(csvText);
            } else {
                datosProcesados = procesarCSVReposicion(csvText);
            }
            
            document.getElementById('uploadProgressFill').style.width = '60%';
            document.getElementById('uploadStatus').textContent = 'Subiendo a Firebase...';
            
            // Subir a Firebase según el modo seleccionado
            const rutaFirebase = tipoRutaActual === 'recoleccion' ? 'recoleccion_rutas' : 'reposicion_rutas';
            
            if (modoSubidaActual === 'replace') {
                // Reemplazar todos los datos
                await database.ref(rutaFirebase).set(datosProcesados);
            } else {
                // Añadir a los datos existentes
                const snapshot = await database.ref(rutaFirebase).once('value');
                const datosExistentes = snapshot.val() || {};
                
                // Combinar datos existentes con nuevos
                const datosCombinados = { ...datosExistentes, ...datosProcesados };
                
                // Subir datos combinados
                await database.ref(rutaFirebase).set(datosCombinados);
            }

            // Guardar la fecha de última actualización
            await database.ref(`estado/${rutaFirebase}_lastUpdate`).set(new Date().toISOString());
            
            document.getElementById('uploadProgressFill').style.width = '100%';
            document.getElementById('uploadStatus').textContent = '✅ Datos subidos correctamente';
            
            // Actualizar información
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
    
    // Detectar separador (usualmente tabulación para estos archivos)
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    // Verificar encabezados
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    const encabezadosEsperados = ['DEPOSITO', 'CODIGO UPC', 'ARTICULO', 'CANTIDAD', 'INDICADOR', 'FECHA', 'DEPOSITO DESTINO', 'COLA'];
    if (encabezados.length < 5) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: DEPOSITO, CODIGO UPC, ARTICULO, CANTIDAD, INDICADOR, FECHA, DEPOSITO DESTINO, COLA');
    }
    
    // Procesar datos
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
            const deposito_destino = partes[6] || ''; // Nueva columna
            const cola_reposicion = partes[7] || ''; // Nueva columna
            
            if (deposito && upc) {
                // Crear ID único para el registro
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
    
    // Detectar separador (usualmente tabulación para estos archivos)
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    // Verificar encabezados
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    if (encabezados.length < 4) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: DEPOSITO, CODIGO_UPC, ARTICULO, CANTIDAD, FECHA');
    }
    
    // Procesar datos
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
                // Crear ID único para el registro
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
        // Cargar datos de recolección
        const snapshotRecoleccion = await database.ref('recoleccion_rutas').once('value');
        recoleccionData = snapshotRecoleccion.val() || {};
        
        // Cargar datos de reposición
        const snapshotReposicion = await database.ref('reposicion_rutas').once('value');
        reposicionData = snapshotReposicion.val() || {};
        
        // Cargar última actualización de recolección
        const lastUpdateRecoleccion = await database.ref('estado/recoleccion_rutas_lastUpdate').once('value');
        const lastUpdateRecoleccionDate = lastUpdateRecoleccion.val() ? new Date(lastUpdateRecoleccion.val()).toLocaleString() : '-';

        // Actualizar información en la UI
        document.getElementById('recoleccionTotalRecords').textContent = Object.keys(recoleccionData).length;
        document.getElementById('recoleccionLastUpdate').textContent = lastUpdateRecoleccionDate;
        
        if (Object.keys(recoleccionData).length > 0) {
            document.getElementById('recoleccionStatus').textContent = 'Datos cargados';
            document.getElementById('recoleccionStatus').style.color = '#27ae60';
            
            // Mostrar vista previa
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

function verificarRutasActuales() {
    cargarRutasDesdeFirebase();
    mostrarMensaje(`Rutas actualizadas: Recolección (${Object.keys(recoleccionData).length})`, true);
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
    
    // VERIFICAR CONTRASEÑA
    if (password !== PASSWORD_SLOTING) {
        mostrarMensaje('❌ Contraseña incorrecta. No tienes permisos para subir sloting.', false);
        return;
    }
    
    if (!file) {
        mostrarMensaje('Por favor, selecciona un archivo CSV', false);
        return;
    }
    
    // Mostrar progreso
    document.getElementById('slotingProgressBar').style.display = 'block';
    document.getElementById('slotingProgressFill').style.width = '10%';
    document.getElementById('slotingUploadStatus').textContent = 'Leyendo archivo...';
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const csvText = e.target.result;
            document.getElementById('slotingProgressFill').style.width = '30%';
            document.getElementById('slotingUploadStatus').textContent = 'Procesando datos...';
            
            // Procesar CSV
            const datosProcesados = procesarCSVSloting(csvText);
            document.getElementById('slotingProgressFill').style.width = '60%';
            document.getElementById('slotingUploadStatus').textContent = 'Subiendo a Firebase...';
            
            // Subir a Firebase
            await database.ref('sloting').set(datosProcesados);

            // Guardar la fecha de última actualización
            await database.ref('estado/sloting_lastUpdate').set(new Date().toISOString());
            
            document.getElementById('slotingProgressFill').style.width = '100%';
            document.getElementById('slotingUploadStatus').textContent = '✅ Sloting subido correctamente';
            
            // Actualizar información del sloting
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
    
    // Detectar separador
    const primeraLinea = lineas[0];
    const separador = primeraLinea.includes('\t') ? '\t' : ',';
    
    // Verificar encabezados
    const encabezados = primeraLinea.split(separador).map(h => h.trim().replace(/^"|"$/g, ''));
    
    if (encabezados.length < 3 || 
        !encabezados[0].includes('UPC') || 
        !encabezados[1].includes('ARTICULO') || 
        !encabezados[2].includes('DEPOSITO')) {
        throw new Error('Formato de archivo incorrecto. Se esperaban columnas: CODIGO_UPC, ARTICULO, DEPOSITO FINAL');
    }
    
    // Procesar datos
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

        // Cargar última actualización del sloting
        const lastUpdateSloting = await database.ref('estado/sloting_lastUpdate').once('value');
        const lastUpdateSlotingDate = lastUpdateSloting.val() ? new Date(lastUpdateSloting.val()).toLocaleString() : '-';
        
        // Actualizar información en la UI
        document.getElementById('slotingTotalRecords').textContent = Object.keys(slotingData).length;
        document.getElementById('slotingLastUpdate').textContent = lastUpdateSlotingDate;
        
        if (Object.keys(slotingData).length > 0) {
            document.getElementById('slotingStatus').textContent = 'Datos cargados';
            document.getElementById('slotingStatus').style.color = '#27ae60';
            
            // Mostrar vista previa
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

// ================= GESTIÓN DE USUARIOS CONECTADOS =================
async function cargarUsuariosConectados() {
    try {
        document.getElementById('usuariosLoading').style.display = 'block';
        document.getElementById('usuariosTable').style.display = 'none';
        
        // Cargar usuarios conectados desde Firebase
        const usuariosSnapshot = await database.ref('usuarios_conectados').once('value');
        usuariosConectados = usuariosSnapshot.val() || {};
        
        // Procesar usuarios
        const usuariosProcesados = [];
        
        for (const [usuarioId, datosUsuario] of Object.entries(usuariosConectados)) {
            const tiempoConectado = calcularTiempoConectado(datosUsuario.timestamp_conexion);
            const tiempoDesdeUltimaActividad = calcularTiempoDesdeUltimaActividad(datosUsuario.ultima_actividad);
            const estaActivo = tiempoDesdeUltimaActividad < 5; // Considerar activo si la última actividad fue hace menos de 5 minutos
            
            usuariosProcesados.push({
                nombre: datosUsuario.nombre,
                estado: estaActivo ? 'ACTIVO' : 'INACTIVO',
                ultimaActividad: datosUsuario.ultima_actividad,
                tiempoConectado: tiempoConectado,
                modulo: datosUsuario.modulo || 'No especificado'
            });
        }
        
        // Ordenar usuarios por última actividad (más reciente primero)
        usuariosProcesados.sort((a, b) => {
            return new Date(b.ultimaActividad) - new Date(a.ultimaActividad);
        });
        
        // Mostrar en la tabla
        const tbody = document.getElementById('usuariosTableBody');
        tbody.innerHTML = '';
        
        if (usuariosProcesados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;">No hay usuarios conectados</td></tr>';
        } else {
            usuariosProcesados.forEach(usuario => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${usuario.nombre}</td>
                    <td class="${usuario.estado === 'ACTIVO' ? 'user-active' : 'user-inactive'}">${usuario.estado}</td>
                    <td>${usuario.ultimaActividad ? new Date(usuario.ultimaActividad).toLocaleString() : '-'}</td>
                    <td>${usuario.tiempoConectado}</td>
                    <td>${usuario.modulo}</td>
                `;
                tbody.appendChild(row);
            });
        }
        
        document.getElementById('usuariosLoading').style.display = 'none';
        document.getElementById('usuariosTable').style.display = 'table';
        
    } catch (error) {
        console.error('Error cargando usuarios:', error);
        document.getElementById('usuariosLoading').textContent = 'Error al cargar información de usuarios';
    }
}

function calcularTiempoConectado(timestampConexion) {
    if (!timestampConexion) return '-';
    
    const inicio = new Date(timestampConexion);
    const ahora = new Date();
    const diferenciaMs = ahora - inicio;
    
    const horas = Math.floor(diferenciaMs / (1000 * 60 * 60));
    const minutos = Math.floor((diferenciaMs % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${horas}h ${minutos}m`;
}

function calcularTiempoDesdeUltimaActividad(ultimaActividad) {
    if (!ultimaActividad) return Infinity;
    
    const ahora = new Date();
    const ultima = new Date(ultimaActividad);
    const diferenciaMs = ahora - ultima;
    
    return Math.floor(diferenciaMs / (1000 * 60)); // Devuelve minutos
}

// ================= FUNCIONES PRINCIPALES DEL ADMINISTRADOR =================
async function cargarDashboard() {
    try {
        mostrarMensaje('Cargando datos del sistema...', true);
        
        // Cargar datos de Firebase
        await cargarDatosFirebase();
        
        // Procesar y mostrar datos
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
        // Cargar estado de rutas desde Firebase
        database.ref('estado').once('value')
            .then(snapshot => {
                estadoDesdeFirebase = snapshot.val() || {};
                console.log('Estado cargado desde Firebase:', estadoDesdeFirebase);
                
                // Cargar rutas de recolección
                return database.ref('recoleccion_rutas').once('value');
            })
            .then(snapshot => {
                rutasRecoleccionDesdeFirebase = snapshot.val() || {};
                console.log('Rutas de recolección cargadas:', Object.keys(rutasRecoleccionDesdeFirebase).length);
                
                // Cargar rutas de reposición
                return database.ref('reposicion_rutas').once('value');
            })
            .then(snapshot => {
                rutasReposicionDesdeFirebase = snapshot.val() || {};
                console.log('Rutas de reposición cargadas:', Object.keys(rutasReposicionDesdeFirebase).length);
                
                // Cargar registros de recolección
                return database.ref('recolecciones').once('value');
            })
            .then(snapshot => {
                const registros = snapshot.val();
                registrosRecoleccion = registros ? Object.values(registros) : [];
                console.log('Registros de recolección cargados:', registrosRecoleccion.length);
                
                // Cargar registros de reposición
                return database.ref('reposiciones').once('value');
            })
            .then(snapshot => {
                const registros = snapshot.val();
                registrosReposicion = registros ? Object.values(registros) : [];
                console.log('Registros de reposición cargados:', registrosReposicion.length);
                
                // Cargar usuarios conectados
                return database.ref('usuarios_conectados').once('value');
            })
            .then(snapshot => {
                usuariosConectados = snapshot.val() || {};
                console.log('Usuarios conectados cargados:', Object.keys(usuariosConectados).length);
                resolve();
            })
            .catch(error => {
                console.error('Error cargando datos de Firebase:', error);
                reject(error);
            });
    });
}

function actualizarEstadisticas() {
    // Obtener fecha actual para filtrar
    const fechaActual = new Date().toISOString().split('T')[0];
    
    let rutasActivas, rutasCompletadas, totalPlanificado, totalRecolectado, totalPicado, totalRepuesto, operariosUnicos;
    
    // Filtrar registros de recolección por fecha actual
    const registrosHoyRecoleccion = registrosRecoleccion.filter(reg => {
        const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
        return fechaReg === fechaActual;
    });
    
    // Filtrar registros de reposición por fecha actual
    const registrosHoyReposicion = registrosReposicion.filter(reg => {
        const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
        return fechaReg === fechaActual;
    });
    
    if (moduloActual === 'recoleccion') {
        // Agrupar por ruta y cola
        const grupos = agruparRecoleccionPorRutaYCola(registrosHoyRecoleccion);
        rutasActivas = Object.keys(grupos).length;
        rutasCompletadas = calcularRutasCompletadasRecoleccion(grupos);
        
        // Calcular total planificado y recolectado
        totalPlanificado = Object.values(recoleccionData).reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        totalRecolectado = registrosHoyRecoleccion.reduce((sum, reg) => sum + (reg.cantidad_recolectada || 0), 0);
        
        // Calcular picado y repuesto
        totalPicado = registrosHoyRecoleccion.reduce((sum, reg) => sum + (reg.cantidad_recolectada || 0), 0);
        totalRepuesto = registrosHoyReposicion.reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        
        // Operarios únicos
        operariosUnicos = new Set();
        registrosHoyRecoleccion.forEach(registro => {
            if (registro.usuario) operariosUnicos.add(registro.usuario);
        });
    } else {
        // Para reposición
        const grupos = agruparReposicionPorCola(registrosHoyRecoleccion, registrosHoyReposicion);
        rutasActivas = Object.keys(grupos).length;
        rutasCompletadas = calcularRutasCompletadasReposicion(grupos);
        
        // Calcular picado y repuesto
        totalPicado = registrosHoyRecoleccion.reduce((sum, reg) => sum + (reg.cantidad_recolectada || 0), 0);
        totalRepuesto = registrosHoyReposicion.reduce((sum, reg) => sum + (reg.cantidad || 0), 0);
        
        // Operarios únicos
        operariosUnicos = new Set();
        registrosHoyReposicion.forEach(registro => {
            if (registro.usuario) operariosUnicos.add(registro.usuario);
        });
    }
    
    // Actualizar UI según el módulo
    document.getElementById('totalRutas').textContent = rutasActivas;
    document.getElementById('rutasCompletadas').textContent = rutasCompletadas;
    
    if (moduloActual === 'recoleccion') {
        document.getElementById('totalRegistros').textContent = `${totalPlanificado}/${totalRecolectado}`;
        document.getElementById('totalOperarios').textContent = `${totalPicado}/${totalRepuesto}`;
    } else {
        document.getElementById('totalRegistros').textContent = `${totalPicado}/${totalRepuesto}`;
        document.getElementById('totalOperarios').textContent = operariosUnicos.size;
    }
}

// Función para agrupar registros de recolección por ruta y cola - CORREGIDA
function agruparRecoleccionPorRutaYCola(registros) {
    const grupos = {};
    
    // Primero, calcular el total planificado desde recoleccion_rutas
    Object.values(recoleccionData).forEach(registroRuta => {
        const ruta = registroRuta.deposito ? registroRuta.deposito.split('-')[0] : 'SIN_RUTA';
        const cola = obtenerColaRecoleccion(registroRuta.deposito);
        const clave = `${ruta}-${cola}`;
        
        if (!grupos[clave]) {
            grupos[clave] = {
                ruta: ruta,
                cola: cola,
                total: 0,
                completado: 0,
                recolector: ''
            };
        }
        
        // Sumar cantidad planificada
        grupos[clave].total += registroRuta.cantidad || 0;
    });
    
    // Luego, procesar los registros de recolección para calcular el completado
    // Usamos un mapa para evitar duplicados
    const registrosProcesados = new Map();
    
    registros.forEach(registro => {
        // Crear una clave única para cada registro
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        
        // Evitar procesar el mismo registro múltiples veces
        if (registrosProcesados.has(registroKey)) {
            return;
        }
        
        registrosProcesados.set(registroKey, true);
        
        const ruta = registro.deposito ? registro.deposito.split('-')[0] : 'SIN_RUTA';
        const cola = obtenerColaRecoleccion(registro.deposito);
        const clave = `${ruta}-${cola}`;
        
        // Solo sumar si existe el grupo (está en la planificación)
        if (grupos[clave]) {
            // Sumar cantidad recolectada (usando cantidad_recolectada)
            grupos[clave].completado += registro.cantidad_recolectada || 0;
            
            // Actualizar recolector (tomar el primero encontrado)
            if (registro.usuario && !grupos[clave].recolector) {
                grupos[clave].recolector = registro.usuario;
            }
        }
    });
    
    return grupos;
}

// Función para agrupar registros de reposición por cola - CORREGIDA
function agruparReposicionPorCola(registrosRecoleccion, registrosReposicion) {
    const grupos = {};
    
    // Usar mapas para evitar duplicados
    const registrosRecoleccionProcesados = new Map();
    const registrosReposicionProcesados = new Map();
    
    // Procesar recolecciones para obtener lo picado (cantidad_recolectada)
    registrosRecoleccion.forEach(registro => {
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        if (registrosRecoleccionProcesados.has(registroKey)) return;
        registrosRecoleccionProcesados.set(registroKey, true);
        
        const cola = obtenerColaReposicion(registro.deposito_destino);
        
        if (!cola || cola === 'OTROS') return;
        
        if (!grupos[cola]) {
            grupos[cola] = {
                cola: cola,
                total: 0,
                completado: 0,
                recolector: registro.usuario
            };
        }
        
        // Sumar cantidad picada
        grupos[cola].total += registro.cantidad_recolectada || 0;
    });
    
    // Procesar reposiciones para obtener lo repuesto
    registrosReposicion.forEach(registro => {
        const registroKey = `${registro.deposito}_${registro.upc}_${registro.timestamp}`;
        if (registrosReposicionProcesados.has(registroKey)) return;
        registrosReposicionProcesados.set(registroKey, true);
        
        const cola = registro.cola;
        
        if (!cola || cola === 'OTROS') return;
        
        if (!grupos[cola]) {
            grupos[cola] = {
                cola: cola,
                total: 0,
                completado: 0,
                recolector: registro.usuario
            };
        }
        
        // Sumar cantidad repuesta
        grupos[cola].completado += registro.cantidad || 0;
        
        // Actualizar recolector
        if (registro.usuario && !grupos[cola].recolector) {
            grupos[cola].recolector = registro.usuario;
        }
    });
    
    return grupos;
}

function calcularRutasCompletadasRecoleccion(grupos) {
    let completadas = 0;
    Object.values(grupos).forEach(grupo => {
        const porcentaje = grupo.total > 0 ? Math.round((grupo.completado / grupo.total) * 100) : 0;
        // Corregido: solo completada si es exactamente 100% o menos pero no más
        if (porcentaje >= 100) completadas++;
    });
    return completadas;
}

function calcularRutasCompletadasReposicion(grupos) {
    let completadas = 0;
    Object.values(grupos).forEach(grupo => {
        const porcentaje = grupo.total > 0 ? Math.round((grupo.completado / grupo.total) * 100) : 0;
        if (porcentaje >= 100) completadas++;
    });
    return completadas;
}

function actualizarTablaEstadoRutas() {
    const tbody = document.getElementById('dashboardTableBody');
    const thead = document.getElementById('dashboardTableHead');
    tbody.innerHTML = '';
    
    // Obtener fecha actual para filtrar
    const fechaActual = new Date().toISOString().split('T')[0];
    
    let grupos;
    if (moduloActual === 'recoleccion') {
        // Configurar encabezados para recolección
        thead.innerHTML = `
            <tr>
                <th>Ruta</th>
                <th>Cola</th>
                <th>Estado</th>
                <th>Recolector</th>
                <th>Progreso</th>
            </tr>
        `;
        
        // Filtrar registros de recolección por fecha actual y agrupar
        const registrosHoy = registrosRecoleccion.filter(reg => {
            const fechaReg = reg.timestamp ? new Date(reg.timestamp).toISOString().split('T')[0] : null;
            return fechaReg === fechaActual;
        });
        
        grupos = agruparRecoleccionPorRutaYCola(registrosHoy);
    } else {
        // Configurar encabezados para reposición
        thead.innerHTML = `
            <tr>
                <th>Cola</th>
                <th>Estado</th>
                <th>Recolector</th>
                <th>Progreso</th>
            </tr>
        `;
        
        // Filtrar registros por fecha actual y agrupar para reposición
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
        // Ordenar grupos por ruta y cola
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
        
        gruposOrdenados.forEach(grupo => {
            const porcentaje = grupo.total > 0 ? Math.round((grupo.completado / grupo.total) * 100) : 0;
            let estadoClass, estadoText;
            
            // Determinar estado CORREGIDO
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
                    <td>${Math.min(grupo.completado, grupo.total)}/${grupo.total}</td>
                `;
            } else {
                row.innerHTML = `
                    <td>${grupo.cola}</td>
                    <td class="${estadoClass}">${estadoText}</td>
                    <td>${grupo.recolector || '-'}</td>
                    <td>${Math.min(grupo.completado, grupo.total)}/${grupo.total}</td>
                `;
            }
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('dashboardLoading').style.display = 'none';
    document.getElementById('dashboardTable').style.display = 'table';
}

async function actualizarDesdeFirebase() {
    try {
        mostrarMensaje('Actualizando desde Firebase...', true);
        
        await cargarDatosFirebase();
        await cargarRutasDesdeFirebase();
        
        // Actualizar la vista
        actualizarEstadisticas();
        actualizarTablaEstadoRutas();
        
        // Si estamos en el módulo de usuarios, actualizar también
        if (moduloActual === 'usuarios') {
            cargarUsuariosConectados();
        }
        
        mostrarMensaje('✅ Datos actualizados desde Firebase correctamente', true);
        
    } catch (error) {
        console.error('Error actualizando desde Firebase:', error);
        mostrarMensaje('❌ Error al actualizar desde Firebase: ' + error.message, false);
    }
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