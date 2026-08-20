const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

let db;

const RUTA_DB = path.join(__dirname, "uber.db");


/* ========================================
   INICIAR BASE DE DATOS
======================================== */

async function iniciarBaseDatos() {

    const SQL = await initSqlJs();

    /* =====================================
       CARGAR BASE EXISTENTE
    ===================================== */

    if (fs.existsSync(RUTA_DB)) {

        const archivo =
            fs.readFileSync(RUTA_DB);

        db = new SQL.Database(archivo);

        console.log("💾 Base de datos existente cargada");

    } else {

        db = new SQL.Database();

        console.log("🆕 Creando nueva base de datos");

    }


    /* =====================================
       TABLA USUARIOS
    ===================================== */

    db.run(`

        CREATE TABLE IF NOT EXISTS usuarios (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            nombre TEXT NOT NULL,

            telefono TEXT UNIQUE NOT NULL,

            email TEXT UNIQUE,

            password TEXT NOT NULL,

            tipo TEXT NOT NULL

        );

    `);


    /* =====================================
       TABLA OTP (códigos de verificación)
    ===================================== */

    db.run(`

        CREATE TABLE IF NOT EXISTS otps (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            destino TEXT NOT NULL,

            canal TEXT NOT NULL,

            codigo_hash TEXT NOT NULL,

            intentos INTEGER DEFAULT 0,

            expira INTEGER NOT NULL

        );

    `);


    /* =====================================
       TABLA VIAJES
    ===================================== */

    db.run(`

        CREATE TABLE IF NOT EXISTS viajes (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            pasajero_id INTEGER,

            conductor_id INTEGER,

            origen_lat REAL,

            origen_lng REAL,

            destino_lat REAL,

            destino_lng REAL,

            recogida TEXT,

            destino TEXT,

            recogida_lat REAL,

            recogida_lng REAL,

            tipo_vehiculo TEXT,

            distancia REAL,

            minutos INTEGER,

            estado TEXT DEFAULT 'buscando_conductor',

            precio REAL,

            fecha DATETIME DEFAULT CURRENT_TIMESTAMP

        );

    `);


    /* =====================================
       MIGRACIÓN
    ===================================== */

    actualizarTablaUsuarios();
    actualizarTablaViajes();


    /* =====================================
       GUARDAR
    ===================================== */

    guardarBaseDatos();


    console.log("✅ Base de datos lista");

}


/* ========================================
   ACTUALIZAR TABLA USUARIOS
   - Agrega flags de verificación.
   - Relaja telefono NOT NULL para permitir
     registro solo con correo.
======================================== */

function actualizarTablaUsuarios() {

    const resultado =
        db.exec("PRAGMA table_info(usuarios)");

    if (resultado.length === 0) {

        console.log(
            "⚠️ No se encontró tabla usuarios"
        );

        return;

    }

    const columnas =
        resultado[0].values.map(
            fila => fila[1]
        );

    console.log(
        "📋 Columnas usuarios:",
        columnas
    );

    /* Flags de verificación. */
    if (!columnas.includes("verificado_telefono")) {

        db.run(`
            ALTER TABLE usuarios
            ADD COLUMN verificado_telefono INTEGER DEFAULT 0
        `);

        console.log("➕ verificado_telefono agregado");

    }

    if (!columnas.includes("verificado_correo")) {

        db.run(`
            ALTER TABLE usuarios
            ADD COLUMN verificado_correo INTEGER DEFAULT 0
        `);

        console.log("➕ verificado_correo agregado");

    }

    /* Relajar NOT NULL en telefono si aplica.
       SQLite no soporta ALTER COLUMN, así que
       se reconstruye la tabla preservando datos. */
    const colTelefono =
        resultado[0].values.find(
            f => f[1] === "telefono"
        );

    if (colTelefono && colTelefono[3] === 1) {

        console.log(
            "🔧 Relajando telefono NOT NULL..."
        );

        db.run(`
            CREATE TABLE usuarios_new (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                nombre TEXT NOT NULL,

                telefono TEXT UNIQUE,

                email TEXT UNIQUE,

                password TEXT NOT NULL,

                tipo TEXT NOT NULL,

                verificado_telefono INTEGER DEFAULT 0,

                verificado_correo INTEGER DEFAULT 0

            )
        `);

        db.run(`
            INSERT INTO usuarios_new
            (
                id, nombre, telefono,
                email, password, tipo
            )
            SELECT
                id, nombre, telefono,
                email, password, tipo
            FROM usuarios
        `);

        db.run("DROP TABLE usuarios");

        db.run(
            "ALTER TABLE usuarios_new RENAME TO usuarios"
        );

        console.log(
            "✅ telefono ahora admite NULL (registro solo-correo)"
        );

    }

}


/* ========================================
   ACTUALIZAR TABLA VIAJES
======================================== */

function actualizarTablaViajes() {

    const resultado =
        db.exec("PRAGMA table_info(viajes)");


    if (resultado.length === 0) {

        console.log(
            "⚠️ No se encontró tabla viajes"
        );

        return;

    }


    const columnas =
        resultado[0].values.map(
            fila => fila[1]
        );


    console.log(
        "📋 Columnas actuales:",
        columnas
    );


    /* =====================================
       PASAJERO
    ===================================== */

    if (!columnas.includes("pasajero_id")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN pasajero_id INTEGER

        `);

        console.log(
            "➕ pasajero_id agregado"
        );

    }


    /* =====================================
       CONDUCTOR
    ===================================== */

    if (!columnas.includes("conductor_id")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN conductor_id INTEGER

        `);

        console.log(
            "➕ conductor_id agregado"
        );

    }


    /* =====================================
       ORIGEN LAT
    ===================================== */

    if (!columnas.includes("origen_lat")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN origen_lat REAL

        `);

        console.log(
            "➕ origen_lat agregado"
        );

    }


    /* =====================================
       ORIGEN LNG
    ===================================== */

    if (!columnas.includes("origen_lng")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN origen_lng REAL

        `);

        console.log(
            "➕ origen_lng agregado"
        );

    }


    /* =====================================
       DESTINO LAT
    ===================================== */

    if (!columnas.includes("destino_lat")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN destino_lat REAL

        `);

        console.log(
            "➕ destino_lat agregado"
        );

    }


    /* =====================================
       DESTINO LNG
    ===================================== */

    if (!columnas.includes("destino_lng")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN destino_lng REAL

        `);

        console.log(
            "➕ destino_lng agregado"
        );

    }


    /* =====================================
       RECOGIDA
    ===================================== */

    if (!columnas.includes("recogida")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN recogida TEXT

        `);

        console.log(
            "➕ recogida agregado"
        );

    }


    /* =====================================
       DESTINO
    ===================================== */

    if (!columnas.includes("destino")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN destino TEXT

        `);

        console.log(
            "➕ destino agregado"
        );

    }


    /* =====================================
       RECOGIDA LAT
    ===================================== */

    if (!columnas.includes("recogida_lat")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN recogida_lat REAL

        `);

        console.log(
            "➕ recogida_lat agregado"
        );

    }


    /* =====================================
       RECOGIDA LNG
    ===================================== */

    if (!columnas.includes("recogida_lng")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN recogida_lng REAL

        `);

        console.log(
            "➕ recogida_lng agregado"
        );

    }


    /* =====================================
       TIPO DE VEHÍCULO
    ===================================== */

    if (!columnas.includes("tipo_vehiculo")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN tipo_vehiculo TEXT

        `);

        console.log(
            "➕ tipo_vehiculo agregado"
        );

    }


    /* =====================================
       DISTANCIA
    ===================================== */

    if (!columnas.includes("distancia")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN distancia REAL

        `);

        console.log(
            "➕ distancia agregado"
        );

    }


    /* =====================================
       MINUTOS
    ===================================== */

    if (!columnas.includes("minutos")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN minutos INTEGER

        `);

        console.log(
            "➕ minutos agregado"
        );

    }


    /* =====================================
       ESTADO
    ===================================== */

    if (!columnas.includes("estado")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN estado TEXT

        `);

        console.log(
            "➕ estado agregado"
        );

    }


    /* =====================================
       PRECIO
    ===================================== */

    if (!columnas.includes("precio")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN precio REAL

        `);

        console.log(
            "➕ precio agregado"
        );

    }


    /* =====================================
       FECHA
    ===================================== */

    if (!columnas.includes("fecha")) {

        db.run(`

            ALTER TABLE viajes

            ADD COLUMN fecha DATETIME

        `);

        console.log(
            "➕ fecha agregado"
        );

    }


    /* =====================================
       ESTADOS ANTIGUOS
    ===================================== */

    db.run(`

        UPDATE viajes

        SET estado = 'buscando_conductor'

        WHERE estado IS NULL

        OR estado = ''

    `);


    console.log(
        "✅ Migración de viajes completada"
    );

}


/* ========================================
   GUARDAR BASE DE DATOS
======================================== */

function guardarBaseDatos() {

    if (!db) {

        throw new Error(
            "La base de datos no está iniciada"
        );

    }


    const datos =
        db.export();


    fs.writeFileSync(
        RUTA_DB,
        Buffer.from(datos)
    );

}


/* ========================================
   OBTENER BASE DE DATOS
======================================== */

function getDb() {

    if (!db) {

        throw new Error(
            "La base de datos no está iniciada"
        );

    }


    return db;

}


/* ========================================
   EXPORTAR
======================================== */

module.exports = {

    iniciarBaseDatos,

    getDb,

    guardarBaseDatos

};
