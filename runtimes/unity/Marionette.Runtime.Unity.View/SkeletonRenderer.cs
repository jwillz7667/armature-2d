#if UNITY_2021_3_OR_NEWER
using System.Collections.Generic;
using Marionette.Runtime.Core.Document;
using Marionette.Runtime.Core.Skeleton;
using Marionette.Runtime.View;
using UnityEngine;

namespace Marionette.Runtime.Unity.View
{
    // The drop-in Unity component: load a Marionette format document (a .mrnt-exported JSON) plus its atlas
    // page textures, play one animation, and render it. It drives the SHARED, engine-agnostic solve
    // (Sample.SampleSkeleton) and the SHARED view build (DrawItemBuilder + MeshBufferAssembler) every Update,
    // then hands the batches to SkeletonMeshBuilder to upload. All the load-bearing logic (solve, draw-item
    // gather, batching) lives in the tested engine-agnostic assemblies; this MonoBehaviour is a thin,
    // declarative driver: parse on enable, advance a clock, solve, gather, upload.
    //
    // References UnityEngine, so it is NOT part of the headless dotnet solution (Unity compiles it). See the
    // package README for the drop-in steps and the example scene.
    [AddComponentMenu("Marionette/Skeleton Renderer")]
    public sealed class SkeletonRenderer : MonoBehaviour
    {
        [Header("Document")]
        [Tooltip("The Marionette format document JSON (a .mrnt export saved as a .json TextAsset).")]
        [SerializeField]
        private TextAsset documentJson;

        [Tooltip("The skin to render. 'default' unless the rig defines alternates.")]
        [SerializeField]
        private string skinName = "default";

        [Tooltip("The animation to play. Must name an animation in the document.")]
        [SerializeField]
        private string animationName = string.Empty;

        [Header("Playback")]
        [SerializeField]
        private bool loop = true;

        [SerializeField]
        private float timeScale = 1f;

        [SerializeField]
        private bool playOnEnable = true;

        [Header("Atlas")]
        [Tooltip("Atlas page textures. The Name of each texture must match the page file name in the document "
            + "atlas (for example 'skeleton.png').")]
        [SerializeField]
        private Texture2D[] atlasPages = System.Array.Empty<Texture2D>();

        [Tooltip("Optional atlas-targets.json sidecar. Its alpha policy overrides the manual setting.")]
        [SerializeField] private TextAsset atlasTargetsManifest;
        [SerializeField] private bool premultipliedAtlasPages;
        private bool _atlasPremultiplied;

        [Header("Materials")]
        [Tooltip("Optional normal-blend material. Overrides must expose the Marionette/Slot shader properties and "
            + "support light and dark vertex tint (see MarionetteSlot.shader).")]
        [SerializeField]
        private Material normalMaterial;

        [SerializeField]
        private Material additiveMaterial;

        [SerializeField]
        private Material multiplyMaterial;

        [SerializeField]
        private Material screenMaterial;

        [Header("Sorting")]
        [SerializeField]
        private string sortingLayer = "Default";

        [SerializeField]
        private int baseSortingOrder;

        private SkeletonDocument _document;
        private RenderModel _renderModel;
        private AtlasIndex _atlas;
        private Pose _pose;
        private SkeletonDrawList _drawList;
        private RenderBatchSet _batches;
        private SkeletonMeshBuilder _meshBuilder;

        private readonly Dictionary<string, Material> _materials = new Dictionary<string, Material>();
        private readonly Dictionary<string, Texture2D> _pageTextures = new Dictionary<string, Texture2D>();

        private double _time;
        private double _duration;
        private bool _isPlaying;
        private bool _isLoaded;

        // The current playback time in seconds (clamped or looped into [0, duration]).
        public double Time => _time;

        // Whether the document loaded and an animation is ready to play.
        public bool IsLoaded => _isLoaded;

        private void OnEnable()
        {
            Load();
            if (playOnEnable)
            {
                Play(animationName);
            }
        }

        private void OnDisable()
        {
            _isPlaying = false;
        }

        private void OnDestroy() { ReleaseRenderResources(); }

        private void ReleaseRenderResources()
        {
            _meshBuilder?.Dispose();
            _meshBuilder = null;
            foreach (Material owned in _materials.Values) Destroy(owned);
            _materials.Clear();
        }

        // Assign the render inputs from code (the inspector-free path the example uses). In a normal project
        // you set these fields in the inspector instead. Call Load() afterward to (re)build. Any null
        // material argument leaves the existing assignment.
        public void SetInputs(
            TextAsset document,
            Texture2D[] pages,
            Material normal,
            Material additive,
            Material multiply,
            Material screen,
            string skin = "default",
            TextAsset atlasManifest = null,
            bool pagesPremultiplied = false)
        {
            documentJson = document;
            atlasTargetsManifest = atlasManifest;
            premultipliedAtlasPages = pagesPremultiplied;
            atlasPages = pages ?? System.Array.Empty<Texture2D>();
            skinName = skin;
            if (normal != null)
            {
                normalMaterial = normal;
            }

            if (additive != null)
            {
                additiveMaterial = additive;
            }

            if (multiply != null)
            {
                multiplyMaterial = multiply;
            }

            if (screen != null)
            {
                screenMaterial = screen;
            }
        }

        // Load and prepare the document, atlas, and solve pose. Safe to call again to reload after changing
        // the document or atlas in the inspector.
        public void Load()
        {
            _isLoaded = false;
            ReleaseRenderResources();
            if (documentJson == null)
            {
                Debug.LogWarning("SkeletonRenderer: no document JSON assigned.", this);
                return;
            }

            _atlasPremultiplied = atlasTargetsManifest != null ? AtlasAlpha.ReadPremultiplied(atlasTargetsManifest.text) : premultipliedAtlasPages;
            string json = documentJson.text;
            _document = RigReader.Parse(json);
            _renderModel = RenderModelReader.Parse(json);
            _atlas = new AtlasIndex(_renderModel.Atlas);
            _pose = BuildPose.Build(_document);
            _drawList = new SkeletonDrawList();
            _batches = new RenderBatchSet();
            _meshBuilder = new SkeletonMeshBuilder(transform);

            _materials.Clear();
            RegisterMaterial("normal", normalMaterial);
            RegisterMaterial("additive", additiveMaterial);
            RegisterMaterial("multiply", multiplyMaterial);
            RegisterMaterial("screen", screenMaterial);

            _pageTextures.Clear();
            foreach (Texture2D page in atlasPages)
            {
                if (page != null)
                {
                    _pageTextures[page.name] = page;
                }
            }

            _isLoaded = true;
        }

        // Start (or restart) playing the named animation from time 0. Resets physics so the simulation starts
        // from rest on the first frame.
        public void Play(string animation)
        {
            if (!_isLoaded)
            {
                return;
            }

            Animation found = _document.FindAnimation(animation);
            if (found == null)
            {
                Debug.LogWarning($"SkeletonRenderer: animation '{animation}' not found.", this);
                _isPlaying = false;
                return;
            }

            animationName = animation;
            _duration = found.Duration;
            _time = 0;
            _isPlaying = true;
            Sample.ResetPhysics(_pose);
            RenderFrame(0);
        }

        private void Update()
        {
            if (!_isPlaying)
            {
                return;
            }

            double dt = UnityEngine.Time.deltaTime * timeScale;
            RenderFrame(dt);
        }

        // Advance the clock by frameDt seconds, solve, gather, batch, and upload. frameDt also advances the
        // physics simulation clock (the constraints carry velocity across frames).
        private void RenderFrame(double frameDt)
        {
            double next = _time + frameDt;
            if (_duration > 0)
            {
                if (loop)
                {
                    next %= _duration;
                    if (next < 0)
                    {
                        next += _duration;
                    }
                }
                else if (next > _duration)
                {
                    next = _duration;
                }
            }

            _time = next;

            Sample.SampleSkeleton(_document, animationName, _time, _pose, skinName, frameDt);
            DrawItemBuilder.BuildInto(
                _document, _renderModel, _atlas, _pose, skinName, animationName, _time, _drawList);
            MeshBufferAssembler.Assemble(_drawList, _batches);

            int sortingLayerId = SortingLayer.NameToID(sortingLayer);
            _meshBuilder.Upload(
                _batches, _materials, _pageTextures, sortingLayerId, baseSortingOrder, normalMaterial, _atlasPremultiplied);
        }

        private void RegisterMaterial(string blend, Material material)
        {
            Shader shader = material != null ? material.shader : Shader.Find("Marionette/Slot");
            if (shader == null) throw new System.InvalidOperationException("Marionette/Slot shader is missing from the build");
            Material owned = material != null ? new Material(material) : new Material(shader);
            var source = blend == "multiply" ? UnityEngine.Rendering.BlendMode.DstColor : UnityEngine.Rendering.BlendMode.One;
            var destination = blend == "additive" ? UnityEngine.Rendering.BlendMode.One :
                blend == "screen" ? UnityEngine.Rendering.BlendMode.OneMinusSrcColor : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha;
            owned.SetInt("_SrcBlend", (int)source);
            owned.SetInt("_DstBlend", (int)destination);
            owned.SetInt("_SrcBlendAlpha", (int)(blend == "multiply" ? UnityEngine.Rendering.BlendMode.Zero : UnityEngine.Rendering.BlendMode.One));
            owned.SetInt("_DstBlendAlpha", (int)(blend == "multiply" ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha));
            _materials[blend] = owned;
        }
    }
}
#endif
