"""
Agente de Telemetría – UDP
Simula sensores en tiempo real (temperatura, velocidad, presión, etc.)
que emiten datos de alta frecuencia sin garantía de entrega.
"""

import socket
import time
import random
import json
from datetime import datetime

# ── Configuración ─────────────────────────────────────────────
HOST  = "127.0.0.1"
PORT  = 12001
DELAY = 1        # segundos entre envíos
# ──────────────────────────────────────────────────────────────

# Catálogo de sensores simulados (relacionados al contexto Olist:
# almacenes, vehículos de reparto, temperatura de paquetes frágiles)
SENSORES = ["ALMACEN-SP", "VEHICULO-RJ", "VEHICULO-MG", "DEPOSITO-BA", "CAMION-RS"]


def generar_telemetria() -> dict:
    """Genera una lectura aleatoria de sensor con timestamp."""
    return {
        "sensor_id"  : random.choice(SENSORES),
        "timestamp"  : datetime.now().isoformat(timespec="seconds"),
        "temperatura": round(random.uniform(15.0, 42.0), 2),   # °C
        "velocidad"  : round(random.uniform(0.0, 120.0), 1),   # km/h
        "presion"    : round(random.uniform(1.0, 5.0), 3),      # bar
        "carga_kg"   : round(random.uniform(0.0, 1000.0), 1),  # kg
        "bateria_pct": random.randint(5, 100),
    }


def crear_socket() -> socket.socket:
    """Crea un socket UDP (sin conexión)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)       # UDP
    print(f"[UDP] Socket de telemetría listo → destino {HOST}:{PORT}")
    return s


def main() -> None:
    sock = crear_socket()
    envios = 0

    try:
        while True:
            datos    = generar_telemetria()
            payload  = json.dumps(datos).encode("utf-8")

            # UDP: sendto() no requiere conexión previa
            sock.sendto(payload, (HOST, PORT))
            envios += 1

            print(f"[UDP] #{envios:>5} | {datos['sensor_id']:<15} | "
                  f"T={datos['temperatura']}°C | "
                  f"V={datos['velocidad']} km/h | "
                  f"Bat={datos['bateria_pct']}%")

            time.sleep(DELAY)

    except KeyboardInterrupt:
        print(f"\n[UDP] Agente detenido. Total de paquetes enviados: {envios}")
    finally:
        sock.close()
        print("[UDP] Socket cerrado.")


if __name__ == "__main__":
    main()