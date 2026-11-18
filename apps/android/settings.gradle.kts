pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "vehicle-contact-android"
include(":core")
// Dengan Android SDK (CI / mesin pengembang Android): sertakan :app dan pakai build root yang mendeklarasikan plugin Android.
// Tanpa SDK: hanya :core (JVM murni) sehingga bisa dibangun & diuji di mana saja.
val hasAndroidSdk = System.getenv("ANDROID_HOME") != null || System.getenv("ANDROID_SDK_ROOT") != null || file("local.properties").exists()
if (hasAndroidSdk) {
    rootProject.buildFileName = "build.android.gradle.kts"
    include(":app")
}
