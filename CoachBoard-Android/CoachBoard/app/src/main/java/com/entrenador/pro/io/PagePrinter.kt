package com.entrenador.pro.io

import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebView

/**
 * Envía la página al gestor de impresión de Android, que es quien
 * ofrece "Guardar como PDF". Así el acta y la ficha del jugador salen
 * en A4 sin depender de ninguna biblioteca externa.
 */
object PagePrinter {

    fun print(ctx: Context, web: WebView, jobName: String) {
        val manager = ctx.getSystemService(Context.PRINT_SERVICE) as PrintManager
        val adapter = web.createPrintDocumentAdapter(jobName)
        val attrs = PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
            .build()
        manager.print(jobName, adapter, attrs)
    }

    /** Deja el nombre del trabajo de impresión en algo legible. */
    fun limpiarNombre(titulo: String): String {
        val limpio = titulo.replace(Regex("[^\\w\\sáéíóúÁÉÍÓÚñÑ-]"), "").trim()
        return if (limpio.isEmpty()) "CoachBoard" else limpio
    }
}
