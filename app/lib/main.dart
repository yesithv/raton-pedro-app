import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'src/ui/camera_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const PerezArApp());
}

class PerezArApp extends StatelessWidget {
  const PerezArApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Ratón Pérez AR',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        scaffoldBackgroundColor: const Color(0xFF0B0D10),
      ),
      home: const CameraScreen(),
    );
  }
}
