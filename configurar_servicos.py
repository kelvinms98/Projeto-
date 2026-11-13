import getpass
import os
import re
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"
KEYS = {
    "NEXUS_SMTP_HOST": "smtp.gmail.com",
    "NEXUS_SMTP_PORT": "465",
    "NEXUS_SMTP_SECURE": "true",
    "NEXUS_SMTP_USER": "nexusstorestred@gmail.com",
    "NEXUS_EMAIL_FROM": "nexusstorestred@gmail.com",
    "NEXUS_SHIPPING_BASE_BRL": "8.00",
    "NEXUS_SHIPPING_SERVICE_BRL": "3.50",
}


def read_existing_env():
    if not ENV_PATH.exists():
        return []
    return ENV_PATH.read_text(encoding="utf-8").splitlines()


def existing_values(lines):
    values = {}
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def ask_value(prompt, default):
    entered = input(f"{prompt} [{default}]: ").strip()
    return entered or default


def update_env(lines, values):
    updated = []
    written = set()
    key_pattern = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=")
    for line in lines:
        match = key_pattern.match(line)
        key = match.group(1) if match else None
        if key in values:
            if key not in written:
                updated.append(f"{key}={values[key]}")
                written.add(key)
            continue
        updated.append(line)
    for key, value in values.items():
        if key not in written:
            updated.append(f"{key}={value}")
    return updated


def save_env(lines):
    content = "\n".join(lines).rstrip() + "\n"
    handle, temporary_path = tempfile.mkstemp(
        prefix=".env-",
        suffix=".tmp",
        dir=ROOT,
        text=True,
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8", newline="\n") as output:
            output.write(content)
        os.replace(temporary_path, ENV_PATH)
    except OSError:
        try:
            os.unlink(temporary_path)
        except OSError:
            pass
        raise


def main():
    print("Configuração SMTP local NEXUS — a senha não será exibida nem enviada.")
    lines = read_existing_env()
    current = existing_values(lines)
    smtp_host = ask_value(
        "Servidor SMTP",
        current.get("NEXUS_SMTP_HOST", KEYS["NEXUS_SMTP_HOST"]),
    )
    smtp_port = ask_value(
        "Porta SMTP",
        current.get("NEXUS_SMTP_PORT", KEYS["NEXUS_SMTP_PORT"]),
    )
    if not smtp_port.isdigit() or not 1 <= int(smtp_port) <= 65535:
        raise SystemExit("Porta inválida; informe um número entre 1 e 65535.")
    secure_default = current.get("NEXUS_SMTP_SECURE", "true" if smtp_port == "465" else "false")
    secure = ask_value("Usar SSL direto? (true/false)", secure_default).lower()
    if secure not in {"true", "false"}:
        raise SystemExit("Informe true ou false para SSL direto.")
    smtp_user = ask_value(
        "Usuário SMTP",
        current.get("NEXUS_SMTP_USER", KEYS["NEXUS_SMTP_USER"]),
    )
    email_from = ask_value(
        "Endereço remetente",
        current.get("NEXUS_EMAIL_FROM", smtp_user),
    )
    smtp_password = getpass.getpass("Senha/chave SMTP (entrada oculta): ").strip()
    if not smtp_host or not smtp_user or not email_from or not smtp_password:
        raise SystemExit("Configuração cancelada: preencha servidor, usuário, remetente e senha.")

    values = {
        **KEYS,
        "NEXUS_SMTP_HOST": smtp_host,
        "NEXUS_SMTP_PORT": smtp_port,
        "NEXUS_SMTP_SECURE": secure,
        "NEXUS_SMTP_USER": smtp_user,
        "NEXUS_SMTP_PASSWORD": "".join(smtp_password.split()),
        "NEXUS_EMAIL_FROM": email_from,
    }
    lines = update_env(lines, values)
    try:
        save_env(lines)
    except OSError as error:
        raise SystemExit(f"Não foi possível salvar o .env: {error}") from error

    print("\nConfigurações salvas localmente no .env.")
    print("Reinicie o servidor NEXUS para ativar o SMTP e a taxa fixa de entrega.")
    print("As credenciais não foram mostradas na tela.")


if __name__ == "__main__":
    main()
