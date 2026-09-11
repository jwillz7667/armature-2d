// Unlit two-color slot shader. LIGHT arrives in COLOR and DARK in TEXCOORD1.
// Straight or premultiplied atlas input produces premultiplied fragment output.
// SkeletonRenderer assigns separate RGB and alpha blend factors per slot mode.
Shader "Marionette/Slot"
{
    Properties
    {
        _PremultipliedAlpha ("Atlas Already Premultiplied", Float) = 0
        _SrcBlendAlpha ("Source Alpha Factor", Float) = 1
        _DstBlendAlpha ("Destination Alpha Factor", Float) = 10
        _MainTex ("Atlas Page", 2D) = "white" {}
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src Blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst Blend", Float) = 10
    }

    SubShader
    {
        Tags { "Queue" = "Transparent" "IgnoreProjector" = "True" "RenderType" = "Transparent" }
        Cull Off
        Lighting Off
        ZWrite Off
        Blend [_SrcBlend] [_DstBlend], [_SrcBlendAlpha] [_DstBlendAlpha]

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
                float4 dark : TEXCOORD1;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
                float4 dark : TEXCOORD1;
            };

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float _PremultipliedAlpha;

            v2f vert (appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.color = v.color;
                o.dark = v.dark;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 texel = tex2D(_MainTex, i.uv);
                float3 pm = lerp(texel.rgb * texel.a, texel.rgb, _PremultipliedAlpha);
                float3 rgb = (pm * i.color.rgb + (texel.a - pm) * i.dark.rgb) * i.color.a;
                return float4(rgb, texel.a * i.color.a);
            }
            ENDCG
        }
    }
}
