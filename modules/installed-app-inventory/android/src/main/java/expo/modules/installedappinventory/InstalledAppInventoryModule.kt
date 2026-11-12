package expo.modules.installedappinventory

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.util.Base64
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InstalledAppInventoryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NestguardInstalledAppInventory")

    AsyncFunction("getLaunchableApps") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val packageManager = context.packageManager
      val launcherIntent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)

      packageManager.queryIntentActivities(launcherIntent, 0)
        .asSequence()
        .mapNotNull { result ->
          val activityInfo = result.activityInfo ?: return@mapNotNull null
          val packageName = activityInfo.packageName
          if (packageName == context.packageName) return@mapNotNull null

          val appName = result.loadLabel(packageManager).toString().trim().take(80)
          if (appName.isEmpty()) return@mapNotNull null
          val icon = result.loadIcon(packageManager)
          mapOf(
            "packageName" to packageName,
            "appName" to appName,
            "iconBase64" to encodeIcon(icon),
          )
        }
        .distinctBy { it["packageName"] }
        .sortedBy { it["appName"]?.lowercase() }
        .take(200)
        .toList()
    }
  }

  private fun encodeIcon(drawable: Drawable): String {
    val bitmap = Bitmap.createBitmap(48, 48, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    drawable.setBounds(0, 0, canvas.width, canvas.height)
    drawable.draw(canvas)

    return try {
      val output = java.io.ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)
      Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
    } finally {
      bitmap.recycle()
    }
  }
}
