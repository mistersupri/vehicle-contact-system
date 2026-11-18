// Root build bila Android SDK tersedia. Semua plugin dideklarasikan di sini (berversi, apply false);
// submodul memakainya TANPA versi agar berbagi satu classpath.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
