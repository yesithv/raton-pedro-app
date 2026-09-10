import 'package:flutter_test/flutter_test.dart';
import 'package:perezar/src/ar/ar_events.dart';
import 'package:perezar/src/catalog/effect.dart';
import 'package:perezar/src/flow/wizard.dart';

void main() {
  group('asistente', () {
    test('todos los pasos están definidos', () {
      for (final step in WizardStep.values) {
        expect(kSteps[step], isNotNull, reason: 'falta la spec de $step');
      }
    });

    test('la cadena de "atrás" llega siempre a inicio sin ciclos', () {
      for (final step in WizardStep.values) {
        var current = step;
        var hops = 0;
        while (kSteps[current]!.back != null) {
          current = kSteps[current]!.back!;
          expect(++hops, lessThan(WizardStep.values.length),
              reason: 'ciclo en la cadena de atrás desde $step');
        }
        expect(current, WizardStep.inicio);
      }
    });

    test('los pasos que muestran al personaje reproducen en bucle', () {
      // Mostrar un "frame de pose" exigiría poder buscar en el video, y hay servidores
      // que no responden a HTTP Range. El bucle elimina esa dependencia.
      for (final entry in kSteps.entries) {
        if (entry.value.overlayVisible) {
          expect(entry.value.loop, isTrue, reason: '${entry.key} muestra overlay sin bucle');
        }
      }
    });

    test('el transform queda bloqueado a partir de EDITAR', () {
      expect(kSteps[WizardStep.editar]!.gesture, StepGesture.none);
      expect(kSteps[WizardStep.grabar]!.gesture, StepGesture.none);
    });

    test('ESCANEAR tiene texto alternativo para dispositivos sin ARCore', () {
      expect(kSteps[WizardStep.escanear]!.hintNoPlanes, isNotNull);
    });
  });

  group('Effect', () {
    const raw = '''
    {
      "id": "portal_v1", "durationMs": 5000, "fps": 30, "frameCount": 150,
      "packedSize": [1440, 1280], "trackSize": [720, 1280],
      "anchorPoint": [0.5, 0.9102], "defaultScaleFactor": 0.35,
      "referenceLuma": 0.3108, "referenceColor": [0.3288, 0.3075, 0.2918],
      "hasAudio": false, "limitedRange": false
    }''';

    test('parsea la metadata de build_effect.py', () {
      final e = Effect.fromJson(raw, 'assets/effects/portal_v1.mp4', 'Título');
      expect(e.id, 'portal_v1');
      expect(e.anchorPoint, [0.5, 0.9102]);
      expect(e.referenceColor.length, 3);
      expect(e.trackSize, [720, 1280]);
      expect(e.aspectRatio, closeTo(720 / 1280, 1e-9));
    });

    test('usa valores por defecto seguros si falta un campo', () {
      final e = Effect.fromJson('{}', 'x.mp4', 'Sin título');
      expect(e.anchorPoint, [0.5, 0.86]);
      expect(e.referenceColor, [0.5, 0.5, 0.5]);
      expect(e.title, 'Sin título');
    });

    test('conserva el JSON crudo para pasarlo a nativo sin reparsear', () {
      final e = Effect.fromJson(raw, 'x.mp4', 't');
      expect(e.rawMetadata, raw);
    });
  });

  group('ArEvent', () {
    test('mapea cada tipo que emite nativo', () {
      expect(ArEvent.fromMap({'type': 'ready', 'supportsPlanes': true}),
          isA<ArReady>().having((e) => e.supportsPlanes, 'supportsPlanes', isTrue));
      expect(ArEvent.fromMap({'type': 'playbackTick', 'positionMs': 1200}),
          isA<ArPlaybackTick>().having((e) => e.positionMs, 'positionMs', 1200));
      expect(ArEvent.fromMap({'type': 'playbackDone'}), isA<ArPlaybackDone>());
      expect(ArEvent.fromMap({'type': 'recordingDone', 'path': '/a.mp4', 'sizeBytes': 42}),
          isA<ArRecordingDone>().having((e) => e.path, 'path', '/a.mp4'));
    });

    test('un tipo desconocido se convierte en error, no revienta', () {
      expect(ArEvent.fromMap({'type': 'algo_nuevo'}), isA<ArError>());
    });
  });
}
