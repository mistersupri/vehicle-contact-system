plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
// Plugin Android (AGP, Kotlin-Android, Compose) dideklarasikan di :app agar :core bisa dibangun tanpa Google Maven/SDK.
