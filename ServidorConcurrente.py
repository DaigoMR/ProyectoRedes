import socket
import threading
import os
import json
from datetime import datetime
from supabase import create_client, Client

# ── Configuración Supabase ────────────────────────────────────
SUPABASE_URL = "https://qqwdtfddrvgcbhnjvfnv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd2R0ZmRkcnZnY2Jobmp2Zm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDY2ODksImV4cCI6MjA5MzgyMjY4OX0.w5yBm3b6VpqiyQ2ZThjFifM2miYrsPidSzJhjsAAnQg" 
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

HOST = "127.0.0.1"
PORT_TCP = 12000
PORT_UDP = 12001
BUFFER_UDP = 4096

# ══════════════════════════════════════════════════════════════
#  UTILIDADES Y LÓGICA DE INSERCIÓN
# ══════════════════════════════════════════════════════════════

def limpiar(valor):
    # Quitamos espacios y comillas, si queda vacío devolvemos None (NULL en SQL)
    val = valor.strip().replace('"', '')
    return None if val == "" else val

def insertar_en_db_estructurado(etiqueta, linea_datos, addr, protocolo="TCP"):
    try:
        payload_para_log = {}
        tabla_destino = None  # Inicializamos como None

        # --- CASO 1: TCP (ORDENES Y PRODUCTOS) ---
        if protocolo == "TCP":
            columnas = [c.strip() for c in linea_datos.split(',')]
            payload_negocio = {}

            if etiqueta == "ORDEN":
                tabla_destino = "ordenesDeCompra"
                payload_negocio = {
                    "order_id": limpiar(columnas[0]),
                    "customer_id": limpiar(columnas[1]),
                    "order_status": limpiar(columnas[2]),
                    "order_purchase_timestamp": limpiar(columnas[3]),
                    "order_approved_at": limpiar(columnas[4]),
                    "order_delivered_carrier_date": limpiar(columnas[5]),
                    "order_delivered_customer_date": limpiar(columnas[6]),
                    "order_estimated_delivery_date": limpiar(columnas[7]),
                    "cliente_info": f"{addr[0]}:{addr[1]}"
                }

            elif etiqueta == "PRODUCTO":
                tabla_destino = "productos"
                payload_negocio = {
                    "product_id": columnas[0],
                    "product_category_name": columnas[1],
                    "product_name_lenght": columnas[2],
                    "product_description_lenght": columnas[3],
                    "product_photos_qty": columnas[4],
                    "product_weight_g": columnas[5],
                    "product_length_cm": columnas[6],
                    "product_height_cm": columnas[7],
                    "product_width_cm": columnas[8],
                    "cliente_info": f"{addr[0]}:{addr[1]}"
                }

            if tabla_destino:
                supabase.table(tabla_destino).upsert(payload_negocio).execute()
                payload_para_log = {"msg": f"Carga {etiqueta}", "data": payload_negocio}
                print(f"[TCP] {etiqueta} guardado en {tabla_destino}")
            else:
                return 

        # --- CASO 2: UDP ---
        elif protocolo == "UDP":
            try:
                # Convertimos el dato recibido a número
                valor_temp = float(linea_datos)
                # Creamos el objeto con la llave exacta que busca React
                payload_para_log = {"temperatura": valor_temp}
                print(f"[UDP] Temperatura recibida: {valor_temp}°C de {addr}")
            except ValueError:
                # Si recibes algo que no es número, lo guardas como texto
                payload_para_log = {"raw_data": linea_datos}

        # --- REGISTRO GENERAL ---
        log_final = {
            "origen": etiqueta if etiqueta else protocolo, # Guardará 'ORDEN', 'PRODUCTO' o 'UDP'
            "contenido": payload_negocio if protocolo == "TCP" else payload_para_log, 
            "fecha": datetime.now().isoformat(),
            "cliente_info": f"{addr[0]}:{addr[1]}"
        }
        supabase.table("registros_servidor").insert(log_final).execute()

    except Exception as e:
        print(f"[DB ERROR] Error en {protocolo}: {e}")

# ══════════════════════════════════════════════════════════════
#  MANEJADORES
# ══════════════════════════════════════════════════════════════

def manejar_cliente_tcp(conn, addr):
    print(f"[TCP] Cliente {addr} conectado.")
    buffer = ""
    try:
        while True:
            fragmento = conn.recv(1024).decode("utf-8")
            if not fragmento: break
            buffer += fragmento
            while "\n" in buffer:
                linea, buffer = buffer.split("\n", 1)
                linea = linea.strip()
                if "|" in linea:
                    etiqueta, datos_csv = linea.split("|", 1)
                    insertar_en_db_estructurado(etiqueta, datos_csv, addr, "TCP")
    finally:
        conn.close()
        print(f"[TCP] Cliente {addr} desconectado.")

def escuchar_udp():
    srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    srv.bind((HOST, PORT_UDP))
    print(f"[UDP] Escuchando en {HOST}:{PORT_UDP}")
    while True:
        data, addr = srv.recvfrom(BUFFER_UDP)
        insertar_en_db_estructurado(None, data.decode("utf-8").strip(), addr, "UDP")

# ══════════════════════════════════════════════════════════════
#  EJECUCIÓN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Hilo TCP
    t_tcp = threading.Thread(target=lambda: (
        srv := socket.socket(socket.AF_INET, socket.SOCK_STREAM),
        srv.bind((HOST, PORT_TCP)),
        srv.listen(5),
        [threading.Thread(target=manejar_cliente_tcp, args=srv.accept(), daemon=True).start() for _ in iter(int, 1)]
    ), daemon=True)
    t_tcp.start()

    # Hilo UDP
    threading.Thread(target=escuchar_udp, daemon=True).start()

    try:
        while True: import time; time.sleep(1)
    except KeyboardInterrupt:
        print("\nServidor apagado.")