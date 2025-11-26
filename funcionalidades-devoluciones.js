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
const PASSWORD_CARGAR = "E123456";

// Variables globales
let usuarioActual = localStorage.getItem('usuarioSokso');
let datosDevoluciones = [];
let colasData = {};
let reposicionesData = {};
let colaActual = '';
let depositosCola = [];
let depositoActual = null;
let depositoActualIndex = -1;
let escaneosTemporales = {};
let escaneosCache = {};

// =============================================
// FUNCIONES PARA LA VISTA DE LISTA DE COLAS
// =============================================

window.addEventListener('load', function() {
    if (!usuarioActual) {
        window.location.href = 'index.html';
        return;
    }
    
    document.getElementById('totalUnidades').textContent = `Unidades: 0`;
    verificarConexionFirebase();
    cargarDatosDesdeCache();
    cargarReposicionesDesdeFirebase();
    
    // Mostrar vista de lista de colas por defecto
    mostrarVistaListaColas();
});

function verificarConexionFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        const estado = snap.val() === true ? 'connected' : 'disconnected';
        document.getElementById('firebaseIndicator').className = `connection-indicator ${estado}`;
        document.getElementById('firebaseIndicatorDetalle').className = `connection-indicator ${estado}`;
    });
}

function cargarDatosDesdeCache() {
    const cache = localStorage.getItem('cacheDevoluciones');
    if (cache) {
        datosDevoluciones = JSON.parse(cache);
        console.log('Datos cargados desde cache:', datosDevoluciones);
        procesarDatosColas();
    }
}

function cargarReposicionesDesdeFirebase() {
    const ref = database.ref('reposicion_devol');
    ref.once('value').then(snapshot => {
        const data = snapshot.val();
        if (data) {
            reposicionesData = data;
            console.log('Reposiciones cargadas desde Firebase:', reposicionesData);
            procesarDatosColas();
        }
    }).catch(error => {
        console.error('Error cargando reposiciones:', error);
    });
}

function procesarDatosColas() {
    colasData = {};
    let totalUnidades = 0;

    // Procesar datos planificados (DEVOLUCIONES)
    if (datosDevoluciones && datosDevoluciones.length > 0) {
        datosDevoluciones.forEach(item => {
            const cola = item.cola_reposicion;
            if (!colasData[cola]) {
                colasData[cola] = {
                    total: 0,
                    completado: 0
                };
            }
            colasData[cola].total += parseInt(item.CANTIDAD);
            totalUnidades += parseInt(item.CANTIDAD);
        });
    }

    // Procesar datos de reposición (reposicion_devol)
    if (reposicionesData) {
        Object.keys(reposicionesData).forEach(key => {
            const item = reposicionesData[key];
            const cola = item.cola;
            if (colasData[cola]) {
                colasData[cola].completado += parseInt(item.cantidad);
            }
        });
    }

    // Actualizar el total de unidades
    document.getElementById('totalUnidades').textContent = `Unidades: ${totalUnidades}`;
    actualizarVistaColas();
}

function actualizarVistaColas() {
    const grid = document.getElementById('colasGrid');
    grid.innerHTML = '';

    if (Object.keys(colasData).length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">No hay colas cargadas</div>';
        return;
    }

    Object.keys(colasData).sort().forEach(cola => {
        const button = document.createElement('button');
        button.className = 'cola-button';
        
        // Solo marcar como completo si la reposición es igual o mayor al total planificado
        if (colasData[cola].completado >= colasData[cola].total) {
            button.classList.add('completo');
        }
        
        button.textContent = `${cola} ${colasData[cola].completado}/${colasData[cola].total}`;
        button.onclick = () => irADetalleCola(cola);
        grid.appendChild(button);
    });
}

function irADetalleCola(cola) {
    // Limpiar estado anterior completamente
    colaActual = cola;
    depositosCola = [];
    depositoActual = null;
    depositoActualIndex = -1;
    escaneosTemporales = {};
    
    localStorage.setItem('colaSeleccionada', cola);
    inicializarDetalleCola();
    mostrarVistaDetalleCola();
}

function cargarColasModal() {
    document.getElementById('cargarColasModal').style.display = 'flex';
}

function cerrarCargarColasModal() {
    document.getElementById('cargarColasModal').style.display = 'none';
    document.getElementById('passwordCargar').value = '';
    document.getElementById('fileInput').value = '';
}

function obtenerFechaActual() {
    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, '0');
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const año = hoy.getFullYear();
    return `${dia}/${mes}/${año}`;
}

function cargarArchivo() {
    const password = document.getElementById('passwordCargar').value;
    if (password !== PASSWORD_CARGAR) {
        mostrarMensaje('Contraseña incorrecta', false);
        return;
    }

    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
        mostrarMensaje('Selecciona un archivo CSV', false);
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());

        // Validar encabezados
        const expectedHeaders = ['deposito_destino', 'cola_reposicion', 'CODIGO UPC', 'ARTICULO', 'CANTIDAD', 'FECHA'];
        if (!expectedHeaders.every(h => headers.includes(h))) {
            mostrarMensaje('El archivo CSV no tiene los encabezados correctos', false);
            return;
        }

        // Obtener fecha actual para validación
        const fechaActual = obtenerFechaActual();
        let fechaArchivo = null;
        let archivoValido = true;

        // Procesar las líneas
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(',').map(v => v.trim());
            if (values.length !== headers.length) continue;

            const item = {};
            headers.forEach((header, index) => {
                item[header] = values[index];
            });

            // Validar fecha (solo la primera vez)
            if (!fechaArchivo) {
                fechaArchivo = item.FECHA;
                if (fechaArchivo !== fechaActual) {
                    mostrarMensaje(`ERROR: La fecha del archivo (${fechaArchivo}) no coincide con la fecha actual (${fechaActual}). Comuníquese con James Jimenez.`, false);
                    archivoValido = false;
                    return;
                }
            }

            // Verificar que todas las fechas sean iguales
            if (item.FECHA !== fechaArchivo) {
                mostrarMensaje(`ERROR: Las fechas en el archivo no son consistentes. Comuníquese con James Jimenez.`, false);
                archivoValido = false;
                return;
            }

            data.push(item);
        }

        if (archivoValido) {
            // Subir a Firebase en el nodo DEVOLUCIONES
            subirDatosAFirebase(data);
        }
    };

    reader.readAsText(file);
}

function subirDatosAFirebase(data) {
    const ref = database.ref('DEVOLUCIONES');
    // Limpiar datos existentes y cargar nuevos
    ref.remove().then(() => {
        const promises = [];
        data.forEach(item => {
            const newRef = ref.push();
            promises.push(newRef.set({
                ...item,
                usuario: usuarioActual,
                hora: new Date().toLocaleTimeString()
            }));
        });

        Promise.all(promises).then(() => {
            mostrarMensaje('Archivo cargado exitosamente', true);
            cerrarCargarColasModal();
            // Actualizar la caché y la vista
            datosDevoluciones = data;
            localStorage.setItem('cacheDevoluciones', JSON.stringify(data));
            procesarDatosColas();
        }).catch(error => {
            mostrarMensaje('Error al cargar el archivo: ' + error.message, false);
        });
    });
}

function actualizarDatos() {
    // Descargar los datos de Firebase y actualizar la caché
    const refDevoluciones = database.ref('DEVOLUCIONES');
    const refReposiciones = database.ref('reposicion_devol');
    
    Promise.all([
        refDevoluciones.once('value'),
        refReposiciones.once('value')
    ]).then(([snapshotDevoluciones, snapshotReposiciones]) => {
        const dataDevoluciones = snapshotDevoluciones.val();
        const dataReposiciones = snapshotReposiciones.val();
        
        if (dataDevoluciones) {
            const dataArray = Object.keys(dataDevoluciones).map(key => dataDevoluciones[key]);
            datosDevoluciones = dataArray;
            localStorage.setItem('cacheDevoluciones', JSON.stringify(dataArray));
        }
        
        if (dataReposiciones) {
            reposicionesData = dataReposiciones;
        }
        
        procesarDatosColas();
        mostrarMensaje('Datos actualizados', true);
    }).catch(error => {
        mostrarMensaje('Error al actualizar: ' + error.message, false);
    });
}

function volverInterfazPrincipal() {
    window.location.href = 'index.html';
}

// =============================================
// FUNCIONES PARA LA VISTA DE DETALLE DE COLA
// =============================================

function inicializarDetalleCola() {
    if (!colaActual) {
        mostrarMensajeDetalle('No se ha seleccionado una cola', false);
        setTimeout(() => mostrarVistaListaColas(), 2000);
        return;
    }
    
    document.getElementById('currentColaDisplay').textContent = colaActual;
    
    // Mostrar fecha actual
    const fechaActual = obtenerFechaActual();
    document.getElementById('fechaActualDisplay').textContent = `Fecha: ${fechaActual}`;
    
    filtrarDepositosPorCola();
    inicializarInterfazDetalle();
    
    // Establecer el primer depósito como actual automáticamente
    if (depositosCola.length > 0) {
        establecerDepositoActual(0);
    }
}

function filtrarDepositosPorCola() {
    if (!datosDevoluciones || datosDevoluciones.length === 0) {
        console.error('No hay datos de devoluciones cargados');
        mostrarMensajeDetalle('No hay datos de devoluciones cargados para esta cola', false);
        return;
    }
    
    depositosCola = datosDevoluciones.filter(item => item.cola_reposicion === colaActual);
    console.log(`Depósitos filtrados para cola ${colaActual}:`, depositosCola);
    
    if (depositosCola.length === 0) {
        console.warn(`No se encontraron depósitos para la cola ${colaActual}`);
        mostrarMensajeDetalle(`No se encontraron depósitos para la cola ${colaActual}`, false);
        return;
    }
    
    // Cargar escaneos desde cache
    const cacheKey = `escaneosCache_${colaActual}`;
    const cacheData = localStorage.getItem(cacheKey);
    if (cacheData) {
        escaneosCache = JSON.parse(cacheData);
    }
    
    // Agrupar por depósito y artículo
    const depositosAgrupados = {};
    depositosCola.forEach(item => {
        const key = `${item.deposito_destino}_${item['CODIGO UPC']}`;
        if (!depositosAgrupados[key]) {
            depositosAgrupados[key] = {
                deposito: item.deposito_destino,
                articulo: item.ARTICULO,
                upc: item['CODIGO UPC'],
                cantidad: 0,
                escaneado: 0
            };
        }
        depositosAgrupados[key].cantidad += parseInt(item.CANTIDAD);
        
        // Verificar si ya hay escaneos para este depósito
        if (escaneosCache[key]) {
            depositosAgrupados[key].escaneado = escaneosCache[key];
        }
    });
    
    depositosCola = Object.values(depositosAgrupados);
    
    // Ordenar los depósitos
    depositosCola.sort((a, b) => a.deposito.localeCompare(b.deposito));
    console.log('Depósitos agrupados y ordenados:', depositosCola);
}

function inicializarInterfazDetalle() {
    actualizarListaDepositos();
    
    // Configurar eventos de escaneo
    document.getElementById('depositoInput').addEventListener('input', function(e) {
        const deposito = this.value.trim();
        if (deposito.length > 5) { // Esperar a que tenga una longitud mínima
            validarDeposito(deposito);
        }
    });
    
    document.getElementById('upcInput').addEventListener('input', function(e) {
        const upc = this.value.trim();
        if (upc.length > 10) { // Esperar a que tenga una longitud mínima
            // Procesar automáticamente sin Enter
            setTimeout(() => {
                procesarEscaneoUPC(upc);
                this.value = '';
            }, 100);
        }
    });
    
    document.getElementById('depositoInput').focus();
}

function establecerDepositoActual(index) {
    if (index < 0 || index >= depositosCola.length) return;
    
    depositoActual = depositosCola[index];
    depositoActualIndex = index;
    
    console.log('Depósito establecido como actual:', depositoActual);
    
    // Actualizar interfaz con los datos del depósito
    document.getElementById('currentDepositoDisplay').textContent = depositoActual.deposito;
    document.getElementById('currentArticuloDisplay').textContent = depositoActual.articulo;
    document.getElementById('cantidadTotal').textContent = depositoActual.cantidad;
    document.getElementById('cantidadLeida').textContent = depositoActual.escaneado;
    document.getElementById('cantidadPendiente').textContent = depositoActual.cantidad - depositoActual.escaneado;
    
    // Limpiar campo de depósito (debe ser escaneado)
    document.getElementById('depositoInput').value = '';
    
    // Actualizar información del siguiente depósito
    actualizarInfoSiguienteDeposito();
    
    // Inicializar escaneos temporales
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    if (!escaneosTemporales[key]) {
        escaneosTemporales[key] = 0;
    }
    
    // Actualizar lista para mostrar depósito activo
    actualizarListaDepositos();
    
    // Deshabilitar UPC hasta que se escanee el depósito correcto
    document.getElementById('upcInput').disabled = true;
    
    mostrarMensajeDetalle(`Listo para escanear depósito: ${depositoActual.deposito}`, true);
}

function actualizarInfoSiguienteDeposito() {
    const nextIndex = depositoActualIndex + 1;
    const infoElement = document.getElementById('nextDepositoInfo');
    
    if (nextIndex < depositosCola.length) {
        const nextDeposito = depositosCola[nextIndex];
        infoElement.textContent = `Siguiente: ${nextDeposito.deposito} - ${nextDeposito.articulo} (${nextDeposito.cantidad})`;
    } else {
        infoElement.textContent = 'Último depósito de la cola';
    }
}

function validarDeposito(deposito) {
    console.log('Validando depósito escaneado:', deposito);
    console.log('Depósito esperado:', depositoActual.deposito);
    
    // Verificar que el depósito escaneado coincide con el depósito actual esperado
    if (deposito === depositoActual.deposito) {
        // Depósito correcto, habilitar UPC
        document.getElementById('upcInput').disabled = false;
        document.getElementById('upcInput').focus();
        mostrarMensajeDetalle(`Depósito ${deposito} escaneado correctamente`, true);
        
        // Limpiar el campo después de la validación exitosa
        setTimeout(() => {
            document.getElementById('depositoInput').value = '';
        }, 500);
    } else {
        // Depósito incorrecto
        mostrarMensajeDetalle(`ERROR: Depósito incorrecto. Se esperaba: ${depositoActual.deposito}`, false);
        document.getElementById('depositoInput').value = '';
        document.getElementById('depositoInput').focus();
    }
}

function procesarEscaneoUPC(upc) {
    if (!depositoActual) {
        mostrarMensajeDetalle('Primero escanea un depósito válido', false);
        return;
    }
    
    console.log('Procesando UPC:', upc);
    console.log('UPC esperado:', depositoActual.upc);
    
    // Validar que el UPC corresponde al depósito actual
    if (depositoActual.upc !== upc) {
        mostrarMensajeDetalle('Código UPC no válido para este depósito', false);
        return;
    }
    
    // Verificar que no se exceda la cantidad
    if (depositoActual.escaneado >= depositoActual.cantidad) {
        mostrarMensajeDetalle('¡Depósito ya completado!', true);
        return;
    }
    
    // Incrementar contadores
    depositoActual.escaneado++;
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    escaneosTemporales[key]++;
    
    // Actualizar interfaz
    document.getElementById('cantidadLeida').textContent = depositoActual.escaneado;
    document.getElementById('cantidadPendiente').textContent = depositoActual.cantidad - depositoActual.escaneado;
    
    // Actualizar cache local
    escaneosCache[key] = depositoActual.escaneado;
    localStorage.setItem(`escaneosCache_${colaActual}`, JSON.stringify(escaneosCache));
    
    // Actualizar lista
    actualizarListaDepositos();
    
    // Verificar si se completó el depósito
    if (depositoActual.escaneado >= depositoActual.cantidad) {
        mostrarMensajeDetalle('¡Depósito completado!', true);
        // Guardar automáticamente y pasar al siguiente después de un breve delay
        setTimeout(() => {
            guardarYAvanzar();
        }, 800);
    }
}

function actualizarListaDepositos() {
    const lista = document.getElementById('depositosList');
    lista.innerHTML = '';
    
    if (depositosCola.length === 0) {
        lista.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">No hay depósitos para esta cola</div>';
        return;
    }
    
    depositosCola.forEach((deposito, index) => {
        const item = document.createElement('div');
        item.className = 'deposito-item';
        
        if (deposito.escaneado >= deposito.cantidad) {
            item.classList.add('deposito-completo');
        }
        
        // Marcar como activo si es el depósito actual
        if (depositoActual && deposito.deposito === depositoActual.deposito && deposito.upc === depositoActual.upc) {
            item.classList.add('deposito-activo');
        }
        
        const estado = `${deposito.escaneado}/${deposito.cantidad}`;
            
        item.innerHTML = `
            <div>${deposito.deposito}</div>
            <div>${deposito.cantidad}</div>
            <div>${estado}</div>
        `;
        
        // Hacer clicable para seleccionar depósito
        item.addEventListener('click', () => seleccionarDeposito(index));
        
        lista.appendChild(item);
    });
}

function seleccionarDeposito(index) {
    establecerDepositoActual(index);
    mostrarMensajeDetalle(`Depósito ${depositosCola[index].deposito} seleccionado`, true);
}

function guardarYAvanzar() {
    if (!depositoActual) return;
    
    // Guardar los escaneos actuales en Firebase
    guardarEscaneosActuales().then(() => {
        // Mostrar pantalla de éxito
        const successScreen = document.getElementById('successScreen');
        successScreen.style.display = 'flex';
        
        setTimeout(() => {
            successScreen.style.display = 'none';
            
            // Buscar siguiente depósito no completado
            let siguienteIndex = -1;
            for (let i = depositoActualIndex + 1; i < depositosCola.length; i++) {
                if (depositosCola[i].escaneado < depositosCola[i].cantidad) {
                    siguienteIndex = i;
                    break;
                }
            }
            
            if (siguienteIndex !== -1) {
                // Establecer siguiente depósito
                establecerDepositoActual(siguienteIndex);
                mostrarMensajeDetalle(`Siguiente depósito: ${depositosCola[siguienteIndex].deposito}`, true);
            } else {
                // No hay más depósitos pendientes
                mostrarMensajeDetalle('¡Todos los depósitos completados!', true);
                document.getElementById('currentDepositoDisplay').textContent = '----';
                document.getElementById('currentArticuloDisplay').textContent = '----';
                document.getElementById('cantidadTotal').textContent = '0';
                document.getElementById('cantidadLeida').textContent = '0';
                document.getElementById('cantidadPendiente').textContent = '0';
                document.getElementById('nextDepositoInfo').textContent = '¡Cola completada!';
                
                depositoActual = null;
                depositoActualIndex = -1;
                
                // Actualizar lista
                actualizarListaDepositos();
            }
            
        }, 1000);
    }).catch(error => {
        mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
    });
}

function guardarEscaneosActuales() {
    if (!depositoActual) {
        return Promise.resolve();
    }
    
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    const escaneosPendientes = escaneosTemporales[key] || 0;
    
    if (escaneosPendientes === 0) {
        return Promise.resolve();
    }
    
    const ref = database.ref('reposicion_devol');
    const now = new Date();
    const fecha = now.toLocaleDateString('es-ES');
    const hora = now.toLocaleTimeString('es-ES');
    
    // Guardar cada escaneo individual
    const promises = [];
    
    for (let i = 0; i < escaneosPendientes; i++) {
        const newRef = ref.push();
        const promise = newRef.set({
            usuario: usuarioActual,
            cola: colaActual,
            deposito: depositoActual.deposito,
            descripcion: depositoActual.articulo,
            upc: depositoActual.upc,
            cantidad: 1,
            fecha: fecha,
            hora: hora
        });
        promises.push(promise);
    }
    
    // Limpiar escaneos temporales
    escaneosTemporales[key] = 0;
    
    return Promise.all(promises);
}

function siguienteDeposito() {
    // Buscar siguiente depósito no completado
    let siguienteIndex = -1;
    const startIndex = depositoActual ? depositoActualIndex + 1 : 0;
    
    for (let i = startIndex; i < depositosCola.length; i++) {
        if (depositosCola[i].escaneado < depositosCola[i].cantidad) {
            siguienteIndex = i;
            break;
        }
    }
    
    if (siguienteIndex !== -1) {
        establecerDepositoActual(siguienteIndex);
        mostrarMensajeDetalle(`Saltando al depósito: ${depositosCola[siguienteIndex].deposito}`, true);
    } else {
        mostrarMensajeDetalle('No hay más depósitos pendientes', true);
    }
}

function volverAColas() {
    // Guardar cualquier cambio pendiente
    guardarEscaneosActuales().then(() => {
        // Limpiar completamente el estado
        colaActual = '';
        depositosCola = [];
        depositoActual = null;
        depositoActualIndex = -1;
        escaneosTemporales = {};
        
        localStorage.removeItem('colaSeleccionada');
        mostrarVistaListaColas();
    });
}

function guardarFinalizar() {
    guardarEscaneosActuales().then(() => {
        mostrarMensajeDetalle('Todos los datos guardados correctamente', true);
        setTimeout(() => {
            volverAColas();
        }, 1000);
    });
}

// =============================================
// FUNCIONES GENERALES
// =============================================

function mostrarVistaListaColas() {
    document.getElementById('vistaListaColas').style.display = 'flex';
    document.getElementById('vistaDetalleCola').style.display = 'none';
}

function mostrarVistaDetalleCola() {
    document.getElementById('vistaListaColas').style.display = 'none';
    document.getElementById('vistaDetalleCola').style.display = 'flex';
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

function mostrarMensajeDetalle(mensaje, esExito) {
    const statusDiv = document.getElementById('statusMessageDetalle');
    statusDiv.textContent = mensaje;
    statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
    statusDiv.style.display = 'block';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Manejar tecla Enter en modales
document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        if (document.getElementById('cargarColasModal').style.display === 'flex') {
            cargarArchivo();
        }
    }
    if (event.key === 'Escape') {
        if (document.getElementById('cargarColasModal').style.display === 'flex') {
            cerrarCargarColasModal();
        }
    }
});