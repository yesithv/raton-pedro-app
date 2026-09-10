import 'package:flutter/material.dart';

import '../../ar/ar_events.dart';

const _accent = Color(0xFFE8B930);
const _accentInk = Color(0xFF2A1F04);

/// Resultado de una grabación.
///
/// No embebe un reproductor a propósito: el video ya está en la galería del teléfono,
/// que sabe reproducirlo, compartirlo y borrarlo mejor que nada que se pueda meter aquí.
/// Añadir ExoPlayer al APK para hacer peor lo que el sistema hace bien no sale a cuenta.
class RecordingSheet extends StatelessWidget {
  final ArRecordingDone result;

  /// Métricas de rendimiento visibles. Se activan solas si algo va mal, porque al
  /// probar en gama baja hay que poder anotarlas sin conectar un depurador.
  final bool showMetrics;

  final VoidCallback onShare;
  final VoidCallback onOpen;
  final VoidCallback onClose;

  const RecordingSheet({
    super.key,
    required this.result,
    required this.onShare,
    required this.onOpen,
    required this.onClose,
    this.showMetrics = false,
  });

  /// Por debajo de 30 fps sostenidos el efecto pierde el timing con el que se animó.
  bool get _performanceWorthShowing => result.dropRate > 0.02 || result.exportMs > 2000;

  @override
  Widget build(BuildContext context) {
    final seconds = (result.durationMs / 1000).toStringAsFixed(1);
    final megabytes = (result.sizeBytes / 1e6).toStringAsFixed(1);

    return Container(
      color: const Color(0xFF0B0D10),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                result.savedToGallery ? Icons.check_circle_outline : Icons.warning_amber_outlined,
                size: 56,
                color: result.savedToGallery ? _accent : Colors.orange,
              ),
              const SizedBox(height: 18),
              Text(
                result.savedToGallery ? 'Guardado en tu galería' : 'Grabado, pero sin guardar',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                result.savedToGallery
                    ? '$seconds s · $megabytes MB'
                    : 'No pude escribir en la galería. El archivo está en '
                        'el almacenamiento de la app.',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF9AA3AD), fontSize: 13),
              ),

              if (showMetrics || _performanceWorthShowing) ...[
                const SizedBox(height: 20),
                _Metrics(result: result),
              ],

              const SizedBox(height: 28),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                alignment: WrapAlignment.center,
                children: [
                  OutlinedButton(onPressed: onClose, child: const Text('Seguir grabando')),
                  if (result.savedToGallery)
                    OutlinedButton(onPressed: onOpen, child: const Text('Ver')),
                  if (result.savedToGallery)
                    FilledButton(
                      onPressed: onShare,
                      style: FilledButton.styleFrom(
                        backgroundColor: _accent,
                        foregroundColor: _accentInk,
                      ),
                      child: const Text('COMPARTIR',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Metrics extends StatelessWidget {
  final ArRecordingDone result;
  const _Metrics({required this.result});

  @override
  Widget build(BuildContext context) {
    final drop = (result.dropRate * 100).toStringAsFixed(1);
    final rows = <(String, String, bool)>[
      ('frames', '${result.framesSubmitted}', false),
      ('caídos', '${result.framesDropped}  ($drop %)', result.dropRate > 0.02),
      ('export', '${result.exportMs} ms', result.exportMs > 2000),
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      decoration: BoxDecoration(
        color: const Color(0xE60E1115),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final (label, value, bad) in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 80,
                    child: Text(label,
                        style: const TextStyle(color: Color(0xFF9AA3AD), fontSize: 12)),
                  ),
                  Text(
                    value,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: bad ? Colors.orange : Colors.white,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
