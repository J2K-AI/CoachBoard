package com.entrenador.pro.avisos

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.entrenador.pro.MainActivity
import com.entrenador.pro.R

/** Suelta la notificacion cuando salta la alarma. */
class AvisoReceiver : BroadcastReceiver() {

    override fun onReceive(ctx: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) return

        Avisos.canal(ctx)

        val titulo = intent.getStringExtra("titulo") ?: "CoachBoard"
        val texto = intent.getStringExtra("texto") ?: ""
        val id = intent.getIntExtra("id", 1)

        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags = flags or PendingIntent.FLAG_IMMUTABLE
        }
        val abrir = PendingIntent.getActivity(
            ctx, id, Intent(ctx, MainActivity::class.java), flags
        )

        val n = NotificationCompat.Builder(ctx, Avisos.CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(abrir)
            .build()

        try {
            NotificationManagerCompat.from(ctx).notify(id, n)
        } catch (e: SecurityException) {
            /* El permiso puede haberse retirado entre medias. */
        }
    }
}
