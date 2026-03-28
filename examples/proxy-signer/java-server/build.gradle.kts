plugins {
    java
    application
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

application {
    mainClass.set("com.coinbase.examples.proxysigner.ProxySignerServer")
}

repositories {
    mavenCentral()
    maven { url = uri("https://jitpack.io") }
    maven {
        url = uri("https://maven.pkg.github.com/coinbase/cdp-sdk")
        credentials {
            username = project.findProperty("gpr.user") as String? ?: System.getenv("GITHUB_ACTOR")
            password = project.findProperty("gpr.token") as String? ?: System.getenv("GITHUB_TOKEN")
        }
    }
}

dependencies {
    implementation("com.coinbase:cdp-sdk:0.1.0")
    implementation("io.javalin:javalin:6.7.0")
    implementation("org.slf4j:slf4j-simple:2.0.16")
}
