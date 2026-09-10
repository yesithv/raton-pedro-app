plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.ironcoding.perezar"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.ironcoding.perezar"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // ARCore exige API 24 como minimo. La arquitectura hablaba de Android 9 (API 28);
        // conviene fijarlo con los numeros reales del mercado objetivo antes de cerrarlo,
        // ver correccion #4 de docs/plan-de-trabajo.md.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // ARCore. Se declara siempre; que se USE lo decide en arranque
    // ArCoreApk.checkAvailability(), y si no esta se cae a Camera2Driver. En el manifest
    // va como "optional" y camera.ar con required=false, para que Play Store no oculte
    // la app en los dispositivos no certificados, que son parte del parque objetivo.
    implementation("com.google.ar:core:1.42.0")
}

// El shader es fuente unica de verdad: vive en shaders/ en la raiz del repo y lo comparten
// el prototipo web y el nativo. Se copia a assets en cada build, para que no exista una
// segunda copia que se quede atras sin que nadie se entere.
val copyShaders by tasks.registering(Copy::class) {
    from(rootProject.projectDir.resolve("../../shaders"))
    include("composite.vert", "composite.frag")
    into(layout.projectDirectory.dir("src/main/assets/shaders"))
}

tasks.named("preBuild") { dependsOn(copyShaders) }
