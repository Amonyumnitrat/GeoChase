@echo off
echo ==========================================
echo GIT KIMLIK DOGRULAMA
echo ==========================================
echo.
echo Lutfen GitHub'da kullandiginiz bilgileri girin.
echo Bu bilgiler commit'lerde "Yazar" olarak gozukecektir.
echo.

set uname=Amonyumnitrat
set uemail=ayberktepeli55@gmail.com

echo.
echo Ayarlar uygulaniyor...
"C:\Program Files\Git\cmd\git.exe" config user.name "%uname%"
"C:\Program Files\Git\cmd\git.exe" config user.email "%uemail%"

echo.
echo ==========================================
echo YEDEKLEME BASLIYOR...
echo ==========================================

REM 1. Ekle
"C:\Program Files\Git\cmd\git.exe" add .

REM 2. Kaydet
"C:\Program Files\Git\cmd\git.exe" commit -m "Backup %date% %time%"

REM 3. Remote Ekle (Varsa hata verir, geceriz)
"C:\Program Files\Git\cmd\git.exe" remote add origin https://github.com/Amonyumnitrat/GeoFind-.git

REM 4. Yukle
echo.
echo GitHub'a yukleniyor...
"C:\Program Files\Git\cmd\git.exe" push -u origin main

echo.
echo ==========================================
echo ISLEM BITTI.
echo ==========================================
echo.

cmd /k
