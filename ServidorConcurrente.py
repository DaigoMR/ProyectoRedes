"""
Servidor Concurrente – Fase 2, Paso 1
Recibe datos de múltiples clientes TCP (transaccional) y UDP (telemetría)
simultáneamente usando threading para evitar bloqueos.
"""

import socket
import threading
import json
import csv
import os
from datetime import datetime
from supabase import create_client, Client

# ── Configuración Supabase ────────────────────────────────────
SUPABASE_URL = "https://qqwdtfddrvgcbhnjvfnv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd2R0ZmRkcnZnY2Jobmp2Zm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDY2ODksImV4cCI6MjA5MzgyMjY4OX0.w5yBm3b6VpqiyQ2ZThjFifM2miYrsPidSzJhjsAAnQg"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Configuración ─────────────────────────────────────────────
HOST        = "127.0.0.1"
PORT_TCP    = 12000
PORT_UDP    = 12001
BUFFER_UDP  = 4096          # bytes máximos por datagrama UDP
ARCHIVO_TCP = r"c:/TrabajosPythonVS/ActividadesRedes/ProyectoFinal/recibidos_tcp.csv"
ARCHIVO_UDP = r"c:/TrabajosPythonVS/ActividadesRedes/ProyectoFinal/recibidos_udp.json"
# ──────────────────────────────────────────────────────────────

# Lock global para escritura segura en archivos (evita condiciones de carrera)
lock_tcp = threading.Lock()
lock_udp = threading.Lock()

# Contador de clientes TCP activos (hilo-seguro)
clientes_activos = 0
lock_contador    = threading.Lock()


# ══════════════════════════════════════════════════════════════
#  UTILIDADES DE ALMACENAMIENTO
# ══════════════════════════════════════════════════════════════

def guardar_tcp(linea: str, cliente_addr: tuple) -> None:
    """Persiste cada registro TCP en un CSV con metadata y en Supabase."""
    timestamp = datetime.now().isoformat(timespec="seconds")
    fila = [timestamp, f"{cliente_addr[0]}:{cliente_addr[1]}", linea.strip()]

    with lock_tcp:
        nuevo = not os.path.exists(ARCHIVO_TCP)
        with open(ARCHIVO_TCP, "a", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            if nuevo:
                w.writerow(["timestamp", "cliente", "dato"])
            w.writerow(fila)

    insertar_en_db("TCP", {"dato": linea.strip()}, cliente_addr)


def guardar_udp(payload: dict, origen: tuple) -> None:
    """Persiste cada datagrama UDP en un archivo JSON y en Supabase."""
    payload["_origen"] = f"{origen[0]}:{origen[1]}"
    payload["_recibido"] = datetime.now().isoformat(timespec="seconds")

    with lock_udp:
        with open(ARCHIVO_UDP, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload) + "\n")

    insertar_en_db("UDP", payload, origen)


# ══════════════════════════════════════════════════════════════
#  MANEJADOR TCP – un hilo por cliente
# ══════════════════════════════════════════════════════════════

def manejar_cliente_tcp(conn: socket.socket, addr: tuple) -> None:
    """
    Ejecutado en su propio hilo.
    Lee el stream de bytes del cliente hasta que cierre la conexión.
    """
    global clientes_activos

    with lock_contador:
        clientes_activos += 1
        n = clientes_activos

    print(f"[TCP]Cliente {addr} conectado  (activos: {n})")

    buffer = ""
    try:
        while True:
            fragmento = conn.recv(1024)
            if not fragmento:           # cliente cerró la conexión
                break

            buffer += fragmento.decode("utf-8")

            # Procesar líneas completas (delimitadas por \n)
            while "\n" in buffer:
                linea, buffer = buffer.split("\n", 1)
                if linea.strip():
                    guardar_tcp(linea, addr)
                    print(f"[TCP] 📥 {addr} → {linea[:90].strip()}")

    except ConnectionResetError:
        print(f"[TCP]{addr} cerró la conexión abruptamente.")
    finally:
        conn.close()
        with lock_contador:
            clientes_activos -= 1
        print(f"[TCP]Cliente {addr} desconectado (activos: {clientes_activos})")

def insertar_en_db(origen, contenido, addr):
    """Envía los datos a la tabla 'registros_servidor' en Supabase."""
    try:
        data = {
            "origen": origen,
            "contenido": contenido,
            "cliente_info": f"{addr[0]}:{addr[1]}"
        }
        supabase.table("registros_servidor").insert(data).execute()
    except Exception as e:
        print(f"[DB ERROR] No se pudo insertar: {e}")

# ══════════════════════════════════════════════════════════════
#  LISTENER TCP – hilo principal TCP
# ══════════════════════════════════════════════════════════════

def escuchar_tcp() -> None:
    """
    Hilo permanente: acepta conexiones entrantes y lanza un
    sub-hilo por cada cliente TCP nuevo.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT_TCP))
    srv.listen(10)                      # cola de hasta 10 conexiones pendientes
    print(f"[TCP]Escuchando en {HOST}:{PORT_TCP}")

    while True:
        try:
            conn, addr = srv.accept()   # bloquea hasta nueva conexión
            hilo = threading.Thread(
                target=manejar_cliente_tcp,
                args=(conn, addr),
                daemon=True,            # muere si el proceso principal termina
                name=f"TCP-{addr[1]}"
            )
            hilo.start()
        except Exception as e:
            print(f"[TCP] ERROR en accept: {e}")

# ══════════════════════════════════════════════════════════════
#  LISTENER UDP – hilo principal UDP
# ══════════════════════════════════════════════════════════════

def escuchar_udp() -> None:
    """
    Hilo permanente: recibe datagramas UDP, los decodifica 
    y los guarda usando el lock de UDP.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    srv.bind((HOST, PORT_UDP))
    print(f"[UDP]Escuchando en {HOST}:{PORT_UDP}")

    while True:
        try:
            data, addr = srv.recvfrom(BUFFER_UDP)
            payload = json.loads(data.decode("utf-8"))
            guardar_udp(payload, addr)
            # Imprimir resumen breve
            print(f"[UDP]{addr} → {payload.get('sensor_id')} (T={payload.get('temperatura')}°C)")
        except Exception as e:
            print(f"[UDP] ERROR: {e}")

# ══════════════════════════════════════════════════════════════
#  EJECUCIÓN PRINCIPAL
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    threading.Thread(target=escuchar_tcp, daemon=True).start()
    threading.Thread(target=escuchar_udp, daemon=True).start()
    print("Servidor con DB activada. Presiona Ctrl+C para salir.")
    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nApagando servidor...")