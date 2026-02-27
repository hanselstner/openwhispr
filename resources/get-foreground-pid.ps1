Add-Type -Language CSharp -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class FGW {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [FGW]::GetForegroundWindow()
$p = 0
[FGW]::GetWindowThreadProcessId($h, [ref]$p) | Out-Null
Write-Output $p
