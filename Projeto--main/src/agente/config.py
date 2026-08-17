import os
from dotenv import load_dotenv

load_dotenv()

# Variáveis para a API do Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Configurações do Banco de Dados
DB_BACKEND = os.environ.get("DB_BACKEND", "sqlite").lower()
DB_SQLITE_PATH = os.environ.get("DB_SQLITE_PATH", "data/agent.db")
DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "agente")