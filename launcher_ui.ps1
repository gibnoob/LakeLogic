Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ─── Settings ─────────────────────────────────────────────────────────────
$AppTitle = "LakeLogic Launcher"
$ServerExe = "dist\LakeLogicMN.exe"
$ServerPort = 3000
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path -Path $ScriptPath -ChildPath $ServerExe

# ─── Global State ─────────────────────────────────────────────────────────
$Global:ServerProcess = $null

# ─── Main Form ────────────────────────────────────────────────────────────
$form = New-Object System.Windows.Forms.Form
$form.Text = $AppTitle
$form.Size = New-Object System.Drawing.Size(400, 220)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0D1626") # Matches app bg

# Try to set form icon from logo if possible (fallback if it fails)
try {
    $iconImg = [System.Drawing.Image]::FromFile((Join-Path $ScriptPath "public\logo_notext.png"))
    $iconBmp = New-Object System.Drawing.Bitmap($iconImg)
    $iconPtr = $iconBmp.GetHicon()
    $form.Icon = [System.Drawing.Icon]::FromHandle($iconPtr)
} catch {
    # Ignore if icon fails to load
}

# ─── UI Layout: Header Label ──────────────────────────────────────────────
$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "LakeLogic Minnesota"
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$lblTitle.ForeColor = [System.Drawing.Color]::White
$lblTitle.AutoSize = $true
$lblTitle.Location = New-Object System.Drawing.Point(20, 20)
$form.Controls.Add($lblTitle)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Status: Stopped"
$lblStatus.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
$lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#fca5a5") # Red initially
$lblStatus.AutoSize = $true
$lblStatus.Location = New-Object System.Drawing.Point(22, 55)
$form.Controls.Add($lblStatus)

# ─── Start Button ─────────────────────────────────────────────────────────
$btnStart = New-Object System.Windows.Forms.Button
$btnStart.Text = "► Start Server"
$btnStart.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btnStart.Size = New-Object System.Drawing.Size(160, 45)
$btnStart.Location = New-Object System.Drawing.Point(20, 100)
$btnStart.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#1AB8A8")
$btnStart.ForeColor = [System.Drawing.Color]::White
$btnStart.FlatStyle = "Flat"
$btnStart.FlatAppearance.BorderSize = 0
$btnStart.Cursor = [System.Windows.Forms.Cursors]::Hand

$btnStart.Add_Click({
    if (-not (Test-Path $ExePath)) {
        [System.Windows.Forms.MessageBox]::Show("Could not find $ServerExe. Ensure it has been packaged.", "Error", 0, [System.Windows.Forms.MessageBoxIcon]::Error)
        return
    }

    $lblStatus.Text = "Status: Starting server..."
    $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#F59E0B") # Yellow
    $form.Refresh()

    # Start the executable silently in the background
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $ExePath
    $psi.WorkingDirectory = $ScriptPath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true

    try {
        $Global:ServerProcess = [System.Diagnostics.Process]::Start($psi)
        
        # Wait just a moment for the server to bind the port
        Start-Sleep -Seconds 2

        $lblStatus.Text = "Status: Running on Port $ServerPort"
        $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#4ADE80") # Green
        
        $btnStart.Enabled = $false
        $btnStart.BackColor = [System.Drawing.Color]::Gray
        $btnStop.Enabled = $true
        $btnStop.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#F87171")
        
        # Automatically open default browser
        Start-Process "http://localhost:$ServerPort"
        
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Failed to launch LakeLogic server.`n`n$($_.Exception.Message)", "Launch Error", 0, [System.Windows.Forms.MessageBoxIcon]::Error)
        $lblStatus.Text = "Status: Error starting"
        $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#F87171")
    }
})

$form.Controls.Add($btnStart)

# ─── Stop Button ──────────────────────────────────────────────────────────
$btnStop = New-Object System.Windows.Forms.Button
$btnStop.Text = "■ Stop Server"
$btnStop.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$btnStop.Size = New-Object System.Drawing.Size(160, 45)
$btnStop.Location = New-Object System.Drawing.Point(190, 100)
$btnStop.BackColor = [System.Drawing.Color]::Gray
$btnStop.ForeColor = [System.Drawing.Color]::White
$btnStop.FlatStyle = "Flat"
$btnStop.FlatAppearance.BorderSize = 0
$btnStop.Enabled = $false
$btnStop.Cursor = [System.Windows.Forms.Cursors]::Hand

$btnStop.Add_Click({
    if ($Global:ServerProcess -and -not $Global:ServerProcess.HasExited) {
        $Global:ServerProcess.Kill()
        $Global:ServerProcess.WaitForExit()
    }
    
    $Global:ServerProcess = $null
    
    # Try one more manual taskkill just to be extremely safe since it's Windows
    & taskkill /f /im "LakeLogicMN.exe" 2>$null

    $lblStatus.Text = "Status: Stopped"
    $lblStatus.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#FCA5A5") # Red
    
    $btnStop.Enabled = $false
    $btnStop.BackColor = [System.Drawing.Color]::Gray
    
    $btnStart.Enabled = $true
    $btnStart.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#1AB8A8")
})

$form.Controls.Add($btnStop)

# ─── Form Closing Cleanup ─────────────────────────────────────────────────
$form.Add_FormClosing({
    if ($Global:ServerProcess -and -not $Global:ServerProcess.HasExited) {
        # Ensure we kill the server when the user closes the launcher GUI
        $Global:ServerProcess.Kill()
        & taskkill /f /im "LakeLogicMN.exe" 2>$null
    }
})

# Display the GUI
[void]$form.ShowDialog()
