import socket
import threading
import os
from datetime import datetime
from supabase import create_client, Client

# ── Configuración Supabase ────────────────────────────────────
SUPABASE_URL = "https://qqwdtfddrvgcbhnjvfnv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd2R0ZmRkcnZnY2Jobmp2Zm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDY2ODksImV4cCI6MjA5MzgyMjY4OX0.w5yBm3b6VpqiyQ2ZThjFifM2miYrsPidSzJhjsAAnQg" 
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Configuración de Red ──────────────────────────────────────
HOST = "127.0.0.1"
PORT_TCP = 12000
PORT_UDP = 12001
BUFFER_UDP = 4096

# ══════════════════════════════════════════════════════════════
#  LÓGICA DE INSERCIÓN ESTRUCTURADA
# ══════════════════════════════════════════════════════════════

def insertar_en_db_estructurado(etiqueta, linea_datos, addr):
    """
    Separa la línea del CSV y la mapea a las columnas reales 
    de las tablas en Supabase.
    """
    columnas = linea_datos.split(',')
    
    try:
        if etiqueta == "ORDEN":
            # Mapeo según olist_orders_dataset.csv
            payload = {
                "order_id": columnas[0],
                "customer_id": columnas[1],
                "order_status": columnas[2],
                "order_purchase_timestamp": columnas[3],
                "order_approved_at": columnas[4],
                "order_delivered_carrier_date": columnas[5],
                "order_delivered_customer_date": columnas[6],
                "order_estimated_delivery_date": columnas[7],
                "cliente_info": f"{addr[0]}:{addr[1]}"
            }
            tabla = "ordenesDeCompra"

        elif etiqueta == "PRODUCTO":
            # Mapeo según olist_products_dataset.csv
            # Convertimos a float los valores numéricos (peso, dimensiones)
            payload = {
                "product_id": columnas[0],
                "product_category_name": columnas[1],
                "product_name_lenght": columnas[2],
                "product_description_lenght": columnas[3],
                "product_photos_qty": columnas[4],
                "product_weight_g": float(columnas[5]) if columnas[5] else 0,
                "product_length_cm": float(columnas[6]) if columnas[6] else 0,
                "product_height_cm": float(columnas[7]) if columnas[7] else 0,
                "product_width_cm": float(columnas[8]) if columnas[8] else 0,
                "cliente_info": f"{addr[0]}:{addr[1]}"
            }
            tabla = "productos"
        
        else:
            print(f"[TCP] Etiqueta desconocida: {etiqueta}")
            return

        # Inserción en la tabla correspondiente
        supabase.table(tabla).insert(payload).execute()
        print(f"[DB] {etiqueta} guardada exitosamente en {tabla}")

    except Exception as e:
        print(f"[DB ERROR] Error procesando {etiqueta}: {e}")

# ══════════════════════════════════════════════════════════════
#  MANEJADORES DE PROTOCOLO
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
                    # Separamos la etiqueta del contenido
                    etiqueta, datos_csv = linea.split("|", 1)
                    insertar_en_db_estructurado(etiqueta, datos_csv, addr)
    finally:
        conn.close()
        print(f"[TCP] Cliente {addr} desconectado.")

def escuchar_udp():
    srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    srv.bind((HOST, PORT_UDP))
    print(f"[UDP] Escuchando en {HOST}:{PORT_UDP}")
    while True:
        data, addr = srv.recvfrom(BUFFER_UDP)
        # Aquí puedes mantener la lógica de telemetría anterior
        print(f"[UDP] Datos recibidos de {addr}")

# ══════════════════════════════════════════════════════════════
#  EJECUCIÓN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # Hilo para TCP
    threading.Thread(target=lambda: (
        srv := socket.socket(socket.AF_INET, socket.SOCK_STREAM),
        srv.bind((HOST, PORT_TCP)),
        srv.listen(5),
        print(f"[TCP] Escuchando en {HOST}:{PORT_TCP}"),
        [threading.Thread(target=manejar_cliente_tcp, args=srv.accept(), daemon=True).start() for _ in iter(int, 1)]
    ), daemon=True).start()

    # Hilo para UDP
    threading.Thread(target=escuchar_udp, daemon=True).start()

    try:
        while True: import time; time.sleep(1)
    except KeyboardInterrupt:
        print("Apagando servidor...")