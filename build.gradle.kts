plugins { 
    id("com.android.application") version "8.0.0" 
    id("kotlin-android") version "1.9.0" 
}

android {
    compileSdk = 33

    defaultConfig {
        applicationId = "com.example.tvpsalon"
        minSdk = 21
        targetSdk = 33
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
}
