<?php
// HABILITAR LOGS DE ERRORES
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/php_errors.log');

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
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

// Verificar que se subió un archivo
if (!isset($_FILES['archivo'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No se recibió archivo']);
    exit;
}

$uploadDir = 'uploads/';
if (!file_exists($uploadDir)) {
    if (!mkdir($uploadDir, 0777, true)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo crear directorio uploads']);
        exit;
    }
}

// Validar tipo de archivo
$allowedTypes = ['text/csv', 'text/plain', 'application/vnd.ms-excel'];
$fileType = $_FILES['archivo']['type'];
$fileName = basename($_FILES['archivo']['name']);
$fileExt = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

if (!in_array($fileExt, ['csv', 'txt'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Solo se permiten archivos CSV o TXT']);
    exit;
}

// Generar nombre único
$uniqueName = 'rutas_' . date('Y-m-d_H-i-s') . '_' . uniqid() . '.csv';
$targetFile = $uploadDir . $uniqueName;

try {
    if (move_uploaded_file($_FILES['archivo']['tmp_name'], $targetFile)) {
        // Crear un archivo de referencia con el último subido
        file_put_contents($uploadDir . 'ultimo_archivo.txt', $uniqueName);
        
        echo json_encode([
            'success' => true,
            'message' => 'Archivo subido correctamente',
            'archivo' => $uniqueName,
            'ruta' => $targetFile
        ]);
    } else {
        $errorCode = $_FILES['archivo']['error'];
        $errorMessage = 'Error desconocido al subir archivo';
        
        switch ($errorCode) {
            case UPLOAD_ERR_INI_SIZE:
                $errorMessage = 'El archivo excede el tamaño máximo permitido';
                break;
            case UPLOAD_ERR_FORM_SIZE:
                $errorMessage = 'El archivo excede el tamaño máximo del formulario';
                break;
            case UPLOAD_ERR_PARTIAL:
                $errorMessage = 'El archivo fue subido parcialmente';
                break;
            case UPLOAD_ERR_NO_FILE:
                $errorMessage = 'No se subió ningún archivo';
                break;
            case UPLOAD_ERR_NO_TMP_DIR:
                $errorMessage = 'Falta la carpeta temporal';
                break;
            case UPLOAD_ERR_CANT_WRITE:
                $errorMessage = 'Error al escribir en el disco';
                break;
            case UPLOAD_ERR_EXTENSION:
                $errorMessage = 'Una extensión de PHP detuvo la subida';
                break;
        }
        
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $errorMessage]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Excepción: ' . $e->getMessage()
    ]);
}
?>