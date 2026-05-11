import socket
import time
import csv
import os

# ── CONFIGURACIÓN FIJA (Edita esto para cada agente) ──────────
HOST = "127.0.0.1"
PORT = 12000
CSV_FILE = "olist_orders_dataset.csv"  # <--- Cambia el nombre aquí
ETIQUETA = "ORDEN"                      # <--- Cambia la etiqueta aquí (ORDEN o PRODUCTO)
DELAY = 1                               # Segundos entre envíos
# ──────────────────────────────────────────────────────────────

def enviar_datos():
    """Lee el CSV fijo y lo envía al servidor con su etiqueta."""
    
    # 1. Verificar existencia del archivo
    if not os.path.exists(CSV_FILE):
        print(f"Error: No se encuentra el archivo '{CSV_FILE}' en esta carpeta.")
        return

    # 2. Conexión al servidor
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((HOST, PORT))
        print(f"Conectado al servidor. Enviando: {ETIQUETA}")

        with open(CSV_FILE, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader)  # Saltar encabezados

            for i, fila in enumerate(reader, start=1):
                # Formato: ETIQUETA|columna1,columna2...
                mensaje = f"{ETIQUETA}|{','.join(fila)}\n"
                
                try:
                    sock.sendall(mensaje.encode("utf-8"))
                    print(f"[{ETIQUETA}] Registro {i} enviado.")
                except Exception as e:
                    print(f"Error en el envío: {e}")
                    break

                time.sleep(DELAY)

    except ConnectionRefusedError:
        print(f"Error: El servidor no responde en {HOST}:{PORT}")
    finally:
        sock.close()
        print(f"Finalizado. Conexión cerrada.")

if __name__ == "__main__":
    enviar_datos()