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
        versionCode = 5
        versionName = "0.3.2"
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

dependencies {
    // Reconocimiento de voz offline (Apache-2.0). El modelo en español va en assets/model-es (lo baja el CI).
    implementation("com.alphacephei:vosk-android:0.3.47")
    implementation("net.java.dev.jna:jna:5.13.0@aar")
}
