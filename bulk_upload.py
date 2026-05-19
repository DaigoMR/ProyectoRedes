import pandas as pd
from supabase import create_client
import math
import time

# ══════════════════════════════════════════════════════════════════════════════
# 1. CREDENCIALES DE TU API WEB HTTPS
# ══════════════════════════════════════════════════════════════════════════════
SUPABASE_URL = "https://qqwdtfddrvgcbhnjvfnv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd2R0ZmRkcnZnY2Jobmp2Zm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDY2ODksImV4cCI6MjA5MzgyMjY4OX0.w5yBm3b6VpqiyQ2ZThjFifM2miYrsPidSzJhjsAAnQg"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ══════════════════════════════════════════════════════════════════════════════
# 2. MOTOR DE CARGA ANALÍTICA CON DEPURACIÓN DE DUPLICADOS EN MEMORIA
# ══════════════════════════════════════════════════════════════════════════════
def inyectar_datos_analiticos(nombre_csv, nombre_tabla, columna_primary_key):
    start_time = time.time()
    print(f"⏳ Procesando archivo local: '{nombre_csv}'...")
    
    try:
        # Lectura estricta de texto
        df = pd.read_csv(nombre_csv, dtype=str)
        df = df.astype(object).where(pd.notnull(df), None)
        
        # 💡 SOLUCCIÓN CRÍTICA (Error 21000):
        # Eliminamos filas duplicadas basadas en la Llave Primaria dentro del CSV.
        # Esto evita mandar duplicados en el mismo lote y elimina el fallo del ON CONFLICT.
        total_antes = len(df)
        df = df.drop_duplicates(subset=[columna_primary_key], keep="first")
        total_despues = len(df)
        
        if total_antes != total_despues:
            print(f"   🧹 Depurador: Se omitieron {total_antes - total_despues:,} registros duplicados en memoria.")

        df["cliente_info"] = None
        
        registros = df.to_dict(orient="records")
        total_filas = len(registros)
        
        tamano_lote = 500
        total_lotes = math.ceil(total_filas / tamano_lote)
        
        print(f"🚀 Subiendo {total_filas:,} registros únicos a '{nombre_tabla}' en {total_lotes} ráfagas web...")
        
        for i in range(total_lotes):
            inicio = i * tamano_lote
            fin = min(inicio + tamano_lote, total_filas)
            lote_actual = registros[inicio:fin]
            
            for intento in range(5):
                try:
                    supabase.table(nombre_tabla).upsert(lote_actual).execute()
                    break
                except Exception as e:
                    if intento == 4:
                        raise e
                    time.sleep(2.5)
            
            if (i + 1) % 10 == 0 or (i + 1) == total_lotes:
                porcentaje = round(((i + 1) / total_lotes) * 100, 1)
                print(f"   🔹 [{porcentaje}%] -> Lote {i+1}/{total_lotes} guardado con éxito")
            
            time.sleep(0.35)
            
        print(f"✅ ¡Éxito! Tabla '{nombre_tabla}' cargada en {round(time.time() - start_time, 1)} segundos.\n")
        
    except FileNotFoundError:
        print(f"❌ Error: No se encontró el archivo '{nombre_csv}' en esta carpeta. Verifica que el nombre esté bien escrito.\n")
    except Exception as e:
        print(f"❌ Fallo crítico al inyectar datos en '{nombre_tabla}': {e}\n")

# ══════════════════════════════════════════════════════════════════════════════
# 3. PIPELINE DE EJECUCIÓN (Solo las tablas pendientes)
# ══════════════════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("==========================================================")
    print("      CARGA CONTROLADA POR LOTES HTTP ANALÍTICOS")
    print("==========================================================\n")
    
    # 📝 NOTA: 'customers' y 'orders' ya están completos en tu base de datos, 
    # no los volvemos a tocar para ahorrar tiempo y ancho de banda.

    # 1. Ejecutamos order_items usando 'order_id' como pivote único para depurar en memoria
    inyectar_datos_analiticos("olist_order_items_dataset.csv", "order_items", "order_id")
    
    # 2. Ejecutamos order_reviews corrigiendo el typo del nombre del archivo y usando 'review_id'
    inyectar_datos_analiticos("olist_order_reviews_dataset.csv", "order_reviews", "review_id")
    
    print("🎉 Proceso finalizado. El set de datos de Olist de 99k filas está completo en la nube.")