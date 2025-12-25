@echo off
title GeoFind Launcher

echo [1/3] Client Build Ediliyor (Lutfen bekleyin)...
cd client
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo Build hatasi! Lutfen npm install yaptigindan emin ol.
    pause
    exit /b %ERRORLEVEL%
)
cd ..

echo [2/3] Server Baslatiliyor (Yeni pencerede)...
start "GeoFind Server" cmd /k "cd server && npm start"

echo [3/3] Ngrok Baslatiliyor (Yeni pencerede)...
echo Eger ngrok kurulu degilse bu adim hata verebilir.
:: Use the local config file we just created
start "GeoFind Ngrok" cmd /k "ngrok http 3001 --config=ngrok.yml"

echo.
echo ==========================================
echo Her sey hazir! 
echo Acilan Ngrok penceresindeki 'Forwarding' adresini arkadaslarina gonder.
echo ==========================================
echo.
pause
