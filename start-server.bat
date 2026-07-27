@echo off
cd /d "%~dp0"
echo ============================================
echo        Tank Merge Server
echo ============================================
echo.
powershell -Command "$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.PrefixOrigin -eq 'Dhcp' } | Select-Object -First 1).IPAddress; if (-not $ip) { $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' } | Select-Object -First 1).IPAddress }; echo 'Your LAN IP: ' + $ip"
echo.
echo Share this address with players:
echo   http://YOUR_LAN_IP:3001
echo.
echo To play from this PC, open:
echo   http://localhost:3001
echo.
echo Press Ctrl+C to stop the server.
echo ============================================
echo.
node server/server.js
pause
