// GENERADO. No se edita a mano: se regenera.
//
//     python3 tools/shader_a_msl.py
//
// La fuente es shaders/composite.frag, que es la misma que usan el nativo de Android y el
// prototipo web. Si editas este archivo, el siguiente que regenere se lleva tu cambio por
// delante, y el CI falla antes por haberse separado del original.
//
// Por qué existe y qué transformaciones lleva: tools/shader_a_msl.py.

#include <metal_stdlib>
#include <simd/simd.h>

using namespace metal;

struct main0_out
{
    float4 fragColor [[color(0)]];
};

struct main0_in
{
    float2 vCamUV [[user(locn0)]];
    float2 vScreenUV [[user(locn1)]];
};

fragment main0_out main0(main0_in in [[stage_in]], constant bool& uLimitedRange [[buffer(6)]], constant float4x4& uOverlayXform [[buffer(0)]], constant float2& uOverlayOrigin [[buffer(1)]], constant float2& uGyroOffset [[buffer(2)]], constant float2& uOverlayScale [[buffer(3)]], constant float2& uOverlayTexel [[buffer(4)]], constant float& uSoftness [[buffer(5)]], constant float3& uExposureMatch [[buffer(7)]], constant float& uTime [[buffer(8)]], constant float& uGrainAmount [[buffer(9)]], texture2d<float> uOverlay [[texture(0)]], texture2d<float> uCamera [[texture(1)]], sampler uOverlaySmplr [[sampler(0)]], sampler uCameraSmplr [[sampler(1)]])
{
    main0_out out = {};
    float3 cam = uCamera.sample(uCameraSmplr, in.vCamUV).xyz;
    float2 ouv = ((in.vScreenUV - uOverlayOrigin) + uGyroOffset) / uOverlayScale;
    bool _97 = ouv.x < 0.0;
    bool _104;
    if (!_97)
    {
        _104 = ouv.x > 1.0;
    }
    else
    {
        _104 = _97;
    }
    bool _111;
    if (!_104)
    {
        _111 = ouv.y < 0.0;
    }
    else
    {
        _111 = _104;
    }
    bool _118;
    if (!_111)
    {
        _118 = ouv.y > 1.0;
    }
    else
    {
        _118 = _111;
    }
    if (_118)
    {
        out.fragColor = float4(cam, 1.0);
        return out;
    }
    float2 texel = uOverlayTexel;
    float2 blur = texel * uSoftness;
    float pad = blur.x + texel.x;
    float2 uvColor = float2(fast::clamp(ouv.x * 0.5, pad, 0.5 - pad), ouv.y);
    float2 uvMatte = float2(fast::clamp((ouv.x * 0.5) + 0.5, 0.5 + pad, 1.0 - pad), ouv.y);
    float2 param = uvColor;
    float3 _268 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param, 0.0, 1.0)).xy).xyz;
    float3 _269 = _268;
    float2 param_1 = uvColor + float2(blur.x, 0.0);
    float3 _282 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param_1, 0.0, 1.0)).xy).xyz;
    float3 _283 = _282;
    float2 param_2 = uvColor + float2(-blur.x, 0.0);
    float3 _296 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param_2, 0.0, 1.0)).xy).xyz;
    float3 _297 = _296;
    float2 param_3 = uvColor + float2(0.0, blur.y);
    float3 _310 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param_3, 0.0, 1.0)).xy).xyz;
    float3 _311 = _310;
    float2 param_4 = uvColor + float2(0.0, -blur.y);
    float3 _324 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param_4, 0.0, 1.0)).xy).xyz;
    float3 _325 = _324;
    float3 rgbP = ((((_269 * 0.5) + (_283 * 0.125)) + (_297 * 0.125)) + (_311 * 0.125)) + (_325 * 0.125);
    float2 param_5 = uvMatte;
    float3 _338 = uOverlay.sample(uOverlaySmplr, (uOverlayXform * float4(param_5, 0.0, 1.0)).xy).xyz;
    float3 _339 = _338;
    float a = _339.x;
    if (uLimitedRange)
    {
        a = fast::clamp((a - 0.0627000033855438232421875) * 1.16439998149871826171875, 0.0, 1.0);
    }
    rgbP *= uExposureMatch;
    float3 param_6 = float3(in.vCamUV * 1024.0, floor(uTime * 30.0));
    param_6 = fract(param_6 * 0.103100001811981201171875);
    param_6 += float3(dot(param_6, param_6.yzx + float3(33.3300018310546875)));
    float _352 = fract((param_6.x + param_6.y) * param_6.z);
    float n = _352 - 0.5;
    rgbP += ((float3(n) * uGrainAmount) * a);
    out.fragColor = float4(rgbP + (cam * (1.0 - a)), 1.0);
    return out;
}

