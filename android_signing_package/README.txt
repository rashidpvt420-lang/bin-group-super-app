BIN GROUP Android Upload Signing Package
----------------------------------------

Files generated in this folder:
- bin-group-upload.jks
  Private Android upload keystore. Keep offline backups. Never commit it to git.
- bin-group-upload-certificate.pem
  Public certificate only. Safe to provide to Google Play Console if an upload-key reset is required.
- github-production-android-secrets.txt
  Contains the four GitHub production Environment secret values required by .github/workflows/android-store-release.yml.

GitHub Environment Secret Names (Target: Repository -> Settings -> Environments -> production -> Environment secrets):
1. ANDROID_UPLOAD_KEYSTORE_BASE64
2. ANDROID_KEYSTORE_PASSWORD
3. ANDROID_KEY_ALIAS
4. ANDROID_KEY_PASSWORD

Alias: bin-group-key
