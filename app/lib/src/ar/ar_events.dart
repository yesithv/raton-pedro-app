/// Eventos que emite la capa nativa. Contrato de la sección 5 de la arquitectura.
///
/// La dirección importa: el reloj de reproducción se lee en nativo y se empuja aquí;
/// el transform se escribe aquí y se empuja a nativo. Nunca al revés.
sealed class ArEvent {
  const ArEvent();

  factory ArEvent.fromMap(Map<Object?, Object?> map) {
    final type = map['type'] as String?;
    double? d(String k) => (map[k] as num?)?.toDouble();
    int? i(String k) => (map[k] as num?)?.toInt();

    return switch (type) {
      'ready' => ArReady(supportsPlanes: map['supportsPlanes'] as bool? ?? false),
      'playbackTick' => ArPlaybackTick(positionMs: i('positionMs') ?? 0),
      'playbackDone' => const ArPlaybackDone(),
      'recordingDone' => ArRecordingDone.fromMap(map),
      'sceneAnalyzed' => ArSceneAnalyzed(luma: d('luma') ?? 0, noise: d('noise') ?? 0),
      'surfaceFound' => const ArSurfaceFound(),
      'thermalWarning' => ArThermalWarning(level: i('level') ?? 0),
      _ => ArError(
          code: map['code'] as String? ?? 'unknown',
          message: map['message'] as String? ?? 'Evento desconocido: $type',
        ),
    };
  }
}

class ArReady extends ArEvent {
  /// false en dispositivos sin ARCore: la colocación pasa a ser por toque.
  final bool supportsPlanes;
  const ArReady({required this.supportsPlanes});
}

class ArPlaybackTick extends ArEvent {
  final int positionMs;
  const ArPlaybackTick({required this.positionMs});
}

class ArPlaybackDone extends ArEvent {
  const ArPlaybackDone();
}

class ArRecordingDone extends ArEvent {
  final String path;

  /// `content://` del archivo ya en la galería del sistema. null si el guardado falló.
  final String? uri;

  final int sizeBytes;
  final int durationMs;

  /// Métricas de salida del spike (sección 1 de la arquitectura).
  ///
  /// Van a la UI a propósito, no solo al log: al probar en tres dispositivos de gama
  /// baja hace falta poder anotarlas sin conectar un depurador.
  final int framesSubmitted;
  final int framesDropped;
  final int exportMs;

  const ArRecordingDone({
    required this.path,
    required this.uri,
    required this.sizeBytes,
    required this.durationMs,
    required this.framesSubmitted,
    required this.framesDropped,
    required this.exportMs,
  });

  factory ArRecordingDone.fromMap(Map<Object?, Object?> map) {
    int i(String k) => (map[k] as num?)?.toInt() ?? 0;
    return ArRecordingDone(
      path: map['path'] as String? ?? '',
      uri: map['uri'] as String?,
      sizeBytes: i('sizeBytes'),
      durationMs: i('durationMs'),
      framesSubmitted: i('framesSubmitted'),
      framesDropped: i('framesDropped'),
      exportMs: i('exportMs'),
    );
  }

  bool get savedToGallery => uri != null;

  /// Porcentaje de frames perdidos. Es la métrica que decide si la gama baja aguanta.
  double get dropRate =>
      framesSubmitted + framesDropped == 0
          ? 0
          : framesDropped / (framesSubmitted + framesDropped);
}

/// Resultado de una captura de foto.
class PhotoResult {
  final String path;
  final String? uri;
  final int sizeBytes;
  const PhotoResult({required this.path, required this.uri, required this.sizeBytes});

  bool get savedToGallery => uri != null;
}

class ArSceneAnalyzed extends ArEvent {
  final double luma;
  final double noise;
  const ArSceneAnalyzed({required this.luma, required this.noise});
}

class ArSurfaceFound extends ArEvent {
  const ArSurfaceFound();
}

class ArThermalWarning extends ArEvent {
  final int level;
  const ArThermalWarning({required this.level});
}

class ArError extends ArEvent {
  final String code;
  final String message;
  const ArError({required this.code, required this.message});
}
