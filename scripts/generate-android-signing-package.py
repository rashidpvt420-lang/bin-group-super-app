import os
import secrets
import string
import subprocess
import base64
import textwrap
from pathlib import Path

def main():
    package_dir = Path("android_signing_package")
    package_dir.mkdir(exist_ok=True)

    keystore = package_dir / "bin-group-upload.jks"
    cert_pem = package_dir / "bin-group-upload-certificate.pem"
    secrets_txt = package_dir / "github-production-android-secrets.txt"
    readme_txt = package_dir / "README.txt"

    alias = "bin-group-key"
    alphabet = string.ascii_letters + string.digits
    store_password = "".join(secrets.choice(alphabet) for _ in range(36))
    key_password = "".join(secrets.choice(alphabet) for _ in range(36))

    # Generate 4096-bit RSA Upload Keystore
    cmd_gen = [
        "keytool", "-genkeypair",
        "-alias", alias,
        "-keyalg", "RSA",
        "-keysize", "4096",
        "-sigalg", "SHA256withRSA",
        "-validity", "10000",
        "-keystore", str(keystore),
        "-storetype", "JKS",
        "-storepass", store_password,
        "-keypass", key_password,
        "-dname", "CN=BIN GROUP Android Upload, OU=Mobile Release, O=BIN GROUP General Maintenance and Property Management LLC, L=Al Ain, ST=Abu Dhabi, C=AE",
        "-noprompt",
    ]
    subprocess.run(cmd_gen, check=True, capture_output=True, text=True)

    # Export Public Certificate
    cmd_export = [
        "keytool", "-exportcert", "-rfc",
        "-alias", alias,
        "-keystore", str(keystore),
        "-storepass", store_password,
        "-file", str(cert_pem),
    ]
    subprocess.run(cmd_export, check=True, capture_output=True, text=True)

    # Base64 encode the keystore file
    keystore_bytes = keystore.read_bytes()
    keystore_b64 = base64.b64encode(keystore_bytes).decode("ascii")

    # Write secrets text file
    secrets_txt.write_text(
        "BIN GROUP — GitHub Production Android Signing Secrets\n"
        "KEEP THIS FILE PRIVATE. DO NOT COMMIT IT TO GIT.\n\n"
        f"ANDROID_UPLOAD_KEYSTORE_BASE64={keystore_b64}\n"
        f"ANDROID_KEYSTORE_PASSWORD={store_password}\n"
        f"ANDROID_KEY_ALIAS={alias}\n"
        f"ANDROID_KEY_PASSWORD={key_password}\n",
        encoding="utf-8",
    )

    # Write Readme instructions
    readme_txt.write_text(
        textwrap.dedent(f"""\
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

        Alias: {alias}
        """),
        encoding="utf-8",
    )

    # Verify keystore alias
    cmd_verify = [
        "keytool", "-list",
        "-keystore", str(keystore),
        "-storepass", store_password,
        "-alias", alias,
    ]
    subprocess.run(cmd_verify, check=True, capture_output=True, text=True)

    print("[android-signing-generator] Successfully generated and verified BIN GROUP Android Upload Signing Package.")
    print(f"Package Directory: {package_dir.resolve()}")
    print(f"Secrets File: {secrets_txt.resolve()}")

if __name__ == "__main__":
    main()
