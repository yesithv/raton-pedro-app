import 'package:flutter/material.dart';

import '../../flow/wizard.dart';

const _accent = Color(0xFFE8B930);
const _accentInk = Color(0xFF2A1F04);
const _rec = Color(0xFFD8443C);

/// Barra inferior. Cambia de contenido según el paso, como el asistente de la referencia.
class StepBar extends StatelessWidget {
  final WizardStep step;
  final bool recording;
  final String effectTitle;
  final VoidCallback onStartVideo;
  final VoidCallback onPlace;
  final VoidCallback onNext;
  final VoidCallback onPrevEffect;
  final VoidCallback onNextEffect;
  final VoidCallback onRecord;
  final VoidCallback onTorch;
  final VoidCallback onPhoto;

  const StepBar({
    super.key,
    required this.step,
    required this.recording,
    required this.effectTitle,
    required this.onStartVideo,
    required this.onPlace,
    required this.onNext,
    required this.onPrevEffect,
    required this.onNextEffect,
    required this.onRecord,
    required this.onTorch,
    required this.onPhoto,
  });

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.bottomCenter,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: switch (step) {
            WizardStep.inicio => _primary('CREAR VIDEO', onStartVideo),
            WizardStep.escanear => _primary('COLOCAR AQUÍ', onPlace),
            WizardStep.superficie || WizardStep.tamano => _primary('SIGUIENTE', onNext),
            WizardStep.editar => Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        onPressed: onPrevEffect,
                        icon: const Icon(Icons.chevron_left, color: Colors.white),
                      ),
                      SizedBox(
                        width: 200,
                        child: Text(
                          effectTitle,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: onNextEffect,
                        icon: const Icon(Icons.chevron_right, color: Colors.white),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  _primary('SELECCIONAR', onNext),
                ],
              ),
            WizardStep.grabar => Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    onPressed: onTorch,
                    icon: const Icon(Icons.bolt, color: Colors.white),
                  ),
                  const SizedBox(width: 18),
                  _Shutter(recording: recording, onTap: onRecord),
                  const SizedBox(width: 18),
                  IconButton(
                    // Deshabilitado mientras se graba: capturar hace un glReadPixels que
                    // bloquea el pipeline, y en mitad de una grabación eso se traduce en
                    // frames caídos justo en el momento que el usuario quería guardar.
                    onPressed: recording ? null : onPhoto,
                    icon: const Icon(Icons.photo_camera_outlined, color: Colors.white),
                  ),
                ],
              ),
          },
        ),
      ),
    );
  }

  Widget _primary(String label, VoidCallback onTap) => FilledButton(
        onPressed: onTap,
        style: FilledButton.styleFrom(
          backgroundColor: _accent,
          foregroundColor: _accentInk,
          padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 14),
        ),
        child: Text(
          label,
          style: const TextStyle(fontWeight: FontWeight.w700, letterSpacing: 0.6),
        ),
      );
}

class _Shutter extends StatelessWidget {
  final bool recording;
  final VoidCallback onTap;

  const _Shutter({required this.recording, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 68,
        height: 68,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white24,
          border: Border.all(color: Colors.white70, width: 4),
        ),
        child: Center(
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            width: recording ? 26 : 46,
            height: recording ? 26 : 46,
            decoration: BoxDecoration(
              color: _rec,
              borderRadius: BorderRadius.circular(recording ? 5 : 23),
            ),
          ),
        ),
      ),
    );
  }
}
