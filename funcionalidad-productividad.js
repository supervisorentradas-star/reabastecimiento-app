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
let datosRecoleccion = [];
let datosReposicion = [];
let datosDevoluciones = [];
let todosDatosCargados = false;

// ================= OBJETIVOS DE PRODUCTIVIDAD =================
const OBJETIVOS = {
    'A+B': { recoleccion: 90 },
    'F': { recoleccion: 90 },
    'CDE': { recoleccion: 120 },
    'P': { reposicion: 140, devoluciones: 140 }
};

// ================= FUNCIÓN PARA NORMALIZAR NOMBRES =================
function normalizarNombre(nombre) {
    if (!nombre) return '';
    let nombreNormalizado = nombre.trim().toLowerCase();
    nombreNormalizado = nombreNormalizado.charAt(0).toUpperCase() + nombreNormalizado.slice(1);
    
    const normalizaciones = {
        'Edison': 'Edison',
        'Edilson': 'Edilson',
        'Efrain': 'Efrain',
        'Joffer': 'Joffer',
        'Holger': 'Holger',
        'Oscar': 'Oscar',
        'Zulema': 'Zulema',
        'Luis': 'Luis',
        'Patrick': 'Patrick',
        'James': 'James',
        'Rocio': 'Rocio',
        'Mishel': 'Mishel',
        'Meyli': 'Meyli'
    };
    
    if (normalizaciones[nombreNormalizado]) {
        return normalizaciones[nombreNormalizado];
    }
    
    return nombreNormalizado;
}

// ================= INICIALIZACIÓN =================
window.addEventListener('load', function() {
    inicializarFirebase();
    configurarEventListeners();
    actualizarDatosFirebase();
});

// ================= CONFIGURACIÓN DE EVENTOS =================
function configurarEventListeners() {
    // Eventos para pestañas
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            this.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
            
            if (tabId === 'evolucion' && todosDatosCargados) {
                cargarListaOperariosEvolucion();
            }
        });
    });
    
    const hoy = new Date();
    const hoyFormateado = hoy.toISOString().split('T')[0];
    document.getElementById('fechaDiaria').value = hoyFormateado;
    
    const mesActual = String(hoy.getMonth() + 1).padStart(2, '0');
    const anioActual = hoy.getFullYear();
    document.getElementById('mesMensual').value = mesActual;
    document.getElementById('anioMensual').value = anioActual;
}

// ================= FIREBASE INTEGRATION =================
function inicializarFirebase() {
    try {
        verificarConexionFirebase();
    } catch (error) {
        console.error('Error inicializando Firebase:', error);
        document.getElementById('estadoConexion').innerHTML = 'Error Firebase';
        document.getElementById('connectionIndicator').className = 'connection-indicator disconnected';
        mostrarMensaje('❌ Error al conectar con Firebase', false);
    }
}

function verificarConexionFirebase() {
    const connectedRef = database.ref(".info/connected");
    connectedRef.on("value", function(snap) {
        if (snap.val() === true) {
            document.getElementById('estadoConexion').innerHTML = 'Conectado';
            document.getElementById('connectionIndicator').className = 'connection-indicator connected';
        } else {
            document.getElementById('estadoConexion').innerHTML = 'Desconectado';
            document.getElementById('connectionIndicator').className = 'connection-indicator disconnected';
        }
    });
}

// ================= ACTUALIZAR DATOS DE FIREBASE =================
async function actualizarDatosFirebase() {
    try {
        mostrarMensaje('📥 Descargando datos de Firebase...', true);
        
        datosRecoleccion = [];
        datosReposicion = [];
        datosDevoluciones = [];
        todosDatosCargados = false;
        
        await Promise.all([
            cargarDatosRecoleccion(),
            cargarDatosReposicion(),
            cargarDatosDevoluciones()
        ]);
        
        todosDatosCargados = true;
        
        const tabActivo = document.querySelector('.tab-button.active').getAttribute('data-tab');
        
        if (tabActivo === 'mensual') {
            cargarDatosProductividad();
        } else if (tabActivo === 'diaria') {
            cargarProductividadDiaria();
        } else if (tabActivo === 'evolucion') {
            cargarListaOperariosEvolucion();
        }
        
        mostrarMensaje('✅ Datos actualizados correctamente', true);
        
    } catch (error) {
        console.error('Error actualizando datos:', error);
        mostrarMensaje('❌ Error al actualizar datos', false);
    }
}

async function cargarDatosRecoleccion() {
    return new Promise((resolve, reject) => {
        database.ref('recolecciones').once('value')
            .then(snapshot => {
                const datos = snapshot.val();
                if (datos) {
                    datosRecoleccion = Object.entries(datos).map(([key, registro]) => ({
                        id: key,
                        ...registro,
                        usuario: normalizarNombre(registro.usuario),
                        fecha: registro.fechaSistema || registro.fecha || '',
                        hora: registro.hora || '00:00'
                    }));
                    console.log(`Recolección cargada: ${datosRecoleccion.length} registros`);
                } else {
                    datosRecoleccion = [];
                }
                resolve(datosRecoleccion);
            })
            .catch(error => {
                console.error('Error cargando recolección:', error);
                datosRecoleccion = [];
                reject(error);
            });
    });
}

async function cargarDatosReposicion() {
    return new Promise((resolve, reject) => {
        database.ref('reposiciones').once('value')
            .then(snapshot => {
                const datos = snapshot.val();
                if (datos) {
                    datosReposicion = Object.entries(datos).map(([key, registro]) => ({
                        id: key,
                        ...registro,
                        usuario: normalizarNombre(registro.usuario),
                        fecha: registro.fecha || '',
                        hora: registro.hora || '00:00'
                    }));
                    console.log(`Reposición cargada: ${datosReposicion.length} registros`);
                } else {
                    datosReposicion = [];
                }
                resolve(datosReposicion);
            })
            .catch(error => {
                console.error('Error cargando reposición:', error);
                datosReposicion = [];
                reject(error);
            });
    });
}

async function cargarDatosDevoluciones() {
    return new Promise((resolve, reject) => {
        database.ref('reposicion_devol').once('value')
            .then(snapshot => {
                const datos = snapshot.val();
                if (datos) {
                    datosDevoluciones = Object.entries(datos).map(([key, registro]) => ({
                        id: key,
                        ...registro,
                        usuario: normalizarNombre(registro.usuario),
                        fecha: registro.fecha || '',
                        hora: registro.hora || '00:00'
                    }));
                    console.log(`Devoluciones cargadas: ${datosDevoluciones.length} registros`);
                } else {
                    datosDevoluciones = [];
                }
                resolve(datosDevoluciones);
            })
            .catch(error => {
                console.error('Error cargando devoluciones:', error);
                datosDevoluciones = [];
                reject(error);
            });
    });
}

// ================= CARGAR DATOS DE PRODUCTIVIDAD MENSUAL =================
async function cargarDatosProductividad() {
    try {
        if (!todosDatosCargados) {
            await actualizarDatosFirebase();
            return;
        }
        
        const mes = document.getElementById('mesMensual').value;
        const anio = parseInt(document.getElementById('anioMensual').value);
        
        mostrarMensaje(`📊 Procesando datos de ${mes}/${anio}...`, true);
        
        const datosRecoleccionFiltrados = filtrarDatosPorMes(datosRecoleccion, mes, anio);
        const datosReposicionFiltrados = filtrarDatosPorMes(datosReposicion, mes, anio);
        const datosDevolucionesFiltrados = filtrarDatosPorMes(datosDevoluciones, mes, anio);
        
        console.log(`Datos filtrados: Recolección=${datosRecoleccionFiltrados.length}, Reposición=${datosReposicionFiltrados.length}, Devoluciones=${datosDevolucionesFiltrados.length}`);
        
        procesarDatosProductividad(datosRecoleccionFiltrados, datosReposicionFiltrados, datosDevolucionesFiltrados);
        
        mostrarMensaje(`✅ Datos de ${mes}/${anio} procesados`, true);
        
    } catch (error) {
        console.error('Error cargando datos de productividad:', error);
        mostrarMensaje('❌ Error al procesar datos', false);
    }
}

function filtrarDatosPorMes(datos, mes, anio) {
    return datos.filter(registro => {
        const fechaRegistro = registro.fecha;
        if (!fechaRegistro) return false;
        
        const fechaFormateada = formatDateToDDMMYYYY(fechaRegistro);
        if (!fechaFormateada) return false;
        
        const partes = fechaFormateada.split('/');
        if (partes.length !== 3) return false;
        
        const mesRegistro = partes[1];
        const anioRegistro = parseInt(partes[2]);
        
        return mesRegistro === mes && anioRegistro === anio;
    });
}

// ================= PROCESAR DATOS DE PRODUCTIVIDAD MENSUAL =================
function procesarDatosProductividad(datosRecoleccionFiltrados, datosReposicionFiltrados, datosDevolucionesFiltrados) {
    const estadisticasRecoleccion = calcularEstadisticasRecoleccionMensual(datosRecoleccionFiltrados);
    mostrarEstadisticasRecoleccion(estadisticasRecoleccion);
    
    const estadisticasReposicion = calcularEstadisticasReposicionMensual(datosReposicionFiltrados);
    mostrarEstadisticasReposicion(estadisticasReposicion);
    
    const estadisticasDevoluciones = calcularEstadisticasDevolucionesMensual(datosDevolucionesFiltrados);
    mostrarEstadisticasDevoluciones(estadisticasDevoluciones);
    
    actualizarEstadisticasGenerales(estadisticasRecoleccion, estadisticasReposicion, estadisticasDevoluciones);
}

// ================= NUEVA FUNCIÓN PARA CALCULAR HORAS TRABAJADAS =================
function calcularHorasTrabajadas(registros) {
    // Agrupar registros por día
    const registrosPorDia = {};
    
    registros.forEach(registro => {
        const fecha = registro.fecha;
        if (!fecha) return;
        
        if (!registrosPorDia[fecha]) {
            registrosPorDia[fecha] = new Set();
        }
        
        // Extraer hora del registro (asumimos que cada registro es una hora de trabajo)
        const hora = registro.hora ? registro.hora.split(':')[0] : '00';
        registrosPorDia[fecha].add(hora);
    });
    
    // Calcular total de horas (suma de horas únicas por día)
    let totalHoras = 0;
    Object.values(registrosPorDia).forEach(horasDia => {
        totalHoras += horasDia.size;
    });
    
    return totalHoras;
}

function calcularEstadisticasRecoleccionMensual(datos) {
    const operarios = {};
    
    datos.forEach(registro => {
        if (registro.usuario) {
            const usuario = registro.usuario;
            const unidades = parseInt(registro.cantidad_recolectada) || 0;
            const cola = registro.cola || 'N/A';
            
            if (!operarios[usuario]) {
                operarios[usuario] = {
                    usuario: usuario,
                    totalUnidades: 0,
                    colas: new Set(),
                    registros: []
                };
            }
            
            operarios[usuario].totalUnidades += unidades;
            operarios[usuario].colas.add(cola);
            operarios[usuario].registros.push(registro);
        }
    });
    
    return Object.values(operarios).map(op => {
        const horasValidas = calcularHorasTrabajadas(op.registros);
        const productividad = horasValidas > 0 ? Math.round(op.totalUnidades / horasValidas) : 0;
        const colas = Array.from(op.colas).join(', ');
        
        let objetivo = 0;
        const colasArray = Array.from(op.colas);
        for (const cola of colasArray) {
            if (OBJETIVOS[cola] && OBJETIVOS[cola].recoleccion) {
                if (OBJETIVOS[cola].recoleccion > objetivo) {
                    objetivo = OBJETIVOS[cola].recoleccion;
                }
            }
        }
        
        if (objetivo === 0) objetivo = 100;
        
        let porcentajeObjetivo = 0;
        let porcentajeTexto = '';
        let porcentajeClass = '';
        
        if (objetivo > 0 && productividad > 0) {
            const diferencia = productividad - objetivo;
            porcentajeObjetivo = Math.round((diferencia / objetivo) * 100);
            
            if (porcentajeObjetivo > 0) {
                porcentajeTexto = `+${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-positive';
            } else if (porcentajeObjetivo < 0) {
                porcentajeTexto = `${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-negative';
            } else {
                porcentajeTexto = '0%';
                porcentajeClass = 'percent-exact';
            }
        }
        
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeObjetivo);
        
        return {
            ...op,
            horasValidas: horasValidas,
            productividad: productividad,
            colas: colas,
            objetivo: objetivo,
            porcentajeObjetivo: porcentajeObjetivo,
            porcentajeTexto: porcentajeTexto,
            porcentajeClass: porcentajeClass,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass
        };
    }).sort((a, b) => b.productividad - a.productividad);
}

function calcularEstadisticasReposicionMensual(datos) {
    const operarios = {};
    
    datos.forEach(registro => {
        if (registro.usuario) {
            const usuario = registro.usuario;
            const unidades = parseInt(registro.cantidad) || 0;
            
            if (!operarios[usuario]) {
                operarios[usuario] = {
                    usuario: usuario,
                    totalUnidades: 0,
                    registros: []
                };
            }
            
            operarios[usuario].totalUnidades += unidades;
            operarios[usuario].registros.push(registro);
        }
    });
    
    return Object.values(operarios).map(op => {
        const horasValidas = calcularHorasTrabajadas(op.registros);
        const productividad = horasValidas > 0 ? Math.round(op.totalUnidades / horasValidas) : 0;
        
        const objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].reposicion : 140;
        
        let porcentajeObjetivo = 0;
        let porcentajeTexto = '';
        let porcentajeClass = '';
        
        if (objetivo > 0 && productividad > 0) {
            const diferencia = productividad - objetivo;
            porcentajeObjetivo = Math.round((diferencia / objetivo) * 100);
            
            if (porcentajeObjetivo > 0) {
                porcentajeTexto = `+${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-positive';
            } else if (porcentajeObjetivo < 0) {
                porcentajeTexto = `${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-negative';
            } else {
                porcentajeTexto = '0%';
                porcentajeClass = 'percent-exact';
            }
        }
        
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeObjetivo);
        
        return {
            ...op,
            horasValidas: horasValidas,
            productividad: productividad,
            objetivo: objetivo,
            porcentajeObjetivo: porcentajeObjetivo,
            porcentajeTexto: porcentajeTexto,
            porcentajeClass: porcentajeClass,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass
        };
    }).sort((a, b) => b.productividad - a.productividad);
}

function calcularEstadisticasDevolucionesMensual(datos) {
    const operarios = {};
    
    datos.forEach(registro => {
        if (registro.usuario) {
            const usuario = registro.usuario;
            const unidades = parseInt(registro.cantidad) || 0;
            
            if (!operarios[usuario]) {
                operarios[usuario] = {
                    usuario: usuario,
                    totalUnidades: 0,
                    registros: []
                };
            }
            
            operarios[usuario].totalUnidades += unidades;
            operarios[usuario].registros.push(registro);
        }
    });
    
    return Object.values(operarios).map(op => {
        const horasValidas = calcularHorasTrabajadas(op.registros);
        const productividad = horasValidas > 0 ? Math.round(op.totalUnidades / horasValidas) : 0;
        
        const objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].devoluciones : 140;
        
        let porcentajeObjetivo = 0;
        let porcentajeTexto = '';
        let porcentajeClass = '';
        
        if (objetivo > 0 && productividad > 0) {
            const diferencia = productividad - objetivo;
            porcentajeObjetivo = Math.round((diferencia / objetivo) * 100);
            
            if (porcentajeObjetivo > 0) {
                porcentajeTexto = `+${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-positive';
            } else if (porcentajeObjetivo < 0) {
                porcentajeTexto = `${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-negative';
            } else {
                porcentajeTexto = '0%';
                porcentajeClass = 'percent-exact';
            }
        }
        
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeObjetivo);
        
        return {
            ...op,
            horasValidas: horasValidas,
            productividad: productividad,
            objetivo: objetivo,
            porcentajeObjetivo: porcentajeObjetivo,
            porcentajeTexto: porcentajeTexto,
            porcentajeClass: porcentajeClass,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass
        };
    }).sort((a, b) => b.productividad - a.productividad);
}

// ================= FUNCIÓN PARA DETERMINAR RENDIMIENTO =================
function obtenerClaseRendimiento(porcentajeDiferencia) {
    if (porcentajeDiferencia >= 20) {
        return {
            texto: 'Excelente',
            clase: 'performance-excellent',
            progresoClass: 'progress-green-dark'
        };
    } else if (porcentajeDiferencia >= 0) {
        return {
            texto: 'Bueno',
            clase: 'performance-good',
            progresoClass: 'progress-green-light'
        };
    } else if (porcentajeDiferencia >= -10) {
        return {
            texto: 'Regular',
            clase: 'performance-regular',
            progresoClass: 'progress-orange'
        };
    } else {
        return {
            texto: 'Bajo',
            clase: 'performance-poor',
            progresoClass: 'progress-red'
        };
    }
}

// ================= MOSTRAR DATOS EN TABLAS MENSUALES =================
function mostrarEstadisticasRecoleccion(estadisticas) {
    const tbody = document.getElementById('cuerpoTablaRecoleccion');
    tbody.innerHTML = '';
    
    if (estadisticas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:15px;">No hay datos de recolección para este periodo</td></tr>';
    } else {
        estadisticas.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.colas || 'N/A'}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('recoleccionLoading').style.display = 'none';
    document.getElementById('tablaRecoleccion').style.display = 'table';
}

function mostrarEstadisticasReposicion(estadisticas) {
    const tbody = document.getElementById('cuerpoTablaReposicion');
    tbody.innerHTML = '';
    
    if (estadisticas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de reposición para este periodo</td></tr>';
    } else {
        estadisticas.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('reposicionLoading').style.display = 'none';
    document.getElementById('tablaReposicion').style.display = 'table';
}

function mostrarEstadisticasDevoluciones(estadisticas) {
    const tbody = document.getElementById('cuerpoTablaDevoluciones');
    tbody.innerHTML = '';
    
    if (estadisticas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de devoluciones para este periodo</td></tr>';
    } else {
        estadisticas.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('devolucionesLoading').style.display = 'none';
    document.getElementById('tablaDevoluciones').style.display = 'table';
}

function actualizarEstadisticasGenerales(estadisticasRecoleccion, estadisticasReposicion, estadisticasDevoluciones) {
    const operariosUnicos = new Set();
    
    [...estadisticasRecoleccion, ...estadisticasReposicion, ...estadisticasDevoluciones].forEach(op => {
        operariosUnicos.add(op.usuario);
    });
    
    const totalUnidadesRecoleccion = estadisticasRecoleccion.reduce((sum, op) => sum + op.totalUnidades, 0);
    const totalUnidadesReposicion = estadisticasReposicion.reduce((sum, op) => sum + op.totalUnidades, 0);
    const totalUnidadesDevoluciones = estadisticasDevoluciones.reduce((sum, op) => sum + op.totalUnidades, 0);
    const totalUnidades = totalUnidadesRecoleccion + totalUnidadesReposicion + totalUnidadesDevoluciones;
    
    const totalHorasRecoleccion = estadisticasRecoleccion.reduce((sum, op) => sum + op.horasValidas, 0);
    const totalHorasReposicion = estadisticasReposicion.reduce((sum, op) => sum + op.horasValidas, 0);
    const totalHorasDevoluciones = estadisticasDevoluciones.reduce((sum, op) => sum + op.horasValidas, 0);
    const totalHoras = totalHorasRecoleccion + totalHorasReposicion + totalHorasDevoluciones;
    
    const productividadPromedio = totalHoras > 0 ? Math.round(totalUnidades / totalHoras) : 0;
    
    document.getElementById('totalOperarios').textContent = operariosUnicos.size;
    document.getElementById('totalUnidades').textContent = totalUnidades.toLocaleString();
    document.getElementById('totalHoras').textContent = totalHoras;
    document.getElementById('productividadPromedio').textContent = productividadPromedio.toLocaleString();
}

// ================= PRODUCTIVIDAD DIARIA =================
async function cargarProductividadDiaria() {
    try {
        if (!todosDatosCargados) {
            await actualizarDatosFirebase();
            return;
        }
        
        const fechaSeleccionada = document.getElementById('fechaDiaria').value;
        
        if (!fechaSeleccionada) {
            mostrarMensajeDiario('❌ Por favor selecciona una fecha', false);
            return;
        }
        
        mostrarMensajeDiario('📊 Calculando productividad diaria...', true);
        
        const estadisticasDiarias = await calcularProductividadDiaria(fechaSeleccionada);
        
        mostrarProductividadDiaria(estadisticasDiarias);
        
        mostrarMensajeDiario('✅ Productividad diaria calculada', true);
        
    } catch (error) {
        console.error('Error calculando productividad diaria:', error);
        mostrarMensajeDiario('❌ Error al calcular productividad diaria', false);
    }
}

async function calcularProductividadDiaria(fecha) {
    const fechaFormateada = formatDateToDDMMYYYY(fecha);
    
    const recoleccionDelDia = datosRecoleccion.filter(registro => {
        const fechaRegistro = registro.fechaSistema || registro.fecha;
        return formatDateToDDMMYYYY(fechaRegistro) === fechaFormateada;
    });
    
    const reposicionDelDia = datosReposicion.filter(registro => {
        const fechaRegistro = registro.fecha;
        return formatDateToDDMMYYYY(fechaRegistro) === fechaFormateada;
    });
    
    const devolucionesDelDia = datosDevoluciones.filter(registro => {
        const fechaRegistro = registro.fecha;
        return formatDateToDDMMYYYY(fechaRegistro) === fechaFormateada;
    });
    
    const productividadRecoleccion = calcularProductividadPorHoraDiaria(recoleccionDelDia, 'recoleccion');
    const productividadReposicion = calcularProductividadPorHoraDiaria(reposicionDelDia, 'reposicion');
    const productividadDevoluciones = calcularProductividadPorHoraDiaria(devolucionesDelDia, 'devoluciones');
    
    return {
        recoleccion: productividadRecoleccion,
        reposicion: productividadReposicion,
        devoluciones: productividadDevoluciones,
        fecha: fechaFormateada
    };
}

function calcularProductividadPorHoraDiaria(datos, tipo) {
    const operarios = {};
    
    datos.forEach(registro => {
        if (!registro.usuario) return;
        
        const usuario = registro.usuario;
        let unidades = 0;
        
        if (tipo === 'recoleccion') {
            unidades = parseInt(registro.cantidad_recolectada) || 0;
        } else {
            unidades = parseInt(registro.cantidad) || 0;
        }
        
        const cola = registro.cola || 'P';
        
        if (!operarios[usuario]) {
            operarios[usuario] = {
                usuario: usuario,
                totalUnidades: 0,
                colas: new Set(),
                registros: []
            };
        }
        
        operarios[usuario].totalUnidades += unidades;
        operarios[usuario].colas.add(cola);
        operarios[usuario].registros.push(registro);
    });
    
    return Object.values(operarios).map(op => {
        const horasValidas = calcularHorasTrabajadas(op.registros);
        const productividad = horasValidas > 0 ? Math.round(op.totalUnidades / horasValidas) : 0;
        const colas = Array.from(op.colas).join(', ');
        
        let objetivo = 0;
        const colasArray = Array.from(op.colas);
        
        if (tipo === 'recoleccion') {
            for (const cola of colasArray) {
                if (OBJETIVOS[cola] && OBJETIVOS[cola].recoleccion) {
                    if (OBJETIVOS[cola].recoleccion > objetivo) {
                        objetivo = OBJETIVOS[cola].recoleccion;
                    }
                }
            }
        } else if (tipo === 'reposicion') {
            objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].reposicion : 140;
        } else {
            objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].devoluciones : 140;
        }
        
        if (objetivo === 0) objetivo = 100;
        
        let porcentajeObjetivo = 0;
        let porcentajeTexto = '';
        let porcentajeClass = '';
        
        if (objetivo > 0 && productividad > 0) {
            const diferencia = productividad - objetivo;
            porcentajeObjetivo = Math.round((diferencia / objetivo) * 100);
            
            if (porcentajeObjetivo > 0) {
                porcentajeTexto = `+${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-positive';
            } else if (porcentajeObjetivo < 0) {
                porcentajeTexto = `${porcentajeObjetivo}%`;
                porcentajeClass = 'percent-negative';
            } else {
                porcentajeTexto = '0%';
                porcentajeClass = 'percent-exact';
            }
        }
        
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeObjetivo);
        
        return {
            usuario: op.usuario,
            colas: colas,
            productividad: productividad,
            horasValidas: horasValidas,
            totalUnidades: op.totalUnidades,
            objetivo: objetivo,
            porcentajeObjetivo: porcentajeObjetivo,
            porcentajeTexto: porcentajeTexto,
            porcentajeClass: porcentajeClass,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass,
            tipo: tipo
        };
    }).sort((a, b) => b.productividad - a.productividad);
}

// ================= MOSTRAR PRODUCTIVIDAD DIARIA =================
function mostrarProductividadDiaria(estadisticas) {
    actualizarEstadisticasDiarias(estadisticas);
    mostrarTablaRecoleccionDiaria(estadisticas.recoleccion);
    mostrarTablaReposicionDiaria(estadisticas.reposicion);
    mostrarTablaDevolucionesDiaria(estadisticas.devoluciones);
}

function actualizarEstadisticasDiarias(estadisticas) {
    const operariosUnicos = new Set();
    let totalUnidades = 0;
    let totalHorasValidas = 0;
    let productividadTotal = 0;
    let operariosConDatos = 0;
    
    estadisticas.recoleccion.forEach(op => {
        operariosUnicos.add(op.usuario);
        totalUnidades += op.totalUnidades;
        totalHorasValidas += op.horasValidas;
        productividadTotal += op.productividad;
        operariosConDatos++;
    });
    
    estadisticas.reposicion.forEach(op => {
        operariosUnicos.add(op.usuario);
        totalUnidades += op.totalUnidades;
        totalHorasValidas += op.horasValidas;
        productividadTotal += op.productividad;
        operariosConDatos++;
    });
    
    estadisticas.devoluciones.forEach(op => {
        operariosUnicos.add(op.usuario);
        totalUnidades += op.totalUnidades;
        totalHorasValidas += op.horasValidas;
        productividadTotal += op.productividad;
        operariosConDatos++;
    });
    
    const totalOperarios = operariosUnicos.size;
    const productividadPromedio = operariosConDatos > 0 ? 
        Math.round(productividadTotal / operariosConDatos) : 0;
    
    document.getElementById('totalOperariosDia').textContent = totalOperarios;
    document.getElementById('totalUnidadesDia').textContent = totalUnidades.toLocaleString();
    document.getElementById('totalHorasDia').textContent = totalHorasValidas;
    document.getElementById('productividadPromedioDia').textContent = productividadPromedio.toLocaleString();
}

function mostrarTablaRecoleccionDiaria(datos) {
    const tbody = document.getElementById('cuerpoTablaRecoleccionDiaria');
    tbody.innerHTML = '';
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:15px;">No hay datos de recolección para esta fecha</td></tr>';
    } else {
        datos.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.colas}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('recoleccionDiariaLoading').style.display = 'none';
    document.getElementById('tablaRecoleccionDiaria').style.display = 'table';
}

function mostrarTablaReposicionDiaria(datos) {
    const tbody = document.getElementById('cuerpoTablaReposicionDiaria');
    tbody.innerHTML = '';
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de reposición para esta fecha</td></tr>';
    } else {
        datos.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('reposicionDiariaLoading').style.display = 'none';
    document.getElementById('tablaReposicionDiaria').style.display = 'table';
}

function mostrarTablaDevolucionesDiaria(datos) {
    const tbody = document.getElementById('cuerpoTablaDevolucionesDiaria');
    tbody.innerHTML = '';
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de devoluciones para esta fecha</td></tr>';
    } else {
        datos.forEach(op => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${op.horasValidas}</td>
                <td><strong>${op.productividad}</strong></td>
                <td>${op.objetivo}</td>
                <td><span class="${op.porcentajeClass}">${op.porcentajeTexto}</span></td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('devolucionesDiariaLoading').style.display = 'none';
    document.getElementById('tablaDevolucionesDiaria').style.display = 'table';
}

// ================= EVOLUCIÓN DE PRODUCTIVIDAD =================
function cargarListaOperariosEvolucion() {
    const operarios = new Set();
    
    datosRecoleccion.forEach(registro => {
        if (registro.usuario) operarios.add(registro.usuario);
    });
    datosReposicion.forEach(registro => {
        if (registro.usuario) operarios.add(registro.usuario);
    });
    datosDevoluciones.forEach(registro => {
        if (registro.usuario) operarios.add(registro.usuario);
    });
    
    const select = document.getElementById('operarioEvolucion');
    select.innerHTML = '<option value="">-- Seleccione un operario --</option>';
    
    const operariosOrdenados = Array.from(operarios).sort();
    
    operariosOrdenados.forEach(operario => {
        if (operario) {
            const option = document.createElement('option');
            option.value = operario;
            option.textContent = operario;
            select.appendChild(option);
        }
    });
}

async function cargarEvolucionOperario() {
    try {
        if (!todosDatosCargados) {
            await actualizarDatosFirebase();
            return;
        }
        
        const operario = document.getElementById('operarioEvolucion').value;
        const tipo = document.getElementById('tipoEvolucion').value;
        const mesesAtras = parseInt(document.getElementById('mesesEvolucion').value);
        
        if (!operario) {
            mostrarMensajeEvolucion('❌ Por favor selecciona un operario', false);
            return;
        }
        
        mostrarMensajeEvolucion(`📈 Calculando evolución para ${operario}...`, true);
        
        const evolucion = calcularEvolucionOperario(operario, tipo, mesesAtras);
        
        mostrarEvolucion(evolucion, operario, tipo);
        
        mostrarMensajeEvolucion('✅ Evolución calculada', true);
        
    } catch (error) {
        console.error('Error calculando evolución:', error);
        mostrarMensajeEvolucion('❌ Error al calcular evolución', false);
    }
}

function calcularEvolucionOperario(operario, tipo, mesesAtras) {
    const evolucion = [];
    const hoy = new Date();
    
    for (let i = mesesAtras - 1; i >= 0; i--) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();
        const mesNombre = obtenerNombreMes(mes);
        
        let datos = [];
        if (tipo === 'recoleccion') {
            datos = datosRecoleccion;
        } else if (tipo === 'reposicion') {
            datos = datosReposicion;
        } else {
            datos = datosDevoluciones;
        }
        
        const datosMes = filtrarDatosPorMes(datos, mes, anio).filter(r => r.usuario === operario);
        
        if (datosMes.length > 0) {
            let estadisticas;
            if (tipo === 'recoleccion') {
                estadisticas = calcularEstadisticasRecoleccionMensual(datosMes);
            } else if (tipo === 'reposicion') {
                estadisticas = calcularEstadisticasReposicionMensual(datosMes);
            } else {
                estadisticas = calcularEstadisticasDevolucionesMensual(datosMes);
            }
            
            if (estadisticas.length > 0) {
                const stat = estadisticas[0];
                evolucion.push({
                    mes: mes,
                    mesNombre: mesNombre,
                    anio: anio,
                    totalUnidades: stat.totalUnidades,
                    horasValidas: stat.horasValidas,
                    productividad: stat.productividad,
                    objetivo: stat.objetivo,
                    porcentajeObjetivo: stat.porcentajeObjetivo
                });
            } else {
                evolucion.push({
                    mes: mes,
                    mesNombre: mesNombre,
                    anio: anio,
                    totalUnidades: 0,
                    horasValidas: 0,
                    productividad: 0,
                    objetivo: 0,
                    porcentajeObjetivo: 0
                });
            }
        } else {
            evolucion.push({
                mes: mes,
                mesNombre: mesNombre,
                anio: anio,
                totalUnidades: 0,
                horasValidas: 0,
                productividad: 0,
                objetivo: 0,
                porcentajeObjetivo: 0
            });
        }
    }
    
    return evolucion;
}

function mostrarEvolucion(evolucion, operario, tipo) {
    mostrarTablaEvolucion(evolucion);
    actualizarGraficoEvolucion(evolucion, operario, tipo);
}

function mostrarTablaEvolucion(evolucion) {
    const tbody = document.getElementById('cuerpoTablaEvolucion');
    tbody.innerHTML = '';
    
    if (evolucion.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:15px;">No hay datos de evolución</td></tr>';
    } else {
        evolucion.forEach(item => {
            const row = document.createElement('tr');
            const tendencia = calcularTendencia(evolucion, item.mes, item.anio);
            
            row.innerHTML = `
                <td>${item.mesNombre}</td>
                <td>${item.anio}</td>
                <td>${item.totalUnidades.toLocaleString()}</td>
                <td>${item.horasValidas}</td>
                <td><strong>${item.productividad}</strong></td>
                <td>${item.objetivo}</td>
                <td>${item.objetivo > 0 ? Math.round((item.productividad / item.objetivo) * 100) : 0}%</td>
                <td><span class="${tendencia.clase}">${tendencia.texto}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('evolucionLoading').style.display = 'none';
    document.getElementById('tablaEvolucion').style.display = 'table';
}

function calcularTendencia(evolucion, mes, anio) {
    const indexActual = evolucion.findIndex(item => item.mes === mes && item.anio === anio);
    
    if (indexActual <= 0) {
        return { texto: '--', clase: '' };
    }
    
    const actual = evolucion[indexActual];
    const anterior = evolucion[indexActual - 1];
    
    if (anterior.productividad === 0) {
        return { texto: 'Nuevo', clase: 'percent-positive' };
    }
    
    const diferencia = actual.productividad - anterior.productividad;
    const porcentaje = Math.round((diferencia / anterior.productividad) * 100);
    
    if (diferencia > 0) {
        return { texto: `↑ ${porcentaje}%`, clase: 'percent-positive' };
    } else if (diferencia < 0) {
        return { texto: `↓ ${Math.abs(porcentaje)}%`, clase: 'percent-negative' };
    } else {
        return { texto: '→ 0%', clase: 'percent-exact' };
    }
}

function actualizarGraficoEvolucion(evolucion, operario, tipo) {
    const categorias = evolucion.map(item => `${item.mesNombre} ${item.anio}`);
    const productividades = evolucion.map(item => item.productividad);
    const objetivos = evolucion.map(item => item.objetivo);
    
    const options = {
        series: [{
            name: 'Productividad',
            data: productividades
        }, {
            name: 'Objetivo',
            data: objetivos
        }],
        chart: {
            height: 350,
            type: 'line',
            zoom: {
                enabled: false
            }
        },
        dataLabels: {
            enabled: false
        },
        stroke: {
            curve: 'smooth'
        },
        title: {
            text: `Evolución de ${operario} - ${tipo.toUpperCase()}`,
            align: 'center',
            style: {
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#6600a1'
            }
        },
        grid: {
            row: {
                colors: ['#f3f3f3', 'transparent'],
                opacity: 0.5
            }
        },
        xaxis: {
            categories: categorias,
            labels: {
                style: {
                    fontSize: '12px'
                }
            }
        },
        yaxis: {
            title: {
                text: 'Unidades por Hora'
            },
            min: 0
        },
        colors: ['#6600a1', '#e74c3c'],
        markers: {
            size: 5
        }
    };
    
    const chartElement = document.querySelector("#chartEvolucion");
    if (chartElement) {
        chartElement.innerHTML = '';
        const chart = new ApexCharts(chartElement, options);
        chart.render();
    }
}

// ================= UTILIDADES =================
function obtenerNombreMes(mes) {
    const meses = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return meses[parseInt(mes) - 1];
}

function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    
    if (typeof dateString === 'string' && dateString.includes('/')) {
        const partes = dateString.split('/');
        if (partes.length === 3) {
            const dia = partes[0].padStart(2, '0');
            const mes = partes[1].padStart(2, '0');
            const anio = partes[2];
            return `${dia}/${mes}/${anio}`;
        }
    }
    
    if (typeof dateString === 'string' && dateString.includes('-')) {
        const partes = dateString.split('-');
        if (partes.length === 3) {
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        }
    }
    
    try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        console.error('Error formateando fecha:', e);
    }
    
    return dateString;
}

function mostrarMensaje(mensaje, esExito) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.textContent = mensaje;
    statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 4000);
}

function mostrarMensajeDiario(mensaje, esExito) {
    const statusDiv = document.getElementById('statusDiario');
    statusDiv.textContent = mensaje;
    statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 4000);
}

function mostrarMensajeEvolucion(mensaje, esExito) {
    const statusDiv = document.getElementById('statusEvolucion');
    statusDiv.textContent = mensaje;
    statusDiv.className = esExito ? 'status-message success-message' : 'status-message error-message';
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 4000);
}

// ================= NAVEGACIÓN =================
function volverInterfazPrincipal() {
    window.location.href = 'index.html';
}

// Actualizar datos automáticamente cada 5 minutos
setInterval(() => {
    if (todosDatosCargados) {
        actualizarDatosFirebase();
    }
}, 300000);