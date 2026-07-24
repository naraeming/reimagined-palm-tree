@echo off
REM 배달K 월간 리포트 리마인더 — 매월 5일 Windows 작업 스케줄러가 호출.
REM 대상월 인자 없음 = send-reminder.js가 지난달로 자동 설정.
"C:\Program Files\nodejs\node.exe" "%~dp0send-reminder.js"
