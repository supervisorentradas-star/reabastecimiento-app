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
let fechaArchivoActual = null;
let colasData = {};
let reposicionesData = {};
let colaActual = '';
let depositosCola = [];
let depositoActual = null;
let depositoActualIndex = -1;
let escaneosTemporales = {};
let contadorEscaneosActual = 0;
let depositoEscaneadoCorrectamente = false;
let escaneosPorDeposito = {}; // Para trackear escaneos por depósito específico

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
        const datos = JSON.parse(cache);
        const fechaActual = obtenerFechaActual();
        
        // Verificar si hay datos y obtener la fecha del archivo
        if (datos.length > 0) {
            fechaArchivoActual = datos[0].FECHA;
            
            // Validar fecha del archivo vs fecha del sistema
            if (fechaArchivoActual !== fechaActual) {
                mostrarModalArchivoDesfasado();
                return;
            }
        }
        
        datosDevoluciones = datos;
        console.log('Datos cargados desde cache:', datosDevoluciones);
        
        // Cargar reposiciones y procesar datos
        cargarReposicionesDesdeFirebase();
    } else {
        // Si no hay cache, cargar reposiciones de todas formas
        cargarReposicionesDesdeFirebase();
    }
}

function cargarReposicionesDesdeFirebase() {
    mostrarLoading(true);
    const ref = database.ref('reposicion_devol');
    
    ref.once('value').then(snapshot => {
        const data = snapshot.val();
        reposicionesData = data || {};
        console.log('Reposiciones cargadas desde Firebase:', reposicionesData);
        
        // Procesar datos después de cargar ambos
        procesarDatosColas();
        mostrarLoading(false);
    }).catch(error => {
        console.error('Error cargando reposiciones:', error);
        mostrarMensaje('Error cargando datos de reposición', false);
        mostrarLoading(false);
    });
}

function procesarDatosColas() {
    colasData = {};
    let totalUnidadesPlanificadas = 0;
    let totalUnidadesRepuestas = 0;

    // Primero, procesar datos de DEVOLUCIONES para obtener las colas planificadas
    if (datosDevoluciones && datosDevoluciones.length > 0) {
        datosDevoluciones.forEach(item => {
            const cola = item.cola_reposicion;
            const deposito = item.deposito_destino;
            const upc = item['CODIGO UPC'];
            const cantidad = parseInt(item.CANTIDAD) || 0;
            
            if (!colasData[cola]) {
                colasData[cola] = {
                    totalPlanificado: 0,
                    totalRepuesto: 0,
                    depositos: {}
                };
            }
            
            // Crear clave única para el depósito
            const keyDeposito = `${deposito}_${upc}`;
            
            if (!colasData[cola].depositos[keyDeposito]) {
                colasData[cola].depositos[keyDeposito] = {
                    deposito: deposito,
                    upc: upc,
                    articulo: item.ARTICULO,
                    cantidadPlanificada: 0,
                    cantidadRepuesta: 0
                };
            }
            
            // Sumar cantidad planificada
            colasData[cola].depositos[keyDeposito].cantidadPlanificada += cantidad;
            colasData[cola].totalPlanificado += cantidad;
            totalUnidadesPlanificadas += cantidad;
        });
    }

    // Luego, procesar datos de reposicion_devol para sumar lo ya repuesto
    if (reposicionesData && Object.keys(reposicionesData).length > 0) {
        Object.keys(reposicionesData).forEach(key => {
            const item = reposicionesData[key];
            const cola = item.cola;
            const deposito = item.deposito;
            const upc = item.upc;
            const cantidad = parseInt(item.cantidad) || 1; // Por defecto 1
            
            if (colasData[cola]) {
                const keyDeposito = `${deposito}_${upc}`;
                
                if (colasData[cola].depositos[keyDeposito]) {
                    // Verificar que no exceda la cantidad planificada
                    const nuevoTotal = colasData[cola].depositos[keyDeposito].cantidadRepuesta + cantidad;
                    const maxPermitido = colasData[cola].depositos[keyDeposito].cantidadPlanificada;
                    
                    if (nuevoTotal <= maxPermitido) {
                        colasData[cola].depositos[keyDeposito].cantidadRepuesta = nuevoTotal;
                        colasData[cola].totalRepuesto += cantidad;
                        totalUnidadesRepuestas += cantidad;
                    } else {
                        // Ajustar al máximo permitido
                        const ajuste = maxPermitido - colasData[cola].depositos[keyDeposito].cantidadRepuesta;
                        if (ajuste > 0) {
                            colasData[cola].depositos[keyDeposito].cantidadRepuesta = maxPermitido;
                            colasData[cola].totalRepuesto += ajuste;
                            totalUnidadesRepuestas += ajuste;
                        }
                    }
                }
            }
        });
    }

    // Validar que totalRepuesto no exceda totalPlanificado
    Object.keys(colasData).forEach(cola => {
        if (colasData[cola].totalRepuesto > colasData[cola].totalPlanificado) {
            colasData[cola].totalRepuesto = colasData[cola].totalPlanificado;
        }
    });

    // Actualizar el total de unidades
    document.getElementById('totalUnidades').textContent = `Unidades: ${totalUnidadesPlanificadas}`;
    actualizarVistaColas();
}

function actualizarVistaColas() {
    const grid = document.getElementById('colasGrid');
    grid.innerHTML = '';

    if (Object.keys(colasData).length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #666;">No hay colas cargadas</div>';
        return;
    }

    // Ordenar colas alfabéticamente
    const colasOrdenadas = Object.keys(colasData).sort();
    
    colasOrdenadas.forEach(cola => {
        const button = document.createElement('button');
        button.className = 'cola-button';
        
        const data = colasData[cola];
        const porcentaje = data.totalPlanificado > 0 ? (data.totalRepuesto / data.totalPlanificado) * 100 : 0;
        
        // Marcar como completo si se ha repuesto el 100% o más
        if (porcentaje >= 100) {
            button.classList.add('completo');
        }
        
        button.textContent = `${cola} ${data.totalRepuesto}/${data.totalPlanificado}`;
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
    contadorEscaneosActual = 0;
    depositoEscaneadoCorrectamente = false;
    escaneosPorDeposito = {};
    
    localStorage.setItem('colaSeleccionada', cola);
    inicializarDetalleCola();
    mostrarVistaDetalleCola();
}

function cargarColasModal() {
    document.getElementById('cargarColasModal').style.display = 'flex';
    document.getElementById('passwordCargar').focus();
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

function mostrarModalArchivoDesfasado() {
    document.getElementById('archivoDesfasadoModal').style.display = 'flex';
}

function cerrarArchivoDesfasadoModal() {
    document.getElementById('archivoDesfasadoModal').style.display = 'none';
    // Limpiar cache y recargar
    localStorage.removeItem('cacheDevoluciones');
    datosDevoluciones = [];
    fechaArchivoActual = null;
    colasData = {};
    actualizarVistaColas();
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
            fechaArchivoActual = fechaArchivo;
            // Subir a Firebase en el nodo DEVOLUCIONES
            subirDatosAFirebase(data);
        }
    };

    reader.readAsText(file);
}

function subirDatosAFirebase(data) {
    mostrarLoading(true);
    const ref = database.ref('DEVOLUCIONES');
    
    // Obtener datos existentes primero para comparar
    ref.once('value').then(snapshot => {
        const dataExistente = snapshot.val();
        const fechaActual = obtenerFechaActual();
        
        // Verificar si ya hay datos para la fecha actual
        if (dataExistente) {
            const primerKey = Object.keys(dataExistente)[0];
            if (dataExistente[primerKey].FECHA === fechaActual) {
                if (!confirm('Ya existen datos para la fecha actual. ¿Deseas reemplazarlos?')) {
                    mostrarLoading(false);
                    return;
                }
            }
        }
        
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
                
                // Recargar reposiciones y procesar datos
                cargarReposicionesDesdeFirebase();
            }).catch(error => {
                mostrarMensaje('Error al cargar el archivo: ' + error.message, false);
                mostrarLoading(false);
            });
        });
    }).catch(error => {
        mostrarMensaje('Error al verificar datos existentes: ' + error.message, false);
        mostrarLoading(false);
    });
}

function actualizarDatos() {
    mostrarLoading(true);
    
    // Descargar los datos de Firebase y actualizar la caché
    const refDevoluciones = database.ref('DEVOLUCIONES');
    const fechaActual = obtenerFechaActual();
    
    refDevoluciones.once('value').then(snapshotDevoluciones => {
        const dataDevoluciones = snapshotDevoluciones.val();
        
        if (dataDevoluciones) {
            const dataArray = Object.keys(dataDevoluciones).map(key => dataDevoluciones[key]);
            
            // Validar fecha del archivo
            if (dataArray.length > 0) {
                const fechaArchivo = dataArray[0].FECHA;
                if (fechaArchivo !== fechaActual) {
                    mostrarModalArchivoDesfasado();
                    mostrarLoading(false);
                    return;
                }
                fechaArchivoActual = fechaArchivo;
            }
            
            datosDevoluciones = dataArray;
            localStorage.setItem('cacheDevoluciones', JSON.stringify(dataArray));
        } else {
            datosDevoluciones = [];
            localStorage.removeItem('cacheDevoluciones');
        }
        
        // Cargar reposiciones actualizadas
        cargarReposicionesDesdeFirebase();
    }).catch(error => {
        mostrarMensaje('Error al actualizar: ' + error.message, false);
        mostrarLoading(false);
    });
}

function volverInterfazPrincipal() {
    window.location.href = 'index.html';
}

// =============================================
// FUNCIONES PARA LA VISTA DE DETALLE DE COLA
// =============================================

function inicializarDetalleCola() {
    if (!colaActual || !colasData[colaActual]) {
        mostrarMensajeDetalle('No se ha seleccionado una cola válida', false);
        setTimeout(() => mostrarVistaListaColas(), 2000);
        return;
    }
    
    document.getElementById('currentColaDisplay').textContent = colaActual;
    
    prepararDepositosParaCola();
    inicializarInterfazDetalle();
    
    // Establecer el primer depósito no completado como actual
    if (depositosCola.length > 0) {
        let primerIndexNoCompletado = -1;
        for (let i = 0; i < depositosCola.length; i++) {
            if (depositosCola[i].cantidadRepuesta < depositosCola[i].cantidadPlanificada) {
                primerIndexNoCompletado = i;
                break;
            }
        }
        
        if (primerIndexNoCompletado !== -1) {
            establecerDepositoActual(primerIndexNoCompletado);
        } else {
            // Todos los depósitos están completos, mostrar el primero
            establecerDepositoActual(0);
        }
    }
}

function prepararDepositosParaCola() {
    depositosCola = [];
    
    if (!colasData[colaActual] || !colasData[colaActual].depositos) {
        console.error('No hay datos para la cola:', colaActual);
        return;
    }
    
    // Convertir el objeto de depósitos a array
    Object.keys(colasData[colaActual].depositos).forEach(key => {
        const depositoData = colasData[colaActual].depositos[key];
        depositosCola.push({
            deposito: depositoData.deposito,
            articulo: depositoData.articulo,
            upc: depositoData.upc,
            cantidadPlanificada: depositoData.cantidadPlanificada,
            cantidadRepuesta: depositoData.cantidadRepuesta
        });
    });
    
    // Ordenar por depósito
    depositosCola.sort((a, b) => a.deposito.localeCompare(b.deposito));
    
    console.log('Depósitos preparados para cola', colaActual, ':', depositosCola);
}

function inicializarInterfazDetalle() {
    actualizarListaDepositos();
    
    // Configurar eventos de escaneo
    const depositoInput = document.getElementById('depositoInput');
    const upcInput = document.getElementById('upcInput');
    
    depositoInput.addEventListener('input', function(e) {
        const deposito = this.value.trim();
        if (deposito.length >= 5) {
            validarDeposito(deposito);
        }
    });
    
    upcInput.addEventListener('input', function(e) {
        const upc = this.value.trim();
        if (upc.length >= 10) {
            setTimeout(() => {
                procesarEscaneoUPC(upc);
                this.value = '';
            }, 100);
        }
    });
    
    // Enfocar el campo de depósito
    setTimeout(() => {
        depositoInput.focus();
        depositoInput.select();
    }, 100);
}

function establecerDepositoActual(index) {
    if (index < 0 || index >= depositosCola.length) return;
    
    depositoActual = depositosCola[index];
    depositoActualIndex = index;
    contadorEscaneosActual = 0;
    depositoEscaneadoCorrectamente = false;
    
    console.log('Depósito establecido como actual:', depositoActual);
    
    // Actualizar interfaz con los datos del depósito
    document.getElementById('currentDepositoDisplay').textContent = depositoActual.deposito;
    document.getElementById('currentArticuloDisplay').textContent = depositoActual.articulo;
    document.getElementById('cantidadTotal').textContent = depositoActual.cantidadPlanificada;
    document.getElementById('cantidadLeida').textContent = depositoActual.cantidadRepuesta;
    document.getElementById('cantidadPendiente').textContent = depositoActual.cantidadPlanificada - depositoActual.cantidadRepuesta;
    
    // Resetear campos de entrada
    const depositoInput = document.getElementById('depositoInput');
    const upcInput = document.getElementById('upcInput');
    
    depositoInput.value = '';
    depositoInput.className = 'scan-input cursor-blink';
    depositoInput.disabled = false;
    upcInput.value = '';
    upcInput.disabled = true;
    upcInput.className = 'scan-input';
    
    // Enfocar campo de depósito y parpadear cursor
    setTimeout(() => {
        depositoInput.focus();
        depositoInput.select();
    }, 50);
    
    // Actualizar información del siguiente depósito
    actualizarInfoSiguienteDeposito();
    
    // Inicializar contador de escaneos temporales para este depósito
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    if (!escaneosTemporales[key]) {
        escaneosTemporales[key] = 0;
    }
    
    // Actualizar lista para mostrar depósito activo
    actualizarListaDepositos();
    
    mostrarMensajeDetalle(`Listo para escanear depósito: ${depositoActual.deposito}`, true);
}

function actualizarInfoSiguienteDeposito() {
    // Buscar siguiente depósito no completado
    for (let i = depositoActualIndex + 1; i < depositosCola.length; i++) {
        if (depositosCola[i].cantidadRepuesta < depositosCola[i].cantidadPlanificada) {
            const nextDeposito = depositosCola[i];
            document.getElementById('nextDepositoInfo').textContent = 
                `Siguiente: ${nextDeposito.deposito} - ${nextDeposito.articulo} (${nextDeposito.cantidadPlanificada})`;
            return;
        }
    }
    
    document.getElementById('nextDepositoInfo').textContent = 'Último depósito de la cola';
}

function validarDeposito(deposito) {
    console.log('Validando depósito escaneado:', deposito);
    console.log('Depósito esperado:', depositoActual.deposito);
    
    // Verificar que el depósito escaneado coincide con el depósito actual esperado
    if (deposito === depositoActual.deposito) {
        // Depósito correcto
        depositoEscaneadoCorrectamente = true;
        const depositoInput = document.getElementById('depositoInput');
        const upcInput = document.getElementById('upcInput');
        
        // Cambiar estilo del input de depósito a naranja
        depositoInput.className = 'scan-input deposito-escaneado';
        depositoInput.disabled = true;
        
        // Habilitar y enfocar campo UPC con cursor parpadeante
        upcInput.disabled = false;
        upcInput.className = 'scan-input cursor-blink';
        
        setTimeout(() => {
            upcInput.focus();
            upcInput.select();
        }, 50);
        
        mostrarMensajeDetalle(`Depósito ${deposito} escaneado correctamente`, true);
        
        // Limpiar el campo después de un breve momento
        setTimeout(() => {
            depositoInput.value = '';
        }, 300);
    } else {
        // Depósito incorrecto
        mostrarMensajeDetalle(`ERROR: Depósito incorrecto. Se esperaba: ${depositoActual.deposito}`, false);
        const depositoInput = document.getElementById('depositoInput');
        depositoInput.value = '';
        
        setTimeout(() => {
            depositoInput.focus();
            depositoInput.select();
        }, 50);
    }
}

function procesarEscaneoUPC(upc) {
    if (!depositoActual) {
        mostrarMensajeDetalle('Primero escanea un depósito válido', false);
        return;
    }
    
    if (!depositoEscaneadoCorrectamente) {
        mostrarMensajeDetalle('Primero debes escanear el depósito correctamente', false);
        return;
    }
    
    console.log('Procesando UPC:', upc);
    console.log('UPC esperado:', depositoActual.upc);
    
    // Validar que el UPC corresponde al depósito actual
    if (depositoActual.upc !== upc) {
        mostrarMensajeDetalle('Código UPC no válido para este depósito', false);
        const upcInput = document.getElementById('upcInput');
        upcInput.value = '';
        
        setTimeout(() => {
            upcInput.focus();
            upcInput.select();
        }, 50);
        return;
    }
    
    // Verificar que no se exceda la cantidad planificada
    const totalEscaneado = depositoActual.cantidadRepuesta + contadorEscaneosActual + 1;
    
    if (totalEscaneado > depositoActual.cantidadPlanificada) {
        mostrarMensajeDetalle(`¡Cantidad excedida! Máximo: ${depositoActual.cantidadPlanificada}`, false);
        const upcInput = document.getElementById('upcInput');
        upcInput.value = '';
        
        setTimeout(() => {
            upcInput.focus();
            upcInput.select();
        }, 50);
        return;
    }
    
    // Incrementar contador de escaneos temporales
    contadorEscaneosActual++;
    
    // Actualizar cache temporal
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    if (!escaneosPorDeposito[key]) {
        escaneosPorDeposito[key] = 0;
    }
    escaneosPorDeposito[key]++;
    
    // Actualizar interfaz - mostrar progreso actual
    const escaneadoTemporal = depositoActual.cantidadRepuesta + contadorEscaneosActual;
    const pendienteTemporal = depositoActual.cantidadPlanificada - escaneadoTemporal;
    
    document.getElementById('cantidadLeida').textContent = escaneadoTemporal;
    document.getElementById('cantidadPendiente').textContent = pendienteTemporal;
    
    mostrarMensajeDetalle(`Escaneo ${contadorEscaneosActual} de ${depositoActual.cantidadPlanificada}`, true);
    
    // Verificar si se completó la cantidad requerida
    if (escaneadoTemporal >= depositoActual.cantidadPlanificada) {
        mostrarMensajeDetalle('¡Cantidad completada! Guardando...', true);
        // Guardar todos los escaneos acumulados
        guardarEscaneosAcumulados().then(() => {
            // Actualizar datos locales
            depositoActual.cantidadRepuesta += contadorEscaneosActual;
            contadorEscaneosActual = 0;
            
            // Actualizar colasData para reflejar el cambio
            const keyDeposito = `${depositoActual.deposito}_${depositoActual.upc}`;
            if (colasData[colaActual] && colasData[colaActual].depositos[keyDeposito]) {
                colasData[colaActual].depositos[keyDeposito].cantidadRepuesta = depositoActual.cantidadRepuesta;
                colasData[colaActual].totalRepuesto += depositoActual.cantidadRepuesta;
            }
            
            actualizarListaDepositos();
            
            // Pasar al siguiente depósito automáticamente después de un breve delay
            setTimeout(() => {
                siguienteDeposito();
            }, 500);
        }).catch(error => {
            mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
        });
    } else {
        // Continuar escaneando UPCs
        const upcInput = document.getElementById('upcInput');
        upcInput.value = '';
        
        setTimeout(() => {
            upcInput.focus();
            upcInput.select();
        }, 50);
    }
}

function guardarEscaneosAcumulados() {
    if (!depositoActual || contadorEscaneosActual === 0) {
        return Promise.resolve();
    }
    
    const key = `${depositoActual.deposito}_${depositoActual.upc}`;
    const escaneosPendientes = contadorEscaneosActual;
    
    const ref = database.ref('reposicion_devol');
    const now = new Date();
    const fecha = now.toLocaleDateString('es-ES');
    const hora = now.toLocaleTimeString('es-ES', { hour12: false });
    
    // Guardar cada escaneo individualmente (uno por unidad)
    const promises = [];
    
    for (let i = 0; i < escaneosPendientes; i++) {
        const newRef = ref.push();
        const promise = newRef.set({
            usuario: usuarioActual,
            cola: colaActual,
            deposito: depositoActual.deposito,
            descripcion: depositoActual.articulo,
            upc: depositoActual.upc,
            cantidad: 1, // Siempre 1 por registro de unidad
            fecha: fecha,
            hora: hora,
            timestamp: now.getTime()
        });
        promises.push(promise);
    }
    
    // Limpiar contador temporal
    contadorEscaneosActual = 0;
    escaneosTemporales[key] = 0;
    
    return Promise.all(promises);
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
        
        if (deposito.cantidadRepuesta >= deposito.cantidadPlanificada) {
            item.classList.add('deposito-completo');
        }
        
        // Marcar como activo si es el depósito actual
        if (depositoActual && deposito.deposito === depositoActual.deposito && deposito.upc === depositoActual.upc) {
            item.classList.add('deposito-activo');
        }
        
        const estado = `${deposito.cantidadRepuesta}/${deposito.cantidadPlanificada}`;
            
        item.innerHTML = `
            <div>${deposito.deposito}</div>
            <div>${deposito.cantidadPlanificada}</div>
            <div>${estado}</div>
        `;
        
        // Hacer clicable para seleccionar depósito
        item.addEventListener('click', () => seleccionarDeposito(index));
        
        lista.appendChild(item);
    });
}

function seleccionarDeposito(index) {
    // Guardar escaneos actuales antes de cambiar
    guardarEscaneosAcumulados().then(() => {
        establecerDepositoActual(index);
        mostrarMensajeDetalle(`Depósito ${depositosCola[index].deposito} seleccionado`, true);
    }).catch(error => {
        mostrarMensajeDetalle('Error al guardar cambios: ' + error.message, false);
    });
}

function siguienteDeposito() {
    // Guardar escaneos acumulados antes de cambiar
    guardarEscaneosAcumulados().then(() => {
        // Buscar siguiente depósito no completado
        let siguienteIndex = -1;
        const startIndex = depositoActual ? depositoActualIndex + 1 : 0;
        
        for (let i = startIndex; i < depositosCola.length; i++) {
            if (depositosCola[i].cantidadRepuesta < depositosCola[i].cantidadPlanificada) {
                siguienteIndex = i;
                break;
            }
        }
        
        if (siguienteIndex !== -1) {
            establecerDepositoActual(siguienteIndex);
            mostrarMensajeDetalle(`Siguiente depósito: ${depositosCola[siguienteIndex].deposito}`, true);
        } else {
            mostrarMensajeDetalle('¡Todos los depósitos completados!', true);
            mostrarPantallaExito();
            
            // Resetear campos
            document.getElementById('currentDepositoDisplay').textContent = '----';
            document.getElementById('currentArticuloDisplay').textContent = '----';
            document.getElementById('cantidadTotal').textContent = '0';
            document.getElementById('cantidadLeida').textContent = '0';
            document.getElementById('cantidadPendiente').textContent = '0';
            document.getElementById('nextDepositoInfo').textContent = '¡Cola completada!';
            
            depositoActual = null;
            depositoActualIndex = -1;
            depositoEscaneadoCorrectamente = false;
            
            // Actualizar lista
            actualizarListaDepositos();
            
            // Actualizar la vista de colas principal después de un delay
            setTimeout(() => {
                procesarDatosColas();
            }, 1000);
        }
    }).catch(error => {
        mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
    });
}

function mostrarPantallaExito() {
    const successScreen = document.getElementById('successScreen');
    successScreen.style.display = 'flex';
    
    setTimeout(() => {
        successScreen.style.display = 'none';
    }, 1000); // Reducido a 1 segundo
}

function volverAColas() {
    // Guardar cualquier cambio pendiente
    guardarEscaneosAcumulados().then(() => {
        // Limpiar completamente el estado
        colaActual = '';
        depositosCola = [];
        depositoActual = null;
        depositoActualIndex = -1;
        escaneosTemporales = {};
        contadorEscaneosActual = 0;
        depositoEscaneadoCorrectamente = false;
        escaneosPorDeposito = {};
        
        localStorage.removeItem('colaSeleccionada');
        mostrarVistaListaColas();
        
        // Actualizar la vista de colas
        procesarDatosColas();
    }).catch(error => {
        mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
    });
}

function guardarFinalizar() {
    guardarEscaneosAcumulados().then(() => {
        mostrarMensajeDetalle('Todos los datos guardados correctamente', true);
        mostrarPantallaExito();
        
        // Actualizar datos globales
        procesarDatosColas();
        
        setTimeout(() => {
            volverAColas();
        }, 1500);
    }).catch(error => {
        mostrarMensajeDetalle('Error al guardar: ' + error.message, false);
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

function mostrarLoading(mostrar) {
    document.getElementById('loadingOverlay').style.display = mostrar ? 'flex' : 'none';
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
        if (document.getElementById('archivoDesfasadoModal').style.display === 'flex') {
            cerrarArchivoDesfasadoModal();
        }
    }
});

// Sincronizar en tiempo real los cambios en reposicion_devol
function iniciarSincronizacionTiempoReal() {
    const ref = database.ref('reposicion_devol');
    ref.on('value', function(snapshot) {
        const data = snapshot.val();
        reposicionesData = data || {};
        console.log('Reposiciones sincronizadas en tiempo real:', reposicionesData);
        
        // Solo actualizar si estamos en la vista de lista
        if (document.getElementById('vistaListaColas').style.display !== 'none') {
            procesarDatosColas();
        }
    });
}

// Iniciar sincronización en tiempo real cuando se carga la página
setTimeout(() => {
    iniciarSincronizacionTiempoReal();
}, 2000);