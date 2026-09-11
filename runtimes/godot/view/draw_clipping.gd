extends RefCounted
# Post-solve triangle clipping with barycentric page UVs, matching the C# view.
const Geometry = preload("res://core/attachment_geometry.gd")

class ActiveClip:
	extends RefCounted
	var attachment
	var prepared
	var world := PackedFloat64Array()
	var start: int
	var end: int

var _clips: Array = []
var _count := 0
var _indices := PackedInt32Array()
var _uvs := PackedFloat64Array()
var _buffers = Geometry.make_clip_buffers()

func reset() -> void:
	_count = 0

func add(pose, position: int, slot_index: int, clip) -> void:
	var end := -1
	for p in range(position + 1, pose.slot_count):
		if pose.slot_names[pose.draw_order[p]] == clip.end:
			end = p
			break
	if end < 0:
		return
	if _count == _clips.size():
		_clips.append(ActiveClip.new())
	var active = _clips[_count]
	_count += 1
	if active.attachment != clip:
		active.attachment = clip
		active.prepared = Geometry.prepare_clipping(clip.clip_vertices)
		active.world.resize(clip.clip_vertices.size())
	active.start = position
	active.end = end
	Geometry.resolve_clip_world_polygon_for_slot(pose, slot_index, clip, active.world)

func apply(list) -> void:
	for c in range(_count):
		var active = _clips[c]
		for i in range(list.count):
			var item = list.item(i)
			if item.render_position <= active.start or item.render_position > active.end:
				continue
			_indices.resize(item.triangle_index_count)
			for j in range(item.triangle_index_count):
				_indices[j] = item.triangles[j]
			var result = Geometry.clip_triangle_list(active.prepared, active.world, item.world_positions, _indices, _buffers)
			if _uvs.size() < result.vertex_count * 2:
				_uvs.resize(result.vertex_count * 2)
			var vertex := 0
			var index_count := 0
			for ring in range(result.ring_count):
				var count: int = _buffers.ring_vertex_count[ring]
				var source: int = _buffers.ring_source_tri[ring] * 3
				var a: int = _indices[source] * 2
				var b: int = _indices[source + 1] * 2
				var d: int = _indices[source + 2] * 2
				for v in range(count):
					var w0: float = _buffers.bary[vertex * 3]
					var w1: float = _buffers.bary[vertex * 3 + 1]
					var w2: float = _buffers.bary[vertex * 3 + 2]
					_uvs[vertex * 2] = item.page_uvs[a] * w0 + item.page_uvs[b] * w1 + item.page_uvs[d] * w2
					_uvs[vertex * 2 + 1] = item.page_uvs[a + 1] * w0 + item.page_uvs[b + 1] * w1 + item.page_uvs[d + 1] * w2
					vertex += 1
				index_count += maxi(0, count - 2) * 3
			item.ensure_capacity(result.vertex_count, index_count)
			for lane in range(result.vertex_count * 2):
				item.world_positions[lane] = _buffers.positions[lane]
				item.page_uvs[lane] = _uvs[lane]
			var offset := 0
			var output := 0
			for ring in range(result.ring_count):
				var count: int = _buffers.ring_vertex_count[ring]
				for v in range(1, count - 1):
					item.triangles[output] = offset
					item.triangles[output + 1] = offset + v
					item.triangles[output + 2] = offset + v + 1
					output += 3
				offset += count
