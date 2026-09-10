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
      'recordingDone' => ArRecordingDone(
          path: map['path'] as String? ?? '',
          sizeBytes: i('sizeBytes') ?? 0,
        ),
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
  final int sizeBytes;
  const ArRecordingDone({required this.path, required this.sizeBytes});
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
