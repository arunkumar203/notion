@echo off
echo ========================================
echo Setting up LLD Scraper
echo ========================================
echo.

REM Check if venv exists
if not exist ".venv" (
    echo Creating virtual environment...
    python -m venv .venv
)

echo Activating virtual environment...
call .venv\Scripts\activate.bat

echo Installing Python packages...
pip install -r requirements.txt

echo Installing Chromium browser...
python -m playwright install chromium

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To run the scraper:
echo   python seed_lld_from_website.py --headed
echo.
pause
