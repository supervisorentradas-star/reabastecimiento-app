<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Verificar que es una solicitud POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

// Leer el input JSON
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'JSON inválido: ' . json_last_error_msg()]);
    exit;
}

// Validar campos requeridos
$requiredFields = ['usuario', 'ruta', 'upc', 'deposito', 'descripcion', 'cantidad', 'accion'];
foreach ($requiredFields as $field) {
    if (!isset($data[$field]) || empty(trim($data[$field]))) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => "Campo requerido faltante: $field"]);
        exit;
    }
}

$registrosDir = 'registros/';
if (!file_exists($registrosDir)) {
    if (!mkdir($registrosDir, 0777, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo crear directorio registros']);
        exit;
    }
}

// Crear nombre de archivo por fecha
$fecha = date('Y-m-d');
$archivoRegistro = $registrosDir . 'registros_' . $fecha . '.csv';

// Si el archivo no existe, crear encabezados
if (!file_exists($archivoRegistro)) {
    $encabezados = "FECHA_HORA,USUARIO,RUTA,UPC,DEPOSITO,DESCRIPCION,CANTIDAD,ACCION\n";
    file_put_contents($archivoRegistro, $encabezados, FILE_APPEND | LOCK_EX);
}

// Preparar datos para guardar
$fechaHora = date('Y-m-d H:i:s');
$linea = sprintf(
    '%s,%s,%s,%s,%s,%s,%d,%s',
    $fechaHora,
    addslashes($data['usuario']),
    addslashes($data['ruta']),
    addslashes($data['upc']),
    addslashes($data['deposito']),
    addslashes($data['descripcion']),
    intval($data['cantidad']),
    addslashes($data['accion'])
) . "\n";

try {
    if (file_put_contents($archivoRegistro, $linea, FILE_APPEND | LOCK_EX)) {
        echo json_encode([
            'success' => true,
            'message' => 'Registro guardado correctamente',
            'archivo' => $archivoRegistro,
            'registro' => $data
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar el registro']);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Excepción al guardar: ' . $e->getMessage()
    ]);
}
?>