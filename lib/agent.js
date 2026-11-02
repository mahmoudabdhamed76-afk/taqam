'use strict';
/* طاقم · حزمة «الباكس على كمبيوتر المركز» — zip فيه البرنامج + ملفات تشغيل ويندوز.
   بيشتغل بـ TAQAM_MODE=pacs: الحالات بتتخزن على هارد الكمبيوتر ده بس، مش على النت. */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const CRLF = s => s.replace(/\r?\n/g, '\r\n');
const WEB_PORT = 8686;

const CHECK = `where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js 22 or newer is required. Opening the download page...
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%v in ('node -v') do set NV=%%v
set NV=%NV:v=%
if %NV% LSS 22 (
  echo  Node.js 22 or newer is required. You have %NV%.
  start "" https://nodejs.org/en/download
  pause
  exit /b 1
)`;

const FILES = {
  'PACS-START.bat': `@echo off
chcp 65001 >nul
title Taqam PACS
cd /d "%~dp0"
${CHECK}
set TAQAM_MODE=pacs
set PORT=${WEB_PORT}
set DATA_DIR=%~dp0data
if /i not "%1"=="silent" start "" http://localhost:${WEB_PORT}/
node --no-warnings server.js
if /i not "%1"=="silent" pause
`,
  'PACS-HIDDEN.vbs': `Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
sh.Run """" & dir & "\\PACS-START.bat"" silent", 0, False
`,
  'PACS-INSTALL.bat': `@echo off
chcp 65001 >nul
title Taqam PACS - Install
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
${CHECK}
for /f "delims=" %%n in ('where node') do if not defined NODE set "NODE=%%n"
echo  [1/3] Firewall rules...
netsh advfirewall firewall delete rule name="Taqam PACS" >nul 2>&1
netsh advfirewall firewall add rule name="Taqam PACS" dir=in action=allow program="%NODE%" enable=yes profile=any >nul
netsh advfirewall firewall add rule name="Taqam PACS" dir=in action=allow protocol=TCP localport=11112,${WEB_PORT} profile=any >nul
echo  [2/3] Start with Windows...
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\\Taqam PACS.lnk'); $s.TargetPath='wscript.exe'; $s.Arguments='\\"%~dp0PACS-HIDDEN.vbs\\"'; $s.WorkingDirectory='%~dp0'; $s.Save()"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\\Taqam PACS.lnk'); $s.TargetPath='http://localhost:${WEB_PORT}/'; $s.Save()"
echo  [3/3] Starting...
start "" wscript.exe "%~dp0PACS-HIDDEN.vbs"
timeout /t 4 >nul
start "" http://localhost:${WEB_PORT}/
echo.
echo  Done. Taqam PACS runs in the background and starts with Windows.
echo  Open: http://localhost:${WEB_PORT}/
timeout /t 8
`,
  'PACS-STOP.bat': `@echo off
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":${WEB_PORT} .*LISTENING"') do taskkill /PID %%p /F
echo Taqam PACS stopped.
timeout /t 3
`,
  'اقرأني.txt': `\uFEFFطاقم — الباكس على كمبيوتر المركز
==================================

الحالات اللي الأجهزة بتبعتها بتتخزن هنا على هارد الكمبيوتر ده (فولدر data جنب الملفات) — مش على النت.

التسطيب (مرة واحدة):
1) لازم يكون متسطّب Node.js 22 أو أحدث — https://nodejs.org
2) حط الفولدر ده في مكان ثابت، مثلا  D:\\Taqam-PACS
3) دوس دبل كليك على  PACS-INSTALL.bat  ووافق على صلاحيات المدير
   - بيفتح البورتات في الفايروول
   - بيخلي الباكس يشتغل لوحده مع الويندوز (في الخلفية)
   - بيعمل اختصار "Taqam PACS" على سطح المكتب
4) هيفتح المتصفح على  http://localhost:${WEB_PORT}  — اعمل حساب المدير أول مرة

إعداد الأجهزة (DICOM Send / Store):
- AE Title :  TAQAM  (تقدر تغيّره من صفحة الباكس)
- IP       :  الـ IP بتاع الكمبيوتر ده — ظاهر فوق في صفحة الباكس
- Port     :  11112

من أي كمبيوتر أو موبايل تاني على نفس الشبكة:  http://IP-الكمبيوتر:${WEB_PORT}

ملفات تانية:
- PACS-START.bat : تشغيل يدوي بشاشة سودا (للتجربة)
- PACS-STOP.bat  : إيقاف
- data\\          : الحالات وقاعدة البيانات — خد منه نسخة احتياطية
`
};

function walk(dir, base, out) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name), rel = base ? base + '/' + f.name : f.name;
    if (f.isDirectory()) walk(full, rel, out); else out.push({ rel, full });
  }
  return out;
}
function items() {
  const top = 'Taqam-PACS/', out = [];
  for (const f of ['server.js', 'package.json']) out.push({ name: top + f, read: () => fs.readFileSync(path.join(ROOT, f)) });
  for (const d of ['lib', 'routes', 'public']) for (const x of walk(path.join(ROOT, d), d, [])) out.push({ name: top + x.rel, read: () => fs.readFileSync(x.full) });
  for (const [n, body] of Object.entries(FILES)) out.push({ name: top + n, read: () => Buffer.from(/\.(bat|vbs|txt)$/.test(n) ? CRLF(body) : body, 'utf8') });
  return out;
}
module.exports = { items, WEB_PORT };
