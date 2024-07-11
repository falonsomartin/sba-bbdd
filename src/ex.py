import psycopg2
import psycopg2.extras

# Conexión a la base de datos
conn = psycopg2.connect(dbname="sba", user="postgres", password="Evenor2510Tech")
cur = conn.cursor()

# Leer el archivo en modo binario
file_path = 'src\sotooo.jpg'
with open(file_path, 'rb') as file:
    file_data = file.read()

# Insertar el archivo en la base de datos usando BYTEA
file_name = "sotooo.jpg"
cur.execute(
    "INSERT INTO files (name, folder_id, content) VALUES (%s, %s, %s) RETURNING id",
    (file_name, 1, psycopg2.Binary(file_data))
)
file_id = cur.fetchone()[0]
conn.commit()

cur.close()
conn.close()