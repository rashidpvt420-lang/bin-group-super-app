# FORCE_BIN_RECOVERY.ps1
# Updated with aggressive process killing for Windows file locks.

echo "💎 [BIN-RECOVERY] Aggressively killing background Java/Gradle processes..."
Stop-Process -Name "java" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "gradle" -Force -ErrorAction SilentlyContinue

echo "💎 [BIN-RECOVERY] Stopping local Gradle services..."
cd "C:\Users\My-PC\Desktop\bin app\apps\owner-app\android"
.\gradlew.bat --stop

echo "💎 [BIN-RECOVERY] Wiping locked build folders..."
# Try to delete with retries in case lock is slow to release
1..3 | ForEach-Object {
    Remove-Item -Recurse -Force "C:\Users\My-PC\Desktop\bin app\node_modules\@capacitor\android\capacitor\build" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "C:\Users\My-PC\Desktop\bin app\apps\owner-app\android\build" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

echo "💎 [BIN-RECOVERY] Final Sync with Gradle 8.13..."
.\gradlew.bat build --refresh-dependencies

echo "💎 [DONE] Your environment is now fully synchronized and unlocked."
