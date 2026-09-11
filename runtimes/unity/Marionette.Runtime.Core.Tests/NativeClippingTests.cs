using System;
using Marionette.Runtime.Core.Skeleton;
using Marionette.Runtime.View;
using Xunit;

namespace Marionette.Runtime.Core.Tests
{
    public sealed class NativeClippingTests
    {
        [Fact]
        public void ClipsTexturedMeshAndHonorsEndOrderWithReusedBuffers()
        {
            var scene = ViewScene.Load("rig-clipping");
            var spec = SampleSpec.Load(RepoPaths.SampleSpec("rig-clipping"));
            var fixture = Fixture.Load(RepoPaths.Fixture("rig-clipping"));
            scene.Sample(spec, fixture.Samples[0], 0);
            var list = scene.GatherDrawItems(spec.Animation, 0);
            Assert.Equal(1, list.Count);
            var item = list[0];
            Assert.Equal(900, Area(item), 6); // [0,40]^2 intersect [10,70]^2.
            for (int v = 0; v < item.VertexCount; v++) {
                double x = item.WorldPositions[v * 2], y = item.WorldPositions[v * 2 + 1];
                Assert.InRange(x, 10 - 1e-8, 40 + 1e-8);
                Assert.InRange(y, 10 - 1e-8, 40 + 1e-8);
                Assert.Equal(x / 40, item.PageUvs[v * 2], 6);
                Assert.Equal(y / 40, item.PageUvs[v * 2 + 1], 6);
            }
            // Moving the end slot ahead of the clip makes the range empty.
            scene.Pose.DrawOrder[0] = scene.SlotIndex("meshslot");
            scene.Pose.DrawOrder[1] = scene.SlotIndex("under");
            scene.Pose.DrawOrder[2] = scene.SlotIndex("clipper");
            list = scene.GatherDrawItems(spec.Animation, 0);
            Assert.Equal(4, list[0].VertexCount);
            Assert.Equal(1600, Area(list[0]), 6);
            scene.Sample(spec, fixture.Samples[0], 0);
            list = scene.GatherDrawItems(spec.Animation, 0);
            Assert.Equal(900, Area(list[0]), 6);
        }

        [Theory]
        [InlineData(true)]
        [InlineData(false)]
        public void ReadsExplicitAtlasAlphaPolicy(bool premultiplied)
        {
            string json = "{\"manifestVersion\":\"1.0.0\",\"premultipliedAlpha\":" + (premultiplied ? "true" : "false") + "}";
            Assert.Equal(premultiplied, AtlasAlpha.ReadPremultiplied(json));
        }

        [Theory]
        [InlineData("{}")]
        [InlineData("{\"manifestVersion\":\"2.0.0\",\"premultipliedAlpha\":true}")]
        [InlineData("{\"manifestVersion\":\"1.0.0\",\"premultipliedAlpha\":\"true\"}")]
        public void RejectsAmbiguousAtlasAlphaPolicy(string json)
        {
            Assert.Throws<RenderModelReadException>(() => AtlasAlpha.ReadPremultiplied(json));
        }

        private static double Area(DrawItem item)
        {
            double area = 0;
            for (int i = 0; i < item.TriangleIndexCount; i += 3) {
                int a = item.Triangles[i] * 2, b = item.Triangles[i + 1] * 2, c = item.Triangles[i + 2] * 2;
                double[] p = item.WorldPositions;
                area += Math.Abs((p[b] - p[a]) * (p[c + 1] - p[a + 1]) - (p[c] - p[a]) * (p[b + 1] - p[a + 1])) * 0.5;
            }
            return area;
        }
    }
}
