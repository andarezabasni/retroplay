package com.retroplay.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    requestRuntimePermissions()
  }

  // Android 13+ requires runtime consent for notifications (media controls)
  // and granular media access. Declaring them in the manifest is not enough.
  private fun requestRuntimePermissions() {
    val needed = mutableListOf<String>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
        != PackageManager.PERMISSION_GRANTED
      ) {
        needed.add(Manifest.permission.POST_NOTIFICATIONS)
      }
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_AUDIO)
        != PackageManager.PERMISSION_GRANTED
      ) {
        needed.add(Manifest.permission.READ_MEDIA_AUDIO)
      }
    } else {
      if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
        != PackageManager.PERMISSION_GRANTED
      ) {
        needed.add(Manifest.permission.READ_EXTERNAL_STORAGE)
      }
    }

    if (needed.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, needed.toTypedArray(), 1001)
    }
  }
}
