@echo off
chcp 65001 > nul
echo ========================================================
echo        DANG DAY CODE BACKEND LEN GITHUB...
echo ========================================================
echo.

:: 1. Gom toan bo file thay doi
git add .

:: 2. Nhap noi dung commit hoac mac dinh lay thoi gian hien tai
set /p msg="Nhap noi dung commit (An Enter de lay mac dinh): "
if "%msg%"=="" set msg=Auto update backend: %date% %time%

:: 3. Commit va Push
git commit -m "%msg%"
git push origin main

:: Neu repo cua ban dung nhanh master thi bo dau :: o 2 dong duoi:
:: git push origin master

echo.
echo ========================================================
echo        DA PUSH BACKEND LEN GITHUB THANH CONG!
echo ========================================================
pause