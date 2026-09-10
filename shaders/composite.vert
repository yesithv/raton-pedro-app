#version 300 es

// Quad de pantalla completa. aPos en [-1,1].
in vec2 aPos;

// Ajuste "cover" del feed de camara sobre la superficie de presentacion. El sensor
// entrega 4:3 o 16:9; la pantalla del telefono es ~9:19.5. Sin esto, o el feed sale
// estirado o quedan barras.
uniform vec2 uCamUVScale;
uniform vec2 uCamUVOffset;

// Matriz de SurfaceTexture.getTransformMatrix() del feed de camara: en Android trae la
// rotacion del sensor y el volteo de la camara frontal. Es afin, asi que se aplica aqui
// y no por fragmento. En web es la identidad.
uniform mat4 uCamXform;

// Coordenada de TEXTURA de la camara. Para muestrear el feed.
out vec2 vCamUV;
// Coordenada de PANTALLA, 0..1 sobre la superficie de presentacion. Para posicionar
// el overlay. Ver nota en composite.frag: no son lo mismo.
out vec2 vScreenUV;

void main() {
    vScreenUV = aPos * 0.5 + 0.5;
    vScreenUV.y = 1.0 - vScreenUV.y;           // origen arriba-izquierda
    vec2 camUV = vScreenUV * uCamUVScale + uCamUVOffset;
    vCamUV = (uCamXform * vec4(camUV, 0.0, 1.0)).xy;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
