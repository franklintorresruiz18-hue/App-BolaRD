const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const database = require("./database");
const otp = require("./otp");

/* =====================================================
   CARGAR .env (local, sin dependencias)
   En produccion (Render) la variable ORS_API_KEY se
   define en el dashboard; aqui solo la cargamos si no
   esta ya en el entorno. La clave NUNCA se expone al
   frontend.
===================================================== */

try {

    const envPath =
        path.join(__dirname, ".env");

    if (fs.existsSync(envPath)) {

        fs.readFileSync(envPath, "utf8")
            .split("\n")
            .forEach(linea => {

                const t =
                    linea.trim();

                if (
                    t &&
                    !t.startsWith("#") &&
                    t.includes("=")
                ) {

                    const i =
                        t.indexOf("=");

                    const k =
                        t.slice(0, i).trim();

                    const v =
                        t.slice(i + 1).trim();

                    if (process.env[k] === undefined) {
                        process.env[k] = v;
                    }

                }

            });

    }

} catch (e) {
    /* .env es opcional */
}


/* =====================================================
   AUTENTICACIÓN JWT
   El login firma un token con { id, tipo }. Las rutas
   protegidas lo exigen vía header:
   Authorization: Bearer <token>
===================================================== */

let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {

    /* En producción la clave es OBLIGATORIA: si falta, el
       servidor NO debe arrancar con una clave pública
       (cualquiera podría falsificar tokens). En desarrollo
       local sí permitimos una clave por defecto. */
    if (process.env.NODE_ENV === "production") {

        throw new Error(
            "JWT_SECRET no definido: es OBLIGATORIO en " +
            "producción. Define la variable de entorno " +
            "JWT_SECRET."
        );

    }

    JWT_SECRET = "clave_desarrollo_local_bolard";

    console.warn(
        "⚠️ JWT_SECRET no definido: usando clave por defecto " +
        "(SOLO DESARROLLO LOCAL). Define JWT_SECRET en .env " +
        "para producción."
    );

}


/* Verifica el token y deja req.usuario = { id, tipo } */
function verificarToken(req, res, next) {

    const header =
        req.headers["authorization"] || "";

    const partes =
        header.split(" ");

    if (
        partes.length === 2 &&
        partes[0] === "Bearer"
    ) {

        try {

            req.usuario =
                jwt.verify(
                    partes[1],
                    JWT_SECRET,
                    {
                        algorithms: [
                            "HS256"
                        ]
                    }
                );

            return next();

        } catch (error) {

            return res.status(401).json({
                error: "Sesión inválida o expirada"
            });

        }

    }

    return res.status(401).json({
        error: "Falta el token de autenticación"
    });

}


/* El :id (o param) de la URL debe coincidir con el del token */
function esElMismoUsuario(param) {

    return (req, res, next) => {

        const idToken =
            req.usuario && req.usuario.id;

        const idParam =
            Number(req.params[param]);

        if (idToken !== idParam) {

            return res.status(403).json({
                error: "No autorizado para este usuario"
            });

        }

        next();

    };

}


/* El token debe tener el tipo de usuario indicado */
function soloRol(tipo) {

    return (req, res, next) => {

        if (
            !req.usuario ||
            req.usuario.tipo !== tipo
        ) {

            return res.status(403).json({
                error: `Solo ${tipo}s pueden realizar esta acción`
            });

        }

        next();

    };

}


const app = express();


/* =====================================================
   CORS - LISTA BLANCA DE ORÍGENES
   Cerramos el acceso abierto: solo los orígenes
   explícitos en CORS_ORIGINS (env, separados por coma)
   pueden llamar a la API desde un navegador.
   Se permiten siempre las peticiones sin cabecera
   Origin (el propio SPA servido aquí, el WebView del
   APK, curl/Postman) y los orígenes de la lista.
===================================================== */

const corsOptions = {
    origin: (origen, callback) => {

        const lista =
            (process.env.CORS_ORIGINS ||
             "http://localhost:3000,http://127.0.0.1:3000")
                .split(",")
                .map(o => o.trim())
                .filter(Boolean);

        // Sin Origin: SPA mismo servidor, WebView móvil,
        // curl, Postman.
        if (!origen) {
            return callback(null, true);
        }

        // Origen explícitamente permitido en CORS_ORIGINS.
        if (lista.includes(origen)) {
            return callback(null, true);
        }

        /* =====================================
           ORÍGENES DE DESARROLLO / PRUEBA
           El SPA usa rutas relativas, así que el
           origen SIEMPRE es la propia app. Pero los
           navegadores modernos envían la cabecera
           Origin TAMBIÉN en peticiones mismo-origen,
           por lo que CORS se aplica igual. Para poder
           probar en el móvil vía el tunnel HTTPS de
           Cloudflare (cuya URL efímera cambia en cada
           reinicio) permitimos sus subdominios, además
           de localhost en cualquier puerto.
           La protección de la API sigue en el JWT, no
           en CORS.
        ===================================== */

        // Quick tunnels de Cloudflare (pruebas móviles).
        if (
            /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/
                .test(origen)
        ) {
            return callback(null, true);
        }

        // localhost / 127.0.0.1 en cualquier puerto.
        if (
            /^https?:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/
                .test(origen)
        ) {
            return callback(null, true);
        }

        return callback(
            new Error(
                "Origen no permitido por CORS: " + origen
            )
        );

    }
};

app.use(cors(corsOptions));

/* =====================================================
   HEADERS DE SEGURIDAD
   Helmet configura CSP, HSTS, X-Frame-Options,
   X-Content-Type-Options, Referrer-Policy, etc.
===================================================== */

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: [
                    "'self'"
                ],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://unpkg.com"
                ],
                "script-src-attr": [
                    "'unsafe-inline'"
                ],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://unpkg.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "https:",
                    "blob:"
                ],
                connectSrc: [
                    "'self'"
                ],
                fontSrc: [
                    "'self'",
                    "https:",
                    "data:"
                ],
                objectSrc: [
                    "'none'"
                ],
                mediaSrc: [
                    "'self'",
                    "blob:",
                    "https:"
                ]
            }
        },
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    })
);

app.use(
    express.json(
        { limit: "10mb" }
    )
);


/* =====================================================
   SIN CACHÉ EN EL CLIENTE
   En pruebas móviles vía tunnel, el navegador (sobre
   todo Chrome Android con "ahorro de datos") cachea
   index.html de forma agresiva, de modo que los
   cambios del frontend no se reflejan al recargar.
   Forzamos no-store para que SIEMPRE se sirva la
   versión fresca del HTML (no afecta a la API).
===================================================== */

app.use((req, res, next) => {

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader(
        "Pragma",
        "no-cache"
    );
    res.setHeader(
        "Expires",
        "0"
    );

    next();

});



/* =====================================================
   RATE LIMIT (anti fuerza-bruta)
   trust proxy: Render usa un proxy, así req.ip es la
   IP real del cliente y no la del proxy (clave para
   que el límite sea por usuario, no por el proxy).
===================================================== */

app.set("trust proxy", 1);


/* Login: máx 5 intentos FALLIDOS por IP cada 15 min.
   skipSuccessfulRequests evita penalizar a quien
   escribe mal su clave un par de veces. */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Demasiados intentos fallidos. " +
            "Inténtalo de nuevo en 15 minutos."
    }
});


/* Registro: máx 10 por IP cada hora (anti spam/cuentas) */
const registroLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Has enviado demasiados registros. " +
            "Inténtalo más tarde."
    }
});


/* Rutas de mapas: máx 30 por IP cada minuto.
   Estos endpoints consumen la cuota de ORS/Google
   (APIs de pago), así que se limita el abuso aunque
   el usuario esté autenticado. */
const rutaLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Demasiadas solicitudes de ruta. " +
            "Inténtalo en un momento."
    }
});

/* Búsqueda de lugares (geocoding Google): mismo motivo. */
const lugaresLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Demasiadas búsquedas. " +
            "Inténtalo en un momento."
    }
});

/* OTP: envío de código. Muy restringido para evitar
   abuso (spam de SMS/correo y enumeración). */
const otpEnvioLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Demasiados códigos enviados. " +
            "Inténtalo en 15 minutos."
    }
});

/* OTP: verificación de código. Limita los intentos
   de fuerza bruta sobre el código de 6 dígitos. */
const otpVerificacionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Demasiados intentos. " +
            "Solicita un nuevo código."
    }
});

/* =====================================================
   PROTEGER RUTAS CON JWT
   Todas las rutas requieren token excepto las públicas
   (login, registro y health-check). El registro alterno
   POST /usuarios también es público.
===================================================== */

const RUTAS_PUBLICAS = new Set([
    "/",
    "/registro",
    "/login",
    "/api/estado",
    "/auth/enviar-codigo",
    "/auth/verificar-codigo"
]);

app.use((req, res, next) => {

    if (req.method === "OPTIONS") {
        return next();
    }

    if (
        req.method === "POST" &&
        req.path === "/usuarios"
    ) {
        return next();
    }

    if (RUTAS_PUBLICAS.has(req.path)) {
        return next();
    }

    return verificarToken(req, res, next);

});


/* =====================================================
CONFIGURACION DE SUBIDA DE FOTOS
===================================================== */

const carpetaUploads =
    path.join(
        __dirname,
        "frontend",
        "uploads"
    );

if (!fs.existsSync(carpetaUploads)) {

    fs.mkdirSync(
        carpetaUploads,
        { recursive: true }
    );

}

/* Solo se permiten imágenes. Sin esto, un usuario
   podría subir .html/.svg y ejecutar XSS almacenado
   desde /uploads (mismo origen que la app). Se mapea
   el mimetype a una extensión segura para evitar que
   el cliente invente la extensión del archivo. */
const TIPOS_IMAGEN_PERMITIDOS = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp"
};

const almacenamiento =
    multer.diskStorage({

        destination: (
            req,
            file,
            cb
        ) => {

            cb(
                null,
                carpetaUploads
            );

        },

        filename: (
            req,
            file,
            cb
        ) => {

            const extension =
                TIPOS_IMAGEN_PERMITIDOS[
                    file.mimetype
                ] || ".jpg";

            const nombreUnico =
                Date.now() +
                "-" +
                Math.round(
                    Math.random() * 1e9
                ) +
                extension;

            cb(
                null,
                nombreUnico
            );

        }

    });

const subirFotos =
    multer({
        storage: almacenamiento,
        limits: {
            fileSize: 8 * 1024 * 1024
        },
        fileFilter: (
            req,
            file,
            cb
        ) => {

            if (
                TIPOS_IMAGEN_PERMITIDOS[
                    file.mimetype
                ]
            ) {

                return cb(
                    null,
                    true
                );

            }

            cb(
                new Error(
                    "Tipo de archivo no permitido. " +
                    "Solo imágenes JPG, PNG o WEBP."
                )
            );

        }
    });


/* =====================================================
UTILIDADES
===================================================== */

function convertirResultado(resultado) {

    if (
        !resultado ||
        resultado.length === 0
    ) {
        return [];
    }

    const columnas =
        resultado[0].columns;

    return resultado[0].values.map(fila => {

        const objeto = {};

        columnas.forEach(
            (columna, indice) => {

                objeto[columna] =
                    fila[indice];

            }
        );

        return objeto;

    });
}


/* =====================================================
COMPROBAR COLUMNA
===================================================== */

function columnaExiste(
    db,
    tabla,
    columna
) {

    try {

        const resultado =
            db.exec(
                `PRAGMA table_info(${tabla})`
            );

        if (
            !resultado ||
            resultado.length === 0
        ) {
            return false;
        }

        return resultado[0].values.some(
            fila =>
                fila[1] === columna
        );

    } catch (error) {

        console.error(
            "ERROR COMPROBANDO COLUMNA:",
            error
        );

        return false;
    }
}


/* =====================================================
AGREGAR COLUMNA SI NO EXISTE
===================================================== */

function agregarColumnaSiNoExiste(
    db,
    tabla,
    columna,
    definicion
) {

    if (
        !columnaExiste(
            db,
            tabla,
            columna
        )
    ) {

        console.log(
            `🛠️ Agregando columna ${tabla}.${columna}`
        );

        db.run(
            `ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`
        );

    }

}


/* =====================================================
PREPARAR BASE DE DATOS
===================================================== */

function prepararBaseDatos() {

    const db =
        database.getDb();

    console.log(
        "🗄️ Verificando estructura de la base de datos..."
    );


    /* =====================================
    COLUMNAS DE USUARIOS
    ===================================== */

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "documento_identidad",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "foto_documento",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "matricula_vehiculo",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "modelo_vehiculo",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "foto_matricula",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "foto_vehiculo",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "saldo",
        "REAL DEFAULT 0"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "forma_pago",
        "TEXT DEFAULT 'efectivo'"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "tarjeta_numero",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "numero_cuenta_banco",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "foto_perfil",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "calificacion_promedio",
        "REAL DEFAULT 5"
    );

    agregarColumnaSiNoExiste(
        db,
        "usuarios",
        "total_calificaciones",
        "INTEGER DEFAULT 0"
    );


    /* =====================================
    COLUMNAS DE VIAJES
    ===================================== */

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "recogida_lat",
        "REAL"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "recogida_lng",
        "REAL"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "destino_lat",
        "REAL"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "destino_lng",
        "REAL"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "tipo_vehiculo",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "distancia",
        "REAL DEFAULT 0"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "minutos",
        "INTEGER DEFAULT 0"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "precio",
        "REAL DEFAULT 0"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "estado",
        "TEXT DEFAULT 'buscando_conductor'"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "conductor_id",
        "INTEGER"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "fecha",
        "DATETIME DEFAULT CURRENT_TIMESTAMP"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "codigo_verificacion",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "fecha_aceptado",
        "DATETIME"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "fecha_recogida",
        "DATETIME"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "fecha_finalizado",
        "DATETIME"
    );


    /* =====================================
    CANCELACIÓN
    ===================================== */

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "cancelado_por",
        "INTEGER"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "motivo_cancelacion",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "finalizado_por",
        "TEXT"
    );

    agregarColumnaSiNoExiste(
        db,
        "viajes",
        "precio_original",
        "REAL"
    );


    /* =====================================
    TABLA MENSAJES
    ===================================== */

    db.run(`
        CREATE TABLE IF NOT EXISTS mensajes (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            viaje_id INTEGER NOT NULL,

            usuario_id INTEGER NOT NULL,

            mensaje TEXT NOT NULL,

            fecha DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `);


    /* =====================================
    TABLA RETIROS
    ===================================== */

    db.run(`
        CREATE TABLE IF NOT EXISTS retiros (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            conductor_id INTEGER NOT NULL,

            monto REAL NOT NULL,

            numero_cuenta_banco TEXT NOT NULL,

            fecha DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `);


    /* =====================================
    TABLA CALIFICACIONES
    ===================================== */

    db.run(`
        CREATE TABLE IF NOT EXISTS calificaciones (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            viaje_id INTEGER NOT NULL,

            calificador_id INTEGER NOT NULL,

            calificado_id INTEGER NOT NULL,

            estrellas INTEGER NOT NULL,

            comentario TEXT,

            fecha DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `);


    /* =====================================
    TABLA SOPORTE / REPORTES
    ===================================== */

    db.run(`
        CREATE TABLE IF NOT EXISTS soporte_tickets (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            usuario_id INTEGER NOT NULL,

            nombre_usuario TEXT,

            tipo_usuario TEXT,

            categoria TEXT DEFAULT 'soporte',

            viaje_id INTEGER,

            asunto TEXT NOT NULL,

            descripcion TEXT NOT NULL,

            estado TEXT DEFAULT 'abierto',

            fecha DATETIME DEFAULT CURRENT_TIMESTAMP

        )
    `);


    database.guardarBaseDatos();

    console.log(
        "✅ Estructura de base de datos verificada."
    );
}


/* =====================================================
MIGRAR CONTRASEÑAS EN TEXTO PLANO A HASH (bcrypt)
Se ejecuta al arrancar: cualquier password que no
empiece por "$2" (no es un hash bcrypt) se hashea.
===================================================== */

function migrarContrasenasPlanas() {

    const db =
        database.getDb();

    try {

        const resultado =
            db.exec(
                "SELECT id, password FROM usuarios"
            );


        if (
            !resultado.length
        ) {

            return;

        }


        let migradas = 0;

        resultado[0].values.forEach(
            ([id, pwd]) => {

                if (
                    pwd &&
                    !pwd.startsWith("$2")
                ) {

                    const hash =
                        bcrypt.hashSync(
                            pwd,
                            10
                        );

                    db.run(
                        "UPDATE usuarios SET password = ? WHERE id = ?",
                        [hash, id]
                    );

                    migradas++;

                }

            }
        );


        if (migradas > 0) {

            database.guardarBaseDatos();

            console.log(
                `🔐 ${migradas} contraseña(s) migrada(s) a hash bcrypt`
            );

        }

    } catch (error) {

        console.error(
            "ERROR MIGRANDO CONTRASEÑAS:",
            error
        );

    }

}


/* =====================================================
GENERAR CÓDIGO DE VERIFICACIÓN
===================================================== */

function generarCodigoVerificacion() {

    return String(
        Math.floor(
            1000 +
            Math.random() * 9000
        )
    );

}


/* =====================================================
DISTANCIA ENTRE DOS PUNTOS (HAVERSINE)
===================================================== */

function distanciaMetros(
    lat1,
    lng1,
    lat2,
    lng2
) {

    const R = 6371000;

    const radianes =
        grados =>
            (grados * Math.PI) / 180;

    const dLat =
        radianes(lat2 - lat1);

    const dLng =
        radianes(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
        Math.cos(radianes(lat1)) *
        Math.cos(radianes(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;

}

/*
 * El conductor solo puede finalizar el viaje
 * si está a esta distancia (o menos) del destino.
 */

const UMBRAL_METROS_FINALIZAR = 150;

/*
 * El conductor solo puede verificar el código
 * (y por lo tanto recoger al pasajero) si está
 * a esta distancia (o menos) del punto de recogida.
 */

const UMBRAL_METROS_RECOGIDA = 100;

/*
 * Si el pasajero decide finalizar el viaje
 * anticipadamente (antes de llegar al destino),
 * se le aplica esta tarifa (70% del precio
 * original, es decir 30% de reducción).
 */

const PORCENTAJE_FINALIZACION_ANTICIPADA = 0.7;


/* =====================================================
INICIO
===================================================== */

/* =====================================================
   ARCHIVOS ESTÁTICOS
   Se sirve el frontend con cache-buster para forzar
   a los navegadores a ignorar su cache local.
===================================================== */

app.use((req, res, next) => {

    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, " +
        "must-revalidate, proxy-revalidate, " +
        "max-age=0"
    );

    res.setHeader(
        "Pragma",
        "no-cache"
    );

    res.setHeader(
        "Expires",
        "0"
    );

    next();

});

app.use(
    express.static(
        path.join(__dirname, "frontend"),
        {
            maxAge: "0",
            etag: false,
            lastModified: false
        }
    )
);


/* =====================================================
ESTADO SERVIDOR
===================================================== */

app.get(
    "/api/estado",
    (req, res) => {

        res.json({

            app: "MiBola",

            estado:
                "Servidor funcionando",

            puerto: 3000

        });

    }
);


/* =====================================================
USUARIOS
===================================================== */

app.get(
    "/usuarios",
    (req, res) => {

        try {

            const db =
                database.getDb();

            const resultado =
                db.exec(`
                    SELECT
                        id,
                        nombre,
                        telefono,
                        email,
                        tipo
                    FROM usuarios
                    ORDER BY id DESC
                `);

            res.json(
                convertirResultado(
                    resultado
                )
            );

        } catch (error) {

            console.error(
                "ERROR USUARIOS:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener los usuarios",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
REGISTRAR USUARIO
===================================================== */

app.post(
    "/usuarios",
    (req, res) => {

        const db =
            database.getDb();

        const {
            nombre,
            telefono,
            email,
            password,
            tipo
        } = req.body;


        if (
            !nombre ||
            !telefono ||
            !password ||
            !tipo
        ) {

            return res.status(400).json({

                error:
                    "Faltan datos obligatorios"

            });

        }


        if (
            tipo !== "pasajero" &&
            tipo !== "conductor"
        ) {

            return res.status(400).json({

                error:
                    "El tipo debe ser pasajero o conductor"

            });

        }


        try {

            const passwordHasheada =
                bcrypt.hashSync(
                    password,
                    10
                );

            const stmt =
                db.prepare(`
                    INSERT INTO usuarios
                    (
                        nombre,
                        telefono,
                        email,
                        password,
                        tipo
                    )
                    VALUES (?, ?, ?, ?, ?)
                `);


            stmt.run([

                nombre,
                telefono,
                email || null,
                passwordHasheada,
                tipo

            ]);


            stmt.free();

            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Usuario registrado correctamente"

            });

        } catch (error) {

            console.error(
                "ERROR REGISTRANDO USUARIO:",
                error
            );

            res.status(400).json({

                error:
                    "El teléfono o email ya existe",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
REGISTRO (alias de /usuarios que usa el frontend)
===================================================== */

app.post(
    "/registro",
    registroLimiter,
    subirFotos.fields([
        { name: "foto_documento", maxCount: 1 },
        { name: "foto_matricula", maxCount: 1 },
        { name: "foto_vehiculo", maxCount: 1 }
    ]),
    async (req, res) => {

        const db =
            database.getDb();

        const {
            email,
            codigo,
            nombre,
            password,
            tipo,
            telefono,
            documento_identidad,
            matricula_vehiculo,
            modelo_vehiculo
        } = req.body;


        /* =================================
           NORMALIZAR Y VALIDAR EMAIL (para OTP)
        ================================= */

        const emailNormalizado =
            otp.normalizarEmail(email);

        if (!emailNormalizado) {

            return res.status(400).json({

                error:
                    "Correo electrónico inválido"

            });

        }


        /* =================================
           VALIDAR TELÉFONO (obligatorio en registro)
        ================================= */

        if (!telefono || !telefono.trim()) {

            return res.status(400).json({

                error:
                    "El número de teléfono es obligatorio"

            });

        }

        const telefonoNormalizado =
            otp.normalizarTelefonoRD(telefono);

        if (!telefonoNormalizado) {

            return res.status(400).json({

                error:
                    "Número de teléfono inválido. Use formato RD (809, 829, 849)"

            });

        }


        /* =================================
           VERIFICAR OTP (puerta de seguridad)
           El código se verifica contra el EMAIL.
        ================================= */

        const resultadoOTP =
            otp.verificar(
                emailNormalizado,
                codigo
            );

        if (!resultadoOTP.ok) {

            const mensajes = {
                no_encontrado:
                    "Debes solicitar un código primero",
                expirado:
                    "El código expiró. Solicita uno nuevo.",
                intentos_agotados:
                    "Demasiados intentos. " +
                    "Solicita un nuevo código.",
                incorrecto:
                    "Código incorrecto"
            };

            return res.status(401).json({

                error:
                    mensajes[resultadoOTP.razon] ||
                    "Código inválido"

            });

        }


        /* =================================
           VALIDACIONES BÁSICAS
        ================================= */

        if (
            !nombre ||
            !password ||
            !tipo
        ) {

            return res.status(400).json({

                error:
                    "Faltan datos obligatorios"

            });

        }

        if (password.length < 6) {

            return res.status(400).json({

                error:
                    "La contraseña debe tener al menos " +
                    "6 caracteres"

            });

        }

        if (
            tipo !== "pasajero" &&
            tipo !== "conductor"
        ) {

            return res.status(400).json({

                error:
                    "El tipo debe ser pasajero o conductor"

            });

        }


        /* =================================
           VALIDACIONES EXTRA PARA CONDUCTOR
        ================================= */

        if (tipo === "conductor") {

            if (
                !documento_identidad ||
                !matricula_vehiculo ||
                !modelo_vehiculo
            ) {

                return res.status(400).json({

                    error:
                        "Como conductor debes indicar tu " +
                        "documento de identidad, matrícula " +
                        "y modelo del vehículo"

                });

            }

        }


        /* =================================
           UNICIDAD DEL TELÉFONO Y EMAIL
        ================================= */

        const existeTelefono =
            db.prepare(
                "SELECT id FROM usuarios " +
                "WHERE telefono = ? LIMIT 1"
            );

        existeTelefono.bind([telefonoNormalizado]);

        const telefonoExiste = existeTelefono.step();

        existeTelefono.free();

        if (telefonoExiste) {

            return res.status(400).json({

                error:
                    "Ese teléfono ya está registrado"

            });

        }

        const existeEmail =
            db.prepare(
                "SELECT id FROM usuarios " +
                "WHERE email = ? LIMIT 1"
            );

        existeEmail.bind([emailNormalizado]);

        const emailExiste = existeEmail.step();

        existeEmail.free();

        if (emailExiste) {

            return res.status(400).json({

                error:
                    "Ese correo ya está registrado"

            });

        }


        const archivos =
            req.files || {};

        const fotoDocumento =
            archivos.foto_documento
                ? "/uploads/" +
                  archivos.foto_documento[0].filename
                : null;

        const fotoMatricula =
            archivos.foto_matricula
                ? "/uploads/" +
                  archivos.foto_matricula[0].filename
                : null;

        const fotoVehiculo =
            archivos.foto_vehiculo
                ? "/uploads/" +
                  archivos.foto_vehiculo[0].filename
                : null;


        try {

            const passwordHasheada =
                bcrypt.hashSync(
                    password,
                    10
                );

            const stmt =
                db.prepare(`
                    INSERT INTO usuarios
                    (
                        nombre,
                        telefono,
                        email,
                        password,
                        tipo,

                        verificado_telefono,
                        verificado_correo,

                        documento_identidad,
                        foto_documento,

                        matricula_vehiculo,
                        modelo_vehiculo,
                        foto_matricula,
                        foto_vehiculo
                    )
                    VALUES
                    (
                        ?, ?, ?, ?, ?,
                        ?, ?,
                        ?, ?,
                        ?, ?, ?, ?
                    )
                `);


            stmt.run([

                nombre,
                telefonoNormalizado,
                emailNormalizado,
                passwordHasheada,
                tipo,

                0,  // verificado_telefono: false (no se verifica por OTP)
                1,  // verificado_correo: true (se verificó por OTP)

                documento_identidad || null,
                fotoDocumento,

                matricula_vehiculo || null,
                modelo_vehiculo || null,
                fotoMatricula,
                fotoVehiculo

            ]);


            stmt.free();

            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Usuario registrado correctamente"

            });

        } catch (error) {

            console.error(
                "ERROR REGISTRANDO USUARIO:",
                error
            );

            res.status(400).json({

                error:
                    "No se pudo registrar el usuario",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
   SOLICITAR CÓDIGO OTP (primer paso del registro)
   Solo por email (Gmail)
===================================================== */

app.post(
    "/auth/enviar-codigo",
    otpEnvioLimiter,
    async (req, res) => {

        const {
            email
        } = req.body;


        if (!email) {

            return res.status(400).json({

                error:
                    "El correo electrónico es obligatorio"

            });

        }


        try {

            const {
                destino: destinoOk,
                medio
            } = await otp.solicitar(email);

            res.json({

                mensaje:
                    "Código enviado correctamente",

                /* En desarrollo (consola) el frontend
                   puede mostrar una pista; en producción
                   nunca se devuelve el código. */
                canal: "correo",
                medio: medio

            });

        } catch (error) {

            return res.status(400).json({

                error: error.message

            });

        }

    }
);


/* =====================================================
   VERIFICAR CÓDIGO OTP (segundo paso del registro)
===================================================== */

app.post(
    "/auth/verificar-codigo",
    otpVerificacionLimiter,
    async (req, res) => {

        const {
            email,
            codigo
        } = req.body;

        if (!email || !codigo) {

            return res.status(400).json({

                error:
                    "Correo y código son obligatorios"

            });

        }

        const destino = otp.normalizarEmail(email);

        if (!destino) {

            return res.status(400).json({

                error: "Correo electrónico inválido"

            });

        }

        const resultado = otp.verificar(destino, codigo);

        if (!resultado.ok) {

            return res.status(400).json({

                error:
                    resultado.razon === "expirado"
                        ? "El código ha expirado"
                        : resultado.razon === "intentos_agotados"
                        ? "Demasiados intentos fallidos"
                        : "Código incorrecto"

            });

        }

        res.json({

            mensaje: "Código verificado correctamente",
            email: destino

        });

    }
);


/* =====================================================
LOGIN
===================================================== */

app.post(
    "/login",
    loginLimiter,
    (req, res) => {

        const db =
            database.getDb();

        const {
            identificador,
            password
        } = req.body;

        const idLimpio =
            (identificador || "").trim();


        if (
            !idLimpio ||
            !password
        ) {

            return res.status(400).json({

                error:
                    "Debes introducir tu teléfono o correo " +
                    "y tu contraseña"

            });

        }


        try {

            const buscarPor =
                (columna, valor) => {

                    const s =
                        db.prepare(`
                            SELECT
                                id,
                                nombre,
                                telefono,
                                email,
                                tipo,
                                password
                            FROM usuarios
                            WHERE ` + columna + ` = ?
                            LIMIT 1
                        `);

                    s.bind([valor]);

                    let u = null;

                    if (s.step()) {
                        u = s.getAsObject();
                    }

                    s.free();

                    return u;

                };

            let usuario = null;

            if (otp.esEmailValido(idLimpio)) {

                usuario =
                    buscarPor(
                        "email",
                        idLimpio.toLowerCase()
                    );

            }

            if (!usuario) {

                const tel =
                    otp.normalizarTelefonoRD(idLimpio);

                if (tel) {
                    usuario = buscarPor("telefono", tel);
                }

                /* Soporte a cuentas antiguas cuyo
                   teléfono no estaba normalizado. */
                if (!usuario) {
                    usuario = buscarPor("telefono", idLimpio);
                }

            }

            if (!usuario) {

                return res.status(401).json({

                    error:
                        "Teléfono/correo o contraseña incorrectos"

                });

            }


            if (
                !usuario.password ||
                !bcrypt.compareSync(
                    password,
                    usuario.password
                )
            ) {

                return res.status(401).json({

                    error:
                        "Teléfono o contraseña incorrectos"

                });

            }


            delete usuario.password;


            const token =
                jwt.sign(
                    {
                        id: usuario.id,
                        tipo: usuario.tipo
                    },
                    JWT_SECRET,
                    { expiresIn: "30d" }
                );


            res.json({

                mensaje:
                    "Inicio de sesión correcto",

                usuario,

                token

            });

        } catch (error) {

            console.error(
                "ERROR LOGIN:",
                error
            );

            res.status(500).json({

                error:
                    "Error interno del servidor",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
OBTENER DATOS DE UN USUARIO (SALDO, FORMA DE PAGO, ETC)
===================================================== */

app.get(
    "/usuarios/:id",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const stmt =
                db.prepare(`
                    SELECT

                        id,
                        nombre,
                        telefono,
                        email,
                        tipo,

                        documento_identidad,
                        foto_documento,

                        matricula_vehiculo,
                        modelo_vehiculo,
                        foto_matricula,
                        foto_vehiculo,

                        saldo,
                        forma_pago,
                        tarjeta_numero,
                        numero_cuenta_banco

                    FROM usuarios

                    WHERE id = ?

                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Usuario no encontrado"

                });

            }


            const usuario =
                stmt.getAsObject();


            stmt.free();


            res.json(usuario);

        } catch (error) {

            console.error(
                "ERROR OBTENIENDO USUARIO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo obtener el usuario",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
ACTUALIZAR FORMA DE PAGO (PASAJERO)
===================================================== */

app.put(
    "/usuarios/:id/pago",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                forma_pago,
                tarjeta_numero
            } = req.body;


            if (
                forma_pago !== "efectivo" &&
                forma_pago !== "tarjeta"
            ) {

                return res.status(400).json({

                    error:
                        "La forma de pago debe ser efectivo o tarjeta"

                });

            }


            if (
                forma_pago === "tarjeta" &&
                !tarjeta_numero
            ) {

                return res.status(400).json({

                    error:
                        "Debes indicar el número de tarjeta"

                });

            }


            db.run(`
                UPDATE usuarios
                SET
                    forma_pago = ?,
                    tarjeta_numero = ?
                WHERE id = ?
            `, [

                forma_pago,

                forma_pago === "tarjeta"
                    ? tarjeta_numero
                    : null,

                id

            ]);


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Forma de pago actualizada",

                forma_pago

            });

        } catch (error) {

            console.error(
                "ERROR ACTUALIZANDO PAGO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo actualizar la forma de pago",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
RETIRAR SALDO (CONDUCTOR)
===================================================== */

app.put(
    "/usuarios/:id/retirar",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                numero_cuenta_banco,
                monto
            } = req.body;

            const montoNumero =
                Number(monto);


            if (
                !numero_cuenta_banco ||
                !numero_cuenta_banco.trim()
            ) {

                return res.status(400).json({

                    error:
                        "Debes indicar tu número de cuenta bancaria"

                });

            }


            if (
                !montoNumero ||
                montoNumero <= 0
            ) {

                return res.status(400).json({

                    error:
                        "El monto a retirar no es válido"

                });

            }


            const stmt =
                db.prepare(`
                    SELECT saldo, tipo
                    FROM usuarios
                    WHERE id = ?
                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Usuario no encontrado"

                });

            }


            const usuario =
                stmt.getAsObject();


            stmt.free();


            if (
                usuario.tipo !== "conductor"
            ) {

                return res.status(403).json({

                    error:
                        "Solo los conductores pueden retirar saldo"

                });

            }


            if (
                montoNumero >
                Number(usuario.saldo || 0)
            ) {

                return res.status(400).json({

                    error:
                        "No tienes saldo suficiente para retirar ese monto"

                });

            }


            db.run(`
                UPDATE usuarios
                SET
                    saldo = saldo - ?,
                    numero_cuenta_banco = ?
                WHERE id = ?
            `, [

                montoNumero,
                numero_cuenta_banco.trim(),
                id

            ]);


            const registro =
                db.prepare(`
                    INSERT INTO retiros
                    (
                        conductor_id,
                        monto,
                        numero_cuenta_banco
                    )
                    VALUES (?, ?, ?)
                `);


            registro.run([

                id,
                montoNumero,
                numero_cuenta_banco.trim()

            ]);


            registro.free();


            const nuevoSaldo =
                Number(usuario.saldo || 0) -
                montoNumero;


            database.guardarBaseDatos();


            console.log("");
            console.log(
                "💸 RETIRO DE SALDO"
            );
            console.log(
                "Conductor:",
                id
            );
            console.log(
                "Monto:",
                montoNumero
            );
            console.log(
                "Cuenta:",
                numero_cuenta_banco
            );
            console.log("");


            res.json({

                mensaje:
                    "Retiro procesado correctamente",

                saldo:
                    nuevoSaldo

            });

        } catch (error) {

            console.error(
                "ERROR RETIRANDO SALDO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo procesar el retiro",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
EDITAR PERFIL (NOMBRE Y FOTO DE PERFIL)
===================================================== */

app.put(
    "/usuarios/:id/perfil",
    subirFotos.single("foto_perfil"),
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                nombre,
                email
            } = req.body;


            const archivo =
                req.file
                    ? "/uploads/" +
                      req.file.filename
                    : null;


            let sql =
                "UPDATE usuarios SET ";

            const partes = [];

            const parametros = [];

            if (nombre && nombre.trim()) {

                partes.push(
                    "nombre = ?"
                );

                parametros.push(
                    nombre.trim()
                );

            }

            if (email !== undefined) {

                partes.push(
                    "email = ?"
                );

                parametros.push(
                    email
                        ? email.trim()
                        : null
                );

            }

            if (archivo) {

                partes.push(
                    "foto_perfil = ?"
                );

                parametros.push(
                    archivo
                );

            }

            if (partes.length === 0) {

                return res.status(400).json({

                    error:
                        "No hay datos para actualizar"

                });

            }

            sql +=
                partes.join(", ") +
                " WHERE id = ?";

            parametros.push(id);


            db.run(
                sql,
                parametros
            );


            database.guardarBaseDatos();


            const stmt =
                db.prepare(`
                    SELECT
                        id, nombre, telefono, email,
                        tipo, foto_perfil
                    FROM usuarios
                    WHERE id = ?
                    LIMIT 1
                `);

            stmt.bind([id]);

            let usuarioActualizado = null;

            if (stmt.step()) {

                usuarioActualizado =
                    stmt.getAsObject();

            }

            stmt.free();


            res.json({

                mensaje:
                    "Perfil actualizado correctamente",

                usuario:
                    usuarioActualizado

            });

        } catch (error) {

            console.error(
                "ERROR ACTUALIZANDO PERFIL:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo actualizar el perfil",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CALIFICAR VIAJE
===================================================== */

app.post(
    "/viajes/:id/calificar",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            /* Seguridad: el calificador SIEMPRE es quien
               inició sesión (token JWT), nunca el del
               body. */
            const calificador_id =
                req.usuario.id;

            const {
                estrellas,
                comentario
            } = req.body;

            const estrellasNumero =
                Number(estrellas);


            if (
                !calificador_id ||
                !estrellasNumero ||
                estrellasNumero < 1 ||
                estrellasNumero > 5
            ) {

                return res.status(400).json({

                    error:
                        "Debes enviar una calificación de 1 a 5 estrellas"

                });

            }


            const stmt =
                db.prepare(`
                    SELECT
                        id, pasajero_id, conductor_id, estado
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);

            stmt.bind([id]);

            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }

            const viaje =
                stmt.getAsObject();

            stmt.free();


            if (
                viaje.estado !== "finalizado"
            ) {

                return res.status(400).json({

                    error:
                        "Solo puedes calificar viajes finalizados"

                });

            }


            let calificadoId = null;

            if (
                Number(calificador_id) ===
                Number(viaje.pasajero_id)
            ) {

                calificadoId =
                    viaje.conductor_id;

            } else if (
                Number(calificador_id) ===
                Number(viaje.conductor_id)
            ) {

                calificadoId =
                    viaje.pasajero_id;

            } else {

                return res.status(403).json({

                    error:
                        "No participaste en este viaje"

                });

            }

            if (!calificadoId) {

                return res.status(400).json({

                    error:
                        "No hay a quién calificar en este viaje"

                });

            }


            /*
             * Evitar calificar dos veces el
             * mismo viaje desde el mismo lado.
             */

            const existente =
                db.prepare(`
                    SELECT id
                    FROM calificaciones
                    WHERE viaje_id = ?
                    AND calificador_id = ?
                    LIMIT 1
                `);

            existente.bind([
                id,
                calificador_id
            ]);

            const yaCalifico =
                existente.step();

            existente.free();

            if (yaCalifico) {

                return res.status(400).json({

                    error:
                        "Ya calificaste este viaje"

                });

            }


            const insertar =
                db.prepare(`
                    INSERT INTO calificaciones
                    (
                        viaje_id,
                        calificador_id,
                        calificado_id,
                        estrellas,
                        comentario
                    )
                    VALUES (?, ?, ?, ?, ?)
                `);

            insertar.run([

                id,
                calificador_id,
                calificadoId,
                estrellasNumero,
                comentario || null

            ]);

            insertar.free();


            /*
             * RECALCULAR PROMEDIO
             */

            const promedioStmt =
                db.prepare(`
                    SELECT
                        AVG(estrellas) AS promedio,
                        COUNT(*) AS total
                    FROM calificaciones
                    WHERE calificado_id = ?
                `);

            promedioStmt.bind([
                calificadoId
            ]);

            let promedio = 5;
            let total = 0;

            if (promedioStmt.step()) {

                const fila =
                    promedioStmt.getAsObject();

                promedio =
                    Number(fila.promedio || 5);

                total =
                    Number(fila.total || 0);

            }

            promedioStmt.free();


            db.run(`
                UPDATE usuarios
                SET
                    calificacion_promedio = ?,
                    total_calificaciones = ?
                WHERE id = ?
            `, [

                Math.round(promedio * 10) / 10,
                total,
                calificadoId

            ]);


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Calificación registrada",

                calificacion_promedio:
                    Math.round(promedio * 10) / 10,

                total_calificaciones:
                    total

            });

        } catch (error) {

            console.error(
                "ERROR CALIFICANDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo registrar la calificación",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
SOPORTE TÉCNICO / REPORTES
===================================================== */

app.post(
    "/soporte",
    (req, res) => {

        try {

            const db =
                database.getDb();

            let {
                usuario_id,
                nombre_usuario,
                tipo_usuario,
                categoria,
                viaje_id,
                asunto,
                descripcion
            } = req.body;

            // Seguridad: el ticket siempre pertenece al usuario
            // del token, nunca al del body (evita suplantación).
            usuario_id = req.usuario.id;


            if (
                !usuario_id ||
                !asunto ||
                !descripcion
            ) {

                return res.status(400).json({

                    error:
                        "Faltan datos del reporte"

                });

            }


            const stmt =
                db.prepare(`
                    INSERT INTO soporte_tickets
                    (
                        usuario_id,
                        nombre_usuario,
                        tipo_usuario,
                        categoria,
                        viaje_id,
                        asunto,
                        descripcion
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

            stmt.run([

                usuario_id,
                nombre_usuario || null,
                tipo_usuario || null,
                categoria || "soporte",
                viaje_id || null,
                asunto.trim(),
                descripcion.trim()

            ]);

            stmt.free();


            database.guardarBaseDatos();


            console.log("");
            console.log(
                "🛟 NUEVO TICKET DE SOPORTE"
            );
            console.log(
                "Usuario:",
                usuario_id
            );
            console.log(
                "Asunto:",
                asunto
            );
            console.log("");


            res.json({

                mensaje:
                    "Tu reporte fue enviado. Te responderemos pronto."

            });

        } catch (error) {

            console.error(
                "ERROR CREANDO TICKET:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo enviar el reporte",

                detalle:
                    error.message

            });

        }

    }
);

app.get(
    "/soporte/:usuario_id",
    esElMismoUsuario("usuario_id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.usuario_id
                );

            const stmt =
                db.prepare(`
                    SELECT
                        id, categoria, viaje_id,
                        asunto, descripcion,
                        estado, fecha
                    FROM soporte_tickets
                    WHERE usuario_id = ?
                    ORDER BY id DESC
                    LIMIT 20
                `);

            stmt.bind([id]);

            const tickets = [];

            while (stmt.step()) {

                tickets.push(
                    stmt.getAsObject()
                );

            }

            stmt.free();


            res.json(tickets);

        } catch (error) {

            console.error(
                "ERROR OBTENIENDO TICKETS:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener tus reportes",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CREAR VIAJE
===================================================== */

app.post(
    "/viajes",
    soloRol("pasajero"),
    (req, res) => {

        const db =
            database.getDb();

        try {

            let {

                pasajero_id,

                conductor_id,

                recogida,

                destino,

                recogida_lat,

                recogida_lng,

                destino_lat,

                destino_lng,

                tipo_vehiculo,

                distancia,

                minutos,

                precio

            } = req.body;


            console.log("");
            console.log(
                "================================="
            );
            console.log(
                "🚕 NUEVA SOLICITUD"
            );
            console.log(
                req.body
            );


            /* =================================
            PASAJERO (SIEMPRE el usuario del token)
            ================================= */

            // Seguridad: el pasajero es SIEMPRE quien inició
            // sesión, nunca el del body (evita suplantación).
            pasajero_id = req.usuario.id;

            if (!pasajero_id) {

                const resultado =
                    db.exec(`
                        SELECT id
                        FROM usuarios
                        WHERE tipo = 'pasajero'
                        ORDER BY id ASC
                        LIMIT 1
                    `);


                const pasajeros =
                    convertirResultado(
                        resultado
                    );


                if (
                    pasajeros.length === 0
                ) {

                    return res.status(400).json({

                        error:
                            "No existe ningún pasajero registrado."

                    });

                }


                pasajero_id =
                    pasajeros[0].id;

            }


            /* =================================
            COORDENADAS
            ================================= */

            if (
                recogida_lat === undefined ||
                recogida_lng === undefined ||
                destino_lat === undefined ||
                destino_lng === undefined
            ) {

                return res.status(400).json({

                    error:
                        "Faltan las coordenadas de recogida o destino"

                });

            }


            conductor_id =
                conductor_id || null;

            tipo_vehiculo =
                tipo_vehiculo || "vehiculo";

            distancia =
                Number(distancia) || 0;

            minutos =
                Number(minutos) || 0;

            precio =
                Number(precio) || 0;


            /* =================================
            CREAR VIAJE
            ================================= */

            const stmt =
                db.prepare(`
                    INSERT INTO viajes
                    (
                        pasajero_id,
                        conductor_id,

                        origen_lat,
                        origen_lng,

                        destino_lat,
                        destino_lng,

                        recogida,
                        destino,

                        recogida_lat,
                        recogida_lng,

                        tipo_vehiculo,

                        distancia,
                        minutos,

                        estado,

                        precio,

                        codigo_verificacion,

                        cancelado_por,

                        motivo_cancelacion
                    )

                    VALUES
                    (
                        ?,
                        ?,

                        ?,
                        ?,

                        ?,
                        ?,

                        ?,
                        ?,

                        ?,
                        ?,

                        ?,

                        ?,
                        ?,

                        ?,

                        ?,

                        NULL,

                        NULL,

                        NULL
                    )
                `);


            stmt.run([

                Number(pasajero_id),

                conductor_id
                    ? Number(conductor_id)
                    : null,

                Number(recogida_lat),
                Number(recogida_lng),

                Number(destino_lat),
                Number(destino_lng),

                recogida || "",
                destino || "",

                Number(recogida_lat),
                Number(recogida_lng),

                tipo_vehiculo,

                distancia,

                minutos,

                "buscando_conductor",

                precio

            ]);


            stmt.free();


            const resultado =
                db.exec(`
                    SELECT *
                    FROM viajes
                    ORDER BY id DESC
                    LIMIT 1
                `);


            const viajes =
                convertirResultado(
                    resultado
                );


            if (
                viajes.length === 0
            ) {

                throw new Error(
                    "No se pudo recuperar el viaje creado"
                );

            }


            const viaje =
                viajes[0];


            database.guardarBaseDatos();


            console.log(
                "✅ VIAJE CREADO:",
                viaje.id
            );


            res.status(201).json({

                mensaje:
                    "Viaje creado correctamente",

                id:
                    viaje.id,

                viaje

            });

        } catch (error) {

            console.error(
                "❌ ERROR CREANDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo guardar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VIAJES DISPONIBLES
===================================================== */

app.get(
    "/viajes/disponibles",
    soloRol("conductor"),
    (req, res) => {

        try {

            const db =
                database.getDb();


            const resultado =
                db.exec(`
                    SELECT

                        v.id,

                        v.pasajero_id,

                        v.conductor_id,

                        v.recogida,

                        v.destino,

                        v.recogida_lat,

                        v.recogida_lng,

                        v.destino_lat,

                        v.destino_lng,

                        v.tipo_vehiculo,

                        v.distancia,

                        v.minutos,

                        v.estado,

                        v.precio,

                        v.fecha,

                        u.nombre
                            AS pasajero_nombre,

                        u.telefono
                            AS pasajero_telefono,

                        u.calificacion_promedio
                            AS pasajero_calificacion,

                        u.total_calificaciones
                            AS pasajero_total_calificaciones

                    FROM viajes v

                    LEFT JOIN usuarios u
                        ON u.id =
                           v.pasajero_id

                    WHERE v.estado =
                        'buscando_conductor'

                    ORDER BY v.id DESC
                `);


            res.json(
                convertirResultado(
                    resultado
                )
            );

        } catch (error) {

            console.error(
                "ERROR VIAJES DISPONIBLES:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener los viajes disponibles",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VER TODOS LOS VIAJES
===================================================== */

app.get(
    "/viajes",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();


            const resultado =
                db.exec(`
                    SELECT

                        v.id,

                        v.pasajero_id,

                        v.conductor_id,

                        v.recogida,

                        v.destino,

                        v.recogida_lat,

                        v.recogida_lng,

                        v.destino_lat,

                        v.destino_lng,

                        v.tipo_vehiculo,

                        v.distancia,

                        v.minutos,

                        v.estado,

                        v.precio,

                        v.fecha,

                        v.codigo_verificacion,

                        v.cancelado_por,

                        v.motivo_cancelacion,

                        u.nombre
                            AS pasajero_nombre

                    FROM viajes v

                    LEFT JOIN usuarios u
                        ON u.id =
                           v.pasajero_id

                    ORDER BY v.id DESC
                `);


            res.json(
                convertirResultado(
                    resultado
                )
            );

        } catch (error) {

            console.error(
                "ERROR OBTENIENDO VIAJES:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener los viajes",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
OBTENER VIAJE POR ID
===================================================== */

app.get(
    "/viajes/:id",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.*,

                        p.nombre
                            AS pasajero_nombre,

                        p.telefono
                            AS pasajero_telefono,

                        p.email
                            AS pasajero_email,

                        p.foto_perfil
                            AS pasajero_foto,

                        p.calificacion_promedio
                            AS pasajero_calificacion,

                        p.total_calificaciones
                            AS pasajero_total_calificaciones,

                        c.nombre
                            AS conductor_nombre,

                        c.telefono
                            AS conductor_telefono,

                        c.email
                            AS conductor_email,

                        c.foto_perfil
                            AS conductor_foto,

                        c.calificacion_promedio
                            AS conductor_calificacion,

                        c.total_calificaciones
                            AS conductor_total_calificaciones,

                        c.matricula_vehiculo
                            AS conductor_matricula,

                        c.modelo_vehiculo
                            AS conductor_modelo

                    FROM viajes v

                    LEFT JOIN usuarios p
                        ON p.id =
                           v.pasajero_id

                    LEFT JOIN usuarios c
                        ON c.id =
                           v.conductor_id

                    WHERE v.id = ?

                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            res.json(viaje);

        } catch (error) {

            console.error(
                "ERROR OBTENIENDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "Error obteniendo viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VIAJE ACTIVO PASAJERO
===================================================== */

app.get(
    "/viajes/pasajero/:id/activo",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.*,

                        c.nombre
                            AS conductor_nombre,

                        c.telefono
                            AS conductor_telefono,

                        c.email
                            AS conductor_email,

                        c.foto_perfil
                            AS conductor_foto,

                        c.calificacion_promedio
                            AS conductor_calificacion,

                        c.total_calificaciones
                            AS conductor_total_calificaciones,

                        c.matricula_vehiculo
                            AS conductor_matricula,

                        c.modelo_vehiculo
                            AS conductor_modelo

                    FROM viajes v

                    LEFT JOIN usuarios c
                        ON c.id =
                           v.conductor_id

                    WHERE v.pasajero_id = ?

                    AND v.estado IN
                    (
                        'buscando_conductor',
                        'aceptado',
                        'en_camino',
                        'recogido'
                    )

                    ORDER BY v.id DESC

                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.json(null);

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            res.json(viaje);

        } catch (error) {

            console.error(
                "ERROR VIAJE PASAJERO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo obtener el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VIAJE ACTIVO CONDUCTOR
===================================================== */

app.get(
    "/viajes/conductor/:id/activo",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.*,

                        p.nombre
                            AS pasajero_nombre,

                        p.telefono
                            AS pasajero_telefono,

                        p.email
                            AS pasajero_email

                    FROM viajes v

                    LEFT JOIN usuarios p
                        ON p.id =
                           v.pasajero_id

                    WHERE v.conductor_id = ?

                    AND v.estado IN
                    (
                        'aceptado',
                        'en_camino',
                        'recogido'
                    )

                    ORDER BY v.id DESC

                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.json(null);

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            res.json(viaje);

        } catch (error) {

            console.error(
                "ERROR VIAJE CONDUCTOR:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo obtener el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VIAJES DEL CONDUCTOR
===================================================== */

app.get(
    "/viajes/conductor/:id",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.*,

                        p.nombre
                            AS pasajero_nombre,

                        p.telefono
                            AS pasajero_telefono

                    FROM viajes v

                    LEFT JOIN usuarios p
                        ON p.id =
                           v.pasajero_id

                    WHERE v.conductor_id = ?

                    ORDER BY v.id DESC
                `);


            stmt.bind([id]);


            const viajes = [];

            while (
                stmt.step()
            ) {

                viajes.push(
                    stmt.getAsObject()
                );

            }


            stmt.free();


            res.json(viajes);

        } catch (error) {

            console.error(
                "ERROR VIAJES CONDUCTOR:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener los viajes",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
HISTORIAL DE VIAJES DEL CONDUCTOR (RECIENTES)
===================================================== */

app.get(
    "/viajes/conductor/:id/historial",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.id,

                        v.recogida,

                        v.destino,

                        v.tipo_vehiculo,

                        v.precio,

                        v.estado,

                        v.fecha,

                        p.nombre
                            AS pasajero_nombre

                    FROM viajes v

                    LEFT JOIN usuarios p
                        ON p.id =
                           v.pasajero_id

                    WHERE v.conductor_id = ?

                    AND v.estado IN
                    (
                        'finalizado',
                        'cancelado'
                    )

                    ORDER BY v.id DESC

                    LIMIT 20
                `);


            stmt.bind([id]);


            const viajes = [];

            while (
                stmt.step()
            ) {

                viajes.push(
                    stmt.getAsObject()
                );

            }


            stmt.free();


            res.json(viajes);

        } catch (error) {

            console.error(
                "ERROR HISTORIAL CONDUCTOR:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo obtener el historial",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
HISTORIAL DE VIAJES DEL PASAJERO (RECIENTES)
===================================================== */

app.get(
    "/viajes/pasajero/:id/historial",
    esElMismoUsuario("id"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const stmt =
                db.prepare(`
                    SELECT

                        v.id,

                        v.recogida,

                        v.destino,

                        v.tipo_vehiculo,

                        v.precio,

                        v.estado,

                        v.fecha,

                        c.nombre
                            AS conductor_nombre

                    FROM viajes v

                    LEFT JOIN usuarios c
                        ON c.id =
                           v.conductor_id

                    WHERE v.pasajero_id = ?

                    AND v.estado IN
                    (
                        'finalizado',
                        'cancelado'
                    )

                    ORDER BY v.id DESC

                    LIMIT 20
                `);


            stmt.bind([id]);


            const viajes = [];

            while (
                stmt.step()
            ) {

                viajes.push(
                    stmt.getAsObject()
                );

            }


            stmt.free();


            res.json(viajes);

        } catch (error) {

            console.error(
                "ERROR HISTORIAL PASAJERO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo obtener el historial",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
ACEPTAR VIAJE
===================================================== */

app.put(
    "/viajes/:id/aceptar",
    verificarToken,
    soloRol("conductor"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );

            const conductorId =
                Number(
                    req.body.conductor_id
                );


            if (
                !conductorId
            ) {

                return res.status(400).json({

                    error:
                        "Falta el conductor_id"

                });

            }


            /* =====================================
            VERIFICAR CONDUCTOR
            ===================================== */

            const conductorStmt =
                db.prepare(`
                    SELECT
                        id,
                        nombre,
                        telefono,
                        email,
                        tipo
                    FROM usuarios
                    WHERE id = ?
                    AND tipo = 'conductor'
                    LIMIT 1
                `);


            conductorStmt.bind([
                conductorId
            ]);


            if (
                !conductorStmt.step()
            ) {

                conductorStmt.free();

                return res.status(404).json({

                    error:
                        "El conductor no existe"

                });

            }


            const conductor =
                conductorStmt.getAsObject();


            conductorStmt.free();


            /* =====================================
            VERIFICAR VIAJE
            ===================================== */

            const verificar =
                db.prepare(`
                    SELECT
                        id,
                        estado,
                        conductor_id
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            verificar.bind([
                viajeId
            ]);


            if (
                !verificar.step()
            ) {

                verificar.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viajeAntes =
                verificar.getAsObject();


            verificar.free();


            if (
                viajeAntes.estado !==
                "buscando_conductor"
            ) {

                return res.status(409).json({

                    error:
                        "Este viaje ya no está disponible",

                    estado:
                        viajeAntes.estado,

                    conductor_id:
                        viajeAntes.conductor_id

                });

            }


            /* =====================================
            GENERAR CÓDIGO
            ===================================== */

            const codigo =
                generarCodigoVerificacion();


            /* =====================================
            ACEPTACIÓN ATÓMICA
            ===================================== */

            const update =
                db.prepare(`
                    UPDATE viajes

                    SET
                        conductor_id = ?,
                        estado = 'aceptado',
                        codigo_verificacion = ?,
                        fecha_aceptado =
                            CURRENT_TIMESTAMP,
                        cancelado_por = NULL,
                        motivo_cancelacion = NULL

                    WHERE id = ?

                    AND estado =
                        'buscando_conductor'
                `);


            update.run([

                conductorId,
                codigo,
                viajeId

            ]);


            update.free();


            /* =====================================
            VERIFICAR QUE REALMENTE SE ACEPTÓ
            ===================================== */

            const comprobar =
                db.prepare(`
                    SELECT *
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            comprobar.bind([
                viajeId
            ]);


            if (
                !comprobar.step()
            ) {

                comprobar.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado después de aceptar"

                });

            }


            const viaje =
                comprobar.getAsObject();


            comprobar.free();


            /*
             * Otro conductor pudo haberlo tomado
             * entre la comprobación y el UPDATE.
             */

            if (
                Number(
                    viaje.conductor_id
                ) !== conductorId ||
                viaje.estado !==
                "aceptado"
            ) {

                return res.status(409).json({

                    error:
                        "Este viaje ya fue aceptado por otro conductor",

                    estado:
                        viaje.estado,

                    conductor_id:
                        viaje.conductor_id

                });

            }


            database.guardarBaseDatos();


            console.log("");
            console.log(
                "🚗 VIAJE ACEPTADO"
            );
            console.log(
                "Viaje:",
                viajeId
            );
            console.log(
                "Conductor:",
                conductor.nombre
            );
            console.log(
                "Código:",
                codigo
            );
            console.log("");


            res.json({

                mensaje:
                    "Viaje aceptado correctamente",

                conductor,

                viaje,

                codigo_verificacion:
                    codigo

            });

        } catch (error) {

            console.error(
                "❌ ERROR ACEPTANDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo aceptar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CONDUCTOR SALE HACIA LA RECOGIDA (aceptado -> en_camino)
===================================================== */

app.put(
    "/viajes/:id/en-camino",
    soloRol("conductor"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );


            const verificar =
                db.prepare(`
                    SELECT id, estado
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            verificar.bind([id]);


            if (!verificar.step()) {

                verificar.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                verificar.getAsObject();


            verificar.free();


            if (
                viaje.estado !==
                "aceptado"
            ) {

                return res.status(400).json({

                    error:
                        "El viaje debe estar aceptado antes de marcarlo en camino"

                });

            }


            db.run(`
                UPDATE viajes
                SET estado = 'en_camino'
                WHERE id = ?
            `, [id]);


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Estado actualizado",

                estado:
                    "en_camino"

            });

        } catch (error) {

            console.error(
                "ERROR EN-CAMINO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo actualizar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
VERIFICAR CÓDIGO Y RECOGER PASAJERO
===================================================== */

app.put(
    "/viajes/:id/verificar",
    soloRol("conductor"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                conductor_id,
                codigo,
                lat,
                lng
            } = req.body;


            const stmt =
                db.prepare(`
                    SELECT

                        id,
                        conductor_id,
                        estado,
                        codigo_verificacion,
                        recogida_lat,
                        recogida_lng

                    FROM viajes

                    WHERE id = ?

                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            if (
                Number(
                    viaje.conductor_id
                ) !== Number(conductor_id)
            ) {

                return res.status(403).json({

                    error:
                        "No eres el conductor de este viaje"

                });

            }


            if (
                viaje.estado !==
                "en_camino"
            ) {

                return res.status(400).json({

                    error:
                        "El conductor debe estar en camino antes de recoger al pasajero"

                });

            }


            if (
                !viaje.codigo_verificacion
            ) {

                return res.status(400).json({

                    error:
                        "Este viaje no tiene código de verificación"

                });

            }


            /*
             * EL CONDUCTOR SOLO PUEDE VERIFICAR
             * EL CÓDIGO SI ESTÁ CERCA DE LA RECOGIDA
             */

            const tieneCoordenadasRecogida =
                viaje.recogida_lat !== null &&
                viaje.recogida_lat !== undefined &&
                viaje.recogida_lng !== null &&
                viaje.recogida_lng !== undefined;

            if (tieneCoordenadasRecogida) {

                if (
                    lat === undefined ||
                    lat === null ||
                    lng === undefined ||
                    lng === null
                ) {

                    return res.status(400).json({

                        error:
                            "No se pudo confirmar tu ubicación actual"

                    });

                }

                const distancia =
                    distanciaMetros(
                        Number(lat),
                        Number(lng),
                        Number(viaje.recogida_lat),
                        Number(viaje.recogida_lng)
                    );

                if (
                    distancia >
                    UMBRAL_METROS_RECOGIDA
                ) {

                    return res.status(400).json({

                        error:
                            "Debes estar cerca del punto de recogida para verificar el código",

                        distancia_metros:
                            Math.round(distancia)

                    });

                }

            }


            if (
                String(codigo).trim() !==
                String(viaje.codigo_verificacion)
            ) {

                return res.status(400).json({

                    error:
                        "Código de verificación incorrecto"

                });

            }


            db.run(`
                UPDATE viajes
                SET
                    estado = 'recogido',
                    fecha_recogida =
                        CURRENT_TIMESTAMP
                WHERE id = ?
            `, [id]);


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Pasajero recogido correctamente",

                estado:
                    "recogido"

            });

        } catch (error) {

            console.error(
                "ERROR VERIFICANDO CODIGO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo verificar el código",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
FINALIZAR VIAJE
===================================================== */

app.put(
    "/viajes/:id/finalizar",
    soloRol("conductor"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                conductor_id,
                lat,
                lng
            } = req.body;


            const stmt =
                db.prepare(`
                    SELECT
                        id,
                        estado,
                        conductor_id,
                        precio,
                        destino_lat,
                        destino_lng
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            if (
                Number(
                    viaje.conductor_id
                ) !==
                Number(conductor_id)
            ) {

                return res.status(403).json({

                    error:
                        "No eres el conductor de este viaje"

                });

            }


            if (
                viaje.estado !==
                "recogido"
            ) {

                return res.status(400).json({

                    error:
                        "El viaje debe estar recogido antes de finalizar"

                });

            }


            /*
             * EL CONDUCTOR SOLO PUEDE FINALIZAR
             * SI ESTÁ CERCA DEL DESTINO
             */

            const tieneCoordenadasDestino =
                viaje.destino_lat !== null &&
                viaje.destino_lat !== undefined &&
                viaje.destino_lng !== null &&
                viaje.destino_lng !== undefined;

            if (
                tieneCoordenadasDestino &&
                (
                    lat === undefined ||
                    lat === null ||
                    lng === undefined ||
                    lng === null
                )
            ) {

                return res.status(400).json({

                    error:
                        "No se pudo confirmar tu ubicación actual"

                });

            }

            if (tieneCoordenadasDestino) {

                const distancia =
                    distanciaMetros(
                        Number(lat),
                        Number(lng),
                        Number(viaje.destino_lat),
                        Number(viaje.destino_lng)
                    );

                if (
                    distancia >
                    UMBRAL_METROS_FINALIZAR
                ) {

                    return res.status(400).json({

                        error:
                            "Debes estar cerca del destino para finalizar el viaje",

                        distancia_metros:
                            Math.round(distancia)

                    });

                }

            }


            db.run(`
                UPDATE viajes
                SET
                    estado = 'finalizado',
                    fecha_finalizado =
                        CURRENT_TIMESTAMP,
                    finalizado_por = 'conductor'
                WHERE id = ?
            `, [id]);


            /*
             * ACREDITAR SALDO AL CONDUCTOR
             */

            let nuevoSaldo = null;

            if (viaje.conductor_id) {

                db.run(`
                    UPDATE usuarios
                    SET saldo =
                        saldo + ?
                    WHERE id = ?
                `, [

                    Number(
                        viaje.precio || 0
                    ),

                    viaje.conductor_id

                ]);


                const saldoStmt =
                    db.prepare(`
                        SELECT saldo
                        FROM usuarios
                        WHERE id = ?
                        LIMIT 1
                    `);

                saldoStmt.bind([
                    viaje.conductor_id
                ]);

                if (saldoStmt.step()) {

                    nuevoSaldo =
                        saldoStmt.getAsObject().saldo;

                }

                saldoStmt.free();

            }


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Viaje finalizado correctamente",

                estado:
                    "finalizado",

                saldo:
                    nuevoSaldo

            });

        } catch (error) {

            console.error(
                "ERROR FINALIZANDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo finalizar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
FINALIZAR VIAJE ANTICIPADAMENTE (LO PIDE EL PASAJERO)
===================================================== */

app.put(
    "/viajes/:id/finalizar-pasajero",
    soloRol("pasajero"),
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const {
                pasajero_id
            } = req.body;


            const stmt =
                db.prepare(`
                    SELECT
                        id,
                        estado,
                        pasajero_id,
                        conductor_id,
                        precio
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            stmt.bind([id]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            if (
                Number(
                    viaje.pasajero_id
                ) !==
                Number(pasajero_id)
            ) {

                return res.status(403).json({

                    error:
                        "No eres el pasajero de este viaje"

                });

            }


            if (
                viaje.estado !==
                "recogido"
            ) {

                return res.status(400).json({

                    error:
                        "Solo puedes finalizar el viaje una vez que ya estés a bordo"

                });

            }


            const precioOriginal =
                Number(
                    viaje.precio || 0
                );

            const precioReducido =
                Math.round(
                    precioOriginal *
                    PORCENTAJE_FINALIZACION_ANTICIPADA
                );


            db.run(`
                UPDATE viajes
                SET
                    estado = 'finalizado',
                    fecha_finalizado =
                        CURRENT_TIMESTAMP,
                    finalizado_por = 'pasajero_anticipado',
                    precio_original = ?,
                    precio = ?
                WHERE id = ?
            `, [

                precioOriginal,
                precioReducido,
                id

            ]);


            /*
             * ACREDITAR SALDO REDUCIDO AL CONDUCTOR
             */

            let nuevoSaldo = null;

            if (viaje.conductor_id) {

                db.run(`
                    UPDATE usuarios
                    SET saldo =
                        saldo + ?
                    WHERE id = ?
                `, [

                    precioReducido,
                    viaje.conductor_id

                ]);


                const saldoStmt =
                    db.prepare(`
                        SELECT saldo
                        FROM usuarios
                        WHERE id = ?
                        LIMIT 1
                    `);

                saldoStmt.bind([
                    viaje.conductor_id
                ]);

                if (saldoStmt.step()) {

                    nuevoSaldo =
                        saldoStmt.getAsObject().saldo;

                }

                saldoStmt.free();

            }


            database.guardarBaseDatos();


            console.log("");
            console.log(
                "⏹️ VIAJE FINALIZADO ANTICIPADAMENTE POR PASAJERO"
            );
            console.log(
                "Viaje:",
                id
            );
            console.log(
                "Precio original:",
                precioOriginal
            );
            console.log(
                "Precio con reducción:",
                precioReducido
            );
            console.log("");


            res.json({

                mensaje:
                    "Viaje finalizado. Se aplicó una tarifa reducida.",

                estado:
                    "finalizado",

                precio_original:
                    precioOriginal,

                precio:
                    precioReducido,

                saldo:
                    nuevoSaldo

            });

        } catch (error) {

            console.error(
                "ERROR FINALIZANDO VIAJE (PASAJERO):",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo finalizar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CANCELAR VIAJE
===================================================== */

app.put(
    "/viajes/:id/cancelar",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );

            /* Seguridad: el usuario_id SIEMPRE viene del
               token JWT, nunca del body (evita
               suplantación). */
            const usuarioId =
                Number(
                    req.usuario.id
                );

            const motivo =
                req.body.motivo ||
                "Cancelado por el usuario";

            const tipoUsuario =
                req.body.tipo_usuario ||
                req.usuario.tipo;


            /* =====================================
            OBTENER VIAJE
            ===================================== */

            const stmt =
                db.prepare(`
                    SELECT
                        id,
                        pasajero_id,
                        conductor_id,
                        estado
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);


            stmt.bind([
                viajeId
            ]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                stmt.getAsObject();


            stmt.free();


            const esPasajero =
                Number(
                    viaje.pasajero_id
                ) === usuarioId;

            const esConductor =
                Number(
                    viaje.conductor_id
                ) === usuarioId;


            if (
                !esPasajero &&
                !esConductor
            ) {

                return res.status(403).json({

                    error:
                        "No tienes permiso para cancelar este viaje"

                });

            }


            /* =====================================
            YA FINALIZADO
            ===================================== */

            if (
                viaje.estado ===
                "finalizado"
            ) {

                return res.status(400).json({

                    error:
                        "El viaje ya fue finalizado"

                });

            }


            /* =====================================
            YA CANCELADO
            ===================================== */

            if (
                viaje.estado ===
                "cancelado"
            ) {

                return res.status(400).json({

                    error:
                        "El viaje ya fue cancelado"

                });

            }


            /* =====================================
            CONDUCTOR CANCELA
            ===================================== */

            if (
                esConductor
            ) {

                /*
                 * El conductor abandona el viaje.
                 *
                 * El viaje vuelve a búsqueda.
                 */

                const update =
                    db.prepare(`
                        UPDATE viajes

                        SET
                            conductor_id = NULL,

                            estado =
                                'buscando_conductor',

                            codigo_verificacion =
                                NULL,

                            fecha_aceptado =
                                NULL,

                            cancelado_por = ?,

                            motivo_cancelacion = ?

                        WHERE id = ?

                        AND conductor_id = ?
                    `);


                update.run([

                    usuarioId,
                    motivo,
                    viajeId,
                    usuarioId

                ]);


                update.free();


                database.guardarBaseDatos();


                console.log("");
                console.log(
                    "🚗❌ CONDUCTOR CANCELÓ"
                );
                console.log(
                    "Viaje:",
                    viajeId
                );
                console.log(
                    "Conductor:",
                    usuarioId
                );
                console.log("");


                return res.json({

                    mensaje:
                        "El conductor canceló el viaje",

                    id:
                        viajeId,

                    estado:
                        "buscando_conductor",

                    cancelado_por:
                        usuarioId,

                    tipo_cancelacion:
                        "conductor",

                    motivo

                });

            }


            /* =====================================
            PASAJERO CANCELA
            ===================================== */

            if (
                esPasajero
            ) {

                const update =
                    db.prepare(`
                        UPDATE viajes

                        SET

                            estado =
                                'cancelado',

                            codigo_verificacion =
                                NULL,

                            cancelado_por = ?,

                            motivo_cancelacion = ?

                        WHERE id = ?

                        AND pasajero_id = ?
                    `);


                update.run([

                    usuarioId,
                    motivo,
                    viajeId,
                    usuarioId

                ]);


                update.free();


                database.guardarBaseDatos();


                console.log("");
                console.log(
                    "❌ PASAJERO CANCELÓ"
                );
                console.log(
                    "Viaje:",
                    viajeId
                );
                console.log(
                    "Pasajero:",
                    usuarioId
                );
                console.log("");


                return res.json({

                    mensaje:
                        "Viaje cancelado correctamente",

                    id:
                        viajeId,

                    estado:
                        "cancelado",

                    cancelado_por:
                        usuarioId,

                    tipo_cancelacion:
                        "pasajero",

                    motivo

                });

            }


        } catch (error) {

            console.error(
                "ERROR CANCELANDO VIAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo cancelar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CAMBIAR ESTADO DEL VIAJE
===================================================== */

app.put(
    "/viajes/:id/estado",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const id =
                Number(
                    req.params.id
                );

            const estado =
                req.body.estado;

            const codigo =
                String(
                    req.body.codigo_verificacion ||
                    ""
                ).trim();


            const estadosPermitidos = [

                "buscando_conductor",
                "aceptado",
                "en_camino",
                "recogido",
                "finalizado",
                "cancelado"

            ];


            if (
                !estadosPermitidos.includes(
                    estado
                )
            ) {

                return res.status(400).json({

                    error:
                        "Estado no válido"

                });

            }


            /* =====================================
            OBTENER VIAJE
            ===================================== */

            const verificar =
                db.prepare(`
                    SELECT

                        id,
                        pasajero_id,
                        conductor_id,
                        estado,
                        codigo_verificacion

                    FROM viajes

                    WHERE id = ?

                    LIMIT 1
                `);


            verificar.bind([
                id
            ]);


            if (
                !verificar.step()
            ) {

                verificar.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                verificar.getAsObject();


            verificar.free();


            /* =====================================
            VERIFICAR AUTORIZACIÓN
            Solo el conductor o pasajero del
            viaje pueden cambiar su estado.
            ===================================== */

            const esPasajeroViaje =
                Number(
                    viaje.pasajero_id
                ) === Number(
                    req.usuario.id
                );

            const esConductorViaje =
                Number(
                    viaje.conductor_id
                ) === Number(
                    req.usuario.id
                );


            if (
                !esPasajeroViaje &&
                !esConductorViaje
            ) {

                return res.status(403).json({

                    error:
                        "No tienes permiso para modificar este viaje"

                });

            }


            /* =====================================
            RECOGIDO (solo conductor)
            ===================================== */

            if (
                estado ===
                "recogido"
            ) {

                if (
                    !esConductorViaje
                ) {

                    return res.status(403).json({

                        error:
                            "Solo el conductor puede marcar como recogido"

                    });

                }

                if (
                    !viaje.codigo_verificacion
                ) {

                    return res.status(400).json({

                        error:
                            "Este viaje no tiene código de verificación"

                    });

                }


                if (
                    codigo !==
                    String(
                        viaje.codigo_verificacion
                    )
                ) {

                    return res.status(400).json({

                        error:
                            "Código de verificación incorrecto"

                    });

                }


                if (
                    viaje.estado !==
                    "en_camino"
                ) {

                    return res.status(400).json({

                        error:
                            "El conductor debe estar en camino antes de recoger al pasajero"

                    });

                }

            }


            /* =====================================
            FINALIZAR (solo conductor)
            ===================================== */

            if (
                estado ===
                "finalizado"
            ) {

                if (
                    !esConductorViaje
                ) {

                    return res.status(403).json({

                        error:
                            "Solo el conductor puede finalizar el viaje"

                    });

                }

                if (
                    viaje.estado !==
                    "recogido"
                ) {

                    return res.status(400).json({

                        error:
                            "El viaje debe estar recogido antes de finalizar"

                    });

                }

            }


            /* =====================================
            CANCELAR
            ===================================== */

            if (
                estado ===
                "cancelado"
            ) {

                return res.status(400).json({

                    error:
                        "Utiliza /viajes/:id/cancelar para cancelar"

                });

            }


            /* =====================================
            ACTUALIZAR
            ===================================== */

            let sql = `
                UPDATE viajes
                SET estado = ?
            `;


            const parametros = [
                estado
            ];


            if (
                estado ===
                "recogido"
            ) {

                sql += `,
                    fecha_recogida =
                        CURRENT_TIMESTAMP
                `;

            }


            if (
                estado ===
                "finalizado"
            ) {

                sql += `,
                    fecha_finalizado =
                        CURRENT_TIMESTAMP
                `;

            }


            sql += `
                WHERE id = ?
            `;


            parametros.push(id);


            const stmt =
                db.prepare(sql);


            stmt.run(
                parametros
            );


            stmt.free();


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Estado actualizado",

                id,

                estado

            });

        } catch (error) {

            console.error(
                "ERROR ESTADO:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo actualizar el viaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CHAT - OBTENER MENSAJES
===================================================== */

app.get(
    "/viajes/:id/mensajes",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );


            /* =====================================
            VERIFICAR QUE EL USUARIO PARTICIPE EN EL VIAJE
            ===================================== */

            const viajeVerif =
                db.prepare(`
                    SELECT
                        id,
                        pasajero_id,
                        conductor_id
                    FROM viajes
                    WHERE id = ?
                    LIMIT 1
                `);

            viajeVerif.bind([viajeId]);

            if (
                !viajeVerif.step()
            ) {

                viajeVerif.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }

            const viajeData =
                viajeVerif.getAsObject();

            viajeVerif.free();

            const usuarioParticipa =
                Number(
                    viajeData.pasajero_id
                ) === Number(req.usuario.id) ||
                Number(
                    viajeData.conductor_id
                ) === Number(req.usuario.id);

            if (
                !usuarioParticipa
            ) {

                return res.status(403).json({

                    error:
                        "No tienes acceso a este chat"

                });

            }


            const stmt =
                db.prepare(`
                    SELECT

                        m.id,

                        m.viaje_id,

                        m.usuario_id,

                        m.mensaje,

                        m.fecha,

                        u.nombre
                            AS usuario_nombre,

                        u.tipo
                            AS usuario_tipo

                    FROM mensajes m

                    LEFT JOIN usuarios u
                        ON u.id =
                           m.usuario_id

                    WHERE m.viaje_id = ?

                    ORDER BY m.id ASC
                `);


            stmt.bind([
                viajeId
            ]);


            const mensajes = [];

            while (
                stmt.step()
            ) {

                mensajes.push(
                    stmt.getAsObject()
                );

            }


            stmt.free();


            res.json(mensajes);

        } catch (error) {

            console.error(
                "ERROR OBTENIENDO MENSAJES:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudieron obtener los mensajes",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
CHAT - ENVIAR MENSAJE
===================================================== */

app.post(
    "/viajes/:id/mensajes",
    verificarToken,
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );


            /* Seguridad: el usuario_id SIEMPRE viene
               del token JWT, nunca del body. */
            const usuarioId =
                Number(
                    req.usuario.id
                );


            const {
                mensaje
            } = req.body;


            if (
                !usuarioId
            ) {

                return res.status(400).json({

                    error:
                        "Falta usuario_id"

                });

            }


            if (
                !mensaje ||
                !mensaje.trim()
            ) {

                return res.status(400).json({

                    error:
                        "El mensaje está vacío"

                });

            }


            /* =====================================
            VERIFICAR VIAJE
            ===================================== */

            const viajeStmt =
                db.prepare(`
                    SELECT

                        id,
                        pasajero_id,
                        conductor_id,
                        estado

                    FROM viajes

                    WHERE id = ?

                    LIMIT 1
                `);


            viajeStmt.bind([
                viajeId
            ]);


            if (
                !viajeStmt.step()
            ) {

                viajeStmt.free();

                return res.status(404).json({

                    error:
                        "Viaje no encontrado"

                });

            }


            const viaje =
                viajeStmt.getAsObject();


            viajeStmt.free();


            if (
                Number(
                    viaje.pasajero_id
                ) !== usuarioId &&

                Number(
                    viaje.conductor_id
                ) !== usuarioId
            ) {

                return res.status(403).json({

                    error:
                        "No tienes acceso a este chat"

                });

            }


            const stmt =
                db.prepare(`
                    INSERT INTO mensajes
                    (
                        viaje_id,
                        usuario_id,
                        mensaje
                    )
                    VALUES (?, ?, ?)
                `);


            stmt.run([

                viajeId,

                usuarioId,

                mensaje.trim()

            ]);


            stmt.free();


            database.guardarBaseDatos();


            res.json({

                mensaje:
                    "Mensaje enviado"

            });

        } catch (error) {

            console.error(
                "ERROR ENVIANDO MENSAJE:",
                error
            );

            res.status(500).json({

                error:
                    "No se pudo enviar el mensaje",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
INICIAR SERVIDOR
===================================================== */

const PORT = 3000;


async function iniciarServidor() {

    try {

        await database.iniciarBaseDatos();

        prepararBaseDatos();

        migrarContrasenasPlanas();


/* =====================================================
   RUTA (ROUTING) - PROXY SEGURO A ORS / OSRM
   La clave de OpenRouteService vive SOLO aqui
   (process.env.ORS_API_KEY). Devuelve
   { routes: [ { geometry, legs } ] }.
===================================================== */

/* Decodifica la polilínea codificada que devuelve
   ORS (formato estándar Google, precisión 1e5) a un
   arreglo de coordenadas [lng, lat] para el GeoJSON. */
function decodificarPolyline(str) {

    const coords = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < str.length) {

        let result = 1;
        let shift = 0;
        let b;

        do {
            b = str.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);

        lat +=
            (result & 1)
                ? ~(result >> 1)
                : (result >> 1);

        result = 1;
        shift = 0;

        do {
            b = str.charCodeAt(index++) - 63 - 1;
            result += b << shift;
            shift += 5;
        } while (b >= 0x1f);

        lng +=
            (result & 1)
                ? ~(result >> 1)
                : (result >> 1);

        coords.push([
            lng / 1e5,
            lat / 1e5
        ]);

    }

    return coords;

}

app.get(
    "/api/ruta",
    rutaLimiter,
    async (req, res) => {

        const {
            oLat,
            oLng,
            dLat,
            dLng,
            proveedor
        } = req.query;

        if (
            oLat === undefined ||
            oLng === undefined ||
            dLat === undefined ||
            dLng === undefined
        ) {

            return res.status(400).json({
                error: "Faltan coordenadas"
            });

        }

        const osLat = Number(oLat);
        const osLng = Number(oLng);
        const dsLat = Number(dLat);
        const dsLng = Number(dLng);

        /* 1) OpenRouteService (si hay clave) */
        /* proveedor=osrm salta ORS y usa OSRM directo,
           porque OSRM devuelve "maneuver" (tipo/modo de
           giro) útil para traducir instrucciones a
           español cuando se prefiere OSRM. */

        if (process.env.ORS_API_KEY && proveedor !== "osrm") {

            try {

                /* ORS IGNORA "language" cuando se manda
                   en la query string (GET): siempre
                   responde las instrucciones en inglés.
                   Hay que usar POST y enviar
                   "language":"es" en el body para que
                   vengan en español. La geometría viene
                   como polilínea codificada, la
                   decodificamos a coordenadas GeoJSON. */

                const url =

                    "https://api.openrouteservice.org/v2/directions/driving-car" +
                    "?api_key=" + process.env.ORS_API_KEY;

                const r =
                    await fetch(
                        url,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/json"
                            },
                            body: JSON.stringify({
                                coordinates: [
                                    [ osLng, osLat ],
                                    [ dsLng, dsLat ]
                                ],
                                language: "es"
                            })
                        }
                    );

                const d =
                    await r.json();

                const rutaORS =

                    d &&
                    d.routes &&
                    d.routes[0];

                if (
                    rutaORS &&
                    rutaORS.geometry
                ) {

                    const coords =
                        decodificarPolyline(
                            rutaORS.geometry
                        );

                    const summary =
                        rutaORS.summary || {};

                    const segmentos =
                        rutaORS.segments || [];

                    const pasos =

                        segmentos
                            .reduce(
                                (acc, seg) =>
                                    acc.concat(
                                        seg.steps || []
                                    ),
                                []
                            )
                            .map(
                                paso => ({

                                    distance:
                                        paso.distance,

                                    duration:
                                        paso.duration,

                                    /* ORS ya trae la
                                       instrucción en español
                                       (language=es en el body
                                       POST). */
                                    instruction:
                                        paso.instruction,

                                    name:
                                        paso.name,

                                    /* ORS no envía "maneuver"
                                       (usa un "type" numérico),
                                       así que lo dejamos nulo
                                       para que el frontend use
                                       el texto en español y
                                       deduzca el ícono desde
                                       la instrucción. */
                                    maneuver: {
                                        type: null,
                                        modifier: null
                                    }

                                })
                            );

                    return res.json({

                        routes: [
                            {

                                geometry: {
                                    type: "LineString",
                                    coordinates: coords
                                },

                                distance:
                                    summary.distance != null
                                        ? summary.distance
                                        : null,

                                duration:
                                    summary.duration != null
                                        ? summary.duration
                                        : null,

                                legs: [
                                    {

                                        distance:
                                            summary.distance != null
                                                ? summary.distance
                                                : null,

                                        duration:
                                            summary.duration != null
                                                ? summary.duration
                                                : null,

                                        steps: pasos

                                    }
                                ]

                            }
                        ]

                    });

                }

            } catch (e) {

                console.warn(
                    "ORS falló, probando OSRM:",
                    e
                );

            }

        }

        /* 2) OSRM (keyless) */

        try {

            const url =

                "https://router.project-osrm.org/route/v1/driving/" +
                osLng + "," + osLat + ";" +
                dsLng + "," + dsLat +
                "?overview=full&geometries=geojson&steps=true";

            const r =
                await fetch(url);

            const d =
                await r.json();

            if (d && d.routes && d.routes.length) {

                return res.json(d);

            }

        } catch (e) {

            console.warn("OSRM falló:", e);

        }

        /* 3) Sin routing */
        return res.status(502).json({
            error: "No se pudo calcular la ruta"
        });

    }
);


/* =====================================================
   LUGARES (GEOCODIFICACIÓN) - PROXY SEGURO
   Combina fuentes libres (Photon + Nominatim
   acotado a RD) para mejorar la cobertura de
   direcciones en República Dominicana. Si existe
   GOOGLE_API_KEY en .env, usa Google Geocoding
   (mejor cobertura) en su lugar. La key de Google
   NUNCA sale del server.
===================================================== */

const RD_BBOX = {
    minLat: 17.4,
    maxLat: 19.9,
    minLng: -72.0,
    maxLng: -68.3
};

function nombreLugarPhoton(p) {

    const partes = [];

    if (p.name) {

        partes.push(p.name);

    } else if (p.street) {

        partes.push(p.street);

    }

    const ciudad =
        p.city ||
        p.town ||
        p.village ||
        p.municipality;

    if (ciudad) {

        partes.push(ciudad);

    }

    if (p.state) {

        partes.push(p.state);

    }

    if (p.country) {

        partes.push(p.country);

    }

    return partes.join(", ");

}

function dentroDeRD(lat, lng) {

    return (
        lat >= RD_BBOX.minLat &&
        lat <= RD_BBOX.maxLat &&
        lng >= RD_BBOX.minLng &&
        lng <= RD_BBOX.maxLng
    );

}

app.get(
    "/api/lugares",
    lugaresLimiter,
    async (req, res) => {

        const q = req.query.q;

        if (
            !q ||
            String(q).trim().length < 2
        ) {

            return res.json([]);

        }

        const texto =
            String(q).trim();

        const resultados = [];
        const vistos = new Set();

        const clave =
            (lat, lng) =>
                lat.toFixed(4) +
                "," +
                lng.toFixed(4);

        const agregar = (nombre, lat, lng) => {

            if (
                lat == null ||
                lng == null ||
                isNaN(lat) ||
                isNaN(lng)
            ) {

                return;

            }

            const k = clave(lat, lng);

            if (vistos.has(k)) {

                return;

            }

            vistos.add(k);

            resultados.push({
                nombre: nombre,
                lat: lat,
                lng: lng
            });

        };

        /*
         * 1) GOOGLE (si hay key en .env). Mejor
         *    cobertura en RD; la key nunca se
         *    expone al navegador.
         */
        let googleResultados = [];

        if (process.env.GOOGLE_API_KEY) {

            const key =
                process.env.GOOGLE_API_KEY;

            const empujarGoogle = (
                nombre,
                lat,
                lng
            ) => {

                if (
                    lat != null &&
                    lng != null &&
                    !isNaN(lat) &&
                    !isNaN(lng)
                ) {

                    googleResultados.push({
                        nombre: nombre,
                        lat: lat,
                        lng: lng
                    });

                }

            };

            /* a) Places API (New): Text Search */
            try {

                const r =
                    await fetch(
                        "https://places.googleapis.com/v1/places:searchText" +
                        "?key=" + key,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type":
                                    "application/json",
                                "X-Goog-FieldMask":
                                    "places.displayName," +
                                    "places.formattedAddress," +
                                    "places.location"
                            },
                            body: JSON.stringify({
                                text: texto,
                                languageCode: "es",
                                regionCode: "DO"
                            })
                        }
                    );

                const d =
                    await r.json();

                (d.places || [])
                    .forEach(
                        p => {

                            const loc =
                                p.location;

                            const nombre =
                                p.formattedAddress ||
                                (
                                    p.displayName &&
                                    p.displayName.text
                                ) ||
                                texto;

                            if (loc) {

                                empujarGoogle(
                                    nombre,
                                    Number(
                                        loc.latitude
                                    ),
                                    Number(
                                        loc.longitude
                                    )
                                );

                            }

                        }
                    );

            } catch (e) {

                console.warn(
                    "Google Places (New) falló:",
                    e
                );

            }

            /* b) Places API (legacy): Text Search */
            if (googleResultados.length === 0) {

                try {

                    const r =
                        await fetch(
                            "https://maps.googleapis.com/maps/api/place/textsearch/json" +
                            "?query=" +
                            encodeURIComponent(texto) +
                            "&language=es" +
                            "&region=do" +
                            "&key=" + key
                        );

                    const d =
                        await r.json();

                    (d.results || [])
                        .forEach(
                            p => {

                                const loc =
                                    p.geometry &&
                                    p.geometry.location;

                                if (loc) {

                                    empujarGoogle(
                                        p.formatted_address ||
                                            texto,
                                        Number(loc.lat),
                                        Number(loc.lng)
                                    );

                                }

                            }
                        );

                } catch (e) {

                    console.warn(
                        "Google Places (legacy) falló:",
                        e
                    );

                }

            }

            /* c) Geocoding API */
            if (googleResultados.length === 0) {

                try {

                    const r =
                        await fetch(
                            "https://maps.googleapis.com/maps/api/geocode/json" +
                            "?address=" +
                            encodeURIComponent(texto) +
                            "&components=country:DO" +
                            "&language=es" +
                            "&key=" + key
                        );

                    const d =
                        await r.json();

                    (d.results || [])
                        .forEach(
                            r0 => {

                                const loc =
                                    r0.geometry &&
                                    r0.geometry.location;

                                if (loc) {

                                    empujarGoogle(
                                        r0.formatted_address,
                                        Number(loc.lat),
                                        Number(loc.lng)
                                    );

                                }

                            }
                        );

                } catch (e) {

                    console.warn(
                        "Google Geocoding falló:",
                        e
                    );

                }

            }

        }

        /* Volcar resultados de Google */
        googleResultados.forEach(
            r => agregar(
                r.nombre,
                r.lat,
                r.lng
            )
        );

        /*
         * RESPALDO LIBRE (si Google no aportó nada:
         * API no habilitada, sin billing o sin
         * resultados). LocationIQ (key gratuita) +
         * Photon + Nominatim acotado a RD.
         */
        if (googleResultados.length === 0) {

            /* 2) LOCATIONIQ (libre, requiere key
               free-tier en .env como
               LOCATIONIQ_API_KEY). Tiene buena
               cobertura de RD (calles y POIs) y su
               propio índice distinto a Nominatim,
               así aporta resultados que Photon no
               trae. Acotamos a RD con countrycodes.
               Doc: https://locationiq.com */
            if (process.env.LOCATIONIQ_API_KEY) {

                try {

                    const url =

                        "https://locationiq.com/v1/search" +
                        "?key=" +
                        process.env.LOCATIONIQ_API_KEY +
                        "&q=" +
                        encodeURIComponent(texto) +
                        "&format=json" +
                        "&limit=20" +
                        "&countrycodes=do" +
                        "&addressdetails=1" +
                        "&accept-language=es";

                    const r =
                        await fetch(url);

                    const d =
                        await r.json();

                    /* LocationIQ devuelve un objeto de
                       error si la key falla o se
                       excede la cuota. */
                    if (Array.isArray(d)) {

                        d.forEach(
                            n => {

                                agregar(
                                    n.display_name,
                                    Number(n.lat),
                                    Number(n.lon)
                                );

                            }
                        );

                    } else if (d && d.error) {

                        console.warn(
                            "LocationIQ:",
                            d.error
                        );

                    }

                } catch (e) {

                    console.warn(
                        "LocationIQ falló:",
                        e
                    );

                }

            }

            /* 3) PHOTON (libre, sin key). Filtramos
               a RD para no traer resultados de
               otros países. */
            try {

                const url =

                    "https://photon.komoot.io/api/" +
                    "?q=" +
                    encodeURIComponent(texto) +
                    "&limit=20" +
                    "&lang=es";

                const r =
                    await fetch(
                        url,
                        {
                            headers: {
                                "User-Agent":
                                    "MiBola/1.0"
                            }
                        }
                    );

                const d =
                    await r.json();

                (d.features || [])
                    .forEach(
                        f => {

                            const p =
                                f.properties ||
                                {};

                            const c =
                                f.geometry &&
                                f.geometry.coordinates;

                            if (!c) {

                                return;

                            }

                            const lat =
                                Number(c[1]);
                            const lng =
                                Number(c[0]);

                            if (
                                dentroDeRD(
                                    lat,
                                    lng
                                )
                            ) {

                                agregar(
                                    nombreLugarPhoton(
                                        p
                                    ),
                                    lat,
                                    lng
                                );

                            }

                        }
                    );

            } catch (e) {

                console.warn(
                    "Photon falló:",
                    e
                );

            }

            /* 4) NOMINATIM acotado a RD como
               complemento (calles específicas que
               Photon no trae). El server manda
               User-Agent válido para cumplir la
               política de uso de OSM. */
            try {

                const url =

                    "https://nominatim.openstreetmap.org/search" +
                    "?format=json" +
                    "&q=" +
                    encodeURIComponent(texto) +
                    "&limit=20" +
                    "&addressdetails=1" +
                    "&countrycodes=do";

                const r =
                    await fetch(
                        url,
                        {
                            headers: {
                                "User-Agent":
                                    "MiBola/1.0 (app de transporte RD)"
                            }
                        }
                    );

                const d =
                    await r.json();

                (d || [])
                    .forEach(
                        n => {

                            agregar(
                                n.display_name,
                                Number(n.lat),
                                Number(n.lon)
                            );

                        }
                    );

            } catch (e) {

                console.warn(
                    "Nominatim falló:",
                    e
                );

            }

        }

        /* Tope final para mantener la lista usable
           en el frontend (evita 40+ resultados). */
        const MAX_RESULTADOS = 25;

        res.json(
            resultados.slice(0, MAX_RESULTADOS)
        );

    }
);


/* =====================================================
   LUGARES - REVERSE GEOCODE (lat,lng -> dirección)
   Usado por la función "soltar pin en el mapa":
   dada una coordenada, devuelve un nombre legible
   (calle/barrio) para mostrar en el campo. Google si
   hay key; si no, Nominatim (RD). La key de Google
   nunca sale del server.
===================================================== */

app.get(
    "/api/lugares-reverse",
    lugaresLimiter,
    async (req, res) => {

        const lat =
            parseFloat(req.query.lat);

        const lng =
            parseFloat(req.query.lng);

        if (
            isNaN(lat) ||
            isNaN(lng)
        ) {

            return res.json({
                nombre: null,
                lat: lat,
                lng: lng
            });

        }

        /* 1) GOOGLE reverse (si hay key en .env) */
        if (process.env.GOOGLE_API_KEY) {

            try {

                const r =
                    await fetch(
                        "https://maps.googleapis.com/maps/api/geocode/json" +
                        "?latlng=" +
                        lat + "," + lng +
                        "&language=es" +
                        "&key=" +
                        process.env.GOOGLE_API_KEY
                    );

                const d =
                    await r.json();

                if (
                    d.results &&
                    d.results.length > 0
                ) {

                    return res.json({
                        nombre:
                            d.results[0]
                                .formatted_address,
                        lat: lat,
                        lng: lng
                    });

                }

            } catch (e) {

                console.warn(
                    "Google reverse falló:",
                    e
                );

            }

        }

        /* 2) NOMINATIM reverse (libre, RD). Zoom 18
           da calle/barrio. User-Agent válido para
           cumplir la política de OSM. */
        try {

            const url =

                "https://nominatim.openstreetmap.org/reverse" +
                "?format=json" +
                "&lat=" + lat +
                "&lon=" + lng +
                "&zoom=18" +
                "&addressdetails=1" +
                "&accept-language=es";

            const r =
                await fetch(
                    url,
                    {
                        headers: {
                            "User-Agent":
                                "MiBola/1.0 (app de transporte RD)"
                        }
                    }
                );

            const d =
                await r.json();

            if (d && d.display_name) {

                return res.json({
                    nombre: d.display_name,
                    lat: lat,
                    lng: lng
                });

            }

        } catch (e) {

            console.warn(
                "Nominatim reverse falló:",
                e
            );

        }

        /* 3) Nada encontrado: devolvemos las
           coordenadas como texto. */
        res.json({
            nombre:
                lat.toFixed(5) +
                ", " +
                lng.toFixed(5),
            lat: lat,
            lng: lng
        });

    }
);



        app.listen(
            PORT,
            "0.0.0.0",
            () => {

                console.log("");
                console.log(
                    "================================="
                );
                console.log(
                    "🚕 MiBola iniciado correctamente"
                );
                console.log(
                    "🌐 http://localhost:" +
                    PORT
                );
                console.log(
                    "💬 Chat habilitado"
                );
                console.log(
                    "🔐 Código de verificación habilitado"
                );
                console.log(
                    "❌ Cancelación habilitada"
                );
                console.log(
                    "🔄 Reasignación habilitada"
                );
                console.log(
                    "================================="
                );

            }
        );

    } catch (error) {

        console.error(
            "❌ ERROR INICIANDO SERVIDOR:",
            error
        );

    }

}


/* Manejador de errores global: solo expone al cliente
   el mensaje de rechazo de archivos (fileFilter); los
   errores internos devuelven 500 genérico sin filtrar
   información. */
app.use((err, req, res, next) => {

    console.error("❌ Error no controlado:", err);

    const esRechazoSubida =
        err &&
        err.message &&
        /archivo no permitido/i.test(err.message);

    if (esRechazoSubida) {

        return res.status(400).json({
            error: err.message
        });

    }

    res.status(500).json({
        error: "Error interno del servidor"
    });

});


iniciarServidor();
