#Requires -Version 5.1
<#
================================================================================
 CoachBoard · lanzador para PC
--------------------------------------------------------------------------------
 Sirve CoachBoard.html en http://localhost:8731 y abre el navegador.

 Se usa un servidor local en vez de abrir el archivo directamente para que
 la aplicación tenga siempre la misma dirección: así el navegador conserva
 la plantilla, el calendario y las actas entre sesiones, igual que hace la
 app en el móvil.

 Uso:
     Clic derecho sobre el archivo  ->  "Ejecutar con PowerShell"
 o bien, desde una consola:
     powershell -ExecutionPolicy Bypass -File .\CoachBoard.ps1

 Parámetros opcionales:
     -Puerto 9000        usa otro puerto
     -NoAbrirNavegador   no abre el navegador automáticamente

 Para cerrar: pulsa Ctrl+C en esta ventana.
================================================================================
#>

[CmdletBinding()]
param(
    [int]$Puerto = 8731,
    [switch]$NoAbrirNavegador
)

$ErrorActionPreference = 'Stop'

function Escribir {
    param([string]$Texto, [string]$Color = 'Gray')
    Write-Host $Texto -ForegroundColor $Color
}

# ------------------------------------------------------------------
# 1. Localizar el archivo de la aplicación
# ------------------------------------------------------------------
$raiz = Split-Path -Parent $PSCommandPath
$archivo = Join-Path $raiz 'CoachBoard.html'

if (-not (Test-Path -LiteralPath $archivo)) {
    Escribir ''
    Escribir '  No encuentro CoachBoard.html' 'Red'
    Escribir ''
    Escribir '  Este script y CoachBoard.html tienen que estar en la misma carpeta.'
    Escribir "  Carpeta actual: $raiz" 'DarkGray'
    Escribir ''
    Read-Host '  Pulsa Intro para salir'
    exit 1
}

Escribir ''
Escribir '  COACHBOARD' 'Green'
Escribir '  Cuaderno del entrenador' 'DarkGray'
Escribir ''

# ------------------------------------------------------------------
# 2. Abrir un puerto libre
# ------------------------------------------------------------------
$listener = $null
$puertoUsado = 0

foreach ($p in $Puerto..($Puerto + 9)) {
    $intento = New-Object System.Net.HttpListener
    $intento.Prefixes.Add("http://localhost:$p/")
    try {
        $intento.Start()
        $listener = $intento
        $puertoUsado = $p
        break
    }
    catch {
        # Puerto ocupado o bloqueado: probamos con el siguiente.
        try { $intento.Close() } catch { }
    }
}

# Si no se puede levantar el servidor, al menos abrimos el archivo.
if ($null -eq $listener) {
    Escribir '  No he podido abrir ningun puerto local.' 'Yellow'
    Escribir '  Abro la aplicacion directamente desde el archivo.' 'Yellow'
    Escribir '  (Funciona igual, pero los datos quedan ligados a la ruta del archivo.)' 'DarkGray'
    Escribir ''
    Start-Process $archivo
    Read-Host '  Pulsa Intro para salir'
    exit 0
}

$url = "http://localhost:$puertoUsado/"

if ($puertoUsado -ne $Puerto) {
    Escribir "  El puerto $Puerto estaba ocupado; uso el $puertoUsado." 'Yellow'
    Escribir '  Aviso: los datos guardados se asocian al puerto.' 'DarkGray'
    Escribir ''
}

Escribir "  Servidor activo en  $url" 'Cyan'
Escribir '  Deja esta ventana abierta mientras uses la aplicacion.'
Escribir '  Pulsa Ctrl+C para cerrar.' 'DarkGray'
Escribir ''

if (-not $NoAbrirNavegador) {
    try { Start-Process $url } catch { Escribir "  Abre tu navegador en $url" 'Yellow' }
}

# ------------------------------------------------------------------
# 3. Atender peticiones
# ------------------------------------------------------------------
try {
    while ($listener.IsListening) {

        $contexto = $listener.GetContext()
        $peticion = $contexto.Request
        $respuesta = $contexto.Response
        $ruta = $peticion.Url.AbsolutePath

        if ($ruta -eq '/favicon.ico') {
            $respuesta.StatusCode = 204
            $respuesta.Close()
            continue
        }

        try {
            # Se relee en cada peticion: si editas el HTML basta con
            # recargar la pagina para ver el cambio.
            $datos = [System.IO.File]::ReadAllBytes($archivo)
            $respuesta.StatusCode = 200
            $respuesta.ContentType = 'text/html; charset=utf-8'
            $respuesta.Headers.Add('Cache-Control', 'no-store')
            $respuesta.ContentLength64 = $datos.Length
            $respuesta.OutputStream.Write($datos, 0, $datos.Length)
        }
        catch {
            $respuesta.StatusCode = 500
        }
        finally {
            try { $respuesta.Close() } catch { }
        }
    }
}
finally {
    Escribir ''
    Escribir '  Servidor detenido.' 'DarkGray'
    try {
        if ($listener.IsListening) { $listener.Stop() }
        $listener.Close()
    }
    catch { }
}
