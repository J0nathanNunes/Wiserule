"""
Script para converter certificado A1 (.pfx) em base64.

Como usar:
    python scripts/gerar_cert_base64.py C:/caminho/certificado.pfx

Isso vai gerar uma string base64 que você pode colar na variável
GERANET_CERT_BASE64 nas configs do Railway.
"""

import base64
import sys
from pathlib import Path


def exportar_base64(caminho_arquivo: str) -> str:
    """Lê um .pfx e retorna em base64."""
    if not Path(caminho_arquivo).exists():
        print(f"❌ Arquivo não encontrado: {caminho_arquivo}")
        sys.exit(1)

    dados = Path(caminho_arquivo).read_bytes()
    return base64.b64encode(dados).decode()


def main():
    if len(sys.argv) < 2:
        print("Uso: python gerar_cert_base64.py <caminho_do_certificado.pfx>")
        print("Exemplo: python gerar_cert_base64.py C:/certificados/certificado_a1.pfx")
        sys.exit(1)

    caminho = sys.argv[1]
    b64 = exportar_base64(caminho)

    print("\n" + "=" * 60)
    print("✅ Certificado convertido para base64!")
    print("=" * 60)
    print(f"\n📄 Arquivo: {caminho}")
    print(f"📏 Tamanho: {len(b64)} caracteres")
    print(f"🔑 Hash MD5: {base64.b64encode(base64.b64decode(b64)).decode()[:20]}...")
    print("\n📋 Copie a linha abaixo e cole como GERANET_CERT_BASE64 no Railway:\n")
    print(b64)
    print()
    print("=" * 60)
    print("⚠️  Lembre-se também de configurar GERANET_CERT_PASSWORD no Railway!")
    print("=" * 60)


if __name__ == "__main__":
    main()