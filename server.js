const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const database = require("./database");

const app = express();

app.use(cors());
app.use(express.json());

app.use(
    express.static(
        path.join(__dirname, "frontend")
    )
);


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

            const nombreUnico =
                Date.now() +
                "-" +
                Math.round(
                    Math.random() * 1e9
                ) +
                path.extname(
                    file.originalname
                );

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


    database.guardarBaseDatos();

    console.log(
        "✅ Estructura de base de datos verificada."
    );
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
INICIO
===================================================== */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "frontend",
            "index.html"
        )
    );

});


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
                password,
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
    subirFotos.fields([
        { name: "foto_documento", maxCount: 1 },
        { name: "foto_matricula", maxCount: 1 },
        { name: "foto_vehiculo", maxCount: 1 }
    ]),
    (req, res) => {

        const db =
            database.getDb();

        const {
            nombre,
            telefono,
            email,
            password,
            tipo,
            documento_identidad,
            matricula_vehiculo,
            modelo_vehiculo
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
                        "Como conductor debes indicar tu documento de identidad, matrícula y modelo del vehículo"

                });

            }

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

            const stmt =
                db.prepare(`
                    INSERT INTO usuarios
                    (
                        nombre,
                        telefono,
                        email,
                        password,
                        tipo,

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
                        ?, ?, ?, ?
                    )
                `);


            stmt.run([

                nombre,
                telefono,
                email || null,
                password,
                tipo,

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
                    "El teléfono o email ya existe",

                detalle:
                    error.message

            });

        }

    }
);


/* =====================================================
LOGIN
===================================================== */

app.post(
    "/login",
    (req, res) => {

        const db =
            database.getDb();

        const {
            telefono,
            password
        } = req.body;


        if (
            !telefono ||
            !password
        ) {

            return res.status(400).json({

                error:
                    "Debes introducir teléfono y contraseña"

            });

        }


        try {

            const stmt =
                db.prepare(`
                    SELECT
                        id,
                        nombre,
                        telefono,
                        email,
                        tipo
                    FROM usuarios
                    WHERE telefono = ?
                    AND password = ?
                    LIMIT 1
                `);


            stmt.bind([
                telefono,
                password
            ]);


            if (!stmt.step()) {

                stmt.free();

                return res.status(401).json({

                    error:
                        "Teléfono o contraseña incorrectos"

                });

            }


            const usuario =
                stmt.getAsObject();


            stmt.free();


            res.json({

                mensaje:
                    "Inicio de sesión correcto",

                usuario

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
CREAR VIAJE
===================================================== */

app.post(
    "/viajes",
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
            PASAJERO
            ================================= */

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
                            AS pasajero_telefono

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

                        c.nombre
                            AS conductor_nombre,

                        c.telefono
                            AS conductor_telefono,

                        c.email
                            AS conductor_email

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
                            AS conductor_email

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
                codigo
            } = req.body;


            const stmt =
                db.prepare(`
                    SELECT

                        id,
                        conductor_id,
                        estado,
                        codigo_verificacion

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
                        estado,
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
                viaje.estado !==
                "recogido"
            ) {

                return res.status(400).json({

                    error:
                        "El viaje debe estar recogido antes de finalizar"

                });

            }


            db.run(`
                UPDATE viajes
                SET
                    estado = 'finalizado',
                    fecha_finalizado =
                        CURRENT_TIMESTAMP
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
CANCELAR VIAJE
===================================================== */

app.put(
    "/viajes/:id/cancelar",
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );

            const usuarioId =
                Number(
                    req.body.usuario_id
                );

            const motivo =
                req.body.motivo ||
                "Cancelado por el usuario";

            const tipoUsuario =
                req.body.tipo_usuario ||
                "";


            if (!usuarioId) {

                return res.status(400).json({

                    error:
                        "Falta usuario_id"

                });

            }


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
            RECOGIDO
            ===================================== */

            if (
                estado ===
                "recogido"
            ) {

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
            FINALIZAR
            ===================================== */

            if (
                estado ===
                "finalizado"
            ) {

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
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );


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
    (req, res) => {

        try {

            const db =
                database.getDb();

            const viajeId =
                Number(
                    req.params.id
                );


            const {
                usuario_id,
                mensaje
            } = req.body;


            const usuarioId =
                Number(
                    usuario_id
                );


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


iniciarServidor();
