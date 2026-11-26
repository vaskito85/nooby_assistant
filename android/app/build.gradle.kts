plugins {
    id("com.android.application")
}

android {
    namespace = "com.nooby.asistente"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.nooby.asistente"
        minSdk = 24
        targetSdk = 34
        versionCode = 3
        versionName = "0.2.2"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
