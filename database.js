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

    actualizarTablaViajes();


    /* =====================================
       GUARDAR
    ===================================== */

    guardarBaseDatos();


    console.log("✅ Base de datos lista");

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
