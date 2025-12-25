@echo off
title Ngrok Update Helper
echo.
echo Ngrok surumu guncelleniyor...
echo Lutfen bekleyin...
echo.
ngrok update
echo.
if %ERRORLEVEL% NEQ 0 (
    echo Guncelleme sirasinda bir hata oldu veya 'ngrok update' komutu calismadi.
    echo Lutfen https://ngrok.com/download adresinden son surumu indirip kurun.
) else (
    echo Guncelleme basarili! Simdi host_game.bat dosyasini tekrar calistirabilirsin.
)
pause
