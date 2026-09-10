import 'package:flutter/services.dart';

import '../catalog/effect.dart';
import 'ar_events.dart';

/// Envoltorio de los canales con nativo.
///
/// Autoritativo en Dart: transform, efecto seleccionado, catálogo, galería.
/// Autoritativo en nativo: sesión de cámara, contexto GL, decoder, encoder.
class ArController {
  static const _control = MethodChannel('ironcoding/perezar/control');
  static const _events = EventChannel('ironcoding/perezar/events');

  int? textureId;
  bool supportsPlanes = false;

  Stream<ArEvent>? _stream;

  Stream<ArEvent> get events => _stream ??= _events
      .receiveBroadcastStream()
      .map((e) => ArEvent.fromMap(e as Map<Object?, Object?>));

  Future<void> initialize({required int width, required int height}) async {
    final result = await _control.invokeMapMethod<String, Object?>(
      'initialize',
      {'width': width, 'height': height},
    );
    textureId = result?['textureId'] as int?;
    supportsPlanes = result?['supportsPlanes'] as bool? ?? false;
  }

  Future<void> loadEffect(Effect effect) => _control.invokeMethod('loadEffect', {
        'assetPath': effect.assetPath,
        'metadata': effect.rawMetadata,
      });

  /// Se llama en cada frame del gesto de arrastre.
  ///
  /// Un MethodChannel aguanta esa frecuencia, pero NO hay que esperar el retorno:
  /// se dispara y se sigue. Por eso devuelve void y no Future.
  void setTransform({
    required double x,
    required double y,
    required double scaleX,
    required double scaleY,
  }) {
    _control.invokeMethod<void>('setTransform', {
      'x': x,
      'y': y,
      'scaleX': scaleX,
      'scaleY': scaleY,
    });
  }

  Future<void> setOverlayVisible(bool visible) =>
      _control.invokeMethod('setOverlayVisible', visible);

  /// Intenta anclar en ese punto. false si no hay superficie, o si no hay ARCore.
  Future<bool> placeAt(double x, double y) async =>
      await _control.invokeMethod<bool>('placeAt', {'x': x, 'y': y}) ?? false;

  Future<void> play({bool loop = false}) =>
      _control.invokeMethod('play', {'loop': loop});

  Future<void> pause() => _control.invokeMethod('pause');

  Future<void> startRecording(String outputPath, {bool audio = true}) =>
      _control.invokeMethod('startRecording', {
        'outputPath': outputPath,
        'audio': audio,
      });

  Future<ArRecordingDone> stopRecording() async {
    final r = await _control.invokeMapMethod<String, Object?>('stopRecording');
    return ArRecordingDone(
      path: r?['path'] as String? ?? '',
      sizeBytes: (r?['sizeBytes'] as num?)?.toInt() ?? 0,
    );
  }

  Future<bool> setTorch(bool on) async =>
      await _control.invokeMethod<bool>('setTorch', on) ?? false;

  /// Empuja la receta de grading. Los valores salen de docs/receta-grading.md.
  Future<void> setGrading({
    double? key,
    double? whiteBalance,
    double? exposureMin,
    double? exposureMax,
    double? softness,
  }) =>
      _control.invokeMethod('setGrading', {
        if (key != null) 'key': key,
        if (whiteBalance != null) 'whiteBalance': whiteBalance,
        if (exposureMin != null) 'exposureMin': exposureMin,
        if (exposureMax != null) 'exposureMax': exposureMax,
        if (softness != null) 'softness': softness,
      });

  Future<void> dispose() => _control.invokeMethod('dispose');
}
