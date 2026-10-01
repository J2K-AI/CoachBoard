package com.entrenador.pro.avisos

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray

/**
 * Recordatorios de partidos y entrenamientos.
 *
 * La pagina es la que sabe que hay en el calendario, asi que manda la
 * lista ya calculada: cuando sonar y que decir. Aqui solo se programan
 * las alarmas.
 *
 * Esa lista se guarda ademas en las preferencias porque al reiniciar
 * el telefono Android borra todas las alarmas y hay que reponerlas sin
 * abrir el WebView, que es donde viven los datos de verdad.
 *
 * Se usan alarmas con ventana y no exactas a proposito: para un aviso
 * de "manana hay partido" unos minutos no importan, y las exactas
 * obligan a pedir un permiso que Google Play reserva para despertadores
 * y calendarios.
 */
object Avisos {

    const val CANAL = "recordatorios"
    private const val PREFS = "coachboard.avisos"
    private const val CLAVE = "lista"
    private const val MAX = 40          // tope de alarmas vivas a la vez

    /** Un aviso ya resuelto por la pagina. */
    data class Aviso(
        val id: Int,
        val cuando: Long,
        val titulo: String,
        val texto: String
    )

    fun canal(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CANAL) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CANAL, "Recordatorios", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Avisos de partidos y entrenamientos"
            }
        )
    }

    /** Reemplaza todos los avisos por los de la lista (JSON de la pagina). */
    fun programar(ctx: Context, json: String) {
        val lista = parsear(json)
        cancelarTodos(ctx, leer(ctx))
        guardar(ctx, lista)
        canal(ctx)
        poner(ctx, lista)
    }

    /** Tras un reinicio: se reponen desde lo guardado. */
    fun reponer(ctx: Context) {
        canal(ctx)
        poner(ctx, leer(ctx))
    }

    private fun poner(ctx: Context, lista: List<Aviso>) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val ahora = System.currentTimeMillis()
        lista.filter { it.cuando > ahora }.take(MAX).forEach { a ->
            val pi = pending(ctx, a)
            try {
                am.setWindow(
                    AlarmManager.RTC_WAKEUP, a.cuando, 10 * 60 * 1000L, pi
                )
            } catch (e: SecurityException) {
                /* Algunos fabricantes limitan las alarmas; mejor sin
                   aviso que con la aplicacion caida. */
            }
        }
    }

    private fun cancelarTodos(ctx: Context, lista: List<Aviso>) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        lista.forEach { am.cancel(pending(ctx, it)) }
    }

    private fun pending(ctx: Context, a: Aviso): PendingIntent {
        val i = Intent(ctx, AvisoReceiver::class.java).apply {
            action = "com.entrenador.pro.AVISO"
            putExtra("titulo", a.titulo)
            putExtra("texto", a.texto)
            putExtra("id", a.id)
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        return PendingIntent.getBroadcast(ctx, a.id, i, flags)
    }

    /* --- persistencia ------------------------------------------- */

    private fun guardar(ctx: Context, lista: List<Aviso>) {
        val arr = JSONArray()
        lista.forEach { a ->
            arr.put(
                org.json.JSONObject()
                    .put("id", a.id)
                    .put("cuando", a.cuando)
                    .put("titulo", a.titulo)
                    .put("texto", a.texto)
            )
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(CLAVE, arr.toString()).apply()
    }

    private fun leer(ctx: Context): List<Aviso> =
        parsear(
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(CLAVE, "[]") ?: "[]"
        )

    private fun parsear(json: String): List<Aviso> {
        val out = ArrayList<Aviso>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                out.add(
                    Aviso(
                        id = o.optInt("id", i),
                        cuando = o.optLong("cuando", 0L),
                        titulo = o.optString("titulo", "CoachBoard"),
                        texto = o.optString("texto", "")
                    )
                )
            }
        } catch (e: Exception) {
            /* Un JSON roto no debe tumbar la aplicacion: sin avisos. */
        }
        return out
    }
}
