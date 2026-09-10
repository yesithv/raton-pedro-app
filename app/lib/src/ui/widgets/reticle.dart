import 'package:flutter/material.dart';

/// Retículo de colocación del paso ESCANEAR.
///
/// La elipse achatada sugiere el plano del suelo visto en perspectiva, igual que el
/// indicador de la app de referencia.
class Reticle extends StatelessWidget {
  final double x;
  final double y;
  final VoidCallback onTap;

  const Reticle({super.key, required this.x, required this.y, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    return Positioned(
      left: x * size.width - 66,
      top: y * size.height - 26,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 132,
          height: 52,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            border: Border.all(color: const Color(0xFFE8B930), width: 3),
            borderRadius: BorderRadius.circular(26),
            boxShadow: const [
              BoxShadow(color: Color(0x59E8B930), blurRadius: 22),
            ],
          ),
          child: const Icon(Icons.arrow_upward, color: Color(0xFFE8B930), size: 26),
        ),
      ),
    );
  }
}
