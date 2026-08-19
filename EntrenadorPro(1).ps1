#Requires -Version 5.1
<#
================================================================================
 ENTRENADOR PRO  -  Cuaderno digital del entrenador de futbol
 PowerShell 5.1+ / Windows Forms  (Windows)
--------------------------------------------------------------------------------
 Modulos:
   Plantilla        Fichas de jugadores, altas/bajas, % de asistencia.
   Calendario       Partidos y entrenamientos con vista de mes.
   Asistencia       Pasar lista por sesion y estadisticas por jugador.
   Partido          Cronometro, 11 titulares + banquillo, cambios, tarjetas,
                    goles y minutos jugados por jugador en tiempo real.
   Entrenamientos   Pizarra con campo de futbol y piezas (conos, picas, vallas,
                    balones, jugadores, flechas...) arrastrables. Guarda y
                    exporta ejercicios a PNG.
   Tacticas         Campo completo con 22 fichas (11 vs 11), formaciones
                    predefinidas, arrastre libre y exportacion a PNG.

 Los datos se guardan en:  %APPDATA%\EntrenadorPro   (o -DataPath)
 Uso:  powershell.exe -ExecutionPolicy Bypass -STA -File .\EntrenadorPro.ps1
================================================================================
#>

param([string]$DataPath)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

try { [System.Windows.Forms.Application]::EnableVisualStyles() } catch { }
try { [System.Windows.Forms.Application]::SetCompatibleTextRenderingDefault($false) } catch { }

# =============================================================================
#  1. TEMA VISUAL  (vestuario de noche: pizarra oscura, cal blanca, cesped)
# =============================================================================
$script:C = @{
    Bg      = [System.Drawing.Color]::FromArgb(20, 24, 32)
    Panel   = [System.Drawing.Color]::FromArgb(31, 37, 49)
    Panel2  = [System.Drawing.Color]::FromArgb(43, 51, 67)
    Line    = [System.Drawing.Color]::FromArgb(56, 66, 86)
    Text    = [System.Drawing.Color]::FromArgb(233, 238, 246)
    Muted   = [System.Drawing.Color]::FromArgb(150, 162, 182)
    Accent  = [System.Drawing.Color]::FromArgb(38, 190, 122)
    Blue    = [System.Drawing.Color]::FromArgb(60, 130, 246)
    Warn    = [System.Drawing.Color]::FromArgb(245, 196, 60)
    Danger  = [System.Drawing.Color]::FromArgb(228, 74, 74)
    Cesped1 = [System.Drawing.Color]::FromArgb(26, 104, 58)
    Cesped2 = [System.Drawing.Color]::FromArgb(31, 118, 66)
    Cal     = [System.Drawing.Color]::FromArgb(238, 245, 240)
}

$script:F = @{
    Base  = New-Object System.Drawing.Font('Segoe UI', 9.5)
    Small = New-Object System.Drawing.Font('Segoe UI', 8.25)
    Bold  = New-Object System.Drawing.Font('Segoe UI', 9.5, [System.Drawing.FontStyle]::Bold)
    H1    = New-Object System.Drawing.Font('Segoe UI Semibold', 15)
    H2    = New-Object System.Drawing.Font('Segoe UI Semibold', 11)
    Clock = New-Object System.Drawing.Font('Consolas', 32, [System.Drawing.FontStyle]::Bold)
    Score = New-Object System.Drawing.Font('Consolas', 22, [System.Drawing.FontStyle]::Bold)
    Ficha = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
    Mini  = New-Object System.Drawing.Font('Segoe UI', 7.5, [System.Drawing.FontStyle]::Bold)
}

$script:Posiciones = @('POR', 'DFC', 'LTD', 'LTI', 'MCD', 'MC', 'MCO', 'ED', 'EI', 'SD', 'DC')
$script:EstadosAsis = @('Presente', 'Ausente', 'Justificado', 'Lesionado', 'Tarde')

# =============================================================================
#  2. ALMACENAMIENTO
# =============================================================================
if ([string]::IsNullOrWhiteSpace($DataPath)) {
    if ([string]::IsNullOrWhiteSpace($env:APPDATA)) {
        $script:DataDir = Join-Path (Get-Location).Path 'EntrenadorPro'
    } else {
        $script:DataDir = Join-Path $env:APPDATA 'EntrenadorPro'
    }
} else {
    $script:DataDir = $DataPath
}
if (-not (Test-Path $script:DataDir)) { New-Item -ItemType Directory -Path $script:DataDir -Force | Out-Null }

function Write-Store {
    param([string]$Name, $Data)
    try {
        $p = Join-Path $script:DataDir "$Name.json"
        ($Data | ConvertTo-Json -Depth 10) | Set-Content -Path $p -Encoding UTF8
    } catch {
        [System.Windows.Forms.MessageBox]::Show("No se pudo guardar '$Name': $($_.Exception.Message)", 'Guardado') | Out-Null
    }
}

function Read-Store {
    param([string]$Name)
    $p = Join-Path $script:DataDir "$Name.json"
    if (-not (Test-Path $p)) { return @() }
    try {
        $raw = Get-Content -Path $p -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
        return @($raw | ConvertFrom-Json)
    } catch { return @() }
}

function New-Id { return [guid]::NewGuid().ToString() }

$script:Jugadores  = [System.Collections.ArrayList]@(Read-Store 'jugadores')
$script:Eventos    = [System.Collections.ArrayList]@(Read-Store 'eventos')
$script:Asistencia = [System.Collections.ArrayList]@(Read-Store 'asistencia')
$script:Ejercicios = [System.Collections.ArrayList]@(Read-Store 'ejercicios')
$script:Tacticas   = [System.Collections.ArrayList]@(Read-Store 'tacticas')
$script:Partidos   = [System.Collections.ArrayList]@(Read-Store 'partidos')

$script:Club = 'Nuestro equipo'
$cfgArr = @(Read-Store 'config')
if ($cfgArr.Count -gt 0 -and $cfgArr[0].Club) { $script:Club = [string]$cfgArr[0].Club }

function Save-All {
    Write-Store 'jugadores'  @($script:Jugadores)
    Write-Store 'eventos'    @($script:Eventos)
    Write-Store 'asistencia' @($script:Asistencia)
    Write-Store 'ejercicios' @($script:Ejercicios)
    Write-Store 'tacticas'   @($script:Tacticas)
    Write-Store 'partidos'   @($script:Partidos)
    Write-Store 'config'     ([PSCustomObject]@{ Club = $script:Club })
}

function Get-Jugador { param([string]$Id) foreach ($j in $script:Jugadores) { if ($j.Id -eq $Id) { return $j } } return $null }
function Get-Evento  { param([string]$Id) foreach ($e in $script:Eventos)   { if ($e.Id -eq $Id) { return $e } } return $null }

function Get-FechaEvento {
    param($Ev)
    try { return [datetime]::ParseExact("$($Ev.Fecha) $($Ev.Hora)", 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture) }
    catch { return [datetime]::MinValue }
}

function Get-EventosOrdenados {
    return @($script:Eventos | Sort-Object -Property @{ Expression = { Get-FechaEvento $_ } })
}

# =============================================================================
#  3. AYUDAS DE INTERFAZ
# =============================================================================
function Set-DoubleBuffer {
    param($Control)
    try {
        $pi = [System.Windows.Forms.Control].GetProperty('DoubleBuffered',
              [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic)
        $pi.SetValue($Control, $true, $null)
    } catch { }
}

function New-Btn {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 130, [int]$H = 30,
          $Back = $null, $Fore = $null, [string]$Tip = '')
    if ($null -eq $Back) { $Back = $script:C.Panel2 }
    if ($null -eq $Fore) { $Fore = $script:C.Text }
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $Text
    $b.Location = New-Object System.Drawing.Point($X, $Y)
    $b.Size = New-Object System.Drawing.Size($W, $H)
    $b.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $b.FlatAppearance.BorderSize = 0
    $b.BackColor = $Back
    $b.ForeColor = $Fore
    $b.Font = $script:F.Base
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
    if ($Tip -ne '') { $script:Tips.SetToolTip($b, $Tip) }
    return $b
}

function New-Lbl {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 150, $Font = $null, $Fore = $null)
    if ($null -eq $Font) { $Font = $script:F.Base }
    if ($null -eq $Fore) { $Fore = $script:C.Text }
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.Location = New-Object System.Drawing.Point($X, $Y)
    $l.Size = New-Object System.Drawing.Size($W, 20)
    $l.Font = $Font
    $l.ForeColor = $Fore
    $l.BackColor = [System.Drawing.Color]::Transparent
    return $l
}

function New-Txt {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 180, [int]$H = 24, [bool]$Multi = $false)
    $t = New-Object System.Windows.Forms.TextBox
    $t.Text = $Text
    $t.Location = New-Object System.Drawing.Point($X, $Y)
    $t.Size = New-Object System.Drawing.Size($W, $H)
    $t.BackColor = $script:C.Panel2
    $t.ForeColor = $script:C.Text
    $t.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $t.Font = $script:F.Base
    if ($Multi) { $t.Multiline = $true; $t.ScrollBars = [System.Windows.Forms.ScrollBars]::Vertical }
    return $t
}

function New-Cmb {
    param($Items, [int]$X, [int]$Y, [int]$W = 180)
    $c = New-Object System.Windows.Forms.ComboBox
    $c.Location = New-Object System.Drawing.Point($X, $Y)
    $c.Size = New-Object System.Drawing.Size($W, 24)
    $c.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
    $c.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
    $c.BackColor = $script:C.Panel2
    $c.ForeColor = $script:C.Text
    $c.Font = $script:F.Base
    if ($Items) { foreach ($i in $Items) { [void]$c.Items.Add($i) } }
    return $c
}

function New-Lst {
    param([int]$X, [int]$Y, [int]$W, [int]$H, [bool]$Multi = $false)
    $l = New-Object System.Windows.Forms.ListBox
    $l.Location = New-Object System.Drawing.Point($X, $Y)
    $l.Size = New-Object System.Drawing.Size($W, $H)
    $l.BackColor = $script:C.Panel2
    $l.ForeColor = $script:C.Text
    $l.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $l.Font = $script:F.Base
    $l.IntegralHeight = $false
    if ($Multi) { $l.SelectionMode = [System.Windows.Forms.SelectionMode]::MultiExtended }
    return $l
}

function New-Card {
    param([int]$X, [int]$Y, [int]$W, [int]$H)
    $p = New-Object System.Windows.Forms.Panel
    $p.Location = New-Object System.Drawing.Point($X, $Y)
    $p.Size = New-Object System.Drawing.Size($W, $H)
    $p.BackColor = $script:C.Panel
    return $p
}

function Set-GridStyle {
    param($G)
    $G.BackgroundColor = $script:C.Panel
    $G.BorderStyle = [System.Windows.Forms.BorderStyle]::None
    $G.EnableHeadersVisualStyles = $false
    $G.ColumnHeadersDefaultCellStyle.BackColor = $script:C.Panel2
    $G.ColumnHeadersDefaultCellStyle.ForeColor = $script:C.Text
    $G.ColumnHeadersDefaultCellStyle.Font = $script:F.Bold
    $G.ColumnHeadersDefaultCellStyle.SelectionBackColor = $script:C.Panel2
    $G.ColumnHeadersHeightSizeMode = [System.Windows.Forms.DataGridViewColumnHeadersHeightSizeMode]::DisableResizing
    $G.ColumnHeadersHeight = 30
    $G.DefaultCellStyle.BackColor = $script:C.Panel
    $G.DefaultCellStyle.ForeColor = $script:C.Text
    $G.DefaultCellStyle.SelectionBackColor = $script:C.Blue
    $G.DefaultCellStyle.SelectionForeColor = [System.Drawing.Color]::White
    $G.DefaultCellStyle.Font = $script:F.Base
    $G.GridColor = $script:C.Line
    $G.RowHeadersVisible = $false
    $G.AllowUserToAddRows = $false
    $G.AllowUserToDeleteRows = $false
    $G.AllowUserToResizeRows = $false
    $G.SelectionMode = [System.Windows.Forms.DataGridViewSelectionMode]::FullRowSelect
    $G.MultiSelect = $false
    $G.ReadOnly = $true
    $G.RowTemplate.Height = 26
    $G.AutoSizeColumnsMode = [System.Windows.Forms.DataGridViewAutoSizeColumnsMode]::Fill
}

function Ask-Text {
    param([string]$Prompt, [string]$Title = 'Entrenador Pro', [string]$Default = '')
    return [Microsoft.VisualBasic.Interaction]::InputBox($Prompt, $Title, $Default)
}

function Ask-Yes {
    param([string]$Msg, [string]$Title = 'Confirmar')
    $r = [System.Windows.Forms.MessageBox]::Show($Msg, $Title,
         [System.Windows.Forms.MessageBoxButtons]::YesNo, [System.Windows.Forms.MessageBoxIcon]::Question)
    return ($r -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Say { param([string]$Msg, [string]$Title = 'Entrenador Pro')
    [System.Windows.Forms.MessageBox]::Show($Msg, $Title, [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}

function Format-MMSS { param([int]$Seg)
    $m = [math]::Floor($Seg / 60); $s = $Seg % 60
    return ('{0:00}:{1:00}' -f $m, $s)
}

# =============================================================================
#  4. MOTOR DE DIBUJO: CAMPO Y PIEZAS
# =============================================================================
function Get-PieceColor {
    param([string]$Nombre)
    switch ($Nombre) {
        'Azul'     { return [System.Drawing.Color]::FromArgb(60, 130, 246) }
        'Rojo'     { return [System.Drawing.Color]::FromArgb(228, 74, 74) }
        'Amarillo' { return [System.Drawing.Color]::FromArgb(245, 196, 60) }
        'Verde'    { return [System.Drawing.Color]::FromArgb(38, 190, 122) }
        'Naranja'  { return [System.Drawing.Color]::FromArgb(255, 140, 40) }
        'Blanco'   { return [System.Drawing.Color]::FromArgb(240, 244, 250) }
        'Negro'    { return [System.Drawing.Color]::FromArgb(28, 32, 40) }
        default    { return [System.Drawing.Color]::FromArgb(60, 130, 246) }
    }
}

function Draw-Pitch {
    param([System.Drawing.Graphics]$G, [int]$W, [int]$H, [string]$Modo = 'Completo')

    $m = [int]([math]::Max(10, $W * 0.012))
    $vw = $W - 2 * $m; $vh = $H - 2 * $m
    if ($vw -lt 60 -or $vh -lt 60) { return }
    $G.Clear($script:C.Bg)
    $vis = New-Object System.Drawing.Rectangle($m, $m, $vw, $vh)

    if ($Modo -eq 'Pizarra') {
        $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 248, 250))
        $G.FillRectangle($bg, $vis); $bg.Dispose()
        $gp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(222, 228, 236)), 1
        for ($x = $vis.X; $x -lt $vis.Right; $x += 30) { $G.DrawLine($gp, $x, $vis.Y, $x, $vis.Bottom) }
        for ($y = $vis.Y; $y -lt $vis.Bottom; $y += 30) { $G.DrawLine($gp, $vis.X, $y, $vis.Right, $y) }
        $gp.Dispose()
        $bp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 190, 205)), 2
        $G.DrawRectangle($bp, $vis); $bp.Dispose()
        return
    }

    # Cesped con franjas de corte
    $b1 = New-Object System.Drawing.SolidBrush $script:C.Cesped1
    $b2 = New-Object System.Drawing.SolidBrush $script:C.Cesped2
    $G.FillRectangle($b1, $vis)
    $bandas = 10
    $bw = $vis.Width / $bandas
    for ($i = 0; $i -lt $bandas; $i += 2) {
        $rx = [int]($vis.X + $i * $bw)
        $rw = [int][math]::Min($bw, $vis.Right - $rx)
        if ($rw -gt 0) { $G.FillRectangle($b2, $rx, $vis.Y, $rw, $vis.Height) }
    }
    $b1.Dispose(); $b2.Dispose()

    # Campo virtual: en 'Medio' se dibuja el campo completo pero se recorta la mitad derecha
    if ($Modo -eq 'Medio') {
        $pitch = New-Object System.Drawing.Rectangle (($vis.X - $vis.Width), $vis.Y, ($vis.Width * 2), $vis.Height)
        $G.SetClip($vis)
    } else {
        $pitch = $vis
    }

    $px = $pitch.X; $py = $pitch.Y; $pw = $pitch.Width; $ph = $pitch.Height
    $cx = $px + $pw / 2.0; $cy = $py + $ph / 2.0
    $pen = New-Object System.Drawing.Pen $script:C.Cal, 2
    $wb  = New-Object System.Drawing.SolidBrush $script:C.Cal

    $G.DrawRectangle($pen, $px, $py, $pw, $ph)
    $G.DrawLine($pen, $cx, [double]$py, $cx, [double]($py + $ph))
    $r = $ph * 0.13
    $G.DrawEllipse($pen, ($cx - $r), ($cy - $r), (2 * $r), (2 * $r))
    $G.FillEllipse($wb, ($cx - 3), ($cy - 3), 6, 6)

    $aW = $pw * 0.157; $aH = $ph * 0.578
    $gW = $pw * 0.055; $gH = $ph * 0.265
    $G.DrawRectangle($pen, $px, ($cy - $aH / 2), $aW, $aH)
    $G.DrawRectangle($pen, ($px + $pw - $aW), ($cy - $aH / 2), $aW, $aH)
    $G.DrawRectangle($pen, $px, ($cy - $gH / 2), $gW, $gH)
    $G.DrawRectangle($pen, ($px + $pw - $gW), ($cy - $gH / 2), $gW, $gH)

    $sp = $pw * 0.105
    $G.FillEllipse($wb, ($px + $sp - 3), ($cy - 3), 6, 6)
    $G.FillEllipse($wb, ($px + $pw - $sp - 3), ($cy - 3), 6, 6)
    $G.DrawArc($pen, ($px + $sp - $r), ($cy - $r), (2 * $r), (2 * $r), -53, 106)
    $G.DrawArc($pen, ($px + $pw - $sp - $r), ($cy - $r), (2 * $r), (2 * $r), 127, 106)

    # Porterias
    $gd = [math]::Max(6, $pw * 0.012)
    $G.DrawRectangle($pen, ($px - $gd), ($cy - $ph * 0.09), $gd, ($ph * 0.18))
    $G.DrawRectangle($pen, ($px + $pw), ($cy - $ph * 0.09), $gd, ($ph * 0.18))

    # Corners
    $cr = 9
    $G.DrawArc($pen, ($px - $cr), ($py - $cr), (2 * $cr), (2 * $cr), 0, 90)
    $G.DrawArc($pen, ($px + $pw - $cr), ($py - $cr), (2 * $cr), (2 * $cr), 90, 90)
    $G.DrawArc($pen, ($px + $pw - $cr), ($py + $ph - $cr), (2 * $cr), (2 * $cr), 180, 90)
    $G.DrawArc($pen, ($px - $cr), ($py + $ph - $cr), (2 * $cr), (2 * $cr), 270, 90)

    $pen.Dispose(); $wb.Dispose()
    $G.ResetClip()
}

function Draw-Arrowhead {
    param($G, $Brush, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [double]$Len = 13)
    $ang = [math]::Atan2($Y2 - $Y1, $X2 - $X1)
    $a1 = $ang + 2.6; $a2 = $ang - 2.6
    $p = New-Object 'System.Drawing.PointF[]' 3
    $p[0] = New-Object System.Drawing.PointF ([single]$X2, [single]$Y2)
    $p[1] = New-Object System.Drawing.PointF ([single]($X2 + $Len * [math]::Cos($a1)), [single]($Y2 + $Len * [math]::Sin($a1)))
    $p[2] = New-Object System.Drawing.PointF ([single]($X2 + $Len * [math]::Cos($a2)), [single]($Y2 + $Len * [math]::Sin($a2)))
    $G.FillPolygon($Brush, $p)
}

function Draw-WavyLine {
    param($G, $Pen, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2)
    $dx = $X2 - $X1; $dy = $Y2 - $Y1
    $len = [math]::Sqrt($dx * $dx + $dy * $dy)
    if ($len -lt 4) { $G.DrawLine($Pen, $X1, $Y1, $X2, $Y2); return }
    $ux = $dx / $len; $uy = $dy / $len
    $nx = -$uy; $ny = $ux
    $steps = [int][math]::Max(8, $len / 4)
    $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($i = 0; $i -le $steps; $i++) {
        $t = $i / [double]$steps
        $off = 5 * [math]::Sin($t * $len / 9.0)
        $px = $X1 + $ux * $len * $t + $nx * $off
        $py = $Y1 + $uy * $len * $t + $ny * $off
        $pts.Add((New-Object System.Drawing.PointF ([single]$px, [single]$py)))
    }
    $G.DrawLines($Pen, $pts.ToArray())
}

function Draw-Ficha {
    param($G, [double]$X, [double]$Y, [double]$R, $Color, [string]$Dorsal, [string]$Nombre, [bool]$Sel = $false)
    $sh = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
    $G.FillEllipse($sh, ($X - $R + 2), ($Y - $R + 3), (2 * $R), (2 * $R)); $sh.Dispose()
    $br = New-Object System.Drawing.SolidBrush $Color
    $G.FillEllipse($br, ($X - $R), ($Y - $R), (2 * $R), (2 * $R)); $br.Dispose()
    $pn = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(245, 250, 255)), 2
    $G.DrawEllipse($pn, ($X - $R), ($Y - $R), (2 * $R), (2 * $R)); $pn.Dispose()
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    if (-not [string]::IsNullOrWhiteSpace($Dorsal)) {
        $tb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
        $rect = New-Object System.Drawing.RectangleF ([single]($X - $R), [single]($Y - $R), [single](2 * $R), [single](2 * $R))
        $G.DrawString($Dorsal, $script:F.Ficha, $tb, $rect, $sf); $tb.Dispose()
    }
    if (-not [string]::IsNullOrWhiteSpace($Nombre)) {
        $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(160, 12, 16, 22))
        $sz = $G.MeasureString($Nombre, $script:F.Mini)
        $G.FillRectangle($bg, [single]($X - $sz.Width / 2 - 3), [single]($Y + $R + 2), [single]($sz.Width + 6), [single]($sz.Height))
        $bg.Dispose()
        $tb2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(240, 245, 250))
        $G.DrawString($Nombre, $script:F.Mini, $tb2, [single]($X - $sz.Width / 2), [single]($Y + $R + 2)); $tb2.Dispose()
    }
    if ($Sel) {
        $sp = New-Object System.Drawing.Pen $script:C.Warn, 2
        $sp.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
        $G.DrawEllipse($sp, ($X - $R - 5), ($Y - $R - 5), (2 * $R + 10), (2 * $R + 10)); $sp.Dispose()
    }
    $sf.Dispose()
}

function Draw-Item {
    param($G, $It, [int]$W, [int]$H, [bool]$Sel = $false)
    $x = $It.X * $W; $y = $It.Y * $H
    $col = Get-PieceColor $It.Color
    $cal = New-Object System.Drawing.SolidBrush $script:C.Cal
    $penCal = New-Object System.Drawing.Pen $script:C.Cal, 2
    $penCol = New-Object System.Drawing.Pen $col, 3
    $brCol = New-Object System.Drawing.SolidBrush $col

    switch ($It.Tipo) {

        'Jugador' { Draw-Ficha $G $x $y 14 $col $It.Etiqueta '' $Sel }

        'Portero' {
            Draw-Ficha $G $x $y 14 (Get-PieceColor 'Amarillo') $It.Etiqueta '' $Sel
        }

        'Cono' {
            $p = New-Object 'System.Drawing.PointF[]' 3
            $p[0] = New-Object System.Drawing.PointF ([single]$x, [single]($y - 11))
            $p[1] = New-Object System.Drawing.PointF ([single]($x - 9), [single]($y + 8))
            $p[2] = New-Object System.Drawing.PointF ([single]($x + 9), [single]($y + 8))
            $G.FillPolygon($brCol, $p)
            $pd = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 25, 10)), 1
            $G.DrawPolygon($pd, $p); $pd.Dispose()
        }

        'Balon' {
            $wb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
            $G.FillEllipse($wb, ($x - 7), ($y - 7), 14, 14)
            $bp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(25, 30, 38)), 1
            $G.DrawEllipse($bp, ($x - 7), ($y - 7), 14, 14)
            $bb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(25, 30, 38))
            $G.FillEllipse($bb, ($x - 2.5), ($y - 2.5), 5, 5)
            $G.FillEllipse($bb, ($x - 6), ($y + 1), 3, 3)
            $G.FillEllipse($bb, ($x + 3), ($y + 1), 3, 3)
            $G.FillEllipse($bb, ($x - 1), ($y - 6.5), 3, 3)
            $wb.Dispose(); $bp.Dispose(); $bb.Dispose()
        }

        'Porteria' {
            $G.DrawRectangle($penCal, ($x - 22), ($y - 8), 44, 16)
            $np = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(150, 240, 245, 250)), 1
            for ($i = -18; $i -le 18; $i += 6) { $G.DrawLine($np, ($x + $i), ($y - 8), ($x + $i), ($y + 8)) }
            $np.Dispose()
        }

        'Miniporteria' {
            $G.DrawRectangle($penCal, ($x - 13), ($y - 5), 26, 10)
        }

        'Escalera' {
            $G.DrawRectangle($penCal, ($x - 34), ($y - 11), 68, 22)
            for ($i = -34; $i -le 34; $i += 11) { $G.DrawLine($penCal, ($x + $i), ($y - 11), ($x + $i), ($y + 11)) }
        }

        'Valla' {
            $py = New-Object System.Drawing.Pen (Get-PieceColor 'Amarillo'), 3
            $G.DrawLine($py, ($x - 14), ($y - 6), ($x + 14), ($y - 6))
            $G.DrawLine($py, ($x - 14), ($y - 6), ($x - 14), ($y + 7))
            $G.DrawLine($py, ($x + 14), ($y - 6), ($x + 14), ($y + 7))
            $py.Dispose()
        }

        'Pica' {
            $pp = New-Object System.Drawing.Pen $col, 3
            $G.DrawLine($pp, $x, ($y - 14), $x, ($y + 10))
            $G.FillEllipse($brCol, ($x - 6), ($y + 7), 12, 6)
            $pp.Dispose()
        }

        'Aro' {
            $ap = New-Object System.Drawing.Pen $col, 3
            $G.DrawEllipse($ap, ($x - 13), ($y - 9), 26, 18)
            $ap.Dispose()
        }

        'Maniqui' {
            $G.FillEllipse($brCol, ($x - 6), ($y - 16), 12, 12)
            $G.FillRectangle($brCol, ($x - 7), ($y - 4), 14, 20)
            $mp = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(20, 24, 32)), 1
            $G.DrawRectangle($mp, ($x - 7), ($y - 4), 14, 20); $mp.Dispose()
        }

        'Texto' {
            $txt = $It.Etiqueta
            if ([string]::IsNullOrWhiteSpace($txt)) { $txt = 'Texto' }
            $f = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
            $sz = $G.MeasureString($txt, $f)
            $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 12, 16, 22))
            $G.FillRectangle($bg, [single]($x - $sz.Width / 2 - 5), [single]($y - $sz.Height / 2 - 3), [single]($sz.Width + 10), [single]($sz.Height + 6))
            $tb = New-Object System.Drawing.SolidBrush $col
            $G.DrawString($txt, $f, $tb, [single]($x - $sz.Width / 2), [single]($y - $sz.Height / 2))
            $bg.Dispose(); $tb.Dispose(); $f.Dispose()
        }

        'Zona' {
            $x2 = $It.X2 * $W; $y2 = $It.Y2 * $H
            $rx = [math]::Min($x, $x2); $ry = [math]::Min($y, $y2)
            $rw = [math]::Abs($x2 - $x); $rh = [math]::Abs($y2 - $y)
            $fill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(55, $col.R, $col.G, $col.B))
            $G.FillRectangle($fill, $rx, $ry, $rw, $rh); $fill.Dispose()
            $zp = New-Object System.Drawing.Pen $col, 2
            $zp.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
            $G.DrawRectangle($zp, $rx, $ry, $rw, $rh); $zp.Dispose()
        }

        'Flecha' {
            $x2 = $It.X2 * $W; $y2 = $It.Y2 * $H
            switch ($It.Estilo) {
                'Pase'       { $penCol.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash; $G.DrawLine($penCol, $x, $y, $x2, $y2) }
                'Conduccion' { Draw-WavyLine $G $penCol $x $y $x2 $y2 }
                default      { $G.DrawLine($penCol, $x, $y, $x2, $y2) }
            }
            Draw-Arrowhead $G $brCol $x $y $x2 $y2
        }

        default { Draw-Ficha $G $x $y 13 $col $It.Etiqueta '' $Sel }
    }

    if ($Sel -and $It.Tipo -ne 'Jugador' -and $It.Tipo -ne 'Portero') {
        $sp = New-Object System.Drawing.Pen $script:C.Warn, 1
        $sp.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dot
        if ($It.Tipo -eq 'Flecha' -or $It.Tipo -eq 'Zona') {
            $x2 = $It.X2 * $W; $y2 = $It.Y2 * $H
            $rx = [math]::Min($x, $x2) - 6; $ry = [math]::Min($y, $y2) - 6
            $G.DrawRectangle($sp, $rx, $ry, ([math]::Abs($x2 - $x) + 12), ([math]::Abs($y2 - $y) + 12))
        } else {
            $G.DrawRectangle($sp, ($x - 22), ($y - 22), 44, 44)
        }
        $sp.Dispose()
    }

    $cal.Dispose(); $penCal.Dispose(); $penCol.Dispose(); $brCol.Dispose()
}

function Draw-Scene {
    param($G, [int]$W, [int]$H, [string]$Modo, $Items, $SelId)
    $G.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $G.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Draw-Pitch -G $G -W $W -H $H -Modo $Modo
    foreach ($it in $Items) {
        Draw-Item -G $G -It $it -W $W -H $H -Sel ($null -ne $SelId -and $it.Id -eq $SelId)
    }
}

function Test-ItemHit {
    param($Items, [double]$Px, [double]$Py, [int]$W, [int]$H)
    for ($i = $Items.Count - 1; $i -ge 0; $i--) {
        $it = $Items[$i]
        $x = $it.X * $W; $y = $it.Y * $H
        if ($it.Tipo -eq 'Flecha' -or $it.Tipo -eq 'Zona') {
            $x2 = $it.X2 * $W; $y2 = $it.Y2 * $H
            if ([math]::Sqrt([math]::Pow($Px - $x, 2) + [math]::Pow($Py - $y, 2)) -le 11) {
                return [PSCustomObject]@{ Item = $it; Modo = 'P1' }
            }
            if ([math]::Sqrt([math]::Pow($Px - $x2, 2) + [math]::Pow($Py - $y2, 2)) -le 11) {
                return [PSCustomObject]@{ Item = $it; Modo = 'P2' }
            }
            $mx = ($x + $x2) / 2; $my = ($y + $y2) / 2
            if ([math]::Sqrt([math]::Pow($Px - $mx, 2) + [math]::Pow($Py - $my, 2)) -le 14) {
                return [PSCustomObject]@{ Item = $it; Modo = 'Mover' }
            }
        } else {
            if ([math]::Sqrt([math]::Pow($Px - $x, 2) + [math]::Pow($Py - $y, 2)) -le 20) {
                return [PSCustomObject]@{ Item = $it; Modo = 'Mover' }
            }
        }
    }
    return $null
}

function Export-Escena {
    param([string]$Modo, $Items, [string]$Sugerido = 'pizarra')
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = 'Imagen PNG (*.png)|*.png'
    $sfd.FileName = ($Sugerido -replace '[\\/:*?"<>|]', '_') + '.png'
    if ($sfd.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $w = 1600; $h = 1040
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    Draw-Scene -G $g -W $w -H $h -Modo $Modo -Items $Items -SelId $null
    $g.Dispose()
    $bmp.Save($sfd.FileName, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Say "Imagen guardada en:`n$($sfd.FileName)" 'Exportar'
}

# =============================================================================
#  5. FORMACIONES (coordenadas normalizadas, ataque hacia la derecha)
# =============================================================================
function Get-Formacion {
    param([string]$Nombre)
    $f = @{
        '4-4-2'   = @(@(0.055,0.50),@(0.20,0.16),@(0.19,0.38),@(0.19,0.62),@(0.20,0.84),
                      @(0.33,0.14),@(0.31,0.39),@(0.31,0.61),@(0.33,0.86),@(0.44,0.40),@(0.44,0.60))
        '4-3-3'   = @(@(0.055,0.50),@(0.20,0.16),@(0.19,0.38),@(0.19,0.62),@(0.20,0.84),
                      @(0.30,0.30),@(0.28,0.50),@(0.30,0.70),@(0.44,0.16),@(0.46,0.50),@(0.44,0.84))
        '4-2-3-1' = @(@(0.055,0.50),@(0.20,0.16),@(0.19,0.38),@(0.19,0.62),@(0.20,0.84),
                      @(0.27,0.38),@(0.27,0.62),@(0.38,0.16),@(0.37,0.50),@(0.38,0.84),@(0.46,0.50))
        '4-1-4-1' = @(@(0.055,0.50),@(0.20,0.16),@(0.19,0.38),@(0.19,0.62),@(0.20,0.84),
                      @(0.26,0.50),@(0.35,0.14),@(0.34,0.39),@(0.34,0.61),@(0.35,0.86),@(0.46,0.50))
        '3-5-2'   = @(@(0.055,0.50),@(0.19,0.28),@(0.18,0.50),@(0.19,0.72),
                      @(0.30,0.10),@(0.31,0.32),@(0.29,0.50),@(0.31,0.68),@(0.30,0.90),@(0.44,0.40),@(0.44,0.60))
        '3-4-3'   = @(@(0.055,0.50),@(0.19,0.28),@(0.18,0.50),@(0.19,0.72),
                      @(0.31,0.13),@(0.30,0.39),@(0.30,0.61),@(0.31,0.87),@(0.44,0.18),@(0.46,0.50),@(0.44,0.82))
        '5-3-2'   = @(@(0.055,0.50),@(0.19,0.10),@(0.18,0.30),@(0.17,0.50),@(0.18,0.70),@(0.19,0.90),
                      @(0.31,0.30),@(0.30,0.50),@(0.31,0.70),@(0.44,0.40),@(0.44,0.60))
        '4-4-2 rombo' = @(@(0.055,0.50),@(0.20,0.16),@(0.19,0.38),@(0.19,0.62),@(0.20,0.84),
                      @(0.27,0.50),@(0.33,0.24),@(0.33,0.76),@(0.39,0.50),@(0.46,0.40),@(0.46,0.60))
    }
    if ($f.ContainsKey($Nombre)) { return $f[$Nombre] }
    return $f['4-4-2']
}
$script:Formaciones = @('4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '3-5-2', '3-4-3', '5-3-2', '4-4-2 rombo')

# =============================================================================
#  6b. ACTA EN PDF
# =============================================================================
function ConvertTo-HtmlText {
    param([string]$T)
    if ([string]::IsNullOrEmpty($T)) { return '' }
    return ($T -replace '&', '&amp;' -replace '<', '&lt;' -replace '>', '&gt;' -replace '"', '&quot;')
}

function New-ActaHtml {
    param($Acta, $Evento)
    $club  = ConvertTo-HtmlText $script:Club
    $rival = ConvertTo-HtmlText $(if ($Acta.Rival) { $Acta.Rival } else { 'Rival' })
    $cond  = if ($Evento) { [string]$Evento.Condicion } else { 'Local' }
    $local = ($cond -ne 'Visitante')
    if ($local) { $izq = $club; $der = $rival; $mi = $Acta.GolesF; $md = $Acta.GolesC }
    else        { $izq = $rival; $der = $club; $mi = $Acta.GolesC; $md = $Acta.GolesF }

    $cabParts = New-Object System.Collections.ArrayList
    if ($Evento -and $Evento.Competicion) { [void]$cabParts.Add((ConvertTo-HtmlText $Evento.Competicion)) }
    elseif ($Evento) { [void]$cabParts.Add((ConvertTo-HtmlText $Evento.Tipo)) }
    if ($Acta.Fecha) { [void]$cabParts.Add($Acta.Fecha) }
    if ($Evento -and $Evento.Hora) { [void]$cabParts.Add($Evento.Hora) }
    if ($Evento -and $Evento.Lugar) { [void]$cabParts.Add((ConvertTo-HtmlText $Evento.Lugar)) }
    if ($cond) { [void]$cabParts.Add('condicion: ' + $cond.ToLower()) }
    $cab = ($cabParts -join ' &middot; ')

    $goles = @()
    if ($Acta.Goles) { $goles = @(@($Acta.Goles) | Where-Object { $null -ne $_ } | Sort-Object { [int]$_.Min }) }
    $tit = @()
    if ($Acta.Titulares) { $tit = @(@($Acta.Titulares) | Where-Object { $null -ne $_ }) }

    if ($goles.Count -gt 0) {
        $filasGol = ($goles | ForEach-Object {
            $eqTxt = if ($_.Eq -eq 'A') { $club } else { $rival }
            $jugTxt = if ($_.Jug) { ConvertTo-HtmlText $_.Jug } else { '&mdash;' }
            $asTxt = if ($_.Asis) { ConvertTo-HtmlText $_.Asis } else { '&mdash;' }
            "<tr><td class='n'>$($_.Min)'</td><td>$eqTxt</td><td>$jugTxt</td><td>$(ConvertTo-HtmlText $_.Tipo)</td><td>$asTxt</td></tr>"
        }) -join "`n"
    } else {
        $filasGol = "<tr><td colspan='5'>Sin goles detallados. Resultado: $($Acta.GolesF) - $($Acta.GolesC).</td></tr>"
    }

    $orden = @($Acta.Jugadores | Sort-Object @{Expression={ if ($tit -contains $_.JugadorId) { 0 } else { 1 } }}, @{Expression={ -[int]$_.Minutos }})
    $filasJug = ($orden | ForEach-Object {
        $pj = $_
        $esTit = ($tit -contains $pj.JugadorId)
        $penalCount = @($goles | Where-Object { $_.JugId -eq $pj.JugadorId -and $_.Tipo -match 'penalti' }).Count
        $golTxt = [string]$pj.Goles
        if ($penalCount -gt 0) { $golTxt += " ($penalCount p.)" }
        $rol = if ($esTit) { 'Titular' } else { 'Suplente' }
        $cls = if ($esTit) { " class='start'" } else { '' }
        $tr = if ([int]$pj.TR -gt 0) { 'Si' } else { '' }
        "<tr$cls><td class='n'>$($pj.Dorsal)</td><td>$(ConvertTo-HtmlText $pj.Nombre)</td><td>$(ConvertTo-HtmlText $pj.Posicion)</td><td>$rol</td><td class='n'>$($pj.Minutos)'</td><td class='n'>$golTxt</td><td class='n'>$($pj.Asis)</td><td class='n'>$($pj.TA)</td><td class='n'>$tr</td><td>$(ConvertTo-HtmlText $pj.Estado)</td></tr>"
    }) -join "`n"

    $disc = @($Acta.Jugadores | Where-Object { [int]$_.TA -gt 0 -or [int]$_.TR -gt 0 })
    if ($disc.Count -gt 0) {
        $filasDisc = ($disc | ForEach-Object {
            $ta = if ([int]$_.TA -gt 0) { "$($_.TA) amarilla" + $(if ([int]$_.TA -gt 1) { 's' } else { '' }) } else { '&mdash;' }
            $tr = if ([int]$_.TR -gt 0) { 'Expulsado' } else { '&mdash;' }
            "<tr><td class='n'>$($_.Dorsal)</td><td>$(ConvertTo-HtmlText $_.Nombre)</td><td>$ta</td><td>$tr</td></tr>"
        }) -join "`n"
    } else {
        $filasDisc = "<tr><td colspan='4'>Sin amonestaciones.</td></tr>"
    }

    $cron = (@($Acta.Cronica) | ForEach-Object { "<div>$(ConvertTo-HtmlText $_)</div>" }) -join "`n"
    if ([string]::IsNullOrWhiteSpace($cron)) { $cron = '<div>Sin incidencias registradas.</div>' }
    $totMin = (@($Acta.Jugadores) | Measure-Object -Property Minutos -Sum).Sum

    return @"
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Acta $($Acta.Fecha) $rival</title>
<style>
@page { size:A4; margin:15mm 14mm; }
body { color:#111; font-family:Georgia,"Times New Roman",serif; font-size:10.5pt; line-height:1.45; margin:0; }
.ah { border-bottom:2.5px solid #111; padding-bottom:6px; }
.ah-t { font-size:19pt; letter-spacing:.16em; font-weight:700; font-family:Segoe UI,system-ui,sans-serif; }
.ah-s { font-size:8.5pt; letter-spacing:.1em; text-transform:uppercase; color:#444; font-family:Segoe UI,system-ui,sans-serif; margin-top:3px; }
.ares { display:flex; align-items:center; justify-content:center; gap:22px; margin:16px 0 20px; }
.ares .tm { font-size:13pt; font-weight:700; width:38%; font-family:Segoe UI,system-ui,sans-serif; }
.ares .tm.r { text-align:right; }
.ares .sc { font-size:30pt; font-weight:700; letter-spacing:.06em; font-family:Segoe UI,system-ui,sans-serif; }
h4 { font-size:8.5pt; letter-spacing:.19em; text-transform:uppercase; font-family:Segoe UI,system-ui,sans-serif;
     border-bottom:1px solid #111; padding-bottom:3px; margin:18px 0 7px; font-weight:700; }
table { width:100%; border-collapse:collapse; font-size:9.5pt; }
th { text-align:left; font-family:Segoe UI,system-ui,sans-serif; font-size:7.5pt; letter-spacing:.12em;
     text-transform:uppercase; color:#333; border-bottom:1px solid #999; padding:3px 5px; }
td { padding:3px 5px; border-bottom:1px solid #DDD; vertical-align:top; }
td.n, th.n { text-align:right; white-space:nowrap; }
tr.start td { background:#F2F2F2; }
.chron { column-count:2; column-gap:18px; font-size:9pt; }
.chron div { break-inside:avoid; padding:1.5px 0; white-space:pre-wrap; }
.sig { margin-top:26px; display:flex; gap:40px; }
.sig div { flex:1; border-top:1px solid #111; padding-top:4px; font-size:8pt; font-family:Segoe UI,system-ui,sans-serif; color:#444; }
.foot { margin-top:22px; border-top:1px solid #BBB; padding-top:6px; font-size:7.5pt; color:#555;
        font-family:Segoe UI,system-ui,sans-serif; letter-spacing:.06em; display:flex; justify-content:space-between; }
.note { font-size:8pt; color:#555; margin:5px 0 0; }
</style></head><body>
<div class="ah"><div class="ah-t">ACTA DE PARTIDO</div><div class="ah-s">$cab</div></div>
<div class="ares"><div class="tm r">$izq</div><div class="sc">$mi &ndash; $md</div><div class="tm">$der</div></div>

<h4>Goles</h4>
<table><thead><tr><th class="n">Min</th><th>Equipo</th><th>Goleador</th><th>Tipo</th><th>Asistencia</th></tr></thead>
<tbody>
$filasGol
</tbody></table>

<h4>Participacion</h4>
<table><thead><tr><th class="n">Dor</th><th>Jugador</th><th>Pos</th><th>Rol</th><th class="n">Min</th>
<th class="n">G</th><th class="n">A</th><th class="n">TA</th><th class="n">TR</th><th>Situacion final</th></tr></thead>
<tbody>
$filasJug
</tbody></table>
<p class="note">Convocados: $(@($Acta.Jugadores).Count) &middot; titulares: $($tit.Count) &middot; minutos repartidos: $totMin &middot; los penaltis se indican entre parentesis en la columna de goles.</p>

<h4>Disciplina</h4>
<table><thead><tr><th class="n">Dor</th><th>Jugador</th><th>Amonestaciones</th><th>Expulsion</th></tr></thead>
<tbody>
$filasDisc
</tbody></table>

<h4>Cronica</h4>
<div class="chron">
$cron
</div>

<div class="sig"><div>Firma del entrenador</div><div>Firma del delegado</div></div>
<div class="foot"><span>$club &middot; acta generada el $(Get-Date -Format 'dd/MM/yyyy HH:mm')</span><span>Entrenador Pro</span></div>
</body></html>
"@
}

function Get-Navegador {
    $rutas = @(
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
    )
    foreach ($r in $rutas) { if ($r -and (Test-Path $r)) { return $r } }
    return $null
}

function Export-ActaPdf {
    param($Acta, $Evento)
    $base = "acta_$($Acta.Fecha)_$(($Acta.Rival -replace '[^\w\-]', '_'))"
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = 'Documento PDF (*.pdf)|*.pdf'
    $sfd.FileName = "$base.pdf"
    if ($sfd.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $pdf = $sfd.FileName

    $html = New-ActaHtml $Acta $Evento
    $tmp = Join-Path $env:TEMP "$base.html"
    Set-Content -Path $tmp -Value $html -Encoding UTF8

    $nav = Get-Navegador
    if ($nav) {
        try {
            $uri = 'file:///' + ($tmp -replace '\\', '/')
            $args = @('--headless', '--disable-gpu', '--no-pdf-header-footer',
                      "--print-to-pdf=`"$pdf`"", "`"$uri`"")
            Start-Process -FilePath $nav -ArgumentList $args -Wait -WindowStyle Hidden
        } catch { }
    }
    if (Test-Path $pdf) {
        Remove-Item $tmp -ErrorAction SilentlyContinue
        if (Ask-Yes "Acta guardada en:`n$pdf`n`nQuieres abrirla ahora?" 'Acta en PDF') { Start-Process $pdf }
    } else {
        Start-Process $tmp
        Say ("No se ha podido generar el PDF automaticamente, asi que he abierto el acta en el navegador." +
             "`n`nPulsa Ctrl+P y elige 'Microsoft Print to PDF' o 'Guardar como PDF' como impresora.") 'Acta'
    }
}

function Get-EstadisticasJugador {
    param([string]$Id)
    $j = Get-Jugador $Id
    $st = [ordered]@{
        Jugador = $j; Convocatorias = 0; Jugados = 0; Titular = 0; Minutos = 0
        Goles = 0; Asis = 0; Faltas = 0; TA = 0; TR = 0
        Tipos = @{}; Partidos = New-Object System.Collections.ArrayList
    }
    $ordenados = @($script:Partidos | Sort-Object -Property Fecha -Descending)
    foreach ($p in $ordenados) {
        $f = @($p.Jugadores) | Where-Object { $_.JugadorId -eq $Id } | Select-Object -First 1
        if (-not $f) { continue }
        $st.Convocatorias++
        $esTit = (@($p.Titulares) -contains $Id)
        if ($esTit) { $st.Titular++ }
        if ([int]$f.Minutos -gt 0) { $st.Jugados++ }
        $st.Minutos += [int]$f.Minutos
        $st.Goles   += [int]$f.Goles
        $st.Asis    += [int]$f.Asis
        $st.Faltas  += [int]$f.Faltas
        $st.TA      += [int]$f.TA
        $st.TR      += [int]$f.TR
        foreach ($g in @($p.Goles)) {
            if ($g -and $g.JugId -eq $Id) {
                $t = if ($g.Tipo) { [string]$g.Tipo } else { 'Jugada' }
                if (-not $st.Tipos.ContainsKey($t)) { $st.Tipos[$t] = 0 }
                $st.Tipos[$t]++
            }
        }
        [void]$st.Partidos.Add([PSCustomObject]@{
            Fecha = $p.Fecha; Rival = $p.Rival; Res = "$($p.GolesF)-$($p.GolesC)"
            Rol = if ($esTit) { 'Titular' } else { 'Suplente' }
            Minutos = [int]$f.Minutos; Goles = [int]$f.Goles; Asis = [int]$f.Asis
            Faltas = [int]$f.Faltas; TA = [int]$f.TA; TR = [int]$f.TR
        })
    }
    $st.Media   = if ($st.Jugados -gt 0) { [int]($st.Minutos / $st.Jugados) } else { 0 }
    $st.MinGol  = if ($st.Goles -gt 0) { [int]($st.Minutos / $st.Goles) } else { $null }
    $st.MinPart = if (($st.Goles + $st.Asis) -gt 0) { [int]($st.Minutos / ($st.Goles + $st.Asis)) } else { $null }
    $st.FalPart = if ($st.Jugados -gt 0) { [math]::Round($st.Faltas / $st.Jugados, 1) } else { 0 }
    $pres = 0; $tot = 0
    foreach ($a in $script:Asistencia) {
        foreach ($r in @($a.Registros)) {
            if ($r.JugadorId -eq $Id) { $tot++; if ($r.Estado -eq 'Presente' -or $r.Estado -eq 'Tarde') { $pres++ } }
        }
    }
    $st.EntrenoPct = if ($tot -gt 0) { [int](100 * $pres / $tot) } else { $null }
    $st.EntrenoPres = $pres; $st.EntrenoTot = $tot
    return [PSCustomObject]$st
}

function New-FichaHtml {
    param($St)
    $j = $St.Jugador
    $club = ConvertTo-HtmlText $script:Club
    $edad = ''
    try {
        $fn = [datetime]::ParseExact($j.FechaNac, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
        $edad = [string][int](((Get-Date) - $fn).Days / 365.25) + ' anos'
    } catch { }
    $cab = (@($j.Posicion, $j.Pie, $edad, $j.Estado) | Where-Object { $_ }) -join ' &middot; '

    $fila = { param($l, $v) "<tr><td>$l</td><td class='n'>$v</td></tr>" }
    $res = @(
        (& $fila 'Convocatorias' $St.Convocatorias),
        (& $fila 'Partidos jugados' $St.Jugados),
        (& $fila 'Como titular' $St.Titular),
        (& $fila 'Minutos totales' "$($St.Minutos)'"),
        (& $fila 'Media por partido' "$($St.Media)'"),
        (& $fila 'Goles' $St.Goles),
        (& $fila 'Asistencias' $St.Asis),
        (& $fila 'Marca un gol cada' $(if ($St.MinGol) { "$($St.MinGol) minutos" } else { '&mdash;' })),
        (& $fila 'Participa en gol cada' $(if ($St.MinPart) { "$($St.MinPart) minutos" } else { '&mdash;' })),
        (& $fila 'Faltas cometidas' "$($St.Faltas) ($($St.FalPart) por partido)"),
        (& $fila 'Tarjetas amarillas' $St.TA),
        (& $fila 'Expulsiones' $St.TR),
        (& $fila 'Asistencia a entrenamientos' $(if ($null -ne $St.EntrenoPct) { "$($St.EntrenoPct)% ($($St.EntrenoPres) de $($St.EntrenoTot))" } else { '&mdash;' }))
    ) -join "`n"

    $orden = @('Jugada', 'Penalti', 'Falta directa', 'Corner', 'En propia del rival')
    $claves = @($orden | Where-Object { $St.Tipos.ContainsKey($_) })
    foreach ($k in $St.Tipos.Keys) { if ($claves -notcontains $k) { $claves += $k } }
    if ($claves.Count -gt 0) {
        $filasTipo = ($claves | ForEach-Object {
            $n = $St.Tipos[$_]
            $pct = [int](100 * $n / [math]::Max(1, $St.Goles))
            "<tr><td>$(ConvertTo-HtmlText $_)</td><td class='n'>$n</td><td class='n'>$pct%</td></tr>"
        }) -join "`n"
    } else {
        $filasTipo = "<tr><td colspan='3'>Sin goles registrados.</td></tr>"
    }
    $fav = ''
    if ($claves.Count -gt 0) {
        $mejor = ($claves | Sort-Object { $St.Tipos[$_] } -Descending)[0]
        $iguales = @($claves | Where-Object { $St.Tipos[$_] -eq $St.Tipos[$mejor] }).Count
        if ($St.Tipos[$mejor] -ge 2 -and $iguales -eq 1) {
            $fav = "<p class='note'>La mayoria de sus goles llegan asi: $($mejor.ToLower()).</p>"
        }
    }

    if (@($St.Partidos).Count -gt 0) {
        $filasPart = (@($St.Partidos) | ForEach-Object {
            $tr = if ([int]$_.TR -gt 0) { 'Si' } else { '' }
            "<tr><td>$($_.Fecha)</td><td>$(ConvertTo-HtmlText $_.Rival)</td><td>$($_.Res)</td><td>$($_.Rol)</td><td class='n'>$($_.Minutos)'</td><td class='n'>$($_.Goles)</td><td class='n'>$($_.Asis)</td><td class='n'>$($_.Faltas)</td><td class='n'>$($_.TA)</td><td class='n'>$tr</td></tr>"
        }) -join "`n"
    } else {
        $filasPart = "<tr><td colspan='10'>Sin partidos con acta cerrada.</td></tr>"
    }

    return @"
<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Ficha de $(ConvertTo-HtmlText $j.Nombre)</title>
<style>
@page { size:A4; margin:15mm 14mm; }
body { color:#111; font-family:Georgia,"Times New Roman",serif; font-size:10.5pt; line-height:1.45; margin:0; }
.ah { border-bottom:2.5px solid #111; padding-bottom:6px; }
.ah-t { font-size:19pt; letter-spacing:.16em; font-weight:700; font-family:Segoe UI,system-ui,sans-serif; }
.ah-s { font-size:8.5pt; letter-spacing:.1em; text-transform:uppercase; color:#444; font-family:Segoe UI,system-ui,sans-serif; margin-top:3px; }
.ares { display:flex; align-items:center; justify-content:center; gap:22px; margin:16px 0 20px; }
.ares .tm { font-size:13pt; font-weight:700; width:38%; font-family:Segoe UI,system-ui,sans-serif; }
.ares .tm.r { text-align:right; }
.ares .tm.s { font-size:9pt; font-weight:400; color:#444; text-transform:uppercase; letter-spacing:.1em; }
.ares .sc { font-size:30pt; font-weight:700; font-family:Segoe UI,system-ui,sans-serif; }
h4 { font-size:8.5pt; letter-spacing:.19em; text-transform:uppercase; font-family:Segoe UI,system-ui,sans-serif;
     border-bottom:1px solid #111; padding-bottom:3px; margin:18px 0 7px; font-weight:700; }
table { width:100%; border-collapse:collapse; font-size:9.5pt; }
th { text-align:left; font-family:Segoe UI,system-ui,sans-serif; font-size:7.5pt; letter-spacing:.12em;
     text-transform:uppercase; color:#333; border-bottom:1px solid #999; padding:3px 5px; }
td { padding:3px 5px; border-bottom:1px solid #DDD; }
td.n, th.n { text-align:right; white-space:nowrap; }
.note { font-size:8pt; color:#555; margin:5px 0 0; }
.foot { margin-top:22px; border-top:1px solid #BBB; padding-top:6px; font-size:7.5pt; color:#555;
        font-family:Segoe UI,system-ui,sans-serif; letter-spacing:.06em; display:flex; justify-content:space-between; }
</style></head><body>
<div class="ah"><div class="ah-t">FICHA DE JUGADOR</div>
<div class="ah-s">$club &middot; temporada en curso &middot; $(Get-Date -Format 'dd/MM/yyyy')</div></div>
<div class="ares"><div class="tm r">$(ConvertTo-HtmlText $j.Nombre)</div><div class="sc">$($j.Dorsal)</div><div class="tm s">$(ConvertTo-HtmlText $cab)</div></div>

<h4>Resumen de la temporada</h4>
<table><tbody>
$res
</tbody></table>

<h4>De donde vienen sus goles</h4>
<table><thead><tr><th>Origen</th><th class="n">Goles</th><th class="n">Peso</th></tr></thead>
<tbody>
$filasTipo
</tbody></table>
$fav

<h4>Partido a partido</h4>
<table><thead><tr><th>Fecha</th><th>Rival</th><th>Res.</th><th>Rol</th><th class="n">Min</th>
<th class="n">G</th><th class="n">A</th><th class="n">Faltas</th><th class="n">TA</th><th class="n">TR</th></tr></thead>
<tbody>
$filasPart
</tbody></table>

<div class="foot"><span>$club &middot; ficha generada el $(Get-Date -Format 'dd/MM/yyyy HH:mm')</span><span>Entrenador Pro</span></div>
</body></html>
"@
}

function Export-FichaPdf {
    param($St)
    $nombre = ($St.Jugador.Nombre -replace '[^\w\-]', '_')
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = 'Documento PDF (*.pdf)|*.pdf'
    $sfd.FileName = "ficha_$nombre.pdf"
    if ($sfd.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $pdf = $sfd.FileName
    $tmp = Join-Path $env:TEMP "ficha_$nombre.html"
    Set-Content -Path $tmp -Value (New-FichaHtml $St) -Encoding UTF8
    $nav = Get-Navegador
    if ($nav) {
        try {
            $uri = 'file:///' + ($tmp -replace '\\', '/')
            Start-Process -FilePath $nav -ArgumentList @('--headless', '--disable-gpu', '--no-pdf-header-footer',
                "--print-to-pdf=`"$pdf`"", "`"$uri`"") -Wait -WindowStyle Hidden
        } catch { }
    }
    if (Test-Path $pdf) {
        Remove-Item $tmp -ErrorAction SilentlyContinue
        if (Ask-Yes "Ficha guardada en:`n$pdf`n`nQuieres abrirla ahora?" 'Ficha en PDF') { Start-Process $pdf }
    } else {
        Start-Process $tmp
        Say "He abierto la ficha en el navegador. Pulsa Ctrl+P y elige 'Microsoft Print to PDF'." 'Ficha'
    }
}

function Show-FichaJugador {
    param([string]$Id)
    $st = Get-EstadisticasJugador $Id
    $j = $st.Jugador
    $d = New-Object System.Windows.Forms.Form
    $d.Text = "Ficha de $($j.Nombre)"
    $d.Size = New-Object System.Drawing.Size(760, 640)
    $d.StartPosition = 'CenterParent'
    $d.BackColor = $script:C.Bg
    $d.Font = $script:F.Base

    $cab = New-Object System.Windows.Forms.Panel
    $cab.Dock = [System.Windows.Forms.DockStyle]::Top
    $cab.Height = 92
    $cab.BackColor = $script:C.Panel
    $d.Controls.Add($cab)
    $lNum = New-Lbl "$($j.Dorsal)" 20 16 70 (New-Object System.Drawing.Font('Consolas', 30, [System.Drawing.FontStyle]::Bold)) $script:C.Accent
    $lNum.Height = 50
    $cab.Controls.Add($lNum)
    $cab.Controls.Add((New-Lbl $j.Nombre 96 20 420 $script:F.H1))
    $sub = (@($j.Posicion, $j.Pie, $j.Estado) | Where-Object { $_ }) -join '  ·  '
    $cab.Controls.Add((New-Lbl $sub 98 52 420 $script:F.Small $script:C.Muted))

    $tot = New-Lbl ("{0} partidos   {1} min   {2} goles   {3} asistencias" -f $st.Jugados, $st.Minutos, $st.Goles, $st.Asis) 98 70 500 $script:F.Base $script:C.Text
    $cab.Controls.Add($tot)

    $izq = New-Object System.Windows.Forms.Panel
    $izq.Location = New-Object System.Drawing.Point(14, 104)
    $izq.Size = New-Object System.Drawing.Size(340, 440)
    $izq.BackColor = $script:C.Panel
    $izq.Anchor = 'Top,Left,Bottom'
    $d.Controls.Add($izq)
    $izq.Controls.Add((New-Lbl 'Rendimiento' 16 12 250 $script:F.H2))

    $lineas = New-Object System.Collections.ArrayList
    [void]$lineas.Add(("Convocatorias           {0}" -f $st.Convocatorias))
    [void]$lineas.Add(("Titular / suplente      {0} / {1}" -f $st.Titular, ($st.Convocatorias - $st.Titular)))
    [void]$lineas.Add(("Minutos totales         {0}'" -f $st.Minutos))
    [void]$lineas.Add(("Media por partido       {0}'" -f $st.Media))
    [void]$lineas.Add(("Marca un gol cada       {0}" -f $(if ($st.MinGol) { "$($st.MinGol)'" } else { '-' })))
    [void]$lineas.Add(("Gol o asistencia cada   {0}" -f $(if ($st.MinPart) { "$($st.MinPart)'" } else { '-' })))
    [void]$lineas.Add(("Faltas cometidas        {0}  ({1} por partido)" -f $st.Faltas, $st.FalPart))
    [void]$lineas.Add(("Amarillas / rojas       {0} / {1}" -f $st.TA, $st.TR))
    [void]$lineas.Add(("Entrenamientos          {0}" -f $(if ($null -ne $st.EntrenoPct) { "$($st.EntrenoPct)%  ($($st.EntrenoPres)/$($st.EntrenoTot))" } else { '-' })))
    $lStats = New-Lbl ($lineas -join [Environment]::NewLine) 16 44 310 (New-Object System.Drawing.Font('Consolas', 9.5)) $script:C.Text
    $lStats.Height = 190
    $izq.Controls.Add($lStats)

    $izq.Controls.Add((New-Lbl 'De donde vienen sus goles' 16 244 300 $script:F.H2))
    $orden = @('Jugada', 'Penalti', 'Falta directa', 'Corner', 'En propia del rival')
    $claves = @($orden | Where-Object { $st.Tipos.ContainsKey($_) })
    foreach ($k in $st.Tipos.Keys) { if ($claves -notcontains $k) { $claves += $k } }
    if ($claves.Count -eq 0) {
        $izq.Controls.Add((New-Lbl 'Todavia no ha marcado.' 16 274 300 $script:F.Base $script:C.Muted))
    } else {
        $y = 276
        foreach ($k in $claves) {
            $n = $st.Tipos[$k]
            $pct = [int](100 * $n / [math]::Max(1, $st.Goles))
            $izq.Controls.Add((New-Lbl ("{0}  -  {1} ({2}%)" -f $k, $n, $pct) 16 $y 300 $script:F.Base $script:C.Text))
            $bar = New-Object System.Windows.Forms.Panel
            $bar.Location = New-Object System.Drawing.Point(16, ($y + 20))
            $bar.Size = New-Object System.Drawing.Size([int](290 * $pct / 100), 6)
            $bar.BackColor = $script:C.Accent
            $izq.Controls.Add($bar)
            $y += 36
        }
    }

    $grid = New-Object System.Windows.Forms.DataGridView
    $grid.Location = New-Object System.Drawing.Point(366, 104)
    $grid.Size = New-Object System.Drawing.Size(370, 440)
    $grid.Anchor = 'Top,Left,Bottom,Right'
    Set-GridStyle $grid
    [void]$grid.Columns.Add('fecha', 'Fecha')
    [void]$grid.Columns.Add('rival', 'Rival')
    [void]$grid.Columns.Add('min', 'Min')
    [void]$grid.Columns.Add('g', 'G')
    [void]$grid.Columns.Add('a', 'A')
    [void]$grid.Columns.Add('f', 'Faltas')
    $grid.Columns['fecha'].FillWeight = 80
    $grid.Columns['rival'].FillWeight = 110
    $grid.Columns['min'].FillWeight = 45
    $grid.Columns['g'].FillWeight = 30
    $grid.Columns['a'].FillWeight = 30
    $grid.Columns['f'].FillWeight = 45
    foreach ($p in @($st.Partidos)) {
        [void]$grid.Rows.Add($p.Fecha, $p.Rival, "$($p.Minutos)'", $p.Goles, $p.Asis, $p.Faltas)
    }
    $d.Controls.Add($grid)

    $bPdf = New-Btn 'Descargar ficha en PDF' 366 556 220 34 $script:C.Accent ([System.Drawing.Color]::Black)
    $bPdf.Anchor = 'Bottom,Left'
    $bPdf.Add_Click({ param($s, $e) Export-FichaPdf $script:FichaActual })
    $d.Controls.Add($bPdf)
    $bCerrar = New-Btn 'Cerrar' 600 556 130 34
    $bCerrar.Anchor = 'Bottom,Left'
    $bCerrar.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $d.Controls.Add($bCerrar)

    $script:FichaActual = $st
    [void]$d.ShowDialog()
    $d.Dispose()
}

# =============================================================================
#  6c. DIALOGOS
# =============================================================================
function Show-JugadorDialog {
    param($Jug)
    $d = New-Object System.Windows.Forms.Form
    $d.Text = if ($Jug) { 'Editar jugador' } else { 'Nuevo jugador' }
    $d.Size = New-Object System.Drawing.Size(420, 400)
    $d.StartPosition = 'CenterParent'
    $d.FormBorderStyle = 'FixedDialog'
    $d.MaximizeBox = $false; $d.MinimizeBox = $false
    $d.BackColor = $script:C.Panel
    $d.Font = $script:F.Base

    $d.Controls.Add((New-Lbl 'Dorsal' 20 20 120))
    $tDor = New-Txt '' 20 42 80
    $d.Controls.Add($tDor)
    $d.Controls.Add((New-Lbl 'Nombre y apellidos' 120 20 250))
    $tNom = New-Txt '' 120 42 260
    $d.Controls.Add($tNom)

    $d.Controls.Add((New-Lbl 'Posicion' 20 80 120))
    $cPos = New-Cmb $script:Posiciones 20 102 120
    $d.Controls.Add($cPos)
    $d.Controls.Add((New-Lbl 'Pie habil' 160 80 120))
    $cPie = New-Cmb @('Diestro', 'Zurdo', 'Ambidiestro') 160 102 120
    $d.Controls.Add($cPie)
    $d.Controls.Add((New-Lbl 'Estado' 300 80 90))
    $cEst = New-Cmb @('Disponible', 'Lesionado', 'Sancionado', 'Baja') 300 102 80
    $d.Controls.Add($cEst)

    $d.Controls.Add((New-Lbl 'Fecha de nacimiento' 20 140 180))
    $dtNac = New-Object System.Windows.Forms.DateTimePicker
    $dtNac.Location = New-Object System.Drawing.Point(20, 162)
    $dtNac.Size = New-Object System.Drawing.Size(180, 24)
    $dtNac.Format = [System.Windows.Forms.DateTimePickerFormat]::Short
    $d.Controls.Add($dtNac)
    $d.Controls.Add((New-Lbl 'Telefono / contacto' 220 140 160))
    $tTel = New-Txt '' 220 162 160
    $d.Controls.Add($tTel)

    $d.Controls.Add((New-Lbl 'Notas' 20 200 200))
    $tNot = New-Txt '' 20 222 360 80 $true
    $d.Controls.Add($tNot)

    $cPos.SelectedIndex = 5; $cPie.SelectedIndex = 0; $cEst.SelectedIndex = 0
    $dtNac.Value = (Get-Date).AddYears(-18)

    if ($Jug) {
        $tDor.Text = [string]$Jug.Dorsal
        $tNom.Text = [string]$Jug.Nombre
        if ($script:Posiciones -contains $Jug.Posicion) { $cPos.SelectedItem = $Jug.Posicion }
        if ($Jug.Pie) { $cPie.SelectedItem = $Jug.Pie }
        if ($Jug.Estado) { $cEst.SelectedItem = $Jug.Estado }
        $tTel.Text = [string]$Jug.Telefono
        $tNot.Text = [string]$Jug.Notas
        try { $dtNac.Value = [datetime]::ParseExact($Jug.FechaNac, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } catch { }
    }

    $ok = New-Btn 'Guardar ficha' 220 315 160 32 $script:C.Accent ([System.Drawing.Color]::Black)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $ca = New-Btn 'Cancelar' 120 315 90 32
    $ca.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $d.Controls.Add($ok); $d.Controls.Add($ca)
    $d.AcceptButton = $ok; $d.CancelButton = $ca

    while ($true) {
        $r = $d.ShowDialog()
        if ($r -ne [System.Windows.Forms.DialogResult]::OK) { $d.Dispose(); return $null }
        if ([string]::IsNullOrWhiteSpace($tNom.Text)) {
            Say 'Escribe el nombre del jugador para guardar la ficha.' 'Falta el nombre'
            continue
        }
        break
    }
    $dor = 0
    [int]::TryParse($tDor.Text, [ref]$dor) | Out-Null
    $res = [PSCustomObject]@{
        Id       = if ($Jug) { $Jug.Id } else { New-Id }
        Dorsal   = $dor
        Nombre   = $tNom.Text.Trim()
        Posicion = [string]$cPos.SelectedItem
        Pie      = [string]$cPie.SelectedItem
        Estado   = [string]$cEst.SelectedItem
        FechaNac = $dtNac.Value.ToString('yyyy-MM-dd')
        Telefono = $tTel.Text.Trim()
        Notas    = $tNot.Text
    }
    $d.Dispose()
    return $res
}

function Show-EventoDialog {
    param($Ev, [datetime]$FechaDef = (Get-Date))
    $d = New-Object System.Windows.Forms.Form
    $d.Text = if ($Ev) { 'Editar sesion' } else { 'Nueva sesion' }
    $d.Size = New-Object System.Drawing.Size(430, 400)
    $d.StartPosition = 'CenterParent'
    $d.FormBorderStyle = 'FixedDialog'
    $d.MaximizeBox = $false; $d.MinimizeBox = $false
    $d.BackColor = $script:C.Panel
    $d.Font = $script:F.Base

    $d.Controls.Add((New-Lbl 'Tipo' 20 20 100))
    $cTipo = New-Cmb @('Entrenamiento', 'Partido', 'Amistoso', 'Torneo', 'Reunion') 20 42 150
    $d.Controls.Add($cTipo)
    $d.Controls.Add((New-Lbl 'Fecha' 190 20 90))
    $dtF = New-Object System.Windows.Forms.DateTimePicker
    $dtF.Location = New-Object System.Drawing.Point(190, 42)
    $dtF.Size = New-Object System.Drawing.Size(120, 24)
    $dtF.Format = [System.Windows.Forms.DateTimePickerFormat]::Short
    $d.Controls.Add($dtF)
    $d.Controls.Add((New-Lbl 'Hora' 325 20 60))
    $dtH = New-Object System.Windows.Forms.DateTimePicker
    $dtH.Location = New-Object System.Drawing.Point(325, 42)
    $dtH.Size = New-Object System.Drawing.Size(65, 24)
    $dtH.Format = [System.Windows.Forms.DateTimePickerFormat]::Custom
    $dtH.CustomFormat = 'HH:mm'
    $dtH.ShowUpDown = $true
    $d.Controls.Add($dtH)

    $d.Controls.Add((New-Lbl 'Rival (si es partido)' 20 80 200))
    $tRiv = New-Txt '' 20 102 220
    $d.Controls.Add($tRiv)
    $d.Controls.Add((New-Lbl 'Condicion' 255 80 130))
    $cLoc = New-Cmb @('Local', 'Visitante', 'Campo neutral') 255 102 135
    $d.Controls.Add($cLoc)

    $d.Controls.Add((New-Lbl 'Lugar / instalacion' 20 140 200))
    $tLug = New-Txt '' 20 162 220
    $d.Controls.Add($tLug)
    $d.Controls.Add((New-Lbl 'Competicion' 255 140 130))
    $tCom = New-Txt '' 255 162 135
    $d.Controls.Add($tCom)

    $d.Controls.Add((New-Lbl 'Objetivo de la sesion / notas' 20 200 300))
    $tNot = New-Txt '' 20 222 370 80 $true
    $d.Controls.Add($tNot)

    $cTipo.SelectedIndex = 0; $cLoc.SelectedIndex = 0
    $dtF.Value = $FechaDef
    $dtH.Value = (Get-Date -Hour 19 -Minute 0 -Second 0)

    if ($Ev) {
        if ($cTipo.Items -contains $Ev.Tipo) { $cTipo.SelectedItem = $Ev.Tipo }
        try { $dtF.Value = [datetime]::ParseExact($Ev.Fecha, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } catch { }
        try { $dtH.Value = [datetime]::ParseExact($Ev.Hora, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture) } catch { }
        $tRiv.Text = [string]$Ev.Rival
        if ($cLoc.Items -contains $Ev.Condicion) { $cLoc.SelectedItem = $Ev.Condicion }
        $tLug.Text = [string]$Ev.Lugar
        $tCom.Text = [string]$Ev.Competicion
        $tNot.Text = [string]$Ev.Notas
    }

    $ok = New-Btn 'Guardar sesion' 230 315 160 32 $script:C.Accent ([System.Drawing.Color]::Black)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $ca = New-Btn 'Cancelar' 130 315 90 32
    $ca.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $d.Controls.Add($ok); $d.Controls.Add($ca)
    $d.AcceptButton = $ok; $d.CancelButton = $ca

    if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { $d.Dispose(); return $null }
    $res = [PSCustomObject]@{
        Id          = if ($Ev) { $Ev.Id } else { New-Id }
        Tipo        = [string]$cTipo.SelectedItem
        Fecha       = $dtF.Value.ToString('yyyy-MM-dd')
        Hora        = $dtH.Value.ToString('HH:mm')
        Rival       = $tRiv.Text.Trim()
        Condicion   = [string]$cLoc.SelectedItem
        Lugar       = $tLug.Text.Trim()
        Competicion = $tCom.Text.Trim()
        Notas       = $tNot.Text
    }
    $d.Dispose()
    return $res
}

function Show-SeleccionJugadores {
    param([string]$Titulo, $Preseleccion)
    $d = New-Object System.Windows.Forms.Form
    $d.Text = $Titulo
    $d.Size = New-Object System.Drawing.Size(380, 520)
    $d.StartPosition = 'CenterParent'
    $d.BackColor = $script:C.Panel
    $d.Font = $script:F.Base

    $clb = New-Object System.Windows.Forms.CheckedListBox
    $clb.Location = New-Object System.Drawing.Point(15, 15)
    $clb.Size = New-Object System.Drawing.Size(340, 400)
    $clb.BackColor = $script:C.Panel2
    $clb.ForeColor = $script:C.Text
    $clb.BorderStyle = [System.Windows.Forms.BorderStyle]::FixedSingle
    $clb.CheckOnClick = $true
    $clb.IntegralHeight = $false
    $d.Controls.Add($clb)

    $lista = @($script:Jugadores | Sort-Object { [int]$_.Dorsal })
    foreach ($j in $lista) {
        $marca = ''
        if ($j.Estado -and $j.Estado -ne 'Disponible') { $marca = "  [$($j.Estado)]" }
        [void]$clb.Items.Add(("{0,2}  {1}  ({2}){3}" -f $j.Dorsal, $j.Nombre, $j.Posicion, $marca))
    }
    if ($Preseleccion) {
        for ($i = 0; $i -lt $lista.Count; $i++) {
            if ($Preseleccion -contains $lista[$i].Id) { $clb.SetItemChecked($i, $true) }
        }
    }

    $bTodos = New-Btn 'Marcar todos' 15 425 110 28
    $bTodos.Add_Click({ param($s, $e)
        $lb = $s.Parent.Controls[0]
        for ($i = 0; $i -lt $lb.Items.Count; $i++) { $lb.SetItemChecked($i, $true) }
    })
    $bNada = New-Btn 'Desmarcar' 132 425 100 28
    $bNada.Add_Click({ param($s, $e)
        $lb = $s.Parent.Controls[0]
        for ($i = 0; $i -lt $lb.Items.Count; $i++) { $lb.SetItemChecked($i, $false) }
    })
    $ok = New-Btn 'Aceptar' 240 425 115 28 $script:C.Accent ([System.Drawing.Color]::Black)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $d.Controls.Add($bTodos); $d.Controls.Add($bNada); $d.Controls.Add($ok)
    $d.AcceptButton = $ok

    if ($d.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { $d.Dispose(); return $null }
    $sel = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $lista.Count; $i++) {
        if ($clb.GetItemChecked($i)) { [void]$sel.Add($lista[$i].Id) }
    }
    $d.Dispose()
    return $sel
}

function Show-PickOpcion {
    param([string]$Titulo, [string[]]$Opciones, [string]$Subtitulo = '')
    $d = New-Object System.Windows.Forms.Form
    $d.Text = $Titulo
    $alto = 90 + $Opciones.Count * 42
    $d.Size = New-Object System.Drawing.Size(330, $alto)
    $d.StartPosition = 'CenterParent'
    $d.FormBorderStyle = 'FixedDialog'
    $d.MaximizeBox = $false; $d.MinimizeBox = $false
    $d.BackColor = $script:C.Panel
    $d.Font = $script:F.Base
    $y = 14
    if ($Subtitulo -ne '') {
        $l = New-Lbl $Subtitulo 18 $y 280 $script:F.Small $script:C.Muted
        $d.Controls.Add($l); $y += 26
    }
    foreach ($o in $Opciones) {
        $b = New-Btn $o 18 $y 286 34
        $b.Add_Click({
            param($s, $e)
            $f = $s.FindForm(); $f.Tag = $s.Text
            $f.DialogResult = [System.Windows.Forms.DialogResult]::OK
        })
        $d.Controls.Add($b); $y += 40
    }
    $ca = New-Btn 'Cancelar' 18 ($y + 4) 286 28 $script:C.Panel $script:C.Muted
    $ca.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $d.Controls.Add($ca); $d.CancelButton = $ca
    $d.Height = $y + 78
    $r = $d.ShowDialog()
    $sel = $null
    if ($r -eq [System.Windows.Forms.DialogResult]::OK) { $sel = [string]$d.Tag }
    $d.Dispose()
    return $sel
}

function Show-PickJugador {
    param([string]$Titulo, $Ids, [string]$TextoNinguno = 'Ninguno')
    if (-not $Ids -or @($Ids).Count -eq 0) { return $null }
    $d = New-Object System.Windows.Forms.Form
    $d.Text = $Titulo
    $d.Size = New-Object System.Drawing.Size(340, 430)
    $d.StartPosition = 'CenterParent'
    $d.FormBorderStyle = 'FixedDialog'
    $d.MaximizeBox = $false; $d.MinimizeBox = $false
    $d.BackColor = $script:C.Panel
    $d.Font = $script:F.Base

    $lb = New-Lst 15 15 295 300
    $lb.DisplayMember = 'Texto'
    foreach ($id in @($Ids)) {
        [void]$lb.Items.Add([PSCustomObject]@{ Id = $id; Texto = (Get-NombreJ $id) })
    }
    if ($lb.Items.Count -gt 0) { $lb.SelectedIndex = 0 }
    $d.Controls.Add($lb)

    $ok = New-Btn 'Aceptar' 190 328 120 32 $script:C.Accent ([System.Drawing.Color]::Black)
    $ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $no = New-Btn $TextoNinguno 15 328 165 32
    $no.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $d.Controls.Add($ok); $d.Controls.Add($no)
    $d.AcceptButton = $ok; $d.CancelButton = $no

    $r = $d.ShowDialog()
    $sel = $null
    if ($r -eq [System.Windows.Forms.DialogResult]::OK -and $lb.SelectedItem) { $sel = $lb.SelectedItem.Id }
    $d.Dispose()
    return $sel
}

# =============================================================================
#  7. VENTANA PRINCIPAL
# =============================================================================
$script:Form = New-Object System.Windows.Forms.Form
$script:Form.Text = 'Entrenador Pro  -  cuaderno del entrenador'
$script:Form.Size = New-Object System.Drawing.Size(1320, 860)
$script:Form.MinimumSize = New-Object System.Drawing.Size(1140, 720)
$script:Form.StartPosition = 'CenterScreen'
$script:Form.BackColor = $script:C.Bg
$script:Form.ForeColor = $script:C.Text
$script:Form.Font = $script:F.Base

$script:Tips = New-Object System.Windows.Forms.ToolTip
$script:Tips.AutoPopDelay = 8000

# --- Barra superior -----------------------------------------------------------
$script:Header = New-Object System.Windows.Forms.Panel
$script:Header.Dock = [System.Windows.Forms.DockStyle]::Top
$script:Header.Height = 54
$script:Header.BackColor = $script:C.Panel
$script:Form.Controls.Add($script:Header)

$hTitle = New-Lbl 'ENTRENADOR PRO' 18 8 320 $script:F.H1
$hTitle.Height = 26
$script:Header.Controls.Add($hTitle)
$script:LblSub = New-Lbl '' 20 32 700 $script:F.Small $script:C.Muted
$script:Header.Controls.Add($script:LblSub)

$script:BtnGuardar = New-Btn 'Guardar todo' 0 12 120 30 $script:C.Accent ([System.Drawing.Color]::Black) 'Guarda plantilla, calendario, asistencia, ejercicios y tacticas'
$script:BtnGuardar.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$script:BtnGuardar.Add_Click({ Save-All; $script:LblSub.Text = "Datos guardados a las $(Get-Date -Format 'HH:mm:ss')  -  $script:DataDir" })
$script:Header.Controls.Add($script:BtnGuardar)

$script:BtnCarpeta = New-Btn 'Carpeta de datos' 0 12 130 30 $script:C.Panel2 $script:C.Text 'Abre la carpeta donde se guardan los archivos JSON'
$script:BtnCarpeta.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$script:BtnCarpeta.Add_Click({ Start-Process explorer.exe $script:DataDir })
$script:Header.Controls.Add($script:BtnCarpeta)

$script:BtnAyuda = New-Btn 'Guia rapida' 0 12 100 30 $script:C.Panel2 $script:C.Text
$script:BtnAyuda.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right
$script:BtnAyuda.Add_Click({
    $t = @"
PLANTILLA
  Da de alta a tus jugadores. El % de asistencia se calcula solo.

CALENDARIO
  Crea entrenamientos y partidos. Doble clic en una fila para editarla.

ASISTENCIA
  Elige la sesion, marca el estado de cada jugador y guarda la lista.

PARTIDO
  1. Elige el partido y pulsa 'Convocar'.
  2. Selecciona jugadores del banquillo y pulsa 'Titular' hasta tener 11.
  3. 'Iniciar' arranca el cronometro: los minutos de los que estan en el
     campo suben en tiempo real.
  4. Cambio: marca uno en el campo, otro en el banquillo y pulsa 'Cambio'.
  5. Al anotar un goleador te pregunta como fue el gol (jugada, penalti o
     falta directa) y, si fue de jugada, quien dio la asistencia. Los goles
     rapidos y los del rival tambien piden el tipo.
  6. 'Finalizar' guarda el acta y te deja generarla en PDF (una hoja A4 con
     goles, participacion, disciplina y cronica) o en texto plano.

ENTRENAMIENTOS
  Elige una pieza en la paleta y haz clic en el campo para colocarla.
  Con 'Mover' arrastras piezas; boton derecho borra la pieza.
  Las flechas se dibujan arrastrando desde el origen al destino.

TACTICAS
  22 fichas sobre el campo. Aplica una formacion a cada equipo y arrastra
  libremente para probar movimientos. Exporta la pizarra a PNG.
"@
    Say $t 'Guia rapida'
})
$script:Header.Controls.Add($script:BtnAyuda)

$script:Header.Add_Resize({
    $w = $script:Header.ClientSize.Width
    $script:BtnGuardar.Left = $w - 140
    $script:BtnCarpeta.Left = $w - 280
    $script:BtnAyuda.Left   = $w - 390
})

# --- Pestañas -----------------------------------------------------------------
$script:Tabs = New-Object System.Windows.Forms.TabControl
$script:Tabs.Dock = [System.Windows.Forms.DockStyle]::Fill
$script:Tabs.DrawMode = [System.Windows.Forms.TabDrawMode]::OwnerDrawFixed
$script:Tabs.SizeMode = [System.Windows.Forms.TabSizeMode]::Fixed
$script:Tabs.ItemSize = New-Object System.Drawing.Size(168, 34)
$script:Tabs.Padding = New-Object System.Drawing.Point(0, 0)
$script:Tabs.Font = $script:F.Bold
$script:Tabs.Add_DrawItem({
    param($s, $e)
    $sel = ($e.Index -eq $s.SelectedIndex)
    $bg = if ($sel) { $script:C.Accent } else { $script:C.Panel }
    $fg = if ($sel) { [System.Drawing.Color]::FromArgb(12, 20, 16) } else { $script:C.Muted }
    $br = New-Object System.Drawing.SolidBrush $bg
    $e.Graphics.FillRectangle($br, $e.Bounds); $br.Dispose()
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $tb = New-Object System.Drawing.SolidBrush $fg
    $rf = New-Object System.Drawing.RectangleF ([single]$e.Bounds.X, [single]$e.Bounds.Y,
                                                [single]$e.Bounds.Width, [single]$e.Bounds.Height)
    $e.Graphics.DrawString($s.TabPages[$e.Index].Text, $script:F.Bold, $tb, $rf, $sf)
    $tb.Dispose(); $sf.Dispose()
})
$script:Form.Controls.Add($script:Tabs)
$script:Tabs.BringToFront()

function New-Tab {
    param([string]$Text)
    $tp = New-Object System.Windows.Forms.TabPage
    $tp.Text = $Text
    $tp.BackColor = $script:C.Bg
    $tp.ForeColor = $script:C.Text
    $tp.Padding = New-Object System.Windows.Forms.Padding(0)
    [void]$script:Tabs.TabPages.Add($tp)
    return $tp
}

$script:TabPlantilla = New-Tab 'Plantilla'
$script:TabCalendario = New-Tab 'Calendario'
$script:TabAsistencia = New-Tab 'Asistencia'
$script:TabPartido    = New-Tab 'Partido en vivo'
$script:TabEjercicios = New-Tab 'Entrenamientos'
$script:TabTacticas   = New-Tab 'Tacticas 11 vs 11'

# =============================================================================
#  8. PESTAÑA PLANTILLA
# =============================================================================
$script:GridPlantilla = New-Object System.Windows.Forms.DataGridView
$script:GridPlantilla.Location = New-Object System.Drawing.Point(12, 52)
$script:GridPlantilla.Size = New-Object System.Drawing.Size(900, 640)
$script:GridPlantilla.Anchor = 'Top,Left,Bottom,Right'
Set-GridStyle $script:GridPlantilla
[void]$script:GridPlantilla.Columns.Add('dorsal', 'Dorsal')
[void]$script:GridPlantilla.Columns.Add('nombre', 'Jugador')
[void]$script:GridPlantilla.Columns.Add('pos', 'Pos.')
[void]$script:GridPlantilla.Columns.Add('pie', 'Pie')
[void]$script:GridPlantilla.Columns.Add('edad', 'Edad')
[void]$script:GridPlantilla.Columns.Add('tel', 'Contacto')
[void]$script:GridPlantilla.Columns.Add('asis', 'Asistencia')
[void]$script:GridPlantilla.Columns.Add('estado', 'Estado')
$script:GridPlantilla.Columns['dorsal'].FillWeight = 40
$script:GridPlantilla.Columns['nombre'].FillWeight = 160
$script:GridPlantilla.Columns['pos'].FillWeight = 45
$script:GridPlantilla.Columns['pie'].FillWeight = 60
$script:GridPlantilla.Columns['edad'].FillWeight = 45
$script:GridPlantilla.Columns['asis'].FillWeight = 70
$script:TabPlantilla.Controls.Add($script:GridPlantilla)

$script:TabPlantilla.Controls.Add((New-Lbl 'La plantilla' 12 12 260 $script:F.H2))
$script:LblPlantillaInfo = New-Lbl '' 130 15 500 $script:F.Small $script:C.Muted
$script:TabPlantilla.Controls.Add($script:LblPlantillaInfo)

$panelPl = New-Card 924 52 300 640
$panelPl.Anchor = 'Top,Right,Bottom'
$panelPl.AutoScroll = $true
$script:TabPlantilla.Controls.Add($panelPl)

$bPlNuevo = New-Btn 'Fichar jugador' 20 20 260 34 $script:C.Accent ([System.Drawing.Color]::Black)
$bPlEditar = New-Btn 'Editar ficha' 20 62 260 30
$bPlBorrar = New-Btn 'Dar de baja' 20 100 260 30 $script:C.Panel2 $script:C.Danger
$bPlDemo = New-Btn 'Cargar plantilla de ejemplo' 20 150 260 30
$bPlCsv = New-Btn 'Exportar plantilla a CSV' 20 188 260 30
$bPlClub = New-Btn 'Nombre del equipo' 20 226 260 30 $script:C.Panel2 $script:C.Accent 'Aparece en la cabecera del acta'
$panelPl.Controls.Add($bPlNuevo); $panelPl.Controls.Add($bPlEditar)
$panelPl.Controls.Add($bPlBorrar); $panelPl.Controls.Add($bPlDemo); $panelPl.Controls.Add($bPlCsv)
$panelPl.Controls.Add($bPlClub)
$bPlFicha = New-Btn 'Ver ficha estadistica' 20 268 260 34 $script:C.Blue ([System.Drawing.Color]::White) 'Estadisticas acumuladas del jugador seleccionado'
$panelPl.Controls.Add($bPlFicha)
$panelPl.Controls.Add((New-Lbl 'Resumen' 20 318 260 $script:F.H2))
$script:LblResumen = New-Lbl '' 20 346 260 $script:F.Base $script:C.Muted
$script:LblResumen.Height = 280
$panelPl.Controls.Add($script:LblResumen)

function Update-Plantilla {
    $script:GridPlantilla.Rows.Clear()
    $ordenada = @($script:Jugadores | Sort-Object { [int]$_.Dorsal })
    $totalEntrenos = @($script:Eventos | Where-Object { $_.Tipo -eq 'Entrenamiento' }).Count
    foreach ($j in $ordenada) {
        $edad = ''
        try {
            $fn = [datetime]::ParseExact($j.FechaNac, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
            $edad = [int](((Get-Date) - $fn).Days / 365.25)
        } catch { }
        $pres = 0; $tot = 0
        foreach ($a in $script:Asistencia) {
            foreach ($r in @($a.Registros)) {
                if ($r.JugadorId -eq $j.Id) {
                    $tot++
                    if ($r.Estado -eq 'Presente' -or $r.Estado -eq 'Tarde') { $pres++ }
                }
            }
        }
        $asis = if ($tot -gt 0) { '{0}%  ({1}/{2})' -f ([int](100 * $pres / $tot)), $pres, $tot } else { '-' }
        $i = $script:GridPlantilla.Rows.Add($j.Dorsal, $j.Nombre, $j.Posicion, $j.Pie, $edad, $j.Telefono, $asis, $j.Estado)
        $script:GridPlantilla.Rows[$i].Tag = $j.Id
        if ($j.Estado -eq 'Lesionado') { $script:GridPlantilla.Rows[$i].Cells['estado'].Style.ForeColor = $script:C.Danger }
        elseif ($j.Estado -eq 'Sancionado') { $script:GridPlantilla.Rows[$i].Cells['estado'].Style.ForeColor = $script:C.Warn }
    }
    $script:LblPlantillaInfo.Text = "$($script:Jugadores.Count) jugadores  |  $totalEntrenos entrenamientos registrados"

    $porPos = @{}
    foreach ($j in $script:Jugadores) {
        $k = [string]$j.Posicion
        if (-not $porPos.ContainsKey($k)) { $porPos[$k] = 0 }
        $porPos[$k]++
    }
    $lineas = New-Object System.Collections.ArrayList
    [void]$lineas.Add("Efectivos: $($script:Jugadores.Count)")
    $lesion = @($script:Jugadores | Where-Object { $_.Estado -eq 'Lesionado' }).Count
    $sanc = @($script:Jugadores | Where-Object { $_.Estado -eq 'Sancionado' }).Count
    [void]$lineas.Add("Lesionados: $lesion    Sancionados: $sanc")
    [void]$lineas.Add('')
    [void]$lineas.Add('Por demarcacion:')
    foreach ($k in ($porPos.Keys | Sort-Object)) { [void]$lineas.Add("   $k : $($porPos[$k])") }
    [void]$lineas.Add('')
    $prox = @(Get-EventosOrdenados | Where-Object { (Get-FechaEvento $_) -ge (Get-Date).Date } | Select-Object -First 4)
    [void]$lineas.Add('Proximas citas:')
    if ($prox.Count -eq 0) { [void]$lineas.Add('   Sin sesiones programadas') }
    foreach ($e in $prox) {
        $et = if ($e.Rival) { "$($e.Tipo) vs $($e.Rival)" } else { $e.Tipo }
        [void]$lineas.Add("   $($e.Fecha) $($e.Hora)  $et")
    }
    $script:LblResumen.Text = ($lineas -join [Environment]::NewLine)
}

function Get-JugadorSeleccionado {
    if ($script:GridPlantilla.SelectedRows.Count -eq 0) { return $null }
    return Get-Jugador $script:GridPlantilla.SelectedRows[0].Tag
}

$bPlNuevo.Add_Click({
    $j = Show-JugadorDialog $null
    if ($j) { [void]$script:Jugadores.Add($j); Save-All; Update-Plantilla; Update-Asistencia }
})
$bPlEditar.Add_Click({
    $sel = Get-JugadorSeleccionado
    if (-not $sel) { Say 'Selecciona antes un jugador de la lista.' 'Sin seleccion'; return }
    $j = Show-JugadorDialog $sel
    if ($j) {
        for ($i = 0; $i -lt $script:Jugadores.Count; $i++) {
            if ($script:Jugadores[$i].Id -eq $j.Id) { $script:Jugadores[$i] = $j; break }
        }
        Save-All; Update-Plantilla; Update-Asistencia
    }
})
$bPlBorrar.Add_Click({
    $sel = Get-JugadorSeleccionado
    if (-not $sel) { Say 'Selecciona antes un jugador de la lista.' 'Sin seleccion'; return }
    if (Ask-Yes "Se borrara la ficha de $($sel.Nombre) y su historial de asistencia. Continuar?" 'Dar de baja') {
        $script:Jugadores.Remove($sel)
        Save-All; Update-Plantilla; Update-Asistencia
    }
})
$script:GridPlantilla.Add_CellDoubleClick({ $bPlEditar.PerformClick() })

$bPlDemo.Add_Click({
    if ($script:Jugadores.Count -gt 0) {
        if (-not (Ask-Yes 'Ya hay jugadores en la plantilla. Añadir de todos modos los 18 de ejemplo?' 'Plantilla de ejemplo')) { return }
    }
    $demo = @(
        @(1, 'Alvaro Ruiz', 'POR'), @(13, 'Nico Serra', 'POR'),
        @(2, 'Hugo Marin', 'LTD'), @(3, 'Pablo Cuesta', 'LTI'), @(4, 'Ivan Solano', 'DFC'),
        @(5, 'Marc Delgado', 'DFC'), @(12, 'Adria Bosch', 'DFC'), @(15, 'Leo Ferrer', 'LTI'),
        @(6, 'Dani Arana', 'MCD'), @(8, 'Sergio Pinto', 'MC'), @(14, 'Aitor Vega', 'MC'),
        @(10, 'Bruno Salas', 'MCO'), @(16, 'Jon Etxeberria', 'MCD'),
        @(7, 'Erik Navas', 'ED'), @(11, 'Samuel Lago', 'EI'), @(17, 'Diego Peral', 'EI'),
        @(9, 'Tomas Quiroga', 'DC'), @(19, 'Raul Mendez', 'DC')
    )
    foreach ($d in $demo) {
        [void]$script:Jugadores.Add([PSCustomObject]@{
            Id = New-Id; Dorsal = $d[0]; Nombre = $d[1]; Posicion = $d[2]
            Pie = 'Diestro'; Estado = 'Disponible'
            FechaNac = (Get-Date).AddYears(-(18 + ($d[0] % 8))).ToString('yyyy-MM-dd')
            Telefono = ''; Notas = ''
        })
    }
    Save-All; Update-Plantilla; Update-Asistencia
})

$bPlFicha.Add_Click({
    $sel = Get-JugadorSeleccionado
    if (-not $sel) { Say 'Selecciona un jugador de la lista para ver su ficha.' 'Sin seleccion'; return }
    Show-FichaJugador $sel.Id
})

$bPlClub.Add_Click({
    $n = Ask-Text 'Nombre de tu equipo (aparece en la cabecera del acta)' 'Mi equipo' $script:Club
    if (-not [string]::IsNullOrWhiteSpace($n)) {
        $script:Club = $n.Trim(); Save-All
        $script:LblSub.Text = "Equipo: $script:Club"
    }
})

$bPlCsv.Add_Click({
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = 'CSV (*.csv)|*.csv'
    $sfd.FileName = 'plantilla.csv'
    if ($sfd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        @($script:Jugadores) | Select-Object Dorsal, Nombre, Posicion, Pie, Estado, FechaNac, Telefono, Notas |
            Export-Csv -Path $sfd.FileName -NoTypeInformation -Encoding UTF8 -Delimiter ';'
        Say "Plantilla exportada a:`n$($sfd.FileName)" 'Exportar'
    }
})

# =============================================================================
#  9. PESTAÑA CALENDARIO
# =============================================================================
$script:TabCalendario.Controls.Add((New-Lbl 'Calendario de la temporada' 12 12 400 $script:F.H2))

$panelCal = New-Card 12 52 320 640
$panelCal.Anchor = 'Top,Left,Bottom'
$panelCal.AutoScroll = $true
$script:TabCalendario.Controls.Add($panelCal)

$script:Cal = New-Object System.Windows.Forms.MonthCalendar
$script:Cal.Location = New-Object System.Drawing.Point(18, 16)
$script:Cal.MaxSelectionCount = 1
$script:Cal.FirstDayOfWeek = [System.Windows.Forms.Day]::Monday
$script:Cal.TitleBackColor = $script:C.Panel2
$script:Cal.TitleForeColor = $script:C.Text
$script:Cal.BackColor = $script:C.Panel2
$script:Cal.ForeColor = $script:C.Text
$script:Cal.TrailingForeColor = $script:C.Muted
$panelCal.Controls.Add($script:Cal)

$bCalNuevo = New-Btn 'Programar sesion' 18 200 270 34 $script:C.Accent ([System.Drawing.Color]::Black)
$bCalEditar = New-Btn 'Editar sesion' 18 242 270 30
$bCalBorrar = New-Btn 'Eliminar sesion' 18 280 270 30 $script:C.Panel2 $script:C.Danger
$panelCal.Controls.Add($bCalNuevo); $panelCal.Controls.Add($bCalEditar); $panelCal.Controls.Add($bCalBorrar)

$panelCal.Controls.Add((New-Lbl 'Ver' 18 330 60))
$script:CmbFiltro = New-Cmb @('Proximas', 'Todas', 'Solo entrenamientos', 'Solo partidos', 'Dia seleccionado') 18 352 270
$script:CmbFiltro.SelectedIndex = 0
$panelCal.Controls.Add($script:CmbFiltro)

$panelCal.Controls.Add((New-Lbl 'Detalle de la sesion' 18 396 270 $script:F.H2))
$script:LblDetalleEv = New-Lbl '' 18 424 270 $script:F.Base $script:C.Muted
$script:LblDetalleEv.Height = 200
$panelCal.Controls.Add($script:LblDetalleEv)

$script:GridEventos = New-Object System.Windows.Forms.DataGridView
$script:GridEventos.Location = New-Object System.Drawing.Point(344, 52)
$script:GridEventos.Size = New-Object System.Drawing.Size(880, 640)
$script:GridEventos.Anchor = 'Top,Left,Bottom,Right'
Set-GridStyle $script:GridEventos
[void]$script:GridEventos.Columns.Add('fecha', 'Fecha')
[void]$script:GridEventos.Columns.Add('hora', 'Hora')
[void]$script:GridEventos.Columns.Add('tipo', 'Tipo')
[void]$script:GridEventos.Columns.Add('rival', 'Rival')
[void]$script:GridEventos.Columns.Add('cond', 'Condicion')
[void]$script:GridEventos.Columns.Add('lugar', 'Lugar')
[void]$script:GridEventos.Columns.Add('comp', 'Competicion')
[void]$script:GridEventos.Columns.Add('asis', 'Lista')
$script:GridEventos.Columns['fecha'].FillWeight = 75
$script:GridEventos.Columns['hora'].FillWeight = 45
$script:GridEventos.Columns['tipo'].FillWeight = 85
$script:GridEventos.Columns['asis'].FillWeight = 60
$script:TabCalendario.Controls.Add($script:GridEventos)

function Update-Calendario {
    $script:GridEventos.Rows.Clear()
    $todos = Get-EventosOrdenados
    $filtro = [string]$script:CmbFiltro.SelectedItem
    $hoy = (Get-Date).Date
    switch ($filtro) {
        'Proximas'            { $lista = @($todos | Where-Object { (Get-FechaEvento $_).Date -ge $hoy }) }
        'Solo entrenamientos' { $lista = @($todos | Where-Object { $_.Tipo -eq 'Entrenamiento' }) }
        'Solo partidos'       { $lista = @($todos | Where-Object { $_.Tipo -eq 'Partido' -or $_.Tipo -eq 'Amistoso' -or $_.Tipo -eq 'Torneo' }) }
        'Dia seleccionado'    { $d = $script:Cal.SelectionStart.ToString('yyyy-MM-dd'); $lista = @($todos | Where-Object { $_.Fecha -eq $d }) }
        default               { $lista = $todos }
    }
    foreach ($e in $lista) {
        $tieneLista = 'No'
        foreach ($a in $script:Asistencia) { if ($a.EventoId -eq $e.Id) { $tieneLista = 'Si'; break } }
        $i = $script:GridEventos.Rows.Add($e.Fecha, $e.Hora, $e.Tipo, $e.Rival, $e.Condicion, $e.Lugar, $e.Competicion, $tieneLista)
        $script:GridEventos.Rows[$i].Tag = $e.Id
        if ($e.Tipo -ne 'Entrenamiento') { $script:GridEventos.Rows[$i].Cells['tipo'].Style.ForeColor = $script:C.Warn }
        if ((Get-FechaEvento $e).Date -eq $hoy) { $script:GridEventos.Rows[$i].Cells['fecha'].Style.ForeColor = $script:C.Accent }
    }
    $fechas = New-Object System.Collections.ArrayList
    foreach ($e in $script:Eventos) {
        try { [void]$fechas.Add([datetime]::ParseExact($e.Fecha, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)) } catch { }
    }
    $script:Cal.BoldedDates = [datetime[]]@($fechas)
    $script:Cal.UpdateBoldedDates()
}

function Get-EventoSeleccionado {
    if ($script:GridEventos.SelectedRows.Count -eq 0) { return $null }
    return Get-Evento $script:GridEventos.SelectedRows[0].Tag
}

$script:GridEventos.Add_SelectionChanged({
    $e = Get-EventoSeleccionado
    if (-not $e) { $script:LblDetalleEv.Text = ''; return }
    $txt = "$($e.Tipo)" + [Environment]::NewLine
    $txt += "$($e.Fecha)  a las $($e.Hora)" + [Environment]::NewLine
    if ($e.Rival) { $txt += "Rival: $($e.Rival) ($($e.Condicion))" + [Environment]::NewLine }
    if ($e.Lugar) { $txt += "Lugar: $($e.Lugar)" + [Environment]::NewLine }
    if ($e.Competicion) { $txt += "Competicion: $($e.Competicion)" + [Environment]::NewLine }
    if ($e.Notas) { $txt += [Environment]::NewLine + $e.Notas }
    $script:LblDetalleEv.Text = $txt
})

$bCalNuevo.Add_Click({
    $e = Show-EventoDialog $null $script:Cal.SelectionStart
    if ($e) { [void]$script:Eventos.Add($e); Save-All; Update-Calendario; Update-ComboSesiones; Update-ComboPartidos; Update-Plantilla }
})
$bCalEditar.Add_Click({
    $sel = Get-EventoSeleccionado
    if (-not $sel) { Say 'Selecciona una sesion en la lista.' 'Sin seleccion'; return }
    $e = Show-EventoDialog $sel
    if ($e) {
        for ($i = 0; $i -lt $script:Eventos.Count; $i++) {
            if ($script:Eventos[$i].Id -eq $e.Id) { $script:Eventos[$i] = $e; break }
        }
        Save-All; Update-Calendario; Update-ComboSesiones; Update-ComboPartidos
    }
})
$bCalBorrar.Add_Click({
    $sel = Get-EventoSeleccionado
    if (-not $sel) { Say 'Selecciona una sesion en la lista.' 'Sin seleccion'; return }
    if (Ask-Yes 'Se eliminara la sesion y su lista de asistencia. Continuar?' 'Eliminar sesion') {
        $script:Eventos.Remove($sel)
        $borrar = @($script:Asistencia | Where-Object { $_.EventoId -eq $sel.Id })
        foreach ($a in $borrar) { $script:Asistencia.Remove($a) }
        Save-All; Update-Calendario; Update-ComboSesiones; Update-ComboPartidos; Update-Plantilla
    }
})
$script:GridEventos.Add_CellDoubleClick({ $bCalEditar.PerformClick() })
$script:CmbFiltro.Add_SelectedIndexChanged({ Update-Calendario })
$script:Cal.Add_DateChanged({ if ($script:CmbFiltro.SelectedItem -eq 'Dia seleccionado') { Update-Calendario } })
$script:Cal.Add_DoubleClick({ $bCalNuevo.PerformClick() })

# =============================================================================
#  10. PESTAÑA ASISTENCIA
# =============================================================================
$script:TabAsistencia.Controls.Add((New-Lbl 'Pasar lista' 12 12 200 $script:F.H2))
$script:TabAsistencia.Controls.Add((New-Lbl 'Sesion' 12 48 60))
$script:CmbSesion = New-Cmb @() 60 44 420
$script:TabAsistencia.Controls.Add($script:CmbSesion)

$bAsTodos = New-Btn 'Todos presentes' 496 44 130 26 $script:C.Panel2 $script:C.Accent
$bAsGuardar = New-Btn 'Guardar lista' 636 44 130 26 $script:C.Accent ([System.Drawing.Color]::Black)
$script:TabAsistencia.Controls.Add($bAsTodos); $script:TabAsistencia.Controls.Add($bAsGuardar)

$script:GridAsis = New-Object System.Windows.Forms.DataGridView
$script:GridAsis.Location = New-Object System.Drawing.Point(12, 82)
$script:GridAsis.Size = New-Object System.Drawing.Size(760, 610)
$script:GridAsis.Anchor = 'Top,Left,Bottom,Right'
Set-GridStyle $script:GridAsis
$script:GridAsis.ReadOnly = $false
$script:GridAsis.EditMode = [System.Windows.Forms.DataGridViewEditMode]::EditOnEnter
[void]$script:GridAsis.Columns.Add('dorsal', 'Dorsal')
[void]$script:GridAsis.Columns.Add('nombre', 'Jugador')
$colEstado = New-Object System.Windows.Forms.DataGridViewComboBoxColumn
$colEstado.Name = 'estado'; $colEstado.HeaderText = 'Estado'
$colEstado.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
foreach ($s in $script:EstadosAsis) { [void]$colEstado.Items.Add($s) }
[void]$script:GridAsis.Columns.Add($colEstado)
[void]$script:GridAsis.Columns.Add('nota', 'Observacion')
$script:GridAsis.Columns['dorsal'].ReadOnly = $true
$script:GridAsis.Columns['nombre'].ReadOnly = $true
$script:GridAsis.Columns['dorsal'].FillWeight = 40
$script:GridAsis.Columns['nombre'].FillWeight = 150
$script:GridAsis.Columns['estado'].FillWeight = 90
$script:GridAsis.Columns['nota'].FillWeight = 160
$script:TabAsistencia.Controls.Add($script:GridAsis)

$panelStats = New-Card 784 82 440 610
$panelStats.Anchor = 'Top,Right,Bottom'
$script:TabAsistencia.Controls.Add($panelStats)
$panelStats.Controls.Add((New-Lbl 'Quien viene a entrenar' 16 12 300 $script:F.H2))
$script:GridStats = New-Object System.Windows.Forms.DataGridView
$script:GridStats.Location = New-Object System.Drawing.Point(16, 44)
$script:GridStats.Size = New-Object System.Drawing.Size(408, 548)
$script:GridStats.Anchor = 'Top,Left,Bottom,Right'
Set-GridStyle $script:GridStats
[void]$script:GridStats.Columns.Add('nombre', 'Jugador')
[void]$script:GridStats.Columns.Add('ses', 'Sesiones')
[void]$script:GridStats.Columns.Add('pres', 'Presente')
[void]$script:GridStats.Columns.Add('pct', '%')
$script:GridStats.Columns['nombre'].FillWeight = 150
$panelStats.Controls.Add($script:GridStats)

function Update-ComboSesiones {
    $sel = $null
    if ($script:CmbSesion.SelectedItem) { $sel = $script:CmbSesion.SelectedItem.Id }
    $script:CmbSesion.Items.Clear()
    $script:CmbSesion.DisplayMember = 'Texto'
    $lista = @(Get-EventosOrdenados)
    [array]::Reverse($lista)
    foreach ($e in $lista) {
        $extra = if ($e.Rival) { " vs $($e.Rival)" } else { '' }
        [void]$script:CmbSesion.Items.Add([PSCustomObject]@{
            Id = $e.Id; Texto = "$($e.Fecha) $($e.Hora)  -  $($e.Tipo)$extra"
        })
    }
    if ($script:CmbSesion.Items.Count -gt 0) {
        $idx = 0
        if ($sel) {
            for ($i = 0; $i -lt $script:CmbSesion.Items.Count; $i++) {
                if ($script:CmbSesion.Items[$i].Id -eq $sel) { $idx = $i; break }
            }
        }
        $script:CmbSesion.SelectedIndex = $idx
    }
}

function Update-Asistencia {
    $script:GridAsis.Rows.Clear()
    if (-not $script:CmbSesion.SelectedItem) { Update-StatsAsistencia; return }
    $evId = $script:CmbSesion.SelectedItem.Id
    $reg = $null
    foreach ($a in $script:Asistencia) { if ($a.EventoId -eq $evId) { $reg = $a; break } }
    foreach ($j in @($script:Jugadores | Sort-Object { [int]$_.Dorsal })) {
        $estado = 'Presente'; $nota = ''
        if ($j.Estado -eq 'Lesionado') { $estado = 'Lesionado' }
        if ($reg) {
            foreach ($r in @($reg.Registros)) {
                if ($r.JugadorId -eq $j.Id) { $estado = $r.Estado; $nota = $r.Nota; break }
            }
        }
        $i = $script:GridAsis.Rows.Add($j.Dorsal, $j.Nombre, $estado, $nota)
        $script:GridAsis.Rows[$i].Tag = $j.Id
    }
    Update-StatsAsistencia
}

function Update-StatsAsistencia {
    $script:GridStats.Rows.Clear()
    $filas = @()
    foreach ($j in $script:Jugadores) {
        $tot = 0; $pres = 0
        foreach ($a in $script:Asistencia) {
            foreach ($r in @($a.Registros)) {
                if ($r.JugadorId -eq $j.Id) {
                    $tot++
                    if ($r.Estado -eq 'Presente' -or $r.Estado -eq 'Tarde') { $pres++ }
                }
            }
        }
        $pct = if ($tot -gt 0) { [int](100 * $pres / $tot) } else { 0 }
        $filas += [PSCustomObject]@{ Nombre = $j.Nombre; Tot = $tot; Pres = $pres; Pct = $pct }
    }
    foreach ($f in ($filas | Sort-Object -Property Pct -Descending)) {
        $txt = if ($f.Tot -gt 0) { "$($f.Pct)%" } else { '-' }
        $i = $script:GridStats.Rows.Add($f.Nombre, $f.Tot, $f.Pres, $txt)
        if ($f.Tot -gt 0) {
            if ($f.Pct -ge 85) { $script:GridStats.Rows[$i].Cells['pct'].Style.ForeColor = $script:C.Accent }
            elseif ($f.Pct -lt 60) { $script:GridStats.Rows[$i].Cells['pct'].Style.ForeColor = $script:C.Danger }
        }
    }
}

$script:CmbSesion.Add_SelectedIndexChanged({ Update-Asistencia })

$bAsTodos.Add_Click({
    foreach ($row in $script:GridAsis.Rows) { $row.Cells['estado'].Value = 'Presente' }
})

$bAsGuardar.Add_Click({
    if (-not $script:CmbSesion.SelectedItem) { Say 'Programa antes una sesion en el calendario.' 'Sin sesion'; return }
    $script:GridAsis.EndEdit() | Out-Null
    $evId = $script:CmbSesion.SelectedItem.Id
    $regs = New-Object System.Collections.ArrayList
    foreach ($row in $script:GridAsis.Rows) {
        $est = [string]$row.Cells['estado'].Value
        if ([string]::IsNullOrWhiteSpace($est)) { $est = 'Presente' }
        [void]$regs.Add([PSCustomObject]@{
            JugadorId = [string]$row.Tag
            Estado    = $est
            Nota      = [string]$row.Cells['nota'].Value
        })
    }
    $viejo = $null
    foreach ($a in $script:Asistencia) { if ($a.EventoId -eq $evId) { $viejo = $a; break } }
    if ($viejo) { $script:Asistencia.Remove($viejo) }
    [void]$script:Asistencia.Add([PSCustomObject]@{
        EventoId = $evId
        Guardado = (Get-Date).ToString('yyyy-MM-dd HH:mm')
        Registros = @($regs)
    })
    Save-All
    Update-StatsAsistencia; Update-Plantilla; Update-Calendario
    $script:LblSub.Text = 'Lista de asistencia guardada.'
})

# =============================================================================
#  11. PESTAÑA PARTIDO EN VIVO
# =============================================================================
$script:Match = $null
$script:PeriodoNombres = @('1a parte', '2a parte', 'Prorroga 1', 'Prorroga 2')
$script:PeriodoBase = @(0, 2700, 5400, 6300)

$script:TabPartido.Controls.Add((New-Lbl 'Partido' 12 12 90 $script:F.H2))
$script:CmbPartido = New-Cmb @() 80 10 380
$script:TabPartido.Controls.Add($script:CmbPartido)
$bPtConvocar = New-Btn 'Convocar' 470 8 100 28 $script:C.Blue ([System.Drawing.Color]::White) 'Elige los jugadores citados para este partido'
$bPtCargar = New-Btn 'Reanudar acta' 578 8 110 28 $script:C.Panel2 $script:C.Text 'Recupera el acta guardada de este partido'
$bPtPdf = New-Btn 'Acta en PDF' 696 8 110 28 $script:C.Panel2 $script:C.Accent 'Genera el acta en PDF del partido seleccionado'
$script:TabPartido.Controls.Add($bPtConvocar); $script:TabPartido.Controls.Add($bPtCargar)
$script:TabPartido.Controls.Add($bPtPdf)

# --- Marcador y cronometro ---
$script:PanelCrono = New-Card 12 46 300 250
$script:TabPartido.Controls.Add($script:PanelCrono)

$script:LblCrono = New-Lbl '00:00' 0 14 300 $script:F.Clock $script:C.Accent
$script:LblCrono.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$script:LblCrono.Height = 48
$script:PanelCrono.Controls.Add($script:LblCrono)

$script:LblPeriodo = New-Lbl '1a parte  -  detenido' 0 62 300 $script:F.Small $script:C.Muted
$script:LblPeriodo.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$script:PanelCrono.Controls.Add($script:LblPeriodo)

$script:LblMarcador = New-Lbl '0 - 0' 0 86 300 $script:F.Score $script:C.Text
$script:LblMarcador.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$script:LblMarcador.Height = 34
$script:PanelCrono.Controls.Add($script:LblMarcador)

$script:BtnCrono = New-Btn 'Iniciar' 16 128 130 36 $script:C.Accent ([System.Drawing.Color]::Black)
$bPeriodo = New-Btn 'Siguiente parte' 154 128 130 36
$script:PanelCrono.Controls.Add($script:BtnCrono); $script:PanelCrono.Controls.Add($bPeriodo)

$bGolF = New-Btn 'Gol a favor' 16 172 130 32 $script:C.Panel2 $script:C.Accent
$bGolC = New-Btn 'Gol en contra' 154 172 130 32 $script:C.Panel2 $script:C.Danger
$script:PanelCrono.Controls.Add($bGolF); $script:PanelCrono.Controls.Add($bGolC)

$bFinalizar = New-Btn 'Finalizar y guardar acta' 16 210 268 30 $script:C.Panel2 $script:C.Warn
$script:PanelCrono.Controls.Add($bFinalizar)

# --- Campo / banquillo ---
$script:PanelCampo = New-Card 12 306 300 386
$script:PanelCampo.Anchor = 'Top,Left,Bottom'
$script:TabPartido.Controls.Add($script:PanelCampo)
$script:LblEnCampo = New-Lbl 'En el campo (0/11)' 14 10 200 $script:F.H2
$script:PanelCampo.Controls.Add($script:LblEnCampo)
$script:LstCampo = New-Lst 14 38 272 150
$script:LstCampo.Anchor = 'Top,Left,Right'
$script:PanelCampo.Controls.Add($script:LstCampo)
$script:LblBanquillo = New-Lbl 'Banquillo (0)' 14 196 200 $script:F.H2
$script:PanelCampo.Controls.Add($script:LblBanquillo)
$script:LstBanquillo = New-Lst 14 224 272 150
$script:LstBanquillo.Anchor = 'Top,Left,Right,Bottom'
$script:PanelCampo.Controls.Add($script:LstBanquillo)

$script:PanelAcciones = New-Card 324 46 210 646
$script:PanelAcciones.Anchor = 'Top,Left,Bottom'
$script:TabPartido.Controls.Add($script:PanelAcciones)
$script:PanelAcciones.Controls.Add((New-Lbl 'Acciones' 16 12 180 $script:F.H2))
$bTitular = New-Btn 'Subir al once  >' 16 46 178 32 $script:C.Panel2 $script:C.Accent 'Pasa al once inicial al jugador marcado en el banquillo'
$bBajar   = New-Btn '<  Volver al banquillo' 16 84 178 30
$bCambio  = New-Btn 'Hacer cambio' 16 128 178 40 $script:C.Blue ([System.Drawing.Color]::White) 'Marca uno en el campo y otro en el banquillo'
$bAmarilla = New-Btn 'Tarjeta amarilla' 16 180 178 32 $script:C.Warn ([System.Drawing.Color]::Black)
$bRoja = New-Btn 'Tarjeta roja' 16 218 178 32 $script:C.Danger ([System.Drawing.Color]::White)
$bGolJug = New-Btn 'Anotar goleador' 16 260 178 30
$bAsist = New-Btn 'Anotar asistencia' 16 298 178 30 $script:C.Panel2 $script:C.Blue 'Suma una asistencia al jugador marcado'
$bFalta = New-Btn 'Anotar falta cometida' 16 336 178 30
$bNota = New-Btn 'Anotar incidencia' 16 374 178 30
$script:PanelAcciones.Controls.Add($bTitular); $script:PanelAcciones.Controls.Add($bBajar)
$script:PanelAcciones.Controls.Add($bCambio); $script:PanelAcciones.Controls.Add($bAmarilla)
$script:PanelAcciones.Controls.Add($bRoja); $script:PanelAcciones.Controls.Add($bGolJug)
$script:PanelAcciones.Controls.Add($bAsist); $script:PanelAcciones.Controls.Add($bFalta)
$script:PanelAcciones.Controls.Add($bNota)
$script:PanelAcciones.Controls.Add((New-Lbl 'Resumen' 16 418 180 $script:F.H2))
$script:LblResumenPartido = New-Lbl '' 16 446 180 $script:F.Base $script:C.Muted
$script:LblResumenPartido.Height = 200
$script:PanelAcciones.Controls.Add($script:LblResumenPartido)

$script:BtnVistaDirecto = New-Btn 'El partido en directo' 546 46 190 28 $script:C.Accent ([System.Drawing.Color]::Black)
$script:BtnVistaMinutos = New-Btn 'Minutos por jugador' 744 46 190 28 $script:C.Panel2 $script:C.Text
$script:TabPartido.Controls.Add($script:BtnVistaDirecto)
$script:TabPartido.Controls.Add($script:BtnVistaMinutos)

$script:PanelDirecto = New-Object System.Windows.Forms.Panel
$script:PanelDirecto.Location = New-Object System.Drawing.Point(546, 82)
$script:PanelDirecto.Size = New-Object System.Drawing.Size(678, 610)
$script:PanelDirecto.Anchor = 'Top,Left,Bottom,Right'
$script:PanelDirecto.BackColor = $script:C.Bg
$script:PanelDirecto.AutoScroll = $true
$script:TabPartido.Controls.Add($script:PanelDirecto)

$script:Timeline = New-Object System.Windows.Forms.Panel
$script:Timeline.Location = New-Object System.Drawing.Point(0, 0)
$script:Timeline.Size = New-Object System.Drawing.Size(660, 600)
$script:Timeline.BackColor = $script:C.Bg
Set-DoubleBuffer $script:Timeline
$script:PanelDirecto.Controls.Add($script:Timeline)

$script:GridMinutos = New-Object System.Windows.Forms.DataGridView
$script:GridMinutos.Location = New-Object System.Drawing.Point(546, 82)
$script:GridMinutos.Size = New-Object System.Drawing.Size(678, 610)
$script:GridMinutos.Anchor = 'Top,Left,Bottom,Right'
$script:GridMinutos.Visible = $false
Set-GridStyle $script:GridMinutos
[void]$script:GridMinutos.Columns.Add('dorsal', 'Dor.')
[void]$script:GridMinutos.Columns.Add('nombre', 'Jugador')
[void]$script:GridMinutos.Columns.Add('estado', 'Situacion')
[void]$script:GridMinutos.Columns.Add('min', 'Minutos')
[void]$script:GridMinutos.Columns.Add('goles', 'Goles')
[void]$script:GridMinutos.Columns.Add('asis', 'Asis')
[void]$script:GridMinutos.Columns.Add('faltas', 'Faltas')
[void]$script:GridMinutos.Columns.Add('ta', 'TA')
[void]$script:GridMinutos.Columns.Add('tr', 'TR')
$script:GridMinutos.Columns['dorsal'].FillWeight = 35
$script:GridMinutos.Columns['nombre'].FillWeight = 150
$script:GridMinutos.Columns['estado'].FillWeight = 80
$script:GridMinutos.Columns['min'].FillWeight = 55
$script:GridMinutos.Columns['goles'].FillWeight = 40
$script:GridMinutos.Columns['asis'].FillWeight = 40
$script:GridMinutos.Columns['faltas'].FillWeight = 45
$script:GridMinutos.Columns['ta'].FillWeight = 30
$script:GridMinutos.Columns['tr'].FillWeight = 30
$script:TabPartido.Controls.Add($script:GridMinutos)

$script:Timer = New-Object System.Windows.Forms.Timer
$script:Timer.Interval = 1000

# ---------- linea de tiempo ----------
function New-RoundRect {
    param([double]$X, [double]$Y, [double]$W, [double]$H, [double]$R)
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    if ($W -lt 2 * $R -or $H -lt 2 * $R) { $R = [math]::Max(1, [math]::Min($W, $H) / 2) }
    $d = 2 * $R
    $p.AddArc($X, $Y, $d, $d, 180, 90)
    $p.AddArc(($X + $W - $d), $Y, $d, $d, 270, 90)
    $p.AddArc(($X + $W - $d), ($Y + $H - $d), $d, $d, 0, 90)
    $p.AddArc($X, ($Y + $H - $d), $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

function Draw-EvIcon {
    param($G, [string]$Tipo, [double]$CX, [double]$CY)
    switch ($Tipo) {
        { $_ -eq 'Gol' -or $_ -eq 'GolContra' } {
            $anillo = if ($Tipo -eq 'Gol') { $script:C.Accent } else { $script:C.Danger }
            $pa = New-Object System.Drawing.Pen $anillo, 2
            $G.DrawEllipse($pa, ($CX - 11), ($CY - 11), 22, 22); $pa.Dispose()
            $wb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
            $G.FillEllipse($wb, ($CX - 7), ($CY - 7), 14, 14); $wb.Dispose()
            $db = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 28, 36))
            $G.FillEllipse($db, ($CX - 2.5), ($CY - 2.5), 5, 5)
            $G.FillEllipse($db, ($CX - 6), ($CY + 1), 3, 3)
            $G.FillEllipse($db, ($CX + 3), ($CY + 1), 3, 3)
            $G.FillEllipse($db, ($CX - 1), ($CY - 6.5), 3, 3)
            $db.Dispose()
        }
        'Amarilla' {
            $b = New-Object System.Drawing.SolidBrush $script:C.Warn
            $path = New-RoundRect ($CX - 6) ($CY - 9) 12 18 2
            $G.FillPath($b, $path); $b.Dispose(); $path.Dispose()
        }
        'Roja' {
            $b = New-Object System.Drawing.SolidBrush $script:C.Danger
            $path = New-RoundRect ($CX - 6) ($CY - 9) 12 18 2
            $G.FillPath($b, $path); $b.Dispose(); $path.Dispose()
        }
        'DobleAmarilla' {
            $b1 = New-Object System.Drawing.SolidBrush $script:C.Warn
            $p1 = New-RoundRect ($CX - 10) ($CY - 9) 12 18 2
            $G.FillPath($b1, $p1); $b1.Dispose(); $p1.Dispose()
            $b2 = New-Object System.Drawing.SolidBrush $script:C.Danger
            $p2 = New-RoundRect ($CX - 1) ($CY - 7) 12 18 2
            $G.FillPath($b2, $p2); $b2.Dispose(); $p2.Dispose()
        }
        'Cambio' {
            $pv = New-Object System.Drawing.Pen $script:C.Accent, 2
            $pr = New-Object System.Drawing.Pen $script:C.Danger, 2
            $G.DrawLine($pv, ($CX - 6), ($CY + 8), ($CX - 6), ($CY - 4))
            $G.DrawLine($pr, ($CX + 6), ($CY - 8), ($CX + 6), ($CY + 4))
            $bv = New-Object System.Drawing.SolidBrush $script:C.Accent
            $br = New-Object System.Drawing.SolidBrush $script:C.Danger
            $t1 = New-Object 'System.Drawing.PointF[]' 3
            $t1[0] = New-Object System.Drawing.PointF ([single]($CX - 6), [single]($CY - 9))
            $t1[1] = New-Object System.Drawing.PointF ([single]($CX - 11), [single]($CY - 3))
            $t1[2] = New-Object System.Drawing.PointF ([single]($CX - 1), [single]($CY - 3))
            $G.FillPolygon($bv, $t1)
            $t2 = New-Object 'System.Drawing.PointF[]' 3
            $t2[0] = New-Object System.Drawing.PointF ([single]($CX + 6), [single]($CY + 9))
            $t2[1] = New-Object System.Drawing.PointF ([single]($CX + 1), [single]($CY + 3))
            $t2[2] = New-Object System.Drawing.PointF ([single]($CX + 11), [single]($CY + 3))
            $G.FillPolygon($br, $t2)
            $pv.Dispose(); $pr.Dispose(); $bv.Dispose(); $br.Dispose()
        }
        'Asistencia' {
            $b = New-Object System.Drawing.SolidBrush $script:C.Blue
            $G.FillEllipse($b, ($CX - 10), ($CY - 10), 20, 20); $b.Dispose()
            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
            $tb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
            $r = New-Object System.Drawing.RectangleF ([single]($CX - 10), [single]($CY - 10), 20, 20)
            $G.DrawString('A', $script:F.Mini, $tb, $r, $sf)
            $tb.Dispose(); $sf.Dispose()
        }
        'Falta' {
            $b = New-Object System.Drawing.SolidBrush $script:C.Panel2
            $G.FillEllipse($b, ($CX - 10), ($CY - 10), 20, 20); $b.Dispose()
            $pl = New-Object System.Drawing.Pen $script:C.Line, 1
            $G.DrawEllipse($pl, ($CX - 10), ($CY - 10), 20, 20); $pl.Dispose()
            $sf = New-Object System.Drawing.StringFormat
            $sf.Alignment = [System.Drawing.StringAlignment]::Center
            $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
            $tb = New-Object System.Drawing.SolidBrush $script:C.Muted
            $r = New-Object System.Drawing.RectangleF ([single]($CX - 10), [single]($CY - 10), 20, 20)
            $G.DrawString('F', $script:F.Mini, $tb, $r, $sf)
            $tb.Dispose(); $sf.Dispose()
        }
        default {
            $p = New-Object System.Drawing.Pen $script:C.Muted, 2
            $path = New-RoundRect ($CX - 8) ($CY - 9) 16 18 3
            $G.DrawPath($p, $path); $path.Dispose()
            $G.DrawLine($p, ($CX - 4), ($CY - 3), ($CX + 4), ($CY - 3))
            $G.DrawLine($p, ($CX - 4), ($CY + 2), ($CX + 2), ($CY + 2))
            $p.Dispose()
        }
    }
}

function Get-EvAlto {
    param($E)
    if ($E.Tipo -eq 'Periodo') { return 42 }
    if (-not [string]::IsNullOrWhiteSpace($E.Sub)) { return 64 }
    return 50
}

function Draw-EvFila {
    param($G, $E, [int]$CX, [int]$Y, [int]$H, [int]$W)
    $sfL = New-Object System.Drawing.StringFormat
    $sfL.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sfR = New-Object System.Drawing.StringFormat
    $sfR.Alignment = [System.Drawing.StringAlignment]::Far
    $sfR.LineAlignment = [System.Drawing.StringAlignment]::Center
    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center
    $sfC.LineAlignment = [System.Drawing.StringAlignment]::Center
    $brText = New-Object System.Drawing.SolidBrush $script:C.Text
    $brMute = New-Object System.Drawing.SolidBrush $script:C.Muted
    $mid = $Y + $H / 2

    if ($E.Tipo -eq 'Periodo') {
        $txt = "$($E.Titulo)"
        $sz = $G.MeasureString($txt, $script:F.Base)
        $w = [math]::Min($W - 40, $sz.Width + 34)
        $x = $CX - $w / 2
        $path = New-RoundRect $x ($mid - 14) $w 28 14
        $b = New-Object System.Drawing.SolidBrush $script:C.Panel2
        $G.FillPath($b, $path); $b.Dispose(); $path.Dispose()
        $r = New-Object System.Drawing.RectangleF ([single]$x, [single]($mid - 14), [single]$w, 28)
        $G.DrawString($txt, $script:F.Base, $brMute, $r, $sfC)
        $brText.Dispose(); $brMute.Dispose(); $sfL.Dispose(); $sfR.Dispose(); $sfC.Dispose()
        return
    }

    $gutter = 34
    $cardW = $CX - $gutter - 10
    if ($cardW -lt 90) { $cardW = 90 }
    $izquierda = ($E.Lado -ne 'B')
    if ($izquierda) { $x = $CX - $gutter - $cardW } else { $x = $CX + $gutter }

    $path = New-RoundRect $x ($Y + 5) $cardW ($H - 12) 9
    $b = New-Object System.Drawing.SolidBrush $script:C.Panel
    $G.FillPath($b, $path); $b.Dispose()
    $pen = New-Object System.Drawing.Pen $script:C.Line, 1
    $G.DrawPath($pen, $path); $pen.Dispose(); $path.Dispose()

    if ($izquierda) {
        $iconX = $x + $cardW - 24
        $txtRect = New-Object System.Drawing.RectangleF ([single]($x + 12), [single]($Y + 5), [single]($cardW - 48), [single]($H - 12))
        $sf = $sfR
    } else {
        $iconX = $x + 24
        $txtRect = New-Object System.Drawing.RectangleF ([single]($x + 48), [single]($Y + 5), [single]($cardW - 60), [single]($H - 12))
        $sf = $sfL
    }
    Draw-EvIcon $G $E.Tipo $iconX $mid

    if ([string]::IsNullOrWhiteSpace($E.Sub)) {
        $G.DrawString($E.Titulo, $script:F.Bold, $brText, $txtRect, $sf)
    } else {
        $r1 = New-Object System.Drawing.RectangleF ($txtRect.X, [single]($txtRect.Y + 8), $txtRect.Width, 20)
        $r2 = New-Object System.Drawing.RectangleF ($txtRect.X, [single]($txtRect.Y + 27), $txtRect.Width, 20)
        $G.DrawString($E.Titulo, $script:F.Bold, $brText, $r1, $sf)
        $G.DrawString($E.Sub, $script:F.Small, $brMute, $r2, $sf)
    }

    # minuto sobre la linea central
    $mt = "$($E.Min)'"
    $msz = $G.MeasureString($mt, $script:F.Bold)
    $bg = New-Object System.Drawing.SolidBrush $script:C.Bg
    $G.FillRectangle($bg, [single]($CX - $msz.Width / 2 - 5), [single]($mid - 11), [single]($msz.Width + 10), 22)
    $bg.Dispose()
    $mr = New-Object System.Drawing.RectangleF ([single]($CX - 30), [single]($mid - 11), 60, 22)
    $G.DrawString($mt, $script:F.Bold, $brText, $mr, $sfC)

    $brText.Dispose(); $brMute.Dispose(); $sfL.Dispose(); $sfR.Dispose(); $sfC.Dispose()
}

$script:Timeline.Add_Paint({
    param($s, $e)
    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $g.Clear($script:C.Bg)
    $W = $s.ClientSize.Width
    if ($W -lt 120) { return }
    $sfC = New-Object System.Drawing.StringFormat
    $sfC.Alignment = [System.Drawing.StringAlignment]::Center

    if (-not $script:Match -or $script:Match.Eventos.Count -eq 0) {
        $br = New-Object System.Drawing.SolidBrush $script:C.Muted
        $txt = if ($script:Match) {
            "Aqui veras el partido en directo.`r`nGoles, tarjetas y cambios se iran apilando`r`ncon su minuto en cuanto los anotes."
        } else {
            "Convoca a los jugadores para empezar."
        }
        $r = New-Object System.Drawing.RectangleF (10, 40, [single]($W - 20), 140)
        $g.DrawString($txt, $script:F.Base, $br, $r, $sfC)
        $br.Dispose(); $sfC.Dispose()
        return
    }
    $sfC.Dispose()

    $cx = [int]($W * 0.5)
    $y = 12
    $total = 12
    foreach ($ev in $script:Match.Eventos) { $total += (Get-EvAlto $ev) }
    $pen = New-Object System.Drawing.Pen $script:C.Line, 2
    $g.DrawLine($pen, $cx, 6, $cx, [math]::Max(20, $total))
    $pen.Dispose()
    foreach ($ev in $script:Match.Eventos) {
        $alto = Get-EvAlto $ev
        Draw-EvFila $g $ev $cx $y $alto $W
        $y += $alto
    }
})

function Update-Timeline {
    if (-not $script:Timeline) { return }
    $ancho = $script:PanelDirecto.ClientSize.Width - 4
    if ($ancho -lt 200) { $ancho = 200 }
    $alto = 24
    if ($script:Match) { foreach ($ev in $script:Match.Eventos) { $alto += (Get-EvAlto $ev) } }
    $minAlto = $script:PanelDirecto.ClientSize.Height - 2
    if ($alto -lt $minAlto) { $alto = $minAlto }
    $script:Timeline.Size = New-Object System.Drawing.Size($ancho, $alto)
    $script:PanelDirecto.AutoScrollPosition = New-Object System.Drawing.Point(0, 0)
    $script:Timeline.Invalidate()
}

$script:PanelDirecto.Add_Resize({ Update-Timeline })

function Update-ResumenPartido {
    if (-not $script:Match) { $script:LblResumenPartido.Text = ''; return }
    $m = $script:Match
    $cambios = @($m.Eventos | Where-Object { $_.Tipo -eq 'Cambio' }).Count
    $ta = 0; $tr = 0
    foreach ($id in @($m.Convocados)) { $ta += [int]$m.TA[$id]; $tr += [int]$m.TR[$id] }
    $pen = @($m.Lista | Where-Object { $_.Tipo -match 'penalti' }).Count
    $l = New-Object System.Collections.ArrayList
    [void]$l.Add("Marcador   $($m.GolesF) - $($m.GolesC)")
    if ($pen -gt 0) { [void]$l.Add("De penalti   $pen") }
    [void]$l.Add("Cambios     $cambios")
    [void]$l.Add("Amarillas   $ta")
    [void]$l.Add("Rojas       $tr")
    $faltas = 0
    foreach ($id in @($m.Convocados)) { $faltas += [int]$m.Faltas[$id] }
    [void]$l.Add("Faltas      $faltas")
    [void]$l.Add('')
    [void]$l.Add("Convocados  $($m.Convocados.Count)")
    [void]$l.Add("En el campo $($m.Campo.Count)")
    $script:LblResumenPartido.Text = ($l -join [Environment]::NewLine)
}

function Update-ComboPartidos {
    $sel = $null
    if ($script:CmbPartido.SelectedItem) { $sel = $script:CmbPartido.SelectedItem.Id }
    $script:CmbPartido.Items.Clear()
    $script:CmbPartido.DisplayMember = 'Texto'
    $lista = @(Get-EventosOrdenados | Where-Object { $_.Tipo -ne 'Entrenamiento' -and $_.Tipo -ne 'Reunion' })
    [array]::Reverse($lista)
    foreach ($e in $lista) {
        $riv = if ($e.Rival) { $e.Rival } else { 'sin rival' }
        [void]$script:CmbPartido.Items.Add([PSCustomObject]@{
            Id = $e.Id; Texto = "$($e.Fecha)  vs $riv  ($($e.Condicion))"
        })
    }
    if ($script:CmbPartido.Items.Count -gt 0) {
        $idx = 0
        if ($sel) {
            for ($i = 0; $i -lt $script:CmbPartido.Items.Count; $i++) {
                if ($script:CmbPartido.Items[$i].Id -eq $sel) { $idx = $i; break }
            }
        }
        $script:CmbPartido.SelectedIndex = $idx
    }
}

function Get-MatchMinuto {
    if (-not $script:Match) { return 0 }
    $tot = $script:PeriodoBase[$script:Match.Periodo] + $script:Match.Seg
    return [int]([math]::Floor($tot / 60)) + 1
}

function Add-MatchEvento {
    param([string]$Texto, [string]$Tipo = 'Nota', [string]$Lado = 'A', [string]$Sub = '')
    if (-not $script:Match) { return }
    $min = Get-MatchMinuto
    $linea = "{0,3}'  {1}" -f $min, $Texto
    [void]$script:Match.Cronica.Add($linea)
    [void]$script:Match.Eventos.Insert(0, [PSCustomObject]@{
        Min = $min; Tipo = $Tipo; Lado = $Lado; Titulo = $Texto; Sub = $Sub
    })
    Update-Timeline
    Update-ResumenPartido
}

function Add-Cronica {
    param([string]$Texto)
    if (-not $script:Match) { return }
    [void]$script:Match.Cronica.Add(("{0,3}'  {1}" -f (Get-MatchMinuto), $Texto))
}

function Get-NombreJ { param([string]$Id)
    $j = Get-Jugador $Id
    if ($j) { return "$($j.Dorsal) $($j.Nombre)" }
    return '?'
}

function Update-ListasPartido {
    $selC = $null; $selB = $null
    if ($script:LstCampo.SelectedItem) { $selC = $script:LstCampo.SelectedItem.Id }
    if ($script:LstBanquillo.SelectedItem) { $selB = $script:LstBanquillo.SelectedItem.Id }
    $script:LstCampo.BeginUpdate(); $script:LstBanquillo.BeginUpdate()
    $script:LstCampo.Items.Clear()
    $script:LstBanquillo.Items.Clear()
    $script:LstCampo.DisplayMember = 'Texto'
    $script:LstBanquillo.DisplayMember = 'Texto'
    if (-not $script:Match) {
        $script:LstCampo.EndUpdate(); $script:LstBanquillo.EndUpdate()
        $script:LblEnCampo.Text = 'En el campo (0/11)'
        $script:LblBanquillo.Text = 'Banquillo (0)'
        return
    }
    foreach ($id in @($script:Match.Campo)) {
        $seg = [int]$script:Match.Tiempos[$id]
        [void]$script:LstCampo.Items.Add([PSCustomObject]@{
            Id = $id; Texto = ("{0}   {1}'" -f (Get-NombreJ $id), [int]([math]::Floor($seg / 60)))
        })
    }
    foreach ($id in @($script:Match.Banquillo)) {
        [void]$script:LstBanquillo.Items.Add([PSCustomObject]@{ Id = $id; Texto = (Get-NombreJ $id) })
    }
    for ($i = 0; $i -lt $script:LstCampo.Items.Count; $i++) {
        if ($script:LstCampo.Items[$i].Id -eq $selC) { $script:LstCampo.SelectedIndex = $i; break }
    }
    for ($i = 0; $i -lt $script:LstBanquillo.Items.Count; $i++) {
        if ($script:LstBanquillo.Items[$i].Id -eq $selB) { $script:LstBanquillo.SelectedIndex = $i; break }
    }
    $script:LstCampo.EndUpdate(); $script:LstBanquillo.EndUpdate()
    $script:LblEnCampo.Text = "En el campo ($($script:Match.Campo.Count)/11)"
    $script:LblBanquillo.Text = "Banquillo ($($script:Match.Banquillo.Count))"
}

function Update-GridMinutos {
    if (-not $script:Match) { $script:GridMinutos.Rows.Clear(); return }
    $selId = $null; $scroll = 0
    if ($script:GridMinutos.SelectedRows.Count -gt 0) { $selId = $script:GridMinutos.SelectedRows[0].Tag }
    if ($script:GridMinutos.Rows.Count -gt 0 -and $script:GridMinutos.FirstDisplayedScrollingRowIndex -ge 0) {
        $scroll = $script:GridMinutos.FirstDisplayedScrollingRowIndex
    }
    $script:GridMinutos.SuspendLayout()
    $script:GridMinutos.Rows.Clear()
    foreach ($id in @($script:Match.Convocados)) {
        $j = Get-Jugador $id
        if (-not $j) { continue }
        $seg = [int]$script:Match.Tiempos[$id]
        $est = [string]$script:Match.Estados[$id]
        $i = $script:GridMinutos.Rows.Add($j.Dorsal, $j.Nombre, $est,
            ("{0}'  ({1})" -f [int]([math]::Floor($seg / 60)), (Format-MMSS $seg)),
            [int]$script:Match.Goles[$id], [int]$script:Match.Asis[$id],
            [int]$script:Match.Faltas[$id],
            [int]$script:Match.TA[$id], [int]$script:Match.TR[$id])
        $script:GridMinutos.Rows[$i].Tag = $id
        switch ($est) {
            'En el campo' { $script:GridMinutos.Rows[$i].Cells['estado'].Style.ForeColor = $script:C.Accent }
            'Expulsado'   { $script:GridMinutos.Rows[$i].Cells['estado'].Style.ForeColor = $script:C.Danger }
            'Sustituido'  { $script:GridMinutos.Rows[$i].Cells['estado'].Style.ForeColor = $script:C.Muted }
        }
    }
    if ($selId) {
        foreach ($row in $script:GridMinutos.Rows) {
            if ($row.Tag -eq $selId) { $row.Selected = $true; break }
        }
    }
    if ($scroll -gt 0 -and $scroll -lt $script:GridMinutos.Rows.Count) {
        try { $script:GridMinutos.FirstDisplayedScrollingRowIndex = $scroll } catch { }
    }
    $script:GridMinutos.ResumeLayout()
}

function Update-Marcador {
    if (-not $script:Match) { $script:LblMarcador.Text = '0 - 0'; return }
    $script:LblMarcador.Text = "$($script:Match.GolesF) - $($script:Match.GolesC)"
}

function New-Match {
    param([string]$EventoId, $Convocados)
    $t = @{}; $est = @{}; $ta = @{}; $tr = @{}; $gol = @{}; $asi = @{}; $fal = @{}
    foreach ($id in $Convocados) { $t[$id] = 0; $est[$id] = 'Banquillo'; $ta[$id] = 0; $tr[$id] = 0; $gol[$id] = 0; $asi[$id] = 0; $fal[$id] = 0 }
    $script:Match = @{
        EventoId   = $EventoId
        Convocados = [System.Collections.ArrayList]@($Convocados)
        Campo      = New-Object System.Collections.ArrayList
        Banquillo  = [System.Collections.ArrayList]@($Convocados)
        Tiempos    = $t
        Estados    = $est
        TA         = $ta
        TR         = $tr
        Goles      = $gol
        Asis       = $asi
        Faltas     = $fal
        Cronica    = New-Object System.Collections.ArrayList
        Eventos    = New-Object System.Collections.ArrayList
        Lista      = New-Object System.Collections.ArrayList
        Titulares  = New-Object System.Collections.ArrayList
        GolesF     = 0
        GolesC     = 0
        Periodo    = 0
        Seg        = 0
        Corriendo  = $false
        Iniciado   = $false
    }
    $script:LblCrono.Text = '00:00'
    $script:LblPeriodo.Text = '1a parte  -  detenido'
    $script:BtnCrono.Text = 'Iniciar'
    Update-ListasPartido; Update-GridMinutos; Update-Marcador
    Update-Timeline; Update-ResumenPartido
}

function Get-SelCampo {
    if ($script:LstCampo.SelectedItem) { return $script:LstCampo.SelectedItem.Id }
    return $null
}
function Get-SelBanquillo {
    if ($script:LstBanquillo.SelectedItem) { return $script:LstBanquillo.SelectedItem.Id }
    return $null
}

$bPtConvocar.Add_Click({
    if (-not $script:CmbPartido.SelectedItem) { Say 'Programa antes un partido en el calendario.' 'Sin partido'; return }
    $pre = $null
    if ($script:Match) { $pre = @($script:Match.Convocados) }
    $sel = Show-SeleccionJugadores 'Convocatoria' $pre
    if ($null -eq $sel) { return }
    if ($sel.Count -eq 0) { Say 'No has marcado ningun jugador.' 'Convocatoria'; return }
    New-Match $script:CmbPartido.SelectedItem.Id @($sel)
    $script:LblSub.Text = "Convocatoria lista: $($sel.Count) jugadores citados."
})

$bTitular.Add_Click({
    if (-not $script:Match) { Say 'Primero convoca a los jugadores.' 'Sin convocatoria'; return }
    $id = Get-SelBanquillo
    if (-not $id) { Say 'Marca un jugador del banquillo.' 'Sin seleccion'; return }
    if ($script:Match.Campo.Count -ge 11) { Say 'Ya tienes 11 jugadores en el campo. Usa "Hacer cambio".' 'Once completo'; return }
    if ($script:Match.Iniciado) { Say 'El partido ya ha empezado: usa "Hacer cambio" para dar entrada a un jugador.' 'Partido en juego'; return }
    $script:Match.Banquillo.Remove($id)
    [void]$script:Match.Campo.Add($id)
    $script:Match.Estados[$id] = 'En el campo'
    Update-ListasPartido; Update-GridMinutos
})

$bBajar.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { Say 'Marca un jugador del campo.' 'Sin seleccion'; return }
    if ($script:Match.Iniciado) { Say 'Con el partido en marcha usa "Hacer cambio".' 'Partido en juego'; return }
    $script:Match.Campo.Remove($id)
    [void]$script:Match.Banquillo.Add($id)
    $script:Match.Estados[$id] = 'Banquillo'
    Update-ListasPartido; Update-GridMinutos
})

$bCambio.Add_Click({
    if (-not $script:Match) { Say 'Primero convoca a los jugadores.' 'Sin convocatoria'; return }
    $sale = Get-SelCampo
    $entra = Get-SelBanquillo
    if (-not $sale -or -not $entra) { Say 'Marca quien sale (campo) y quien entra (banquillo).' 'Cambio'; return }
    $script:Match.Campo.Remove($sale)
    $script:Match.Banquillo.Remove($entra)
    [void]$script:Match.Campo.Add($entra)
    [void]$script:Match.Banquillo.Add($sale)
    $script:Match.Estados[$sale] = 'Sustituido'
    $script:Match.Estados[$entra] = 'En el campo'
    Add-MatchEvento ("Entra {0}" -f (Get-NombreJ $entra)) 'Cambio' 'A' ("Sale {0}" -f (Get-NombreJ $sale))
    Update-ListasPartido; Update-GridMinutos
})

$bAmarilla.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { $id = Get-SelBanquillo }
    if (-not $id) { Say 'Marca al jugador amonestado.' 'Tarjeta'; return }
    $script:Match.TA[$id] = [int]$script:Match.TA[$id] + 1
    $tipoTA = if ([int]$script:Match.TA[$id] -ge 2) { 'DobleAmarilla' } else { 'Amarilla' }
    $subTA = if ([int]$script:Match.TA[$id] -ge 2) { 'Segunda amonestacion' } else { 'Amonestacion' }
    Add-MatchEvento ("Amarilla para {0}" -f (Get-NombreJ $id)) $tipoTA 'A' $subTA
    if ([int]$script:Match.TA[$id] -ge 2 -and [int]$script:Match.TR[$id] -eq 0) {
        if (Ask-Yes "$(Get-NombreJ $id) acumula dos amarillas. Registrar la expulsion?" 'Doble amarilla') {
            $bRoja.PerformClick(); return
        }
    }
    Update-GridMinutos
})

$bRoja.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { $id = Get-SelBanquillo }
    if (-not $id) { Say 'Marca al jugador expulsado.' 'Tarjeta'; return }
    $script:Match.TR[$id] = 1
    $script:Match.Estados[$id] = 'Expulsado'
    if ($script:Match.Campo -contains $id) { $script:Match.Campo.Remove($id) }
    if ($script:Match.Banquillo -contains $id) { $script:Match.Banquillo.Remove($id) }
    Add-MatchEvento ("Roja a {0}" -f (Get-NombreJ $id)) 'Roja' 'A' ("Nos quedamos con {0}" -f $script:Match.Campo.Count)
    Update-ListasPartido; Update-GridMinutos
})

function Add-Gol {
    param([string]$Eq, [string]$JugId, [string]$Tipo)
    if (-not $script:Match) { return }
    [void]$script:Match.Lista.Add([PSCustomObject]@{
        Min   = Get-MatchMinuto
        Eq    = $Eq
        JugId = $JugId
        Jug   = if ($JugId) { Get-NombreJ $JugId } else { '' }
        Asis  = ''
        Tipo  = $Tipo
    })
}

$bGolJug.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { Say 'Marca al goleador en la lista del campo.' 'Gol'; return }
    $tipo = Show-PickOpcion 'Como fue el gol' @('De jugada', 'De penalti', 'Falta directa', 'Corner') (Get-NombreJ $id)
    if (-not $tipo) { return }
    $tipo = $tipo -replace '^De ', ''
    $tipo = $tipo.Substring(0,1).ToUpper() + $tipo.Substring(1)
    $script:Match.Goles[$id] = [int]$script:Match.Goles[$id] + 1
    $script:Match.GolesF++
    Add-Gol 'A' $id $tipo
    Add-MatchEvento ("Gol de {0}" -f (Get-NombreJ $id)) 'Gol' 'A' ("De {0}" -f $tipo.ToLower())
    Update-Marcador; Update-GridMinutos
    if ($tipo -eq 'jugada' -or $tipo -eq 'corner') {
        $otros = @(@($script:Match.Campo) | Where-Object { $_ -ne $id })
        if ($otros.Count -gt 0) {
            $asis = Show-PickJugador 'Quien dio la asistencia' $otros 'Gol sin asistencia'
            if ($asis) {
                $script:Match.Asis[$asis] = [int]$script:Match.Asis[$asis] + 1
                $ultimo = $script:Match.Lista[$script:Match.Lista.Count - 1]
                $ultimo.Asis = Get-NombreJ $asis
                Add-Cronica ("Asistencia de {0}" -f (Get-NombreJ $asis))
                $evGol = @($script:Match.Eventos | Where-Object { $_.Tipo -eq 'Gol' })[0]
                if ($evGol) { $evGol.Sub = "$($evGol.Sub), asistencia de $(Get-NombreJ $asis)" }
                Update-Timeline
                Update-GridMinutos
            }
        }
    }
})

$bFalta.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { $id = Get-SelBanquillo }
    if (-not $id) { Say 'Marca al jugador que ha cometido la falta.' 'Falta'; return }
    $script:Match.Faltas[$id] = [int]$script:Match.Faltas[$id] + 1
    Add-MatchEvento ("Falta de {0}" -f (Get-NombreJ $id)) 'Falta' 'A' ("Van {0} en el partido" -f $script:Match.Faltas[$id])
})

$bAsist.Add_Click({
    if (-not $script:Match) { return }
    $id = Get-SelCampo
    if (-not $id) { $id = Get-SelBanquillo }
    if (-not $id) { Say 'Marca al jugador que dio la asistencia.' 'Asistencia'; return }
    $script:Match.Asis[$id] = [int]$script:Match.Asis[$id] + 1
    Add-MatchEvento ("Asistencia de {0}" -f (Get-NombreJ $id)) 'Asistencia' 'A' 'Pase de gol'
    Update-GridMinutos
})

$bGolF.Add_Click({
    if (-not $script:Match) { Say 'Primero convoca a los jugadores.' 'Sin partido'; return }
    $tipo = Show-PickOpcion 'Gol a favor' @('De jugada', 'De penalti', 'Falta directa', 'Corner', 'En propia del rival') 'Sin anotar goleador'
    if (-not $tipo) { return }
    $tipo = $tipo -replace '^De ', ''
    $tipo = $tipo.Substring(0,1).ToUpper() + $tipo.Substring(1)
    $script:Match.GolesF++
    Add-Gol 'A' '' $tipo
    Add-MatchEvento 'Gol a favor' 'Gol' 'A' ("De {0}" -f $tipo.ToLower())
    Update-Marcador
})
$bGolC.Add_Click({
    if (-not $script:Match) { Say 'Primero convoca a los jugadores.' 'Sin partido'; return }
    $tipo = Show-PickOpcion 'Gol del rival' @('De jugada', 'De penalti', 'Falta directa', 'Corner', 'En propia puerta nuestra')
    if (-not $tipo) { return }
    $tipo = $tipo -replace '^De ', ''
    $tipo = $tipo.Substring(0,1).ToUpper() + $tipo.Substring(1)
    $script:Match.GolesC++
    Add-Gol 'B' '' $tipo
    Add-MatchEvento 'Gol del rival' 'GolContra' 'B' ("De {0}" -f $tipo.ToLower())
    Update-Marcador
})

$bNota.Add_Click({
    if (-not $script:Match) { return }
    $t = Ask-Text 'Describe la incidencia (lesion, ocasion, ajuste tactico...)' 'Anotar incidencia'
    if (-not [string]::IsNullOrWhiteSpace($t)) { Add-MatchEvento $t 'Nota' 'A' }
})

$script:BtnCrono.Add_Click({
    if (-not $script:Match) { Say 'Primero convoca a los jugadores del partido.' 'Sin convocatoria'; return }
    if ($script:Match.Corriendo) {
        $script:Timer.Stop()
        $script:Match.Corriendo = $false
        $script:BtnCrono.Text = 'Reanudar'
        $script:BtnCrono.BackColor = $script:C.Accent
        $script:LblPeriodo.Text = "$($script:PeriodoNombres[$script:Match.Periodo])  -  pausado"
        Add-MatchEvento 'Reloj parado' 'Periodo' 'C'
    } else {
        if ($script:Match.Campo.Count -lt 11) {
            if (-not (Ask-Yes "Solo hay $($script:Match.Campo.Count) jugadores en el campo. Empezar igualmente?" 'Once incompleto')) { return }
        }
        if (-not $script:Match.Iniciado) {
            $script:Match.Iniciado = $true
            $script:Match.Titulares = [System.Collections.ArrayList]@($script:Match.Campo)
            Add-Cronica ('Once inicial: ' + (@($script:Match.Campo | ForEach-Object { Get-NombreJ $_ }) -join ', '))
            Add-MatchEvento 'Comienza el partido' 'Periodo' 'C'
        } else {
            Add-MatchEvento 'Se reanuda el juego' 'Periodo' 'C'
        }
        $script:Timer.Start()
        $script:Match.Corriendo = $true
        $script:BtnCrono.Text = 'Pausar'
        $script:BtnCrono.BackColor = $script:C.Warn
        $script:LblPeriodo.Text = "$($script:PeriodoNombres[$script:Match.Periodo])  -  en juego"
    }
})

$bPeriodo.Add_Click({
    if (-not $script:Match) { return }
    if ($script:Match.Periodo -ge 3) { Say 'Ya estas en el ultimo periodo disponible.' 'Periodos'; return }
    $script:Timer.Stop()
    $script:Match.Corriendo = $false
    Add-MatchEvento ("Fin de {0}" -f $script:PeriodoNombres[$script:Match.Periodo]) 'Periodo' 'C'
    $script:Match.Periodo++
    $script:Match.Seg = 0
    $script:BtnCrono.Text = 'Iniciar'
    $script:BtnCrono.BackColor = $script:C.Accent
    $script:LblPeriodo.Text = "$($script:PeriodoNombres[$script:Match.Periodo])  -  detenido"
    $script:LblCrono.Text = Format-MMSS $script:PeriodoBase[$script:Match.Periodo]
})

$script:BtnVistaDirecto.Add_Click({
    $script:PanelDirecto.Visible = $true
    $script:GridMinutos.Visible = $false
    $script:BtnVistaDirecto.BackColor = $script:C.Accent
    $script:BtnVistaDirecto.ForeColor = [System.Drawing.Color]::Black
    $script:BtnVistaMinutos.BackColor = $script:C.Panel2
    $script:BtnVistaMinutos.ForeColor = $script:C.Text
    Update-Timeline
})
$script:BtnVistaMinutos.Add_Click({
    $script:PanelDirecto.Visible = $false
    $script:GridMinutos.Visible = $true
    $script:BtnVistaMinutos.BackColor = $script:C.Accent
    $script:BtnVistaMinutos.ForeColor = [System.Drawing.Color]::Black
    $script:BtnVistaDirecto.BackColor = $script:C.Panel2
    $script:BtnVistaDirecto.ForeColor = $script:C.Text
    Update-GridMinutos
})

$script:Timer.Add_Tick({
    if (-not $script:Match) { return }
    $script:Match.Seg++
    foreach ($id in @($script:Match.Campo)) {
        $script:Match.Tiempos[$id] = [int]$script:Match.Tiempos[$id] + 1
    }
    $tot = $script:PeriodoBase[$script:Match.Periodo] + $script:Match.Seg
    $script:LblCrono.Text = Format-MMSS $tot
    if (($script:Match.Seg % 5) -eq 0) { Update-ListasPartido; Update-GridMinutos }
})

$bFinalizar.Add_Click({
    if (-not $script:Match) { return }
    if (-not (Ask-Yes 'Se cierra el acta del partido y se guarda. Continuar?' 'Finalizar')) { return }
    $script:Timer.Stop()
    $script:Match.Corriendo = $false
    $script:BtnCrono.Text = 'Iniciar'
    $script:BtnCrono.BackColor = $script:C.Accent
    Add-MatchEvento 'Final del partido' 'Periodo' 'C'

    $ev = Get-Evento $script:Match.EventoId
    $filas = New-Object System.Collections.ArrayList
    foreach ($id in @($script:Match.Convocados)) {
        $j = Get-Jugador $id
        if (-not $j) { continue }
        [void]$filas.Add([PSCustomObject]@{
            JugadorId = $id
            Dorsal    = $j.Dorsal
            Nombre    = $j.Nombre
            Posicion  = $j.Posicion
            Minutos   = [int]([math]::Floor([int]$script:Match.Tiempos[$id] / 60))
            Segundos  = [int]$script:Match.Tiempos[$id]
            Estado    = [string]$script:Match.Estados[$id]
            Goles     = [int]$script:Match.Goles[$id]
            Asis      = [int]$script:Match.Asis[$id]
            Faltas    = [int]$script:Match.Faltas[$id]
            TA        = [int]$script:Match.TA[$id]
            TR        = [int]$script:Match.TR[$id]
        })
    }
    $acta = [PSCustomObject]@{
        Id        = New-Id
        EventoId  = $script:Match.EventoId
        Fecha     = if ($ev) { $ev.Fecha } else { (Get-Date).ToString('yyyy-MM-dd') }
        Rival     = if ($ev) { $ev.Rival } else { '' }
        GolesF    = $script:Match.GolesF
        GolesC    = $script:Match.GolesC
        Cronica   = @($script:Match.Cronica)
        Eventos   = @($script:Match.Eventos)
        Goles     = @($script:Match.Lista)
        Titulares = @($script:Match.Titulares)
        Jugadores = @($filas)
    }
    $viejas = @($script:Partidos | Where-Object { $_.EventoId -eq $acta.EventoId })
    foreach ($v in $viejas) { $script:Partidos.Remove($v) }
    [void]$script:Partidos.Add($acta)
    Save-All

    $res = "ACTA DEL PARTIDO`r`n"
    $res += "Fecha: $($acta.Fecha)   Rival: $($acta.Rival)`r`n"
    $res += "Resultado: $($acta.GolesF) - $($acta.GolesC)`r`n`r`n"
    $res += "GOLES`r`n"
    foreach ($g in @($acta.Goles | Sort-Object { [int]$_.Min })) {
        $eqTxt = if ($g.Eq -eq 'A') { $script:Club } else { $acta.Rival }
        $asTxt = if ($g.Asis) { "  asist. $($g.Asis)" } else { '' }
        $res += ("{0,3}'  {1,-18} {2,-24} ({3}){4}`r`n" -f $g.Min, $eqTxt, $g.Jug, $g.Tipo, $asTxt)
    }
    $res += "`r`nMINUTOS POR JUGADOR`r`n"
    foreach ($f in ($filas | Sort-Object -Property Minutos -Descending)) {
        $res += ("{0,3}  {1,-24} {2,4}'   goles:{3}  asist:{4}  TA:{5}  TR:{6}   {7}`r`n" -f $f.Dorsal, $f.Nombre, $f.Minutos, $f.Goles, $f.Asis, $f.TA, $f.TR, $f.Estado)
    }
    $res += "`r`nCRONICA`r`n"
    foreach ($c in @($script:Match.Cronica)) { $res += "$c`r`n" }

    $opc = Show-PickOpcion 'Acta cerrada' @('Generar acta en PDF', 'Guardar acta en texto', 'Solo guardar') `
           ("$($acta.GolesF) - $($acta.GolesC) frente a " + $(if ($acta.Rival) { $acta.Rival } else { 'el rival' }))
    if ($opc -eq 'Generar acta en PDF') {
        Export-ActaPdf $acta $ev
    } elseif ($opc -eq 'Guardar acta en texto') {
        $sfd = New-Object System.Windows.Forms.SaveFileDialog
        $sfd.Filter = 'Texto (*.txt)|*.txt'
        $sfd.FileName = "acta_$($acta.Fecha)_$($acta.Rival -replace '[\\/:*?""<>|]','_').txt"
        if ($sfd.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            Set-Content -Path $sfd.FileName -Value $res -Encoding UTF8
            Say "Acta exportada a:`n$($sfd.FileName)" 'Acta'
        }
    }
    $script:LblSub.Text = "Acta guardada: $($acta.GolesF)-$($acta.GolesC) vs $($acta.Rival)"
})

$bPtPdf.Add_Click({
    if (-not $script:CmbPartido.SelectedItem) { return }
    $id = $script:CmbPartido.SelectedItem.Id
    $acta = $null
    foreach ($p in $script:Partidos) { if ($p.EventoId -eq $id) { $acta = $p; break } }
    if (-not $acta) { Say 'Este partido todavia no tiene acta cerrada.' 'Sin acta'; return }
    Export-ActaPdf $acta (Get-Evento $id)
})

$bPtCargar.Add_Click({
    if (-not $script:CmbPartido.SelectedItem) { return }
    $id = $script:CmbPartido.SelectedItem.Id
    $acta = $null
    foreach ($p in $script:Partidos) { if ($p.EventoId -eq $id) { $acta = $p; break } }
    if (-not $acta) { Say 'Este partido todavia no tiene acta guardada.' 'Sin acta'; return }
    $convocados = @(@($acta.Jugadores) | ForEach-Object { $_.JugadorId })
    New-Match $id $convocados
    foreach ($f in @($acta.Jugadores)) {
        $script:Match.Tiempos[$f.JugadorId] = [int]$f.Segundos
        $script:Match.TA[$f.JugadorId] = [int]$f.TA
        $script:Match.TR[$f.JugadorId] = [int]$f.TR
        $script:Match.Goles[$f.JugadorId] = [int]$f.Goles
        $script:Match.Asis[$f.JugadorId] = [int]$f.Asis
        $script:Match.Faltas[$f.JugadorId] = [int]$f.Faltas
        $script:Match.Estados[$f.JugadorId] = [string]$f.Estado
        if ($f.Estado -eq 'En el campo') {
            $script:Match.Banquillo.Remove($f.JugadorId)
            [void]$script:Match.Campo.Add($f.JugadorId)
        } elseif ($f.Estado -eq 'Expulsado' -or $f.Estado -eq 'Sustituido') {
            if ($f.Estado -eq 'Expulsado') { $script:Match.Banquillo.Remove($f.JugadorId) }
        }
    }
    $script:Match.GolesF = [int]$acta.GolesF
    $script:Match.GolesC = [int]$acta.GolesC
    $script:Match.Iniciado = $true
    $script:Match.Cronica = [System.Collections.ArrayList]@($acta.Cronica)
    $script:Match.Lista = [System.Collections.ArrayList]@($acta.Goles)
    $script:Match.Titulares = [System.Collections.ArrayList]@($acta.Titulares)
    if ($acta.Eventos) { $script:Match.Eventos = [System.Collections.ArrayList]@($acta.Eventos) }
    Update-Timeline; Update-ResumenPartido
    Update-ListasPartido; Update-GridMinutos; Update-Marcador
    $script:LblSub.Text = 'Acta recuperada. El cronometro arranca desde 00:00 del periodo actual.'
})

# =============================================================================
#  12. PESTAÑA ENTRENAMIENTOS (PIZARRA)
# =============================================================================
$script:DrillItems = New-Object System.Collections.ArrayList
$script:DrillSel = $null
$script:DrillDrag = $null
$script:DrillModo = 'Completo'
$script:DrillTool = 'Mover'
$script:DrillUndo = New-Object System.Collections.ArrayList
$script:DrillActual = $null

$panelTools = New-Card 12 12 236 680
$panelTools.Anchor = 'Top,Left,Bottom'
$panelTools.AutoScroll = $true
$script:TabEjercicios.Controls.Add($panelTools)

$panelTools.Controls.Add((New-Lbl 'Piezas' 14 10 200 $script:F.H2))
$script:LstTools = New-Lst 14 38 208 250
$foreach_tools = @('Mover', 'Jugador', 'Portero', 'Rival', 'Cono', 'Balon', 'Porteria', 'Miniporteria',
                   'Escalera', 'Valla', 'Pica', 'Aro', 'Maniqui', 'Texto', 'Zona',
                   'Flecha: desplazamiento', 'Flecha: pase', 'Flecha: conduccion')
foreach ($t in $foreach_tools) { [void]$script:LstTools.Items.Add($t) }
$script:LstTools.SelectedIndex = 0
$panelTools.Controls.Add($script:LstTools)

$panelTools.Controls.Add((New-Lbl 'Campo' 14 296 60))
$script:CmbCampo = New-Cmb @('Completo', 'Medio', 'Pizarra') 14 318 100
$script:CmbCampo.SelectedIndex = 0
$panelTools.Controls.Add($script:CmbCampo)
$panelTools.Controls.Add((New-Lbl 'Color' 122 296 60))
$script:CmbColor = New-Cmb @('Azul', 'Rojo', 'Amarillo', 'Verde', 'Naranja', 'Blanco', 'Negro') 122 318 100
$script:CmbColor.SelectedIndex = 0
$panelTools.Controls.Add($script:CmbColor)

$bDrDeshacer = New-Btn 'Deshacer' 14 352 100 28
$bDrLimpiar = New-Btn 'Vaciar campo' 122 352 100 28 $script:C.Panel2 $script:C.Danger
$panelTools.Controls.Add($bDrDeshacer); $panelTools.Controls.Add($bDrLimpiar)

$panelTools.Controls.Add((New-Lbl 'Mis ejercicios' 14 396 200 $script:F.H2))
$script:LstEjercicios = New-Lst 14 424 208 150
$script:LstEjercicios.Anchor = 'Top,Left,Right'
$panelTools.Controls.Add($script:LstEjercicios)

$bDrNuevo = New-Btn 'Nuevo' 14 582 100 28
$bDrGuardar = New-Btn 'Guardar' 122 582 100 28 $script:C.Accent ([System.Drawing.Color]::Black)
$bDrBorrar = New-Btn 'Eliminar' 14 616 100 28 $script:C.Panel2 $script:C.Danger
$bDrPng = New-Btn 'Exportar PNG' 122 616 100 28
$panelTools.Controls.Add($bDrNuevo); $panelTools.Controls.Add($bDrGuardar)
$panelTools.Controls.Add($bDrBorrar); $panelTools.Controls.Add($bDrPng)

$script:LblDrillHint = New-Lbl 'Elige una pieza y haz clic en el campo. Con "Mover" arrastras. Boton derecho borra.' 14 650 208 $script:F.Small $script:C.Muted
$script:LblDrillHint.Height = 30
$panelTools.Controls.Add($script:LblDrillHint)

$script:TabEjercicios.Controls.Add((New-Lbl 'Nombre' 260 16 60))
$script:TxtEjName = New-Txt 'Ejercicio sin titulo' 318 12 300
$script:TabEjercicios.Controls.Add($script:TxtEjName)
$script:TabEjercicios.Controls.Add((New-Lbl 'Duracion' 630 16 60))
$script:TxtEjMin = New-Txt '15' 694 12 50
$script:TabEjercicios.Controls.Add($script:TxtEjMin)
$script:TabEjercicios.Controls.Add((New-Lbl 'min' 748 16 30 $script:F.Small $script:C.Muted))
$script:TabEjercicios.Controls.Add((New-Lbl 'Objetivo' 790 16 60))
$script:TxtEjObj = New-Txt '' 850 12 374
$script:TxtEjObj.Anchor = 'Top,Left,Right'
$script:TabEjercicios.Controls.Add($script:TxtEjObj)

$script:Drill = New-Object System.Windows.Forms.Panel
$script:Drill.Location = New-Object System.Drawing.Point(260, 46)
$script:Drill.Size = New-Object System.Drawing.Size(964, 646)
$script:Drill.Anchor = 'Top,Left,Bottom,Right'
$script:Drill.BackColor = $script:C.Bg
Set-DoubleBuffer $script:Drill
$script:TabEjercicios.Controls.Add($script:Drill)

function Push-DrillUndo {
    try {
        $snap = (@($script:DrillItems) | ConvertTo-Json -Depth 6 -Compress)
        [void]$script:DrillUndo.Add($snap)
        while ($script:DrillUndo.Count -gt 40) { $script:DrillUndo.RemoveAt(0) }
    } catch { }
}

$script:Drill.Add_Paint({
    param($s, $e)
    $sid = $null
    if ($script:DrillSel) { $sid = $script:DrillSel.Id }
    Draw-Scene -G $e.Graphics -W $s.ClientSize.Width -H $s.ClientSize.Height -Modo $script:DrillModo -Items $script:DrillItems -SelId $sid
})
$script:Drill.Add_Resize({ $script:Drill.Invalidate() })

$script:Drill.Add_MouseDown({
    param($s, $e)
    $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
    if ($w -le 0 -or $h -le 0) { return }
    $nx = $e.X / [double]$w; $ny = $e.Y / [double]$h
    $tool = [string]$script:LstTools.SelectedItem

    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
        $hit = Test-ItemHit $script:DrillItems $e.X $e.Y $w $h
        if ($hit) { Push-DrillUndo; $script:DrillItems.Remove($hit.Item); $script:DrillSel = $null; $s.Invalidate() }
        return
    }

    if ($tool -eq 'Mover') {
        $hit = Test-ItemHit $script:DrillItems $e.X $e.Y $w $h
        if ($hit) {
            Push-DrillUndo
            $script:DrillSel = $hit.Item
            $script:DrillDrag = [PSCustomObject]@{
                Item = $hit.Item; Modo = $hit.Modo
                OffX = $nx - $hit.Item.X; OffY = $ny - $hit.Item.Y
            }
        } else { $script:DrillSel = $null }
        $s.Invalidate()
        return
    }

    Push-DrillUndo
    $color = [string]$script:CmbColor.SelectedItem
    $item = $null
    switch ($tool) {
        'Flecha: desplazamiento' { $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Flecha'; X = $nx; Y = $ny; X2 = ($nx + 0.08); Y2 = $ny; Etiqueta = ''; Color = $color; Estilo = 'Desplazamiento' } }
        'Flecha: pase'           { $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Flecha'; X = $nx; Y = $ny; X2 = ($nx + 0.08); Y2 = $ny; Etiqueta = ''; Color = $color; Estilo = 'Pase' } }
        'Flecha: conduccion'     { $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Flecha'; X = $nx; Y = $ny; X2 = ($nx + 0.08); Y2 = $ny; Etiqueta = ''; Color = $color; Estilo = 'Conduccion' } }
        'Zona'                   { $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Zona'; X = $nx; Y = $ny; X2 = ($nx + 0.12); Y2 = ($ny + 0.12); Etiqueta = ''; Color = $color; Estilo = '' } }
        'Texto' {
            $t = Ask-Text 'Texto a colocar en la pizarra' 'Texto'
            if ([string]::IsNullOrWhiteSpace($t)) { return }
            $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Texto'; X = $nx; Y = $ny; X2 = 0; Y2 = 0; Etiqueta = $t; Color = $color; Estilo = '' }
        }
        'Jugador' {
            $n = @($script:DrillItems | Where-Object { $_.Tipo -eq 'Jugador' }).Count + 1
            $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Jugador'; X = $nx; Y = $ny; X2 = 0; Y2 = 0; Etiqueta = "$n"; Color = $color; Estilo = '' }
        }
        'Rival' {
            $n = @($script:DrillItems | Where-Object { $_.Tipo -eq 'Jugador' -and $_.Color -eq 'Rojo' }).Count + 1
            $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Jugador'; X = $nx; Y = $ny; X2 = 0; Y2 = 0; Etiqueta = "$n"; Color = 'Rojo'; Estilo = '' }
        }
        'Portero' { $item = [PSCustomObject]@{ Id = New-Id; Tipo = 'Portero'; X = $nx; Y = $ny; X2 = 0; Y2 = 0; Etiqueta = 'P'; Color = 'Amarillo'; Estilo = '' } }
        default   { $item = [PSCustomObject]@{ Id = New-Id; Tipo = $tool; X = $nx; Y = $ny; X2 = 0; Y2 = 0; Etiqueta = ''; Color = $color; Estilo = '' } }
    }
    if ($item) {
        [void]$script:DrillItems.Add($item)
        $script:DrillSel = $item
        if ($item.Tipo -eq 'Flecha' -or $item.Tipo -eq 'Zona') {
            $script:DrillDrag = [PSCustomObject]@{ Item = $item; Modo = 'P2'; OffX = 0; OffY = 0 }
        }
        $s.Invalidate()
    }
})

$script:Drill.Add_MouseMove({
    param($s, $e)
    if (-not $script:DrillDrag) { return }
    $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
    $nx = [math]::Max(0.01, [math]::Min(0.99, $e.X / [double]$w))
    $ny = [math]::Max(0.01, [math]::Min(0.99, $e.Y / [double]$h))
    $it = $script:DrillDrag.Item
    switch ($script:DrillDrag.Modo) {
        'P1' { $it.X = $nx; $it.Y = $ny }
        'P2' { $it.X2 = $nx; $it.Y2 = $ny }
        default {
            if ($it.Tipo -eq 'Flecha' -or $it.Tipo -eq 'Zona') {
                $dx = $nx - $script:DrillDrag.OffX - $it.X
                $dy = $ny - $script:DrillDrag.OffY - $it.Y
                $it.X += $dx; $it.Y += $dy; $it.X2 += $dx; $it.Y2 += $dy
            } else {
                $it.X = $nx - $script:DrillDrag.OffX
                $it.Y = $ny - $script:DrillDrag.OffY
            }
        }
    }
    $s.Invalidate()
})

$script:Drill.Add_MouseUp({ param($s, $e) $script:DrillDrag = $null })

$script:CmbCampo.Add_SelectedIndexChanged({
    $script:DrillModo = [string]$script:CmbCampo.SelectedItem
    $script:Drill.Invalidate()
})

$bDrDeshacer.Add_Click({
    if ($script:DrillUndo.Count -eq 0) { return }
    $snap = $script:DrillUndo[$script:DrillUndo.Count - 1]
    $script:DrillUndo.RemoveAt($script:DrillUndo.Count - 1)
    $script:DrillItems = [System.Collections.ArrayList]@($snap | ConvertFrom-Json)
    $script:DrillSel = $null
    $script:Drill.Invalidate()
})

$bDrLimpiar.Add_Click({
    if ($script:DrillItems.Count -eq 0) { return }
    if (Ask-Yes 'Quitar todas las piezas del campo?' 'Vaciar') {
        Push-DrillUndo
        $script:DrillItems.Clear(); $script:DrillSel = $null
        $script:Drill.Invalidate()
    }
})

function Update-ListaEjercicios {
    $script:LstEjercicios.Items.Clear()
    $script:LstEjercicios.DisplayMember = 'Texto'
    foreach ($ej in $script:Ejercicios) {
        [void]$script:LstEjercicios.Items.Add([PSCustomObject]@{ Id = $ej.Id; Texto = $ej.Nombre })
    }
}

$bDrNuevo.Add_Click({
    Push-DrillUndo
    $script:DrillItems.Clear()
    $script:DrillSel = $null
    $script:DrillActual = $null
    $script:TxtEjName.Text = 'Ejercicio sin titulo'
    $script:TxtEjObj.Text = ''
    $script:TxtEjMin.Text = '15'
    $script:Drill.Invalidate()
})

$bDrGuardar.Add_Click({
    $nombre = $script:TxtEjName.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($nombre)) { Say 'Ponle un nombre al ejercicio.' 'Falta el nombre'; return }
    $ej = [PSCustomObject]@{
        Id       = if ($script:DrillActual) { $script:DrillActual } else { New-Id }
        Nombre   = $nombre
        Objetivo = $script:TxtEjObj.Text
        Duracion = $script:TxtEjMin.Text
        Campo    = $script:DrillModo
        Items    = @($script:DrillItems)
    }
    $viejo = $null
    foreach ($x in $script:Ejercicios) { if ($x.Id -eq $ej.Id) { $viejo = $x; break } }
    if ($viejo) { $script:Ejercicios.Remove($viejo) }
    [void]$script:Ejercicios.Add($ej)
    $script:DrillActual = $ej.Id
    Save-All
    Update-ListaEjercicios
    $script:LblSub.Text = "Ejercicio guardado: $nombre"
})

$script:LstEjercicios.Add_SelectedIndexChanged({
    if (-not $script:LstEjercicios.SelectedItem) { return }
    $id = $script:LstEjercicios.SelectedItem.Id
    $ej = $null
    foreach ($x in $script:Ejercicios) { if ($x.Id -eq $id) { $ej = $x; break } }
    if (-not $ej) { return }
    $script:DrillActual = $ej.Id
    $script:DrillItems = [System.Collections.ArrayList]@($ej.Items)
    $script:DrillSel = $null
    $script:TxtEjName.Text = $ej.Nombre
    $script:TxtEjObj.Text = [string]$ej.Objetivo
    $script:TxtEjMin.Text = [string]$ej.Duracion
    if ($ej.Campo) { $script:CmbCampo.SelectedItem = $ej.Campo; $script:DrillModo = $ej.Campo }
    $script:Drill.Invalidate()
})

$bDrBorrar.Add_Click({
    if (-not $script:LstEjercicios.SelectedItem) { Say 'Selecciona un ejercicio de la lista.' 'Sin seleccion'; return }
    $id = $script:LstEjercicios.SelectedItem.Id
    $ej = $null
    foreach ($x in $script:Ejercicios) { if ($x.Id -eq $id) { $ej = $x; break } }
    if ($ej -and (Ask-Yes "Eliminar el ejercicio '$($ej.Nombre)'?" 'Eliminar')) {
        $script:Ejercicios.Remove($ej)
        Save-All; Update-ListaEjercicios
    }
})

$bDrPng.Add_Click({
    Export-Escena $script:DrillModo @($script:DrillItems) $script:TxtEjName.Text
})

# =============================================================================
#  13. PESTAÑA TACTICAS 11 vs 11
# =============================================================================
$script:TacItems = New-Object System.Collections.ArrayList
$script:TacSel = $null
$script:TacDrag = $null
$script:TacNombres = $true

$panelTac = New-Card 12 12 236 680
$panelTac.Anchor = 'Top,Left,Bottom'
$panelTac.AutoScroll = $true
$script:TabTacticas.Controls.Add($panelTac)

$panelTac.Controls.Add((New-Lbl 'Mi equipo' 14 12 200 $script:F.H2))
$script:CmbForm1 = New-Cmb $script:Formaciones 14 40 208
$script:CmbForm1.SelectedIndex = 0
$panelTac.Controls.Add($script:CmbForm1)
$bTacAplicar1 = New-Btn 'Colocar mi equipo' 14 70 208 30 $script:C.Blue ([System.Drawing.Color]::White)
$panelTac.Controls.Add($bTacAplicar1)

$panelTac.Controls.Add((New-Lbl 'Rival' 14 116 200 $script:F.H2))
$script:CmbForm2 = New-Cmb $script:Formaciones 14 144 208
$script:CmbForm2.SelectedIndex = 1
$panelTac.Controls.Add($script:CmbForm2)
$bTacAplicar2 = New-Btn 'Colocar al rival' 14 174 208 30 $script:C.Danger ([System.Drawing.Color]::White)
$panelTac.Controls.Add($bTacAplicar2)

$bTacPlantilla = New-Btn 'Poner nombres del once' 14 220 208 30 $script:C.Panel2 $script:C.Accent 'Usa los 11 titulares del partido en curso, o los dorsales mas bajos'
$bTacNombres = New-Btn 'Mostrar / ocultar nombres' 14 256 208 28
$bTacQuitarRival = New-Btn 'Quitar / poner rival' 14 290 208 28
$panelTac.Controls.Add($bTacPlantilla); $panelTac.Controls.Add($bTacNombres); $panelTac.Controls.Add($bTacQuitarRival)

$panelTac.Controls.Add((New-Lbl 'Pizarras guardadas' 14 336 200 $script:F.H2))
$script:LstTacticas = New-Lst 14 364 208 190
$script:LstTacticas.Anchor = 'Top,Left,Right'
$panelTac.Controls.Add($script:LstTacticas)

$script:TxtTacName = New-Txt 'Plan de partido' 14 562 208
$panelTac.Controls.Add($script:TxtTacName)
$bTacGuardar = New-Btn 'Guardar' 14 592 100 28 $script:C.Accent ([System.Drawing.Color]::Black)
$bTacBorrar = New-Btn 'Eliminar' 122 592 100 28 $script:C.Panel2 $script:C.Danger
$bTacPng = New-Btn 'Exportar PNG' 14 626 208 28
$panelTac.Controls.Add($bTacGuardar); $panelTac.Controls.Add($bTacBorrar); $panelTac.Controls.Add($bTacPng)

$script:Tac = New-Object System.Windows.Forms.Panel
$script:Tac.Location = New-Object System.Drawing.Point(260, 12)
$script:Tac.Size = New-Object System.Drawing.Size(964, 680)
$script:Tac.Anchor = 'Top,Left,Bottom,Right'
$script:Tac.BackColor = $script:C.Bg
Set-DoubleBuffer $script:Tac
$script:TabTacticas.Controls.Add($script:Tac)

function Set-Formacion {
    param([string]$Equipo, [string]$Nombre)
    $coords = Get-Formacion $Nombre
    $fichas = @($script:TacItems | Where-Object { $_.Equipo -eq $Equipo })
    for ($i = 0; $i -lt [math]::Min($coords.Count, $fichas.Count); $i++) {
        $c = $coords[$i]
        if ($Equipo -eq 'A') { $fichas[$i].X = $c[0] } else { $fichas[$i].X = 1 - $c[0] }
        $fichas[$i].Y = $c[1]
    }
    $script:Tac.Invalidate()
}

function New-Tactica {
    $script:TacItems.Clear()
    $coordsA = Get-Formacion '4-4-2'
    $coordsB = Get-Formacion '4-3-3'
    for ($i = 0; $i -lt 11; $i++) {
        [void]$script:TacItems.Add([PSCustomObject]@{
            Id = New-Id; Equipo = 'A'; X = $coordsA[$i][0]; Y = $coordsA[$i][1]
            Dorsal = "$($i + 1)"; Nombre = ''; Visible = $true
        })
    }
    for ($i = 0; $i -lt 11; $i++) {
        [void]$script:TacItems.Add([PSCustomObject]@{
            Id = New-Id; Equipo = 'B'; X = (1 - $coordsB[$i][0]); Y = $coordsB[$i][1]
            Dorsal = "$($i + 1)"; Nombre = ''; Visible = $true
        })
    }
}

$script:Tac.Add_Paint({
    param($s, $e)
    $g = $e.Graphics
    $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    Draw-Pitch -G $g -W $w -H $h -Modo 'Completo'
    $r = [math]::Max(12, [math]::Min(20, $w / 55))
    foreach ($f in $script:TacItems) {
        if (-not $f.Visible) { continue }
        $col = if ($f.Equipo -eq 'A') { Get-PieceColor 'Azul' } else { Get-PieceColor 'Rojo' }
        if ($f.Dorsal -eq '1') { $col = Get-PieceColor 'Amarillo' }
        $nom = ''
        if ($script:TacNombres) { $nom = [string]$f.Nombre }
        $sel = ($null -ne $script:TacSel -and $script:TacSel.Id -eq $f.Id)
        Draw-Ficha $g ($f.X * $w) ($f.Y * $h) $r $col ([string]$f.Dorsal) $nom $sel
    }
})
$script:Tac.Add_Resize({ $script:Tac.Invalidate() })

$script:Tac.Add_MouseDown({
    param($s, $e)
    $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
    $hit = $null
    for ($i = $script:TacItems.Count - 1; $i -ge 0; $i--) {
        $f = $script:TacItems[$i]
        if (-not $f.Visible) { continue }
        $d = [math]::Sqrt([math]::Pow($e.X - $f.X * $w, 2) + [math]::Pow($e.Y - $f.Y * $h, 2))
        if ($d -le 22) { $hit = $f; break }
    }
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Right) {
        if ($hit) {
            $t = Ask-Text 'Nombre del jugador para esta ficha' 'Ficha' ([string]$hit.Nombre)
            if ($null -ne $t) { $hit.Nombre = $t }
            $d2 = Ask-Text 'Dorsal' 'Ficha' ([string]$hit.Dorsal)
            if (-not [string]::IsNullOrWhiteSpace($d2)) { $hit.Dorsal = $d2 }
            $s.Invalidate()
        }
        return
    }
    $script:TacSel = $hit
    if ($hit) { $script:TacDrag = $hit }
    $s.Invalidate()
})

$script:Tac.Add_MouseMove({
    param($s, $e)
    if (-not $script:TacDrag) { return }
    $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
    $script:TacDrag.X = [math]::Max(0.02, [math]::Min(0.98, $e.X / [double]$w))
    $script:TacDrag.Y = [math]::Max(0.03, [math]::Min(0.97, $e.Y / [double]$h))
    $s.Invalidate()
})
$script:Tac.Add_MouseUp({ param($s, $e) $script:TacDrag = $null })

$bTacAplicar1.Add_Click({ Set-Formacion 'A' ([string]$script:CmbForm1.SelectedItem) })
$bTacAplicar2.Add_Click({ Set-Formacion 'B' ([string]$script:CmbForm2.SelectedItem) })
$bTacNombres.Add_Click({ $script:TacNombres = -not $script:TacNombres; $script:Tac.Invalidate() })
$bTacQuitarRival.Add_Click({
    $vis = $true
    foreach ($f in $script:TacItems) { if ($f.Equipo -eq 'B') { $vis = -not $f.Visible; break } }
    foreach ($f in $script:TacItems) { if ($f.Equipo -eq 'B') { $f.Visible = $vis } }
    $script:Tac.Invalidate()
})

$bTacPlantilla.Add_Click({
    $once = @()
    if ($script:Match -and $script:Match.Campo.Count -gt 0) {
        $once = @($script:Match.Campo)
    } else {
        $once = @(@($script:Jugadores | Sort-Object { [int]$_.Dorsal } | Select-Object -First 11) | ForEach-Object { $_.Id })
    }
    if ($once.Count -eq 0) { Say 'Primero da de alta jugadores en la plantilla.' 'Sin plantilla'; return }
    $fichas = @($script:TacItems | Where-Object { $_.Equipo -eq 'A' })
    for ($i = 0; $i -lt [math]::Min($once.Count, $fichas.Count); $i++) {
        $j = Get-Jugador $once[$i]
        if ($j) { $fichas[$i].Dorsal = "$($j.Dorsal)"; $fichas[$i].Nombre = ($j.Nombre -split ' ')[0] }
    }
    $script:TacNombres = $true
    $script:Tac.Invalidate()
})

function Update-ListaTacticas {
    $script:LstTacticas.Items.Clear()
    $script:LstTacticas.DisplayMember = 'Texto'
    foreach ($t in $script:Tacticas) {
        [void]$script:LstTacticas.Items.Add([PSCustomObject]@{ Id = $t.Id; Texto = $t.Nombre })
    }
}

$bTacGuardar.Add_Click({
    $nombre = $script:TxtTacName.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($nombre)) { Say 'Ponle un nombre a la pizarra tactica.' 'Falta el nombre'; return }
    $tac = [PSCustomObject]@{
        Id = New-Id
        Nombre = $nombre
        Form1 = [string]$script:CmbForm1.SelectedItem
        Form2 = [string]$script:CmbForm2.SelectedItem
        Fichas = @($script:TacItems)
    }
    $viejo = $null
    foreach ($x in $script:Tacticas) { if ($x.Nombre -eq $nombre) { $viejo = $x; break } }
    if ($viejo) { $tac.Id = $viejo.Id; $script:Tacticas.Remove($viejo) }
    [void]$script:Tacticas.Add($tac)
    Save-All; Update-ListaTacticas
    $script:LblSub.Text = "Pizarra tactica guardada: $nombre"
})

$script:LstTacticas.Add_SelectedIndexChanged({
    if (-not $script:LstTacticas.SelectedItem) { return }
    $id = $script:LstTacticas.SelectedItem.Id
    $tac = $null
    foreach ($x in $script:Tacticas) { if ($x.Id -eq $id) { $tac = $x; break } }
    if (-not $tac) { return }
    $script:TacItems = [System.Collections.ArrayList]@($tac.Fichas)
    $script:TxtTacName.Text = $tac.Nombre
    if ($tac.Form1 -and ($script:Formaciones -contains $tac.Form1)) { $script:CmbForm1.SelectedItem = $tac.Form1 }
    if ($tac.Form2 -and ($script:Formaciones -contains $tac.Form2)) { $script:CmbForm2.SelectedItem = $tac.Form2 }
    $script:TacSel = $null
    $script:Tac.Invalidate()
})

$bTacBorrar.Add_Click({
    if (-not $script:LstTacticas.SelectedItem) { Say 'Selecciona una pizarra guardada.' 'Sin seleccion'; return }
    $id = $script:LstTacticas.SelectedItem.Id
    $tac = $null
    foreach ($x in $script:Tacticas) { if ($x.Id -eq $id) { $tac = $x; break } }
    if ($tac -and (Ask-Yes "Eliminar la pizarra '$($tac.Nombre)'?" 'Eliminar')) {
        $script:Tacticas.Remove($tac)
        Save-All; Update-ListaTacticas
    }
})

$bTacPng.Add_Click({
    $sfd = New-Object System.Windows.Forms.SaveFileDialog
    $sfd.Filter = 'Imagen PNG (*.png)|*.png'
    $sfd.FileName = ($script:TxtTacName.Text -replace '[\\/:*?"<>|]', '_') + '.png'
    if ($sfd.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { return }
    $w = 1600; $h = 1040
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    Draw-Pitch -G $g -W $w -H $h -Modo 'Completo'
    $r = 26
    foreach ($f in $script:TacItems) {
        if (-not $f.Visible) { continue }
        $col = if ($f.Equipo -eq 'A') { Get-PieceColor 'Azul' } else { Get-PieceColor 'Rojo' }
        if ($f.Dorsal -eq '1') { $col = Get-PieceColor 'Amarillo' }
        $nom = if ($script:TacNombres) { [string]$f.Nombre } else { '' }
        Draw-Ficha $g ($f.X * $w) ($f.Y * $h) $r $col ([string]$f.Dorsal) $nom $false
    }
    $g.Dispose()
    $bmp.Save($sfd.FileName, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Say "Pizarra exportada a:`n$($sfd.FileName)" 'Exportar'
})

# =============================================================================
#  14. AJUSTE DE MAQUETACION
# =============================================================================
function Fit-Layout {
    $w = $script:TabPlantilla.ClientSize.Width
    $h = $script:TabPlantilla.ClientSize.Height
    if ($w -lt 400 -or $h -lt 300) { return }
    $m = 12

    # Plantilla
    $script:GridPlantilla.SetBounds($m, 52, ($w - 3 * $m - 300), ($h - 52 - $m))
    $panelPl.SetBounds(($w - $m - 300), 52, 300, ($h - 52 - $m))

    # Calendario
    $panelCal.SetBounds($m, 52, 320, ($h - 52 - $m))
    $script:GridEventos.SetBounds((2 * $m + 320), 52, ($w - 3 * $m - 320), ($h - 52 - $m))

    # Asistencia
    $script:GridAsis.SetBounds($m, 82, ($w - 3 * $m - 440), ($h - 82 - $m))
    $panelStats.SetBounds(($w - $m - 440), 82, 440, ($h - 82 - $m))
    $script:TxtEjObj.Width = [math]::Max(150, $w - 850 - $m)

    # Partido
    $script:PanelCrono.SetBounds($m, 46, 300, 250)
    $script:PanelCampo.SetBounds($m, 306, 300, ($h - 306 - $m))
    $script:PanelAcciones.SetBounds(324, 46, 210, ($h - 46 - $m))
    $script:BtnVistaDirecto.SetBounds(546, 46, [int](($w - 546 - $m - 8) / 2), 28)
    $script:BtnVistaMinutos.SetBounds((546 + [int](($w - 546 - $m - 8) / 2) + 8), 46, [int](($w - 546 - $m - 8) / 2), 28)
    $script:PanelDirecto.SetBounds(546, 82, ($w - 546 - $m), ($h - 82 - $m))
    $script:GridMinutos.SetBounds(546, 82, ($w - 546 - $m), ($h - 82 - $m))
    Update-Timeline

    # Entrenamientos
    $panelTools.SetBounds($m, $m, 236, ($h - 2 * $m))
    $script:Drill.SetBounds(260, 46, ($w - 260 - $m), ($h - 46 - $m))

    # Tacticas
    $panelTac.SetBounds($m, $m, 236, ($h - 2 * $m))
    $script:Tac.SetBounds(260, $m, ($w - 260 - $m), ($h - 2 * $m))
}

# =============================================================================
#  15. ARRANQUE
# =============================================================================
$script:Form.Add_FormClosing({
    if ($script:Timer) { $script:Timer.Stop() }
    Save-All
})

$script:Form.Add_Shown({
    $script:Header.PerformLayout()
    $w = $script:Header.ClientSize.Width
    $script:BtnGuardar.Left = $w - 140
    $script:BtnCarpeta.Left = $w - 280
    $script:BtnAyuda.Left   = $w - 390
    Fit-Layout
    $script:Form.Activate()
})

New-Tactica
Update-Plantilla
Update-Calendario
Update-ComboSesiones
Update-Asistencia
Update-ComboPartidos
Update-ListaEjercicios
Update-ListaTacticas
$script:LblSub.Text = "Datos en $script:DataDir"

[void]$script:Form.ShowDialog()
$script:Form.Dispose()
