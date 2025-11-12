<?php
header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$uploadDir = 'uploads/';

// Verificar si existe la carpeta uploads
if (!file_exists($uploadDir)) {
    http_response_code(404);
    echo "ERROR: No se encontró la carpeta de uploads";
    exit;
}

// Buscar el último archivo subido
$ultimoArchivo = $uploadDir . 'ultimo_archivo.txt';
$archivoCSV = '';

if (file_exists($ultimoArchivo)) {
    $archivoCSV = $uploadDir . trim(file_get_contents($ultimoArchivo));
}

// Si no hay último archivo, buscar el más reciente en uploads
if (!file_exists($archivoCSV)) {
    $archivos = glob($uploadDir . '*.csv');
    if (empty($archivos)) {
        http_response_code(404);
        echo "ERROR: No se encontraron archivos CSV en el servidor";
        exit;
    }
    
    // Ordenar por fecha de modificación (más reciente primero)
    usort($archivos, function($a, $b) {
        return filemtime($b) - filemtime($a);
    });
    
    $archivoCSV = $archivos[0];
}

// Verificar que el archivo existe y es legible
if (!file_exists($archivoCSV)) {
    http_response_code(404);
    echo "ERROR: Archivo CSV no encontrado: " . basename($archivoCSV);
    exit;
}

if (!is_readable($archivoCSV)) {
    http_response_code(403);
    echo "ERROR: No se puede leer el archivo: " . basename($archivoCSV);
    exit;
}

// Leer y enviar el contenido del archivo
$contenido = file_get_contents($archivoCSV);
if ($contenido === false) {
    http_response_code(500);
    echo "ERROR: No se pudo leer el contenido del archivo";
    exit;
}

// Agregar información del archivo como comentario
echo "# Archivo: " . basename($archivoCSV) . "\n";
echo "# Última modificación: " . date('Y-m-d H:i:s', filemtime($archivoCSV)) . "\n";
echo "# Tamaño: " . filesize($archivoCSV) . " bytes\n";
echo "========================================\n";
echo $contenido;
?>