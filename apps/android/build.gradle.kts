plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
// Root build tanpa Android SDK (hanya :core). Dengan SDK, lihat build.android.gradle.kts (dipilih oleh settings.gradle.kts).
