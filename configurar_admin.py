import getpass
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOGIN_PATTERN = re.compile(r"^[a-zA-Z0-9._-]{3,32}$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def main():
    print("Configurador local do administrador NEXUS.")
    print("A senha é digitada sem aparecer e enviada somente ao banco local.")
    username = input("Usuário do administrador [kelvinmonteiro]: ").strip() or "kelvinmonteiro"
    if not LOGIN_PATTERN.fullmatch(username):
        raise SystemExit("Usuário inválido: use 3 a 32 letras, números, ponto, hífen ou sublinhado.")
    name = input("Nome para exibição [Administrador NEXUS]: ").strip() or "Administrador NEXUS"
    if len(name) > 120:
        raise SystemExit("O nome deve ter até 120 caracteres.")
    email = input("E-mail de recuperação/contato: ").strip().lower()
    if not EMAIL_PATTERN.fullmatch(email):
        raise SystemExit("Informe um e-mail válido.")

    password = getpass.getpass("Nova senha (mínimo 12 caracteres, entrada oculta): ")
    confirmation = getpass.getpass("Repita a nova senha: ")
    if password != confirmation:
        raise SystemExit("As senhas não correspondem.")
    if len(password) < 12 or len(password) > 256:
        raise SystemExit("A senha deve ter entre 12 e 256 caracteres.")

    payload = json.dumps({
        "username": username,
        "name": name,
        "email": email,
        "password": password,
    })
    environment = os.environ.copy()
    environment["NEXUS_SETUP_ADMIN"] = "1"
    result = subprocess.run(
        ["node", str(ROOT / "scripts" / "setup-admin.js")],
        cwd=ROOT,
        input=payload,
        text=True,
        capture_output=True,
        env=environment,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip() or "Não foi possível salvar o administrador.")
    print(result.stdout.strip())
    print("Entre em http://localhost:8081/login com esse usuário e a nova senha.")


if __name__ == "__main__":
    main()
