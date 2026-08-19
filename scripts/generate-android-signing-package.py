import base64
import os
import secrets
import string
import subprocess
import textwrap
from pathlib import Path


def repo_root() -> Path:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            check=True,
            capture_output=True,
            text=True,
            cwd=Path(__file__).resolve().parent,
        )
        return Path(result.stdout.strip()).resolve()
    except (OSError, subprocess.CalledProcessError):
        return Path(__file__).resolve().parents[1]


def is_inside(candidate: Path, parent: Path) -> bool:
    try:
        candidate.relative_to(parent)
        return True
    except ValueError:
        return False


def resolve_private_package_dir(root: Path) -> Path:
    configured = os.environ.get("BIN_GROUP_PRIVATE_SIGNING_DIR", "").strip()
    package_dir = (
        Path(configured).expanduser()
        if configured
        else Path.home() / ".bin-group-private" / "android-signing-package"
    ).resolve()

    if is_inside(package_dir, root):
        raise RuntimeError(
            "Refusing to write Android signing material inside the Git repository. "
            "Set BIN_GROUP_PRIVATE_SIGNING_DIR to a private path outside the checkout."
        )

    return package_dir


def restrict_permissions(path: Path, mode: int) -> None:
    try:
        path.chmod(mode)
    except OSError:
        # Windows ACLs do not map cleanly to POSIX modes; the outside-repo guard is mandatory.
        pass


def main():
    root = repo_root()
    package_dir = resolve_private_package_dir(root)
    package_dir.mkdir(parents=True, exist_ok=True)
    restrict_permissions(package_dir, 0o700)

    keystore = package_dir / "bin-group-upload.jks"
    cert_pem = package_dir / "bin-group-upload-certificate.pem"
    secrets_txt = package_dir / "github-production-android-secrets.txt"
    readme_txt = package_dir / "README.txt"

    protected_outputs = (keystore, cert_pem, secrets_txt, readme_txt)
    existing = [path.name for path in protected_outputs if path.exists()]
    if existing:
        raise RuntimeError(
            "Refusing to overwrite an existing Android signing package: "
            + ", ".join(existing)
            + ". Move or securely archive the old private package first."
        )

    alias = "bin-group-key"
    alphabet = string.ascii_letters + string.digits
    store_password = "".join(secrets.choice(alphabet) for _ in range(36))
    key_password = "".join(secrets.choice(alphabet) for _ in range(36))

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
    restrict_permissions(keystore, 0o600)

    cmd_export = [
        "keytool", "-exportcert", "-rfc",
        "-alias", alias,
        "-keystore", str(keystore),
        "-storepass", store_password,
        "-file", str(cert_pem),
    ]
    subprocess.run(cmd_export, check=True, capture_output=True, text=True)

    keystore_b64 = base64.b64encode(keystore.read_bytes()).decode("ascii")

    secrets_txt.write_text(
        "BIN GROUP — GitHub Production Android Signing Secrets\n"
        "KEEP THIS FILE PRIVATE. DO NOT COMMIT IT TO GIT.\n\n"
        f"ANDROID_UPLOAD_KEYSTORE_BASE64={keystore_b64}\n"
        f"ANDROID_KEYSTORE_PASSWORD={store_password}\n"
        f"ANDROID_KEY_ALIAS={alias}\n"
        f"ANDROID_KEY_PASSWORD={key_password}\n",
        encoding="utf-8",
    )
    restrict_permissions(secrets_txt, 0o600)

    readme_txt.write_text(
        textwrap.dedent(f"""\
        BIN GROUP Android Upload Signing Package
        ----------------------------------------

        This directory is intentionally outside the Git repository.

        Files generated in this private folder:
        - bin-group-upload.jks
          Private Android upload keystore. Keep offline backups. Never commit it to git.
        - bin-group-upload-certificate.pem
          Public certificate used for Google Play upload-key registration/reset.
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

    cmd_verify = [
        "keytool", "-list",
        "-keystore", str(keystore),
        "-storepass", store_password,
        "-alias", alias,
    ]
    subprocess.run(cmd_verify, check=True, capture_output=True, text=True)

    print("[android-signing-generator] Successfully generated and verified a private Android upload signing package.")
    print(f"Package Directory: {package_dir}")
    print("Signing secrets were written only to the private package directory and were not printed.")


if __name__ == "__main__":
    main()
