import 'dart:convert';

import 'package:flutter/services.dart';

/// Metadata de un efecto, tal como la produce tools/build_effect.py.
class Effect {
  final String id;
  final String title;
  final String assetPath;
  final int durationMs;
  final int frameCount;
  final List<int> packedSize;
  final List<int> trackSize;

  /// Punto de contacto del personaje con la superficie, normalizado.
  ///
  /// Es crítico: el overlay se posiciona por ESTE punto, no por el centro del frame.
  /// Si no, al tocar la cama el ratón queda flotando con el frame centrado en el dedo.
  final List<double> anchorPoint;

  final double defaultScaleFactor;

  /// Color medio del personaje sin premultiplicar, calculado en build time.
  ///
  /// Estimarlo por frame en el dispositivo hace que los frames donde solo se ve el
  /// portal —emisivo y muy brillante— disparen el estimador de exposición.
  final List<double> referenceColor;

  final bool limitedRange;

  /// El JSON crudo, que se pasa tal cual a nativo para no duplicar el parseo.
  final String rawMetadata;

  Effect({
    required this.id,
    required this.title,
    required this.assetPath,
    required this.durationMs,
    required this.frameCount,
    required this.packedSize,
    required this.trackSize,
    required this.anchorPoint,
    required this.defaultScaleFactor,
    required this.referenceColor,
    required this.limitedRange,
    required this.rawMetadata,
  });

  double get aspectRatio => trackSize[0] / trackSize[1];

  factory Effect.fromJson(String raw, String assetPath, String fallbackTitle) {
    final m = jsonDecode(raw) as Map<String, dynamic>;
    List<T> list<T extends num>(String key, List<T> fallback) =>
        (m[key] as List?)?.cast<T>() ?? fallback;

    return Effect(
      id: m['id'] as String? ?? 'sin_id',
      title: m['title'] as String? ?? fallbackTitle,
      assetPath: assetPath,
      durationMs: (m['durationMs'] as num?)?.toInt() ?? 5000,
      frameCount: (m['frameCount'] as num?)?.toInt() ?? 150,
      packedSize: list<int>('packedSize', [1440, 1280]),
      trackSize: list<int>('trackSize', [720, 1280]),
      anchorPoint: list<double>('anchorPoint', [0.5, 0.86]),
      defaultScaleFactor: (m['defaultScaleFactor'] as num?)?.toDouble() ?? 0.35,
      referenceColor: list<double>('referenceColor', [0.5, 0.5, 0.5]),
      limitedRange: m['limitedRange'] as bool? ?? false,
      rawMetadata: raw,
    );
  }
}

/// Carga el catálogo del bundle.
///
/// Con tres efectos caben de sobra; la descarga bajo demanda solo hace falta cuando el
/// catálogo crezca lo bastante para que el APK se haga incómodo.
class EffectCatalog {
  static Future<List<Effect>> load() async {
    final raw = await rootBundle.loadString('assets/effects/catalog.json');
    final entries = (jsonDecode(raw) as Map<String, dynamic>)['effects'] as List;

    return Future.wait(entries.map((e) async {
      final entry = e as Map<String, dynamic>;
      final base = entry['base'] as String;
      final meta = await rootBundle.loadString('assets/effects/$base.json');
      return Effect.fromJson(meta, 'assets/effects/$base.mp4',
          entry['title'] as String? ?? base);
    }));
  }
}
