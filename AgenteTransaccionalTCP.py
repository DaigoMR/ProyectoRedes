"""
Agente Transaccional – TCP
Simula un sistema crítico (ej. bancario) que envía registros del
dataset de Olist línea por línea con garantía de entrega.
"""

import socket
import time
import csv
import os

# ── Configuración ─────────────────────────────────────────────
HOST    = "127.0.0.1"
PORT    = 12000
CSV_FILE = "olist_orders_dataset.csv"   
DELAY   = 1                         # segundos entre envíos
# ──────────────────────────────────────────────────────────────


def conectar() -> socket.socket:
    """Crea el socket TCP y establece la conexión con el servidor."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)   # TCP
    s.connect((HOST, PORT))
    print(f"[TCP] Conectado a {HOST}:{PORT}")
    return s


def enviar_csv(sock: socket.socket, ruta: str) -> None:
    """Lee el CSV línea por línea y envía cada registro al servidor."""
    if not os.path.exists(ruta):
        print(f"[TCP] ERROR – Archivo no encontrado: {ruta}")
        return

    with open(ruta, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        encabezado = next(reader)                            # primera fila = cabecera
        print(f"[TCP] Columnas detectadas: {encabezado}")

        for i, fila in enumerate(reader, start=1):
            # Convertir la fila a texto CSV y codificar en UTF-8
            mensaje = ",".join(fila) + "\n"
            datos   = mensaje.encode("utf-8")

            try:
                sock.sendall(datos)                          # sendall garantiza envío completo
                print(f"[TCP] Registro {i:>5} enviado → {mensaje[:80].strip()}")
            except BrokenPipeError:
                print("[TCP] Conexión cerrada por el servidor.")
                break

            time.sleep(DELAY)                                # pausa para simular tráfico real

    print("[TCP] Transmisión finalizada.")


def main() -> None:
    sock = None
    try:
        sock = conectar()
        enviar_csv(sock, CSV_FILE)
    except ConnectionRefusedError:
        print(f"[TCP] ERROR – No se puede conectar a {HOST}:{PORT}. ¿El servidor está activo?")
    except KeyboardInterrupt:
        print("\n[TCP] Agente detenido por el usuario.")
    finally:
        if sock:
            sock.close()
            print("[TCP] Socket cerrado.")


if __name__ == "__main__":
    main()