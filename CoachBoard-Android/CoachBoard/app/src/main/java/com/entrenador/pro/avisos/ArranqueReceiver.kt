package com.entrenador.pro.avisos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Al reiniciar el telefono Android borra todas las alarmas. Aqui se
 * reponen desde lo que quedo guardado, sin tener que abrir la
 * aplicacion.
 */
class ArranqueReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val a = intent.action ?: return
        if (a == Intent.ACTION_BOOT_COMPLETED ||
            a == Intent.ACTION_MY_PACKAGE_REPLACED ||
            a == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Avisos.reponer(ctx)
        }
    }
}
