import socket
import time
import csv
import os
import threading
import json

# ── CONFIGURACIÓN GLOBAL ──────────────────────────────────────
HOST = "127.0.0.1"
PORT = 12000
DELAY = 1  # Un registro por segundo para control visual

ARCHIVOS_CONFIG = [
    {"archivo": "olist_orders_dataset.csv", "etiqueta": "ORDEN"},
    {"archivo": "olist_order_items_dataset.csv", "etiqueta": "ITEM"},
    {"archivo": "olist_customers_dataset.csv", "etiqueta": "CLIENTE"},
    {"archivo": "olist_order_reviews_dataset.csv", "etiqueta": "REVIEW"}
]

detener_agente = False
# ──────────────────────────────────────────────────────────────

def enviar_datos_archivo(csv_file, etiqueta):
    global detener_agente

    if not os.path.exists(csv_file):
        print(f"[{etiqueta}] Error: No se encuentra el archivo '{csv_file}'.")
        return

    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((HOST, PORT))
        print(f"[{etiqueta}] Conectado. Transmitiendo JSON seguro a 1 reg/seg...")

        with open(csv_file, newline="", encoding="utf-8") as f:
            # DictReader mapea automáticamente cada fila a un diccionario {columna: valor}
            reader = csv.DictReader(f)

            for i, fila in enumerate(reader, start=1):
                if detener_agente:
                    break
                
                # Limpieza de saltos de línea molestos manteniendo la estructura intacta
                fila_limpia = {}
                for k, v in fila.items():
                    fila_limpia[k] = v.replace('\n', ' ').replace('\r', ' ') if v else ""
                
                # Serializamos la fila completa a JSON seguro
                json_payload = json.dumps(fila_limpia)
                mensaje = f"{etiqueta}|{json_payload}\n"
                
                try:
                    sock.sendall(mensaje.encode("utf-8"))
                    print(f"[{etiqueta}] Registro {i} enviado.")
                except Exception as e:
                    print(f"[{etiqueta}] Error en el envío: {e}")
                    break

                pasos_tiempo = 0
                while pasos_tiempo < DELAY and not detener_agente:
                    time.sleep(0.1)
                    pasos_tiempo += 0.1

    except ConnectionRefusedError:
        print(f"[{etiqueta}] Error: El servidor no responde.")
    finally:
        sock.close()
        print(f"[{etiqueta}] Conexión cerrada.")

def iniciar_agente_multihilo():
    global detener_agente
    hilos = []

    print("--- Iniciando Agente Multihilo JSON Seguro ---")
    print("--> Presiona Ctrl + C para detener la transmisión.\n")
    
    for config in ARCHIVOS_CONFIG:
        hilo = threading.Thread(target=enviar_datos_archivo, args=(config["archivo"], config["etiqueta"]))
        hilos.append(hilo)
        hilo.daemon = True
        hilo.start()

    try:
        while any(hilo.is_alive() for hilo in hilos):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nDeteniendo hilos de forma segura...")
        detener_agente = True
        for hilo in hilos:
            hilo.join(timeout=1.0)
            
    print("--- Agente finalizado ---")

if __name__ == "__main__":
    iniciar_agente_multihilo()