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

// ================= OBJETIVOS DE PRODUCTIVIDAD =================
const OBJETIVOS = {
    'A+B': { recoleccion: 90 },
    'F': { recoleccion: 120 },
    'CDE': { recoleccion: 120 },
    'P': { reposicion: 140 }
};

// ================= INICIALIZACIÓN =================
window.addEventListener('load', function() {
    inicializarFirebase();
    cargarDatosProductividad();
    configurarEventListeners();
});

// ================= CONFIGURACIÓN DE EVENTOS =================
function configurarEventListeners() {
    // Eventos para pestañas
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // Quitar clase active de todos los tabs
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Agregar clase active al tab clickeado
            this.classList.add('active');
            
            // Ocultar todos los contenidos
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Mostrar contenido del tab activo
            const tabId = this.getAttribute('data-tab');
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
    
    // Establecer fecha actual por defecto en filtro diario
    const hoy = new Date().toISOString().split('T')[0];
    document.getElementById('fechaDiaria').value = hoy;
}

// ================= FIREBASE INTEGRATION =================
function inicializarFirebase() {
    try {
        verificarConexionFirebase();
    } catch (error) {
        document.getElementById('estadoConexion').innerHTML = 'Error Firebase';
        document.getElementById('connectionIndicator').className = 'connection-indicator disconnected';
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

// ================= CARGAR DATOS DE PRODUCTIVIDAD =================
async function cargarDatosProductividad() {
    try {
        mostrarMensaje('📊 Cargando datos de productividad...', true);
        
        // Cargar datos de recolección
        await cargarDatosRecoleccion();
        
        // Cargar datos de reposición
        await cargarDatosReposicion();
        
        // Procesar y mostrar datos
        procesarDatosProductividad();
        
        mostrarMensaje('✅ Datos de productividad actualizados', true);
        
    } catch (error) {
        console.error('Error cargando datos de productividad:', error);
        mostrarMensaje('❌ Error al cargar datos de productividad', false);
    }
}

async function cargarDatosRecoleccion() {
    return new Promise((resolve, reject) => {
        database.ref('recolecciones').once('value')
            .then(snapshot => {
                const datos = snapshot.val();
                if (datos) {
                    // Convertir objeto a array
                    datosRecoleccion = Object.values(datos);
                    console.log('Datos de recolección cargados:', datosRecoleccion.length);
                } else {
                    datosRecoleccion = [];
                    console.log('No hay datos de recolección');
                }
                resolve(datosRecoleccion);
            })
            .catch(error => {
                console.error('Error cargando datos de recolección:', error);
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
                    // Convertir objeto a array
                    datosReposicion = Object.values(datos);
                    console.log('Datos de reposición cargados:', datosReposicion.length);
                } else {
                    datosReposicion = [];
                    console.log('No hay datos de reposición');
                }
                resolve(datosReposicion);
            })
            .catch(error => {
                console.error('Error cargando datos de reposición:', error);
                datosReposicion = [];
                reject(error);
            });
    });
}

// ================= PROCESAR DATOS DE PRODUCTIVIDAD MENSUAL =================
function procesarDatosProductividad() {
    // Procesar datos de recolección
    const estadisticasRecoleccion = calcularEstadisticasRecoleccion();
    mostrarEstadisticasRecoleccion(estadisticasRecoleccion);
    
    // Procesar datos de reposición
    const estadisticasReposicion = calcularEstadisticasReposicion();
    mostrarEstadisticasReposicion(estadisticasReposicion);
    
    // Actualizar estadísticas generales
    actualizarEstadisticasGenerales(estadisticasRecoleccion, estadisticasReposicion);
}

function calcularEstadisticasRecoleccion() {
    const operarios = {};
    
    datosRecoleccion.forEach(registro => {
        if (registro.usuario && registro.cantidad_recolectada) {
            const usuario = registro.usuario;
            const fecha = registro.fechaSistema || registro.fecha || new Date(registro.timestamp).toLocaleDateString();
            const unidades = parseInt(registro.cantidad_recolectada) || 0;
            const cola = registro.cola || 'N/A';
            
            if (!operarios[usuario]) {
                operarios[usuario] = {
                    usuario: usuario,
                    totalUnidades: 0,
                    diasTrabajados: new Set(),
                    colas: new Set(),
                    registros: []
                };
            }
            
            operarios[usuario].totalUnidades += unidades;
            operarios[usuario].diasTrabajados.add(fecha);
            operarios[usuario].colas.add(cola);
            operarios[usuario].registros.push(registro);
        }
    });
    
    // Convertir a array y calcular promedios
    return Object.values(operarios).map(op => {
        const dias = op.diasTrabajados.size;
        const promedio = dias > 0 ? Math.round(op.totalUnidades / dias) : 0;
        const colas = Array.from(op.colas).join(', ');
        
        // Calcular rendimiento basado en objetivos
        let objetivo = 0;
        let porcentajeCumplimiento = 0;
        
        // Buscar el objetivo más alto para las colas del operario
        const colasArray = Array.from(op.colas);
        for (const cola of colasArray) {
            if (OBJETIVOS[cola] && OBJETIVOS[cola].recoleccion) {
                if (OBJETIVOS[cola].recoleccion > objetivo) {
                    objetivo = OBJETIVOS[cola].recoleccion;
                }
            }
        }
        
        if (objetivo > 0) {
            porcentajeCumplimiento = Math.round((promedio / objetivo) * 100);
        }
        
        // Determinar clase de rendimiento
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeCumplimiento);
        
        return {
            ...op,
            diasTrabajados: dias,
            promedio: promedio,
            colas: colas,
            objetivo: objetivo,
            porcentajeCumplimiento: porcentajeCumplimiento,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass
        };
    }).sort((a, b) => b.promedio - a.promedio);
}

function calcularEstadisticasReposicion() {
    const operarios = {};
    
    datosReposicion.forEach(registro => {
        if (registro.usuario && registro.cantidad) {
            const usuario = registro.usuario;
            const fecha = registro.fecha || new Date(registro.timestamp).toLocaleDateString();
            const unidades = parseInt(registro.cantidad) || 0;
            
            if (!operarios[usuario]) {
                operarios[usuario] = {
                    usuario: usuario,
                    totalUnidades: 0,
                    diasTrabajados: new Set(),
                    registros: []
                };
            }
            
            operarios[usuario].totalUnidades += unidades;
            operarios[usuario].diasTrabajados.add(fecha);
            operarios[usuario].registros.push(registro);
        }
    });
    
    // Convertir a array y calcular promedios
    return Object.values(operarios).map(op => {
        const dias = op.diasTrabajados.size;
        const promedio = dias > 0 ? Math.round(op.totalUnidades / dias) : 0;
        
        // Calcular rendimiento basado en objetivos
        const objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].reposicion : 140;
        const porcentajeCumplimiento = objetivo > 0 ? Math.round((promedio / objetivo) * 100) : 0;
        
        // Determinar clase de rendimiento
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeCumplimiento);
        
        return {
            ...op,
            diasTrabajados: dias,
            promedio: promedio,
            objetivo: objetivo,
            porcentajeCumplimiento: porcentajeCumplimiento,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass
        };
    }).sort((a, b) => b.promedio - a.promedio);
}

// ================= FUNCIÓN PARA DETERMINAR RENDIMIENTO =================
function obtenerClaseRendimiento(porcentaje) {
    if (porcentaje >= 110) {
        return {
            texto: 'Excelente',
            clase: 'performance-excellent',
            progresoClass: 'progress-green-dark'
        };
    } else if (porcentaje >= 100) {
        return {
            texto: 'Bueno',
            clase: 'performance-good',
            progresoClass: 'progress-green-light'
        };
    } else if (porcentaje >= 80) {
        return {
            texto: 'Regular',
            clase: 'performance-poor',
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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de recolección disponibles</td></tr>';
    } else {
        estadisticas.forEach(op => {
            const row = document.createElement('tr');
            
            // Crear barra de progreso visual
            const progresoHTML = op.objetivo > 0 ? 
                `<div class="progress-container">
                    <div class="progress-bar ${op.progresoClass}" style="width: ${Math.min(op.porcentajeCumplimiento, 100)}%">
                        ${op.porcentajeCumplimiento}%
                    </div>
                </div>` : 'N/A';
            
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.colas || 'N/A'}</td>
                <td><strong>${op.promedio}</strong></td>
                <td>${op.totalUnidades}</td>
                <td>${op.diasTrabajados}</td>
                <td>${progresoHTML}</td>
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:15px;">No hay datos de reposición disponibles</td></tr>';
    } else {
        estadisticas.forEach(op => {
            const row = document.createElement('tr');
            
            // Crear barra de progreso visual
            const progresoHTML = op.objetivo > 0 ? 
                `<div class="progress-container">
                    <div class="progress-bar ${op.progresoClass}" style="width: ${Math.min(op.porcentajeCumplimiento, 100)}%">
                        ${op.porcentajeCumplimiento}%
                    </div>
                </div>` : 'N/A';
            
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td><strong>${op.promedio}</strong></td>
                <td>${op.totalUnidades}</td>
                <td>${op.diasTrabajados}</td>
                <td>${progresoHTML}</td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('reposicionLoading').style.display = 'none';
    document.getElementById('tablaReposicion').style.display = 'table';
}

function actualizarEstadisticasGenerales(estadisticasRecoleccion, estadisticasReposicion) {
    // Calcular operarios activos (últimos 30 días)
    const operariosUnicos = new Set();
    const treintaDiasAtras = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    [...datosRecoleccion, ...datosReposicion].forEach(registro => {
        if (registro.timestamp && registro.timestamp > treintaDiasAtras && registro.usuario) {
            operariosUnicos.add(registro.usuario);
        } else if (registro.usuario) {
            // Si no hay timestamp, incluir igualmente
            operariosUnicos.add(registro.usuario);
        }
    });
    
    // Calcular total de unidades
    const totalUnidadesRecoleccion = estadisticasRecoleccion.reduce((sum, op) => sum + op.totalUnidades, 0);
    const totalUnidadesReposicion = estadisticasReposicion.reduce((sum, op) => sum + op.totalUnidades, 0);
    const totalUnidades = totalUnidadesRecoleccion + totalUnidadesReposicion;
    
    // Calcular promedio general
    const totalDiasRecoleccion = estadisticasRecoleccion.reduce((sum, op) => sum + op.diasTrabajados, 0);
    const totalDiasReposicion = estadisticasReposicion.reduce((sum, op) => sum + op.diasTrabajados, 0);
    const totalDias = Math.max(totalDiasRecoleccion, totalDiasReposicion);
    const promedioGeneral = totalDias > 0 ? Math.round(totalUnidades / totalDias) : 0;
    
    // Actualizar UI
    document.getElementById('totalOperarios').textContent = operariosUnicos.size;
    document.getElementById('totalUnidades').textContent = totalUnidades.toLocaleString();
    document.getElementById('promedioGeneral').textContent = promedioGeneral.toLocaleString();
    document.getElementById('diasTrabajados').textContent = totalDias;
}

// ================= PRODUCTIVIDAD DIARIA =================
async function cargarProductividadDiaria() {
    try {
        const fechaSeleccionada = document.getElementById('fechaDiaria').value;
        
        if (!fechaSeleccionada) {
            mostrarMensajeDiario('❌ Por favor selecciona una fecha', false);
            return;
        }
        
        mostrarMensajeDiario('📊 Calculando productividad diaria...', true);
        
        // Procesar datos para la fecha seleccionada
        const estadisticasDiarias = await calcularProductividadDiaria(fechaSeleccionada);
        
        // Mostrar resultados
        mostrarProductividadDiaria(estadisticasDiarias);
        
        mostrarMensajeDiario('✅ Productividad diaria calculada', true);
        
    } catch (error) {
        console.error('Error calculando productividad diaria:', error);
        mostrarMensajeDiario('❌ Error al calcular productividad diaria', false);
    }
}

async function calcularProductividadDiaria(fecha) {
    // Formatear fecha para comparación (DD/MM/YYYY)
    const fechaFormateada = formatDateToDDMMYYYY(fecha);
    
    // Filtrar datos por fecha
    const recoleccionDelDia = datosRecoleccion.filter(registro => {
        const fechaRegistro = registro.fechaSistema || registro.fecha;
        return formatDateToDDMMYYYY(fechaRegistro) === fechaFormateada;
    });
    
    const reposicionDelDia = datosReposicion.filter(registro => {
        const fechaRegistro = registro.fecha;
        return formatDateToDDMMYYYY(fechaRegistro) === fechaFormateada;
    });
    
    console.log(`Datos del día ${fechaFormateada}:`, {
        recoleccion: recoleccionDelDia.length,
        reposicion: reposicionDelDia.length
    });
    
    // Procesar recolección diaria
    const productividadRecoleccion = calcularProductividadPorHora(recoleccionDelDia, 'recoleccion');
    
    // Procesar reposición diaria
    const productividadReposicion = calcularProductividadPorHora(reposicionDelDia, 'reposicion');
    
    return {
        recoleccion: productividadRecoleccion,
        reposicion: productividadReposicion,
        fecha: fechaFormateada
    };
}

function calcularProductividadPorHora(datos, tipo) {
    const operarios = {};
    
    datos.forEach(registro => {
        if (!registro.usuario) return;
        
        const usuario = registro.usuario;
        const hora = extraerHoraDelRegistro(registro);
        const unidades = tipo === 'recoleccion' ? 
            (parseInt(registro.cantidad_recolectada) || 0) : 
            (parseInt(registro.cantidad) || 0);
        const cola = registro.cola || 'P'; // Para reposición, usar 'P' por defecto
        
        if (!operarios[usuario]) {
            operarios[usuario] = {
                usuario: usuario,
                horasTrabajadas: new Set(),
                totalUnidades: 0,
                unidadesPorHora: {},
                colas: new Set(),
                registros: []
            };
        }
        
        // Agrupar por hora
        operarios[usuario].horasTrabajadas.add(hora);
        operarios[usuario].totalUnidades += unidades;
        operarios[usuario].colas.add(cola);
        
        if (!operarios[usuario].unidadesPorHora[hora]) {
            operarios[usuario].unidadesPorHora[hora] = 0;
        }
        operarios[usuario].unidadesPorHora[hora] += unidades;
        operarios[usuario].registros.push(registro);
    });
    
    // Calcular productividad por hora (solo horas válidas)
    return Object.values(operarios).map(op => {
        // Filtrar horas válidas (≥40 unidades)
        const horasValidas = Object.entries(op.unidadesPorHora)
            .filter(([hora, unidades]) => unidades >= 40)
            .map(([hora, unidades]) => ({ hora, unidades }));
        
        const totalHorasValidas = horasValidas.length;
        const totalUnidadesValidas = horasValidas.reduce((sum, h) => sum + h.unidades, 0);
        
        // Calcular productividad por hora
        const productividadPorHora = totalHorasValidas > 0 ? 
            Math.round(totalUnidadesValidas / totalHorasValidas) : 0;
        
        // Determinar objetivo según cola
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
        } else {
            objetivo = OBJETIVOS['P'] ? OBJETIVOS['P'].reposicion : 140;
        }
        
        // Calcular porcentaje de cumplimiento
        const porcentajeCumplimiento = objetivo > 0 ? 
            Math.round((productividadPorHora / objetivo) * 100) : 0;
        
        // Determinar rendimiento
        const rendimientoInfo = obtenerClaseRendimiento(porcentajeCumplimiento);
        
        return {
            usuario: op.usuario,
            colas: Array.from(op.colas).join(', '),
            productividadPorHora: productividadPorHora,
            horasValidas: totalHorasValidas,
            totalUnidades: op.totalUnidades,
            objetivo: objetivo,
            porcentajeCumplimiento: porcentajeCumplimiento,
            rendimiento: rendimientoInfo.texto,
            rendimientoClass: rendimientoInfo.clase,
            progresoClass: rendimientoInfo.progresoClass,
            tipo: tipo
        };
    }).filter(op => op.horasValidas > 0) // Solo operarios con horas válidas
      .sort((a, b) => b.productividadPorHora - a.productividadPorHora);
}

function extraerHoraDelRegistro(registro) {
    if (registro.hora) {
        // Extraer solo la hora (formato HH:MM:SS -> HH)
        return registro.hora.split(':')[0];
    } else if (registro.timestamp) {
        // Convertir timestamp a hora
        const fecha = new Date(registro.timestamp);
        return String(fecha.getHours()).padStart(2, '0');
    }
    return '00';
}

// ================= MOSTRAR PRODUCTIVIDAD DIARIA =================
function mostrarProductividadDiaria(estadisticas) {
    // Mostrar estadísticas generales del día
    actualizarEstadisticasDiarias(estadisticas);
    
    // Mostrar tabla de recolección diaria
    mostrarTablaRecoleccionDiaria(estadisticas.recoleccion);
    
    // Mostrar tabla de reposición diaria
    mostrarTablaReposicionDiaria(estadisticas.reposicion);
}

function actualizarEstadisticasDiarias(estadisticas) {
    const operariosUnicos = new Set();
    let totalUnidades = 0;
    let totalHorasValidas = 0;
    let productividadTotal = 0;
    let operariosConDatos = 0;
    
    // Procesar recolección
    estadisticas.recoleccion.forEach(op => {
        operariosUnicos.add(op.usuario);
        totalUnidades += op.totalUnidades;
        totalHorasValidas += op.horasValidas;
        productividadTotal += op.productividadPorHora;
        operariosConDatos++;
    });
    
    // Procesar reposición
    estadisticas.reposicion.forEach(op => {
        operariosUnicos.add(op.usuario);
        totalUnidades += op.totalUnidades;
        totalHorasValidas += op.horasValidas;
        productividadTotal += op.productividadPorHora;
        operariosConDatos++;
    });
    
    // Calcular promedio
    const totalOperarios = operariosUnicos.size;
    const productividadPromedio = operariosConDatos > 0 ? 
        Math.round(productividadTotal / operariosConDatos) : 0;
    
    // Actualizar UI
    document.getElementById('totalOperariosDia').textContent = totalOperarios;
    document.getElementById('totalUnidadesDia').textContent = totalUnidades.toLocaleString();
    document.getElementById('horasValidasDia').textContent = totalHorasValidas;
    document.getElementById('productividadPromedioDia').textContent = productividadPromedio.toLocaleString();
}

function mostrarTablaRecoleccionDiaria(datos) {
    const tbody = document.getElementById('cuerpoTablaRecoleccionDiaria');
    tbody.innerHTML = '';
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:15px;">No hay datos de recolección para esta fecha</td></tr>';
    } else {
        datos.forEach(op => {
            const row = document.createElement('tr');
            
            // Crear barra de progreso visual
            const progresoHTML = op.objetivo > 0 ? 
                `<div class="progress-container">
                    <div class="progress-bar ${op.progresoClass}" style="width: ${Math.min(op.porcentajeCumplimiento, 100)}%">
                        ${op.porcentajeCumplimiento}%
                    </div>
                </div>` : 'N/A';
            
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td>${op.colas}</td>
                <td><strong>${op.productividadPorHora}</strong></td>
                <td>${op.horasValidas}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${progresoHTML}</td>
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:15px;">No hay datos de reposición para esta fecha</td></tr>';
    } else {
        datos.forEach(op => {
            const row = document.createElement('tr');
            
            // Crear barra de progreso visual
            const progresoHTML = op.objetivo > 0 ? 
                `<div class="progress-container">
                    <div class="progress-bar ${op.progresoClass}" style="width: ${Math.min(op.porcentajeCumplimiento, 100)}%">
                        ${op.porcentajeCumplimiento}%
                    </div>
                </div>` : 'N/A';
            
            row.innerHTML = `
                <td>${op.usuario}</td>
                <td><strong>${op.productividadPorHora}</strong></td>
                <td>${op.horasValidas}</td>
                <td>${op.totalUnidades.toLocaleString()}</td>
                <td>${progresoHTML}</td>
                <td><span class="performance-badge ${op.rendimientoClass}">${op.rendimiento}</span></td>
            `;
            tbody.appendChild(row);
        });
    }
    
    document.getElementById('reposicionDiariaLoading').style.display = 'none';
    document.getElementById('tablaReposicionDiaria').style.display = 'table';
}

// ================= UTILIDADES =================
function formatDateToDDMMYYYY(dateString) {
    if (!dateString) return '';
    
    // Si ya está en formato DD/MM/YYYY, devolverlo tal cual
    if (dateString.includes('/')) {
        return dateString;
    }
    
    // Si está en formato YYYY-MM-DD, convertirlo
    if (dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    
    // Si es un timestamp o formato desconocido, intentar crear fecha
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

// ================= NAVEGACIÓN =================
function volverInterfazPrincipal() {
    window.location.href = 'index.html';
}

// Actualizar datos automáticamente cada 2 minutos
setInterval(() => {
    cargarDatosProductividad();
}, 120000);