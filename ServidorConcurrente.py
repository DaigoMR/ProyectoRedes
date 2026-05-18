import socket
import threading
import os
import json
import queue
import time
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

cola_procesamiento = queue.Queue()

# ══════════════════════════════════════════════════════════════
#  UTILIDADES Y LÓGICA DE INSERCIÓN
# ══════════════════════════════════════════════════════════════

def limpiar(valor):
    if valor is None:
        return None
    val = str(valor).strip().replace('"', '')
    return None if val == "" or val.lower() == "nan" else val

def procesar_e_insertar(etiqueta, datos_json, ip_cliente):
    """Deserializa el JSON de red e inserta con mapeo explícito de llaves."""
    try:
        payload_negocio = {}
        tabla_destino = None 

        # Deserialización segura libre de problemas por comas internas
        row = json.loads(datos_json)

        if etiqueta == "ORDEN":
            tabla_destino = "orders"
            payload_negocio = {
                "order_id": limpiar(row.get("order_id")),
                "customer_id": limpiar(row.get("customer_id")),
                "order_status": limpiar(row.get("order_status")),
                "order_purchase_timestamp": limpiar(row.get("order_purchase_timestamp")),
                "order_approved_at": limpiar(row.get("order_approved_at")),
                "order_delivered_carrier_date": limpiar(row.get("order_delivered_carrier_date")),
                "order_delivered_customer_date": limpiar(row.get("order_delivered_customer_date")),
                "order_estimated_delivery_date": limpiar(row.get("order_estimated_delivery_date")),
                "cliente_info": ip_cliente
            }

        elif etiqueta == "ITEM":
            tabla_destino = "order_items"
            
            # Limpieza y extracción numérica a prueba de caracteres de moneda o comas
            raw_price = str(limpiar(row.get("price")) or "0").replace("R$", "").replace(",", ".").strip()
            raw_freight = str(limpiar(row.get("freight_value")) or "0").replace("R$", "").replace(",", ".").strip()
            
            payload_negocio = {
                "order_id": limpiar(row.get("order_id")),
                "order_item_id": limpiar(row.get("order_item_id")),
                "product_id": limpiar(row.get("product_id")),
                "seller_id": limpiar(row.get("seller_id")),
                "shipping_limit_date": limpiar(row.get("shipping_limit_date")),
                "price": float(raw_price) if raw_price else 0.0,
                "freight_value": float(raw_freight) if raw_freight else 0.0,
                "cliente_info": ip_cliente
            }

        elif etiqueta == "CLIENTE":
            tabla_destino = "customers"
            payload_negocio = {
                "customer_id": limpiar(row.get("customer_id")),
                "customer_unique_id": limpiar(row.get("customer_unique_id")),
                "customer_zip_code_prefix": limpiar(row.get("customer_zip_code_prefix")),
                "customer_city": limpiar(row.get("customer_city")),
                "customer_state": limpiar(row.get("customer_state")),
                "cliente_info": ip_cliente
            }

        elif etiqueta == "REVIEW":
            tabla_destino = "order_reviews"
            payload_negocio = {
                "review_id": limpiar(row.get("review_id")),
                "order_id": limpiar(row.get("order_id")),
                "review_score": int(limpiar(row.get("review_score"))) if limpiar(row.get("review_score")) else 0,
                "review_comment_title": limpiar(row.get("review_comment_title")),
                "review_comment_message": limpiar(row.get("review_comment_message")),
                "review_creation_date": limpiar(row.get("review_creation_date")),
                "review_answer_timestamp": limpiar(row.get("review_answer_timestamp")),
                "cliente_info": ip_cliente
            }

        if tabla_destino:
            supabase.table(tabla_destino).upsert(payload_negocio).execute()
            print(f"[DB SUCCESS] {etiqueta} insertado en '{tabla_destino}' (Cola restante: {cola_procesamiento.qsize()})")
            
            log_final = {
                "origen": etiqueta, 
                "contenido": payload_negocio, 
                "fecha": datetime.now().isoformat(),
                "cliente_info": ip_cliente
            }
            supabase.table("registros_servidor").insert(log_final).execute()

    except Exception as e:
        print(f"[DB ERROR] Error procesando {etiqueta}: {e}")

def worker_base_datos():
    """
    EL OPERARIO DE DB: Procesa la cola de manera asíncrona y segura.
    Removidos caracteres extraños de compilación para evitar fallos de encoding.
    """
    while True:
        tarea = cola_procesamiento.get()
        if tarea is None: 
            break
            
        etiqueta, datos_json, ip_cliente = tarea
        wrapper_intentos = 0
        
        while wrapper_intentos < 3:
            try:
                # 💡 SOLUCIÓN: Llamada limpia directa sin asignación de variables extrañas
                procesar_e_insertar(etiqueta, datos_json, ip_cliente)
                break  # Éxito absoluto, salimos del bucle de reintentos
            except Exception as e:
                print(f"[REINTENTO DB] Fallo en intento {wrapper_intentos + 1} para {etiqueta}: {e}")
                wrapper_intentos += 1
                time.sleep(0.5)
                
        cola_procesamiento.task_done()

# ══════════════════════════════════════════════════════════════
#  MANEJADORES DE RED
# ══════════════════════════════════════════════════════════════

def manejar_cliente_tcp(conn, addr):
    """
    EL OPERARIO: Se ejecuta en un hilo dedicado por cada cliente conectado.
    Recibe los fragmentos de datos a máxima velocidad y los mete en la cola.
    """
    print(f"[TCP] Cliente {addr} conectado.")
    conn.settimeout(None)  # Evita que el socket se cierre por inactividad
    buffer = ""
    ip_cliente = f"{addr[0]}:{addr[1]}"
    
    try:
        while True:
            try:
                # Recibe ráfagas de hasta 4096 bytes
                fragmento = conn.recv(4096).decode("utf-8")
                if not fragmento: 
                    break  # El cliente cerró la conexión de forma ordenada
                buffer += fragmento
            except OSError as e:
                # Manejo del error de bloqueo intermitente en Windows (WinError 10035)
                if e.errno == 10035:
                    time.sleep(0.01)
                    continue
                else: 
                    raise e

            # Procesa el buffer buscando saltos de línea completos (\n)
            while "\n" in buffer:
                linea, buffer = buffer.split("\n", 1)
                linea = linea.strip()
                if "|" in linea:
                    etiqueta, datos_json = linea.split("|", 1)
                    # Operación instantánea: se arroja a la cola y se libera el socket
                    cola_procesamiento.put((etiqueta, datos_json, ip_cliente))
                    
    except Exception as e:
        print(f"[TCP SERVER ERROR] Error con cliente {addr}: {e}")
    finally:
        conn.close()
        print(f"[TCP] Cliente {addr} desconectado.")


def escuchar_tcp():
    """
    EL RECEPCIONISTA: Escucha permanentemente en el puerto TCP.
    Acepta las conexiones entrantes y delega el flujo a 'manejar_cliente_tcp' en un hilo nuevo.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.bind((HOST, PORT_TCP))
    srv.listen(5)
    print(f"[TCP] Escuchando en {HOST}:{PORT_TCP}")
    
    while True:
        try:
            # Bloqueante: se queda esperando una conexión sin consumir CPU
            conn, addr = srv.accept() 
            
            # Crea e inicia el hilo independiente para atender a este cliente específico
            t_cliente = threading.Thread(target=manejar_cliente_tcp, args=(conn, addr), daemon=True)
            t_cliente.start()
        except Exception as e:
            print(f"[TCP ACCEPT ERROR]: {e}")


def escuchar_udp():
    """
    EL SERVIDOR TELEMETRÍA UDP: Escucha ráfagas de paquetes independientes (Datagramas).
    Versión optimizada con logs limpios y cortos.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    srv.bind((HOST, PORT_UDP))
    print(f"[UDP] Escuchando en {HOST}:{PORT_UDP}")
    
    while True:
        data, addr = srv.recvfrom(BUFFER_UDP)
        linea_datos = data.decode("utf-8").strip()
        
        sensor_name = "Desconocido"
        try:
            # Intentamos parsear el JSON para extraer el ID del dispositivo
            payload_json = json.loads(linea_datos)
            sensor_name = payload_json.get("sensor_id", "Sensor")
            payload_para_log = payload_json
            
            # Log súper corto para la consola si es JSON válido
            print(f"[UDP SUCCESS] Paquete recibido de {sensor_name} -> Guardando...")
            
        except json.JSONDecodeError:
            # Si no es JSON, intentamos ver si es un float directo (como tu código de antes)
            try:
                valor_temp = float(linea_datos)
                payload_para_log = {"temperatura": valor_temp}
                print(f"[UDP SUCCESS] Temperatura: {valor_temp}°C (Recibida de {addr})")
            except ValueError:
                payload_para_log = {"raw_data": linea_datos}
                print(f"[UDP TEXT] Datos planos recibidos de {addr}")
            
        # Inserción en la tabla histórica de logs para UDP en Supabase
        try:
            supabase.table("registros_servidor").insert({
                "origen": "UDP", 
                "contenido": payload_para_log, 
                "fecha": datetime.now().isoformat(), 
                "cliente_info": f"{addr[0]}:{addr[1]}"
            }).execute()
        except Exception as e:
            print(f"[DB ERROR UDP]: No se pudo guardar telemetría: {e}")


# ══════════════════════════════════════════════════════════════
#  EJECUCIÓN DEL SISTEMA
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("--- Iniciando Servidor Concurrente Multiprocolos ---")

    # 1. Iniciar el Worker encargado de procesar la cola e insertar en Supabase
    threading.Thread(target=worker_base_datos, daemon=True).start()
    
    # 2. Iniciar el Servidor TCP en su propio hilo independiente
    threading.Thread(target=escuchar_tcp, daemon=True).start()

    # 3. Iniciar el Servidor UDP en su propio hilo independiente
    threading.Thread(target=escuchar_udp, daemon=True).start()

    # Bucle infinito en el hilo principal para mantener vivo el proceso
    try:
        while True: 
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nServidor apagado de forma limpia desde la consola.")