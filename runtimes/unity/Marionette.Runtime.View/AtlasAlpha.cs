using Marionette.Runtime.Core.Json;

namespace Marionette.Runtime.View
{
    // Reads the alpha policy from the export sidecar; it is not part of SkeletonDocument.
    public static class AtlasAlpha
    {
        public static bool ReadPremultiplied(string json)
        {
            JsonValue root = JsonParser.Parse(json);
            JsonValue? version = root.Member("manifestVersion");
            JsonValue? alpha = root.Member("premultipliedAlpha");
            if (version == null || version.Kind != JsonKind.String || version.AsString() != "1.0.0"
                || alpha == null || alpha.Kind != JsonKind.Bool)
                throw new RenderModelReadException("Invalid atlas-targets alpha policy or unsupported manifest version");
            return alpha.AsBool();
        }
    }
}
