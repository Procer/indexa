@echo off
setlocal EnableDelayedExpansion

if /i "%1"=="run" goto :main
start "TechSearch AR" cmd /k "%~f0" run
exit /b

:main
title TechSearch AR
cls
echo.
echo  TechSearch AR - Iniciando...
echo  ================================
echo.

:: Verificar .env.local
if not exist ".env.local" (
  echo  ERROR: No se encontro .env.local
  pause & exit /b 1
)

:: Verificar variables criticas
set "SUPABASE_URL=" & set "SUPABASE_KEY=" & set "OPENAI_KEY="
for /f "usebackq tokens=1,* delims==" %%a in (".env.local") do (
  if "%%a"=="NEXT_PUBLIC_SUPABASE_URL"   set "SUPABASE_URL=%%b"
  if "%%a"=="SUPABASE_SERVICE_ROLE_KEY"  set "SUPABASE_KEY=%%b"
  if "%%a"=="OPENAI_API_KEY"             set "OPENAI_KEY=%%b"
)
if "!SUPABASE_URL!"=="" ( echo  ERROR: NEXT_PUBLIC_SUPABASE_URL vacio en .env.local  & pause & exit /b 1 )
if "!SUPABASE_KEY!"=="" ( echo  ERROR: SUPABASE_SERVICE_ROLE_KEY vacio en .env.local & pause & exit /b 1 )
if "!OPENAI_KEY!"==""   ( echo  ERROR: OPENAI_API_KEY vacio en .env.local            & pause & exit /b 1 )

:: Instalar dependencias solo si falta node_modules
if not exist "node_modules\" (
  echo  Instalando dependencias...
  call npm install --silent
  if errorlevel 1 ( echo  ERROR en npm install & pause & exit /b 1 )
  echo  OK
  echo.
)

:: Abrir browser cuando el servidor este listo
start /min cmd /c "curl -s --retry 30 --retry-delay 2 --retry-connrefused -o nul http://localhost:3000 && start \"\" \"http://localhost:3000\""

echo  Servidor iniciando en http://localhost:3000
echo  El navegador se abrira automaticamente.
echo.
call npm run dev

echo.
pause
