import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';

import '../ar/ar_controller.dart';
import '../ar/ar_events.dart';
import '../catalog/effect.dart';
import '../flow/wizard.dart';
import 'widgets/reticle.dart';
import 'widgets/step_bar.dart';

class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key});

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> with WidgetsBindingObserver {
  final _ar = ArController();
  final _placement = PlacementState();

  List<Effect> _catalog = const [];
  int _effectIndex = 0;
  WizardStep _step = WizardStep.inicio;

  bool _ready = false;
  bool _recording = false;
  String? _error;
  StreamSubscription<ArEvent>? _subscription;

  double _pinchStartScale = 0.35;

  StepSpec get _spec => kSteps[_step]!;
  Effect? get _effect => _catalog.isEmpty ? null : _catalog[_effectIndex];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _boot();
  }

  Future<void> _boot() async {
    try {
      _catalog = await EffectCatalog.load();
      final size = WidgetsBinding.instance.platformDispatcher.views.first.physicalSize;
      await _ar.initialize(width: size.width.toInt(), height: size.height.toInt());
      _subscription = _ar.events.listen(_onEvent);
      if (_effect != null) await _ar.loadEffect(_effect!);
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _onEvent(ArEvent event) {
    switch (event) {
      case ArRecordingDone(:final path):
        // Puede llegar sin que lo hayamos pedido: nativo cierra el muxer si la app pasa
        // a segundo plano durante una grabación, para no dejar un mp4 sin moov.
        setState(() => _recording = false);
        _showResult(path);
      case ArError(:final message):
        setState(() => _error = message);
      default:
        break;
    }
  }

  /// onPause durante una grabación es el caso feo del ciclo de vida: hay que cerrar el
  /// muxer limpiamente. Nativo lo hace y emite ArRecordingDone; aquí solo se refleja.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused && _recording) {
      _ar.stopRecording().then((r) {
        if (mounted) setState(() => _recording = false);
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _subscription?.cancel();
    _ar.dispose();
    super.dispose();
  }

  // --- Navegación del asistente ------------------------------------------------

  Future<void> _goTo(WizardStep step) async {
    setState(() => _step = step);
    final spec = kSteps[step]!;
    await _ar.setOverlayVisible(spec.overlayVisible);
    if (spec.loop) {
      await _ar.play(loop: true);
    } else {
      await _ar.pause();
    }
  }

  Future<void> _place() async {
    // Con ARCore el ancla la crea nativo; sin él, se queda el transform de Dart.
    _placement.anchored = await _ar.placeAt(_placement.x, _placement.y);
    await _goTo(WizardStep.superficie);
  }

  Future<void> _cycleEffect(int delta) async {
    if (_catalog.isEmpty) return;
    setState(() {
      _effectIndex = (_effectIndex + delta + _catalog.length) % _catalog.length;
    });
    await _ar.loadEffect(_effect!);
    await _ar.play(loop: true);
  }

  // --- Grabación ----------------------------------------------------------------

  Future<void> _toggleRecording() async {
    if (_recording) {
      final result = await _ar.stopRecording();
      setState(() => _recording = false);
      _showResult(result.path);
      return;
    }
    final dir = await getTemporaryDirectory();
    final path = '${dir.path}/perezar_${DateTime.now().millisecondsSinceEpoch}.mp4';
    await _ar.startRecording(path, audio: true);
    setState(() => _recording = true);
  }

  void _showResult(String path) {
    if (!mounted || path.isEmpty || !File(path).existsSync()) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Video guardado: ${path.split('/').last}')),
    );
  }

  // --- Gestos --------------------------------------------------------------------

  void _pushTransform(Size screen) {
    final effect = _effect;
    if (effect == null) return;
    _ar.setTransform(
      x: _placement.x,
      y: _placement.y,
      scaleX: _placement.scaleFactor *
          screen.height * effect.aspectRatio / screen.width,
      scaleY: _placement.scaleFactor,
    );
  }

  void _onScaleStart(ScaleStartDetails d) => _pinchStartScale = _placement.scaleFactor;

  void _onScaleUpdate(ScaleUpdateDetails d, Size screen) {
    switch (_spec.gesture) {
      case StepGesture.move:
        _placement.x = (d.localFocalPoint.dx / screen.width).clamp(0.0, 1.0);
        _placement.y = (d.localFocalPoint.dy / screen.height).clamp(0.0, 1.0);
      case StepGesture.moveY:
        _placement.y = (d.localFocalPoint.dy / screen.height).clamp(0.0, 1.0);
      case StepGesture.scale:
        _placement.scaleFactor = (_pinchStartScale * d.scale).clamp(0.06, 0.9);
      case StepGesture.none:
        return;
    }
    setState(() {});
    _pushTransform(screen);
  }

  // --- Render --------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    if (_error != null) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(_error!, style: const TextStyle(color: Colors.white70)),
          ),
        ),
      );
    }
    if (!_ready || _ar.textureId == null) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final screen = Size(constraints.maxWidth, constraints.maxHeight);
          return GestureDetector(
            onScaleStart: _onScaleStart,
            onScaleUpdate: (d) => _onScaleUpdate(d, screen),
            child: Stack(
              fit: StackFit.expand,
              children: [
                Texture(textureId: _ar.textureId!),
                if (_spec.reticle)
                  Reticle(x: _placement.x, y: _placement.y, onTap: _place),
                _Chrome(
                  title: _spec.title,
                  hint: _recording
                      ? null
                      : (_ar.supportsPlanes ? _spec.hint : (_spec.hintNoPlanes ?? _spec.hint)),
                  showBack: _spec.back != null,
                  onHome: () => _goTo(WizardStep.inicio),
                  onBack: () => _goTo(_spec.back ?? WizardStep.inicio),
                ),
                StepBar(
                  step: _step,
                  recording: _recording,
                  effectTitle: _effect?.title ?? '',
                  onStartVideo: () => _goTo(WizardStep.escanear),
                  onPlace: _place,
                  onNext: () => _goTo(switch (_step) {
                    WizardStep.superficie => WizardStep.tamano,
                    WizardStep.tamano => WizardStep.editar,
                    _ => WizardStep.grabar,
                  }),
                  onPrevEffect: () => _cycleEffect(-1),
                  onNextEffect: () => _cycleEffect(1),
                  onRecord: _toggleRecording,
                  onTorch: () => _ar.setTorch(true),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Chrome extends StatelessWidget {
  final String title;
  final String? hint;
  final bool showBack;
  final VoidCallback onHome;
  final VoidCallback onBack;

  const _Chrome({
    required this.title,
    required this.hint,
    required this.showBack,
    required this.onHome,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    if (title.isEmpty) return const SizedBox.shrink();
    return SafeArea(
      child: Column(
        children: [
          Row(
            children: [
              IconButton(onPressed: onHome, icon: const Icon(Icons.home_outlined)),
              Expanded(
                child: Text(
                  title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2.2,
                  ),
                ),
              ),
              if (showBack)
                IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back))
              else
                const SizedBox(width: 48),
            ],
          ),
          if (hint != null && hint!.isNotEmpty)
            Container(
              margin: const EdgeInsets.symmetric(horizontal: 14),
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 11),
              decoration: BoxDecoration(
                color: const Color(0xE60E1115),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                hint!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}
