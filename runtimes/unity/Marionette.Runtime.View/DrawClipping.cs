using System;
using System.Collections.Generic;
using Marionette.Runtime.Core.Document;
using Marionette.Runtime.Core.Skeleton;

namespace Marionette.Runtime.View
{
    // Clips rendered triangles, preserving page UVs through barycentric interpolation.
    // All buffers and active-clip records grow only to the busiest frame and are reused.
    internal sealed class DrawClipping
    {
        private sealed class Active
        {
            internal ClippingAttachment? Attachment;
            internal AttachmentGeometry.PreparedClip? Prepared;
            internal double[] World = Array.Empty<double>();
            internal int Start;
            internal int End;
        }
        private readonly List<Active> _clips = new List<Active>();
        private readonly List<int> _indices = new List<int>();
        private readonly AttachmentGeometry.ClipBuffers _buffers = AttachmentGeometry.MakeClipBuffers();
        private double[] _uvs = Array.Empty<double>();
        private int _count;

        internal void Reset() { _count = 0; }

        internal void Add(Pose pose, int position, int slotIndex, ClippingAttachment clip)
        {
            int end = -1;
            for (int p = position + 1; p < pose.SlotCount; p++)
                if (pose.SlotNames[pose.DrawOrder[p]] == clip.End) { end = p; break; }
            if (end < 0) return;
            if (_count == _clips.Count) _clips.Add(new Active());
            Active active = _clips[_count++];
            if (!ReferenceEquals(active.Attachment, clip)) {
                active.Attachment = clip;
                active.Prepared = AttachmentGeometry.PrepareClipping(clip);
                active.World = new double[clip.Vertices.Length];
            }
            active.Start = position;
            active.End = end;
            AttachmentGeometry.ResolveClipWorldPolygonForSlot(pose, slotIndex, clip, active.World);
        }

        internal void Apply(SkeletonDrawList list)
        {
            for (int c = 0; c < _count; c++) {
                Active active = _clips[c];
                for (int i = 0; i < list.Count; i++) {
                    DrawItem item = list[i];
                    if (item.RenderPosition <= active.Start || item.RenderPosition > active.End) continue;
                    _indices.Clear();
                    for (int j = 0; j < item.TriangleIndexCount; j++) _indices.Add(item.Triangles[j]);
                    var result = AttachmentGeometry.ClipTriangleList(active.Prepared!, active.World,
                        item.WorldPositions, _indices, _buffers);
                    if (_uvs.Length < result.VertexCount * 2) _uvs = new double[result.VertexCount * 2];
                    int vertex = 0;
                    int indexCount = 0;
                    for (int ring = 0; ring < result.RingCount; ring++) {
                        int count = _buffers.RingVertexCount[ring];
                        int source = _buffers.RingSourceTri[ring] * 3;
                        int a = _indices[source] * 2, b = _indices[source + 1] * 2, d = _indices[source + 2] * 2;
                        for (int v = 0; v < count; v++, vertex++) {
                            double w0 = _buffers.Bary[vertex * 3], w1 = _buffers.Bary[vertex * 3 + 1], w2 = _buffers.Bary[vertex * 3 + 2];
                            _uvs[vertex * 2] = item.PageUvs[a] * w0 + item.PageUvs[b] * w1 + item.PageUvs[d] * w2;
                            _uvs[vertex * 2 + 1] = item.PageUvs[a + 1] * w0 + item.PageUvs[b + 1] * w1 + item.PageUvs[d + 1] * w2;
                        }
                        indexCount += Math.Max(0, count - 2) * 3;
                    }
                    item.EnsureCapacity(result.VertexCount, indexCount);
                    Array.Copy(_buffers.Positions, item.WorldPositions, result.VertexCount * 2);
                    Array.Copy(_uvs, item.PageUvs, result.VertexCount * 2);
                    int offset = 0, output = 0;
                    for (int ring = 0; ring < result.RingCount; ring++) {
                        int count = _buffers.RingVertexCount[ring];
                        for (int v = 1; v + 1 < count; v++) {
                            item.Triangles[output++] = offset;
                            item.Triangles[output++] = offset + v;
                            item.Triangles[output++] = offset + v + 1;
                        }
                        offset += count;
                    }
                }
            }
        }
    }
}
