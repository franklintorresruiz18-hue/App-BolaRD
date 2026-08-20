/* =====================================================
   MÓDULO OTP
   Generación, almacenamiento y envío de códigos de
   verificación (One-Time Password) SOLO PARA REGISTRO.

   Canal soportado: "correo" (Gmail/email).

   ENVÍO (pluggable, gratis en desarrollo):
   - Consola: siempre disponible (modo dev).
   - Correo: nodemailer si están SMTP_HOST, SMTP_USER
            y SMTP_PASS (ej. Gmail, gratis).
   Si no hay proveedor configurado, el código se imprime en consola.
===================================================== */

const crypto = require("crypto");

const database = require("./database");


/* =====================================================
   CONFIGURACIÓN
===================================================== */

const OTP_TTL_SEGUNDOS = 10 * 60;   // 10 minutos
const OTP_MAX_INTENTOS = 5;         // máx intentos de verificación
const OTP_LONGITUD = 6;

/* Pepper para hashear el OTP (nunca se guarda el
   código en texto plano). Reusa JWT_SECRET si no
   hay OTP_SECRET. */
const OTP_PEPPER =
    process.env.OTP_SECRET ||
    process.env.JWT_SECRET ||
    "mibola-otp-pepper-cambiar-en-produccion";


/* =====================================================
   VALIDACIÓN / NORMALIZACIÓN
==================================================== */

const REGEX_EMAIL =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esEmailValido(input) {

    return (
        typeof input === "string" &&
        REGEX_EMAIL.test(input.trim())
    );

}

/* Normaliza email a minúsculas y recorta espacios */
function normalizarEmail(input) {

    if (!input) {
        return null;
    }

    const email = String(input).trim().toLowerCase();

    return esEmailValido(email) ? email : null;

}

/* Normaliza un teléfono de República Dominicana a
   formato E.164 (+18091234567).
   Acepta: 8091234567, 1-809-123-4567, +1 (809) 123-4567,
   +18091234567.
   Devuelve null si no es un número RD válido. */
const PREFIJOS_RD = ["809", "829", "849"];

function normalizarTelefonoRD(input) {

    if (!input) {
        return null;
    }

    const d =
        String(input)
            .replace(/\D/g, "");

    let digitos = null;

    if (
        d.length === 10 &&
        PREFIJOS_RD.includes(d.slice(0, 3))
    ) {

        // 8091234567 -> +18091234567
        digitos = "1" + d;

    } else if (
        d.length === 11 &&
        d.startsWith("1") &&
        PREFIJOS_RD.includes(d.slice(1, 4))
    ) {

        // 18091234567 -> +18091234567
        digitos = d;

    }

    return digitos ? "+" + digitos : null;

}


/* =====================================================
   GENERACIÓN Y HASH
===================================================== */

function generarCodigo() {

    /* Aleatorio criptográfico para evitar
       predecibilidad. */
    return String(
        crypto.randomInt(
            0,
            Math.pow(10, OTP_LONGITUD)
        )
    ).padStart(OTP_LONGITUD, "0");

}


function hashCodigo(codigo, destino) {

    return crypto
        .createHash("sha256")
        .update(
            codigo + "|" + destino + "|" + OTP_PEPPER
        )
        .digest("hex");

}


/* =====================================================
   ALMACENAMIENTO (tabla otps en la BD)
===================================================== */

function borrarDestino(destino) {

    const db = database.getDb();

    db.run(
        "DELETE FROM otps WHERE destino = ?",
        [destino]
    );

    database.guardarBaseDatos();

}


async function almacenar(destino, codigo) {

    const db = database.getDb();

    const expira =
        Math.floor(Date.now() / 1000) +
        OTP_TTL_SEGUNDOS;

    const hash =
        hashCodigo(codigo, destino);

    /* Eliminar códigos previos de este destino
       para que siempre haya uno solo vigente. */
    borrarDestino(destino);

    const stmt =
        db.prepare(`
            INSERT INTO otps
            (
                destino,
                canal,
                codigo_hash,
                intentos,
                expira
            )
            VALUES (?, 'correo', ?, 0, ?)
        `);

    stmt.run([destino, hash, expira]);
    stmt.free();

    database.guardarBaseDatos();

}


/*
 * Verifica el código. No lanza excepción; devuelve
 * { ok, razon }.
 */
function verificar(destino, codigo) {

    const db = database.getDb();

    const ahora =
        Math.floor(Date.now() / 1000);

    const stmt =
        db.prepare(`
            SELECT
                id,
                codigo_hash,
                intentos,
                expira
            FROM otps
            WHERE destino = ?
            ORDER BY id DESC
            LIMIT 1
        `);

    stmt.bind([destino]);

    let fila = null;

    if (stmt.step()) {
        fila = stmt.getAsObject();
    }

    stmt.free();

    if (!fila) {
        return { ok: false, razon: "no_encontrado" };
    }

    if (fila.expira < ahora) {
        borrarDestino(destino);
        return { ok: false, razon: "expirado" };
    }

    if (fila.intentos >= OTP_MAX_INTENTOS) {
        borrarDestino(destino);
        return { ok: false, razon: "intentos_agotados" };
    }

    const hash =
        hashCodigo(codigo, destino);

    if (hash === fila.codigo_hash) {

        borrarDestino(destino);
        return { ok: true };

    }

    /* Incrementar intentos fallidos. */
    const upd =
        db.prepare(
            "UPDATE otps SET intentos = intentos + 1 WHERE id = ?"
        );

    upd.run([fila.id]);
    upd.free();

    database.guardarBaseDatos();

    return { ok: false, razon: "incorrecto" };

}


/* =====================================================
   ENVÍO (pluggable)
===================================================== */

async function enviarCorreo(correo, codigo) {

    /* Requerido solo si se configura SMTP. */
    const nodemailer =
        require("nodemailer");

    const transporter =
        nodemailer.createTransport({

            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure:
                process.env.SMTP_SECURE === "true",
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }

        });

    const remitente =
        process.env.SMTP_FROM ||
        process.env.SMTP_USER;

    const texto =
        "Tu código de verificación de MiBola es: " +
        codigo +
        "\n\nEste código expira en 10 minutos." +
        "\nSi no solicitaste este registro, ignora este " +
        "mensaje; nadie más puede usar tu correo.";

    /* Versión HTML: un correo con formato legítimo
       (branding + nota de ignorar) reduce la chance
       de que Gmail lo clasifique como spam frente a
       un texto plano mínimo. */
    const html =
        "<!DOCTYPE html>" +
        "<html lang='es'><body style='margin:0;" +
        "background:#f4f4f5;font-family:Arial," +
        "Helvetica,sans-serif;'>" +
        "<div style='max-width:480px;margin:0 auto;" +
        "padding:24px;'>" +
        "<h2 style='color:#111827;'>Tu código de MiBola</h2>" +
        "<p style='color:#374151;font-size:15px;'>" +
        "Usa el siguiente código para verificar tu " +
        "registro. Expira en 10 minutos.</p>" +
        "<div style='font-size:32px;font-weight:bold;" +
        "letter-spacing:6px;color:#111827;" +
        "background:#e5e7eb;border-radius:12px;" +
        "padding:16px 24px;display:inline-block;'>" +
        codigo +
        "</div>" +
        "<p style='color:#6b7280;font-size:13px;'>" +
        "Si no solicitaste este registro, ignora este " +
        "mensaje. Nadie más puede usar tu correo.</p>" +
        "</div></body></html>";

    await transporter.sendMail({

        from: remitente,
        /* Reply-To al mismo remitente: correos con
           dirección de respuesta válida repuntan mejor
           en los filtros anti-spam. */
        replyTo: process.env.SMTP_USER || remitente,
        to: correo,
        subject: "Código de verificación de MiBola",
        text: texto,
        html: html

    });

}


/*
 * Envía el código por email. Si no hay
 * proveedor configurado, lo imprime en consola
 * (modo desarrollo, gratis).
 */
async function enviar(destino, codigo) {

    /* SMTP está "configurado" solo si hay host,
       usuario Y contraseña. Si falta la contraseña
       no tiene sentido intentar enviar. */
    const usaSMTP =
        Boolean(process.env.SMTP_HOST) &&
        Boolean(process.env.SMTP_USER) &&
        Boolean(process.env.SMTP_PASS);

    if (usaSMTP) {

        try {

            await enviarCorreo(destino, codigo);
            return "correo";

        } catch (error) {

            console.error(
                "⚠️ Falló el envío OTP por SMTP:",
                error.message
            );

            /* No silenciamos el fallo: si el usuario
               creyó configurar el correo, debe saber
               que no llegó. (Causa típica: usar la
               contraseña normal de Gmail en vez de una
               contraseña de aplicación / App Password.) */
            throw new Error(
                "No se pudo enviar el correo de " +
                "verificación. Revisa SMTP_USER y " +
                "SMTP_PASS. En Gmail usa una " +
                "contraseña de aplicación (App " +
                "Password), no tu clave normal."
            );

        }

    }

    /* Fallback: consola (siempre funciona, gratis). */
    console.log(
        "\n🔐 CÓDIGO OTP (correo) para " +
        destino + ": " + codigo +
        "\n   (modo consola: configura SMTP para " +
        "envío real)\n"
    );

    return "consola";

}


/* =====================================================
   ORQUESTACIÓN
===================================================== */

/*
 * Genera y envía un código por email para registro.
 * Devuelve el email normalizado para que el llamador lo reutilice.
 */
async function solicitar(email) {

    const destino = normalizarEmail(email);

    if (!destino) {
        throw new Error("Correo electrónico inválido");
    }

    const codigo = generarCodigo();

    await almacenar(destino, codigo);

    const medio = await enviar(destino, codigo);

    return { destino, medio };

}


module.exports = {

    solicitar,
    verificar,
    normalizarEmail,
    normalizarTelefonoRD,
    esEmailValido,
    OTP_TTL_SEGUNDOS,
    OTP_MAX_INTENTOS

};
