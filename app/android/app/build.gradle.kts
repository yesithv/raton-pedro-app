import java.util.Properties

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
        applicationId = "com.ironcoding.perezar"
        // ARCore exige API 24 como minimo. La arquitectura hablaba de Android 9 (API 28);
        // conviene fijarlo con los numeros reales del mercado objetivo antes de cerrarlo,
        // ver correccion #4 de docs/plan-de-trabajo.md.
        minSdk = maxOf(flutter.minSdkVersion, 24)
        targetSdk = flutter.targetSdkVersion
        // Los dos salen del `version:` de pubspec.yaml, que es la unica fuente de
        // verdad: "0.1.0+1" da versionName 0.1.0 y versionCode 1. Google Play EXIGE que
        // el versionCode suba en cada subida y no deja reutilizar ninguno, ni siquiera de
        // una version retirada; el versionName es solo lo que lee el usuario.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // La firma de release, de dos sitios y ninguno dentro del repositorio:
    //
    //   - En local, `android/key.properties`, que esta en .gitignore junto con *.jks.
    //     Ver `key.properties.ejemplo` al lado y docs/publicar-android.md.
    //   - En CI, las mismas cuatro cosas por variables de entorno, desde los secretos.
    //
    // Y SI NO HAY NINGUNA DE LAS DOS, NO SE ROMPE NADA: se firma con la clave de
    // depuracion, como hacia la plantilla. Es lo que permite que `CI Android` siga
    // construyendo en cada PR sin tener acceso a la clave de verdad, y que cualquiera
    // pueda clonar el repositorio y compilar sin pedirle nada a nadie.
    //
    // El precio de esa comodidad es que un release SIN clave sale firmado con la de
    // depuracion y lo parece todo menos en el certificado, asi que el workflow de release
    // lo comprueba a proposito antes de dar el archivo por bueno: un .aab asi lo rechaza
    // Google Play, pero media hora mas tarde y con el navegador ya abierto.
    val propiedadesFirma = Properties().apply {
        val archivo = rootProject.file("key.properties")
        if (archivo.exists()) archivo.inputStream().use { load(it) }
    }
    fun deFirma(clave: String, variable: String): String? =
        propiedadesFirma.getProperty(clave) ?: System.getenv(variable)

    val almacen = deFirma("storeFile", "ANDROID_KEYSTORE_FILE")
    val hayClavePropia = almacen != null && file(almacen).exists()

    signingConfigs {
        if (hayClavePropia) {
            create("release") {
                storeFile = file(almacen!!)
                storePassword = deFirma("storePassword", "ANDROID_KEYSTORE_PASSWORD")
                keyAlias = deFirma("keyAlias", "ANDROID_KEY_ALIAS")
                keyPassword = deFirma("keyPassword", "ANDROID_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hayClavePropia) signingConfigs.getByName("release")
                            else signingConfigs.getByName("debug")
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
