# ProGuard rules for Room
-keep class androidx.room.** { *; }

# ProGuard rules for Hilt
-keep class dagger.** { *; }
-keep class javax.inject.** { *; }
-keepclassmembers class * {@dagger.*;}

# ProGuard rules for Kotlin
-dontwarn kotlin.Metadata
-keep class kotlin.Metadata { *; }
-keep class kotlin.** { *; }
