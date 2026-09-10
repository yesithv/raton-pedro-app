import 'dart:ui' show Size;

/// Definición del asistente. Puerto de web/js/flow.js. El flujo sigue el de la app de
/// referencia (docs/plan-de-trabajo.md, hallazgo 5); los textos son propios.
enum WizardStep { inicio, escanear, superficie, tamano, editar, grabar, selfie }

/// Qué gesto está activo en cada paso. En la referencia el ajuste está acotado por paso:
/// no se puede mover y escalar a la vez, y a partir de EDITAR el transform queda fijo.
///
/// `moveAndScale` es la excepción: la usa el paso SELFIE, que no tiene asistente propio y
/// deja mover y escalar al ratón en el mismo gesto.
enum StepGesture { none, move, moveY, scale, moveAndScale }

class StepSpec {
  final String title;
  final String hint;

  /// Texto alternativo cuando el dispositivo no tiene ARCore y no hay nada que escanear.
  final String? hintNoPlanes;

  final bool overlayVisible;
  final bool reticle;
  final bool loop;
  final StepGesture gesture;
  final WizardStep? back;

  const StepSpec({
    required this.title,
    required this.hint,
    this.hintNoPlanes,
    required this.overlayVisible,
    required this.reticle,
    required this.loop,
    required this.gesture,
    this.back,
  });
}

const Map<WizardStep, StepSpec> kSteps = {
  WizardStep.inicio: StepSpec(
    title: '',
    hint: '',
    overlayVisible: false,
    reticle: false,
    loop: false,
    gesture: StepGesture.none,
  ),
  WizardStep.escanear: StepSpec(
    title: 'ESCANEAR',
    hint: 'Apunta al suelo o a la cama y mueve el teléfono despacio.\n'
        'Cuando el círculo se quede quieto, tócalo para dejar ahí al ratón.',
    hintNoPlanes: 'Este teléfono no detecta superficies.\n'
        'Arrastra el círculo hasta donde quieras que aparezca el ratón.',
    overlayVisible: false,
    reticle: true,
    loop: false,
    gesture: StepGesture.move,
    back: WizardStep.inicio,
  ),
  WizardStep.superficie: StepSpec(
    title: 'POSICIÓN',
    hint: 'Ya tengo la superficie. Arrastra hacia arriba o hacia abajo para acercar o '
        'alejar al ratón.',
    overlayVisible: true,
    reticle: false,
    loop: true,
    gesture: StepGesture.moveY,
    back: WizardStep.escanear,
  ),
  WizardStep.tamano: StepSpec(
    title: 'TAMAÑO',
    hint: 'Pellizca para ajustar el tamaño. Cuanto más pequeño, más creíble.',
    overlayVisible: true,
    reticle: false,
    loop: true,
    gesture: StepGesture.scale,
    back: WizardStep.superficie,
  ),
  WizardStep.editar: StepSpec(
    title: 'EDITAR',
    hint: 'Elige qué hace el ratón.',
    overlayVisible: true,
    reticle: false,
    loop: true,
    gesture: StepGesture.none,
    back: WizardStep.tamano,
  ),
  WizardStep.grabar: StepSpec(
    title: 'GRABAR',
    hint: 'Pulsa el botón rojo. Se detiene solo al acabar la animación.\n'
        'Puedes hablar mientras grabas: tu voz entra en el video.',
    overlayVisible: true,
    reticle: false,
    loop: true,
    gesture: StepGesture.none,
    back: WizardStep.editar,
  ),
  WizardStep.selfie: StepSpec(
    title: 'SELFIE',
    hint: 'Arrastra al ratón y pellizca para el tamaño.\n'
        'Toca la cámara para la foto.',
    overlayVisible: true,
    reticle: false,
    loop: true,
    gesture: StepGesture.moveAndScale,
    // A SELFIE se entra desde INICIO y se sale a INICIO: sin este enlace la cadena de
    // "atrás" muere aquí y la flecha ni siquiera se dibuja, porque _Chrome la condiciona
    // a que back exista. Quien la pulse pasa por _toggleCamera, que además devuelve la
    // cámara trasera; volver a INICIO con la frontal puesta dejaría el asistente AR
    // apuntando a la cara.
    back: WizardStep.inicio,
  ),
};

/// Estado del transform, autoritativo en Dart. Se empuja a nativo, nunca al revés.
class PlacementState {
  double x = 0.5;
  double y = 0.72;

  /// Alto del overlay como fracción del alto de pantalla.
  double scaleFactor = 0.35;

  /// true cuando hay un ancla real de ARCore: entonces manda el mundo y estos valores
  /// solo sirven de respaldo.
  bool anchored = false;

  double scaleXFor(double aspectRatio, Size screen) =>
      scaleFactor * screen.height * aspectRatio / screen.width;
}
