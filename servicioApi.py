from fastapi import FastAPI
from supabase import create_client

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Credenciales de Supabase
URL = "https://qqwdtfddrvgcbhnjvfnv.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxd2R0ZmRkcnZnY2Jobmp2Zm52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDY2ODksImV4cCI6MjA5MzgyMjY4OX0.w5yBm3b6VpqiyQ2ZThjFifM2miYrsPidSzJhjsAAnQg"
supabase = create_client(URL, KEY)

@app.get("/api/datos")
def obtener_datos():

    respuesta = supabase.table("registros_servidor").select("*").execute()
    return {"status": "success", "data": respuesta.data}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)