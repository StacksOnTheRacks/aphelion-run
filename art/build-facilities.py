"""Mines and collectors for Aphelion Run.

Built in the open ranger file, beside the ship, at the same relative size the
game uses. The cuff is a copy of the ranger engine collar. The bore faces -X.
The access ports face +Y and -Y. Up is +Z.

Run inside Blender. Exports unit-scale glbs (sphere radius 1) next to this file's
destination paths printed at the end.
"""

import array
import math
import os

import bpy
import mathutils
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else "/tmp"
# This file is exec()'d, so __file__ may be missing. Destinations are absolute.
APP_MODELS = "/Users/derrickanderson/Documents/code/personal/galaxyclass-dev/aphelion-run/packages/app/public/models"
WWW_MODELS = "/Users/derrickanderson/Documents/code/personal/galaxyclass-dev/aphelion-run/packages/www/public/models"
BLEND_COPY = "/Users/derrickanderson/Documents/blends/AphelionFacilities.blend"

# Ranger hull is ~16.13 long and stands in for 0.04 world units. A mine's diameter
# is 0.065, so the preview beside the ship is this many blender units across.
HULL_BLENDER = 16.127
HULL_WORLD = 0.04
MINE_DIAMETER_WORLD = 0.065
PREVIEW_RADIUS = (MINE_DIAMETER_WORLD / HULL_WORLD) * HULL_BLENDER / 2

BORE_INNER = 0.40
PORT_INNER = 0.31
# The hull mouth is smaller than the collar. A seat of the collar's own metal fills that
# gap so the ring and the shutter read as one piece.
PORT_MOUTH = 0.84
FACE_PROUD = 1.075
IRIS_DISTANCE = 1.045
# Just behind the leaves and in front of the hull, so the hole reads as an opening.
DISC_INSET = 0.036
BLADE_COUNT = 6

created_meshes = []


def purge():
	col = bpy.data.collections.get("Facilities")
	if col is None:
		return
	for obj in list(col.all_objects):
		data = obj.data
		bpy.data.objects.remove(obj, do_unlink=True)
		if isinstance(data, bpy.types.Mesh) and data.users == 0:
			bpy.data.meshes.remove(data)
	bpy.data.collections.remove(col)
	for image in list(bpy.data.images):
		if image.name.startswith("Facility ") and image.users == 0:
			bpy.data.images.remove(image)
	for mat in list(bpy.data.materials):
		if mat.name.startswith("Facility ") and mat.users == 0:
			bpy.data.materials.remove(mat)


def collection():
	col = bpy.data.collections.new("Facilities")
	bpy.context.scene.collection.children.link(col)
	return col


def link(col, obj):
	col.objects.link(obj)
	for other in list(obj.users_collection):
		if other != col:
			other.objects.unlink(obj)
	return obj


def new_object(col, name, data, parent):
	obj = bpy.data.objects.new(name, data)
	link(col, obj)
	obj.parent = parent
	if isinstance(data, bpy.types.Mesh):
		created_meshes.append(data)
	return obj


def principled(name, color, metallic, roughness, emission=0.0):
	mat = bpy.data.materials.new(name)
	mat.use_nodes = True
	bsdf = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
	bsdf.inputs["Base Color"].default_value = (*color, 1)
	bsdf.inputs["Metallic"].default_value = metallic
	bsdf.inputs["Roughness"].default_value = roughness
	strength = bsdf.inputs.get("Emission Strength")
	emit = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
	if strength is not None:
		strength.default_value = emission
	if emit is not None and emission > 0:
		emit.default_value = (*color, 1)
	mat.diffuse_color = (*color, 1)
	return mat


def image_material(name, image, metallic, roughness, emission=0.0, uv_scale=1.0):
	mat = principled(name, (1, 1, 1), metallic, roughness, emission)
	tree = mat.node_tree
	bsdf = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
	tex = tree.nodes.new("ShaderNodeTexImage")
	tex.image = image
	tex.location = (-480, 200)
	coord = tree.nodes.new("ShaderNodeTexCoord")
	coord.location = (-980, 200)
	mapping = tree.nodes.new("ShaderNodeMapping")
	mapping.location = (-740, 200)
	mapping.inputs["Scale"].default_value = (uv_scale, uv_scale, uv_scale)
	tree.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
	tree.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
	tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
	return mat


def hash2(ix, iy):
	n = (ix * 374761393 + iy * 668265263) & 0xFFFFFFFF
	n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
	return (n & 0xFFFF) / 65535.0


def save_image(name, width, height, pixels, non_color=False):
	image = bpy.data.images.new(name, width, height, alpha=True)
	buf = array.array("f", pixels)
	image.pixels.foreach_set(buf)
	image.pack()
	if non_color:
		image.colorspace_settings.name = "Non-Color"
	return image


def carbon_pixels(size):
	period = 14
	yarn = 11
	pixels = []
	for y in range(size):
		for x in range(size):
			d0 = (x + y) * 0.7071
			d1 = (x - y) * 0.7071

			def shade(d):
				m = d % period
				if m >= yarn:
					return 0.0
				t = m / yarn
				return math.sin(t * math.pi) ** 0.5

			s0 = shade(d0)
			s1 = shade(d1)
			bx = int(d0 // period)
			by = int(d1 // period)
			over = ((bx + by) // 2) % 2 == 0
			top, under = (s0, s1) if over else (s1, s0)
			if top > 0.05:
				value = 0.16 + 0.34 * top
			else:
				value = 0.08 + 0.10 * under
			value *= 0.94 + 0.06 * hash2(x, y)
			u = x / size
			v = y / size

			def seam(p, bands):
				f = (p * bands) % 1.0
				f = min(f, 1.0 - f)
				return f < 0.012

			if seam(u, 6) or seam(v, 4):
				value *= 0.45
			pixels.extend((value * 0.90, value * 0.93, value * 0.96, 1.0))
	return pixels


def orange_pixels(size):
	pixels = []
	base = (0.93, 0.40, 0.09)
	for y in range(size):
		for x in range(size):
			u = x / size
			v = y / size
			n = hash2(x // 2, y // 2)
			value = 0.92 + 0.08 * n

			def seam(p, bands):
				f = (p * bands) % 1.0
				f = min(f, 1.0 - f)
				return f < 0.010

			if seam(u, 7) or seam(v, 5):
				value *= 0.35
			pixels.extend((base[0] * value, base[1] * value, base[2] * value, 1.0))
	return pixels


def solar_pixels(size):
	cell = 64
	gap = 5
	pixels = []
	for y in range(size):
		for x in range(size):
			cx = x % cell
			cy = y % cell
			ix = x // cell
			iy = y // cell
			n = hash2(ix, iy)
			edge = cx < gap or cy < gap or cx >= cell - 1 or cy >= cell - 1
			bus = (cell // 2 - 1) <= cx <= (cell // 2 + 1)
			if edge or bus:
				pixels.extend((0.62, 0.50, 0.28, 1.0))
			else:
				blue = 0.10 + 0.05 * n
				pixels.extend((0.03 + 0.02 * n, 0.07 + 0.03 * n, blue + 0.16, 1.0))
	return pixels


def uv_equirect(mesh):
	mesh.uv_layers.new(name="UVMap")
	layer = mesh.uv_layers["UVMap"].data
	for poly in mesh.polygons:
		for li in poly.loop_indices:
			vert = mesh.vertices[mesh.loops[li].vertex_index]
			p = vert.co.normalized()
			u = math.atan2(p.y, p.x) / math.tau + 0.5
			v = math.asin(max(-1.0, min(1.0, p.z))) / math.pi + 0.5
			layer[li].uv = (u, v)


def uv_planar(mesh, tangent, bitangent):
	mesh.uv_layers.new(name="UVMap")
	layer = mesh.uv_layers["UVMap"].data
	for poly in mesh.polygons:
		for li in poly.loop_indices:
			vert = mesh.vertices[mesh.loops[li].vertex_index]
			layer[li].uv = (
				vert.co.dot(tangent) * 0.55 + 0.5,
				vert.co.dot(bitangent) * 0.55 + 0.5,
			)


def shade(obj):
	for poly in obj.data.polygons:
		poly.use_smooth = True


def empty(col, name, parent, location, rotation):
	obj = new_object(col, name, None, parent)
	obj.empty_display_type = "ARROWS"
	obj.empty_display_size = 0.2
	obj.location = location
	obj.rotation_euler = rotation.to_euler()
	return obj


def collar_source():
	src = bpy.data.objects["Ranger Engine Collar"]
	mesh = src.data.copy()
	mesh.name = "Facility Collar"
	mesh.transform(src.matrix_world.copy())
	created_meshes.append(mesh)
	xs = [v.co.x for v in mesh.vertices]
	ys = [v.co.y for v in mesh.vertices]
	zs = [v.co.z for v in mesh.vertices]
	center = Vector((
		(min(xs) + max(xs)) * 0.5,
		(min(ys) + max(ys)) * 0.5,
		(min(zs) + max(zs)) * 0.5,
	))
	for vert in mesh.vertices:
		vert.co -= center
	radii = [math.hypot(v.co.x, v.co.z) for v in mesh.vertices]
	inner = min(radii)
	outer = max(radii)
	half = -min(v.co.y for v in mesh.vertices)
	print(f"collar inner={inner:.4f} outer={outer:.4f} half={half:.4f}")
	return mesh, inner, outer, half


def map_rotation(from_dir, to_dir):
	return from_dir.normalized().rotation_difference(to_dir.normalized())


def tighten_opening(mesh, inner, new_inner):
	"""Shift the whole ring inward so the lip covers the shutter.

	Every vertex moves by the same amount. The band stays as wide as the
	original collar, and the outer rim comes in with the lip.
	"""
	shift = inner - new_inner
	if shift <= 1e-5:
		return
	for vert in mesh.vertices:
		radial = math.hypot(vert.co.x, vert.co.z)
		if radial <= shift + 1e-4:
			continue
		factor = (radial - shift) / radial
		vert.co.x *= factor
		vert.co.z *= factor
	try:
		mesh.free_normals_split()
	except (AttributeError, RuntimeError):
		pass
	mesh.update()


def place_collar(col, name, mesh, parent, outward, inner_target, unscaled_inner, unscaled_half, material, cover):
	# Each cuff needs its own mesh. A shared datablock exports as one glTF mesh, and the
	# game then keeps only the first collar — the bore — and drops the access panels.
	mesh = mesh.copy()
	mesh.name = name
	created_meshes.append(mesh)
	mesh.materials.clear()
	mesh.materials.append(material)
	scale = inner_target / unscaled_inner
	# Overlap the shutter, and bring the outer rim in with it so the band stays narrow.
	tighten_opening(mesh, unscaled_inner, cover * 0.94 / scale)
	obj = new_object(col, name, mesh, parent)
	obj.scale = (scale, scale, scale)
	half = unscaled_half * scale
	outward = outward.normalized()
	obj.rotation_euler = map_rotation(Vector((0, -1, 0)), outward).to_euler()
	obj.location = outward * (FACE_PROUD - half)
	return obj, scale, half


def disc(col, name, parent, radius, z, material):
	mesh = bpy.data.meshes.new(name)
	segs = 48
	verts = [(0.0, 0.0, z)]
	for i in range(segs):
		a = math.tau * i / segs
		verts.append((math.cos(a) * radius, math.sin(a) * radius, z))
	faces = [(0, 1 + i, 1 + (i + 1) % segs) for i in range(segs)]
	mesh.from_pydata(verts, [], faces)
	mesh.update()
	for poly in mesh.polygons:
		poly.use_smooth = True
	obj = new_object(col, name, mesh, parent)
	obj.data.materials.append(material)
	return obj


# Hinge sits just inside the circular opening. The leaf never starts outside that circle.
# Small enough that the leaves stay inside the round opening, open or shut.
HINGE_FRACTION = 0.78


def _bezier(p0, p1, p2, count):
	pts = []
	for i in range(count):
		t = i / (count - 1)
		u = 1 - t
		pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
	return pts


def blade_outline(opening):
	"""One shutter leaf inside the round opening.

	The hinge is the origin and +Y points at the aperture center. The plate rides
	inside the hole, overlapping the next leaf, the way a camera iris sits inside
	the lens ring. Positive Z opens it.
	"""
	rim = HINGE_FRACTION
	span = math.radians(150)
	outer = []
	steps = 15
	for i in range(steps):
		angle = -span * i / (steps - 1)
		outer.append((rim * math.cos(angle), rim * math.sin(angle)))
	hinge = outer[0]
	far = outer[-1]
	# Tip reaches past the middle so six leaves cover the hole when shut.
	tip = (-0.14, 0.05)
	lead_ctrl = ((hinge[0] + tip[0]) * 0.5, (hinge[1] + tip[1]) * 0.5 - 0.10)
	trail_ctrl = ((tip[0] + far[0]) * 0.5 - 0.04, (tip[1] + far[1]) * 0.5 - 0.05)
	lead = _bezier(hinge, lead_ctrl, tip, 14)
	trail = _bezier(tip, trail_ctrl, far, 8)
	world = lead[:-1] + trail[1:-1] + list(reversed(outer[1:-1]))
	local = [(y, rim - x) for x, y in world]
	area = 0.0
	for i, (x1, y1) in enumerate(local):
		x2, y2 = local[(i + 1) % len(local)]
		area += x1 * y2 - x2 * y1
	if area < 0:
		local.reverse()
	return [(x * opening, y * opening) for x, y in local]


def port_leaf(reach):
	"""Side-port leaf that stays inside the round hole.

	The hinge is the origin and the aperture center is at (0, reach). The outer
	edge follows the hole so the leaf fills the port from behind the hull. The
	leaf is mirrored so positive Z swings the tip out, the same way the bore opens.
	"""
	hole = reach * 0.88 / 0.94
	center = (0.0, reach)

	def on_hole(deg):
		angle = math.radians(deg)
		return (center[0] + hole * math.sin(angle), center[1] - hole * math.cos(angle))

	outer = [on_hole(deg) for deg in range(-78, 72, 6)]
	tip = (reach * 0.22, reach * 1.06)
	lead = _bezier(outer[-1], (reach * 0.72, reach * 0.55), tip, 14)
	trail = _bezier(tip, (-reach * 0.22, reach * 0.38), outer[0], 14)
	pts = outer[:-1] + lead[:-1] + trail[1:-1]
	# Mirror so positive Z swings the tip away from the center, matching the bore.
	pts = [(-x, y) for x, y in pts]
	area = 0.0
	for i, (x1, y1) in enumerate(pts):
		x2, y2 = pts[(i + 1) % len(pts)]
		area += x1 * y2 - x2 * y1
	if area < 0:
		pts.reverse()
	return pts


def solid_blade(col, name, parent, outline, thickness, material):
	mesh = bpy.data.meshes.new(name)
	n = len(outline)
	verts = []
	for x, y in outline:
		verts.append((x, y, thickness))
		verts.append((x, y, 0.0))
	faces = []
	top = []
	bot = []
	for i in range(n):
		top.append(i * 2)
		bot.append(i * 2 + 1)
	faces.append(top)
	faces.append(list(reversed(bot)))
	for i in range(n):
		j = (i + 1) % n
		faces.append([i * 2, j * 2, j * 2 + 1, i * 2 + 1])
	mesh.from_pydata(verts, [], faces)
	mesh.update()
	for poly in mesh.polygons:
		poly.use_smooth = False
	obj = new_object(col, name, mesh, parent)
	obj.data.materials.append(material)
	return obj


def add_aperture(col, model, prefix, outward, inner, collar_mesh, collar_inner, collar_half, mats, with_iris, inside=False):
	outward = outward.normalized()
	# Side ports: cover the hull hole. Bore: cover the outer tips of the shutter.
	cover = inner * PORT_MOUTH if inside else inner * HINGE_FRACTION
	cuff, scale, half = place_collar(
		col, f"{prefix}Cuff", collar_mesh, model, outward, inner, collar_inner, collar_half, mats["cuff"], cover
	)
	outer = max(math.hypot(v.co.x, v.co.z) for v in cuff.data.vertices) * scale
	rot = map_rotation(Vector((0, 0, 1)), outward)
	# Side ports sit behind the hull, in the hole. The bore stays where it already reads well.
	if inside:
		mouth = math.sqrt(max(0.0, 1.0 - inner * inner))
		distance = mouth - 0.055
		# Hinge sits on the rim of the hole so the leaves fill the port, under the cuff.
		fit = inner * 0.96 / HINGE_FRACTION
		stack = 0.016
		thickness = 0.008
	else:
		distance = IRIS_DISTANCE
		fit = inner
		stack = 0.0022
		thickness = 0.0035
	pivot = empty(col, f"{prefix}Pivot", model, outward * distance, rot)
	pivot["open_radians"] = 0.0
	disc(col, f"{prefix}Throat", pivot, inner * 0.96, -0.04 if inside else -DISC_INSET, mats["throat"])
	if with_iris:
		if inside:
			reach = inner * 0.94
			outline = port_leaf(reach)
		else:
			reach = fit * HINGE_FRACTION
			outline = blade_outline(fit)
		blades = []
		for index in range(BLADE_COUNT):
			ang = math.tau * index / BLADE_COUNT
			# Each leaf sits on the one before it, enough to read as a separate plate.
			hinge = Vector((
				math.cos(ang) * reach,
				math.sin(ang) * reach,
				(index - (BLADE_COUNT - 1) / 2) * stack,
			))
			inward = Vector((-hinge.x, -hinge.y))
			phi = math.atan2(-inward.x, inward.y)
			blade = solid_blade(col, f"{prefix}Iris.{index:03d}", pivot, outline, thickness, mats["iris"])
			blade.location = hinge
			blade.rotation_euler = (0.0, 0.0, phi)
			blades.append((hinge.xy, phi, outline))
		hole = hole_radius(blades, 0.0)
		# Inside the sphere the leaves can pass the hole; the hull hides whatever sits behind it.
		limit = 0.40 if inside else inner * 1.2
		target = inner * (0.30 if inside else 0.34 * HINGE_FRACTION)
		ceiling = math.radians(12 if inside else 40)
		opened = 0.0
		for step in range(1, 90):
			angle = step * math.radians(1)
			if angle > ceiling or blade_reach(blades, angle) > limit:
				break
			opened = angle
			if hole_radius(blades, angle) >= target:
				break
		pivot["open_radians"] = opened
		print(f"{prefix} closed hole={hole:.3f} open={math.degrees(opened):.1f}deg inside={inside} cuffOuter={outer:.3f}")
	# Colored shoulder on the mine bore only. Ports stay bare metal.
	return cuff, outer, half


def _placed(blades, angle):
	for hinge, phi, outline in blades:
		a = phi + angle
		ca = math.cos(a)
		sa = math.sin(a)
		for x, y in outline:
			yield hinge[0] + x * ca - y * sa, hinge[1] + x * sa + y * ca


def hole_radius(blades, angle):
	return min(math.hypot(x, y) for x, y in _placed(blades, angle))


def blade_reach(blades, angle):
	return max(math.hypot(x, y) for x, y in _placed(blades, angle))


def accent_ring(col, model, outward, radius, distance, material):
	mesh = bpy.data.meshes.new("Facility Accent")
	major = radius
	minor = 0.022
	segs = 48
	tube = 10
	verts = []
	faces = []
	axis = outward.normalized()
	quat = map_rotation(Vector((0, 0, 1)), axis)
	center = axis * distance
	for i in range(segs):
		a = math.tau * i / segs
		arm = Vector((math.cos(a) * major, math.sin(a) * major, 0))
		normal = Vector((math.cos(a), math.sin(a), 0))
		for j in range(tube):
			b = math.tau * j / tube
			ring = normal * (math.cos(b) * minor) + Vector((0, 0, math.sin(b) * minor))
			verts.append(quat @ (arm + ring) + center)
	for i in range(segs):
		for j in range(tube):
			a = i * tube + j
			b = i * tube + (j + 1) % tube
			c = ((i + 1) % segs) * tube + (j + 1) % tube
			d = ((i + 1) % segs) * tube + j
			faces.append((a, d, c, b))
	mesh.from_pydata(verts, [], faces)
	mesh.update()
	for poly in mesh.polygons:
		poly.use_smooth = True
	obj = new_object(col, "MineBoreAccent", mesh, model)
	obj.data.materials.append(material)
	return obj


def sphere(col, name, parent, material, holes=()):
	"""Unit sphere. `holes` are (axis, radius) circles cut through the hull so a shutter can sit inside."""
	mesh = bpy.data.meshes.new(name)
	segs = 96
	rings = 48
	verts = []
	for ring in range(rings + 1):
		v = ring / rings
		theta = v * math.pi
		for seg in range(segs):
			u = seg / segs
			phi = u * math.tau
			verts.append((
				math.sin(theta) * math.cos(phi),
				math.sin(theta) * math.sin(phi),
				math.cos(theta),
			))
	faces = []
	for ring in range(rings):
		for seg in range(segs):
			a = ring * segs + seg
			b = ring * segs + (seg + 1) % segs
			c = (ring + 1) * segs + (seg + 1) % segs
			d = (ring + 1) * segs + seg
			if ring == 0:
				faces.append((a, d, c))
			elif ring == rings - 1:
				faces.append((a, d, b))
			else:
				faces.append((a, d, c, b))
	# Poles were repeated per segment. Rebuild more carefully with shared poles.
	mesh.clear_geometry()
	verts = [(0.0, 0.0, 1.0)]
	for ring in range(1, rings):
		theta = ring / rings * math.pi
		for seg in range(segs):
			phi = seg / segs * math.tau
			verts.append((math.sin(theta) * math.cos(phi), math.sin(theta) * math.sin(phi), math.cos(theta)))
	verts.append((0.0, 0.0, -1.0))
	faces = []
	for seg in range(segs):
		faces.append((0, 1 + seg, 1 + (seg + 1) % segs))
	for ring in range(rings - 2):
		for seg in range(segs):
			a = 1 + ring * segs + seg
			b = 1 + ring * segs + (seg + 1) % segs
			c = 1 + (ring + 1) * segs + (seg + 1) % segs
			d = 1 + (ring + 1) * segs + seg
			faces.append((a, b, c, d))
	south = len(verts) - 1
	base = 1 + (rings - 2) * segs
	for seg in range(segs):
		faces.append((south, base + (seg + 1) % segs, base + seg))

	def covered(face):
		center = Vector((0.0, 0.0, 0.0))
		for index in face:
			center += Vector(verts[index])
		center /= len(face)
		for axis, radius in holes:
			axis = axis.normalized()
			along = center.dot(axis)
			if along <= 0.0:
				continue
			if (center - axis * along).length < radius:
				return True
		return False

	kept = [face for face in faces if not covered(face)]
	removed = [face for face in faces if covered(face)]
	# Pull the cut edge onto a circle so the opening is round, not a jagged patch.
	on_removed = {index for face in removed for index in face}
	on_kept = {index for face in kept for index in face}
	verts = list(verts)
	for index in on_removed & on_kept:
		point = Vector(verts[index])
		for axis, radius in holes:
			axis = axis.normalized()
			along = point.dot(axis)
			if along <= 0.0:
				continue
			perp = point - axis * along
			if perp.length > radius * 1.8 or perp.length < 1e-6:
				continue
			mouth = math.sqrt(max(0.0, 1.0 - radius * radius))
			verts[index] = tuple((axis * mouth + perp.normalized() * radius).normalized())
			break
	faces = kept
	mesh.from_pydata(verts, [], faces)
	mesh.update()
	uv_equirect(mesh)
	for poly in mesh.polygons:
		poly.use_smooth = True
	obj = new_object(col, name, mesh, parent)
	obj.data.materials.append(material)
	return obj


def solar_cap(col, parent, material, bezel_mat):
	axis = Vector((-1, 0, 0))
	tangent = Vector((0, 1, 0))
	bitangent = Vector((0, 0, 1))
	ang = math.radians(56)
	rings = 10
	segs = 36
	mesh = bpy.data.meshes.new("Facility Solar Cap")
	verts = [axis * 1.012]
	for ring in range(1, rings + 1):
		theta = ang * ring / rings
		for seg in range(segs):
			phi = math.tau * seg / segs
			direction = (axis * math.cos(theta) + tangent * math.sin(theta) * math.cos(phi) + bitangent * math.sin(theta) * math.sin(phi)).normalized()
			verts.append(direction * 1.012)
	faces = []
	for seg in range(segs):
		faces.append((0, 1 + seg, 1 + (seg + 1) % segs))
	for ring in range(rings - 1):
		for seg in range(segs):
			a = 1 + ring * segs + seg
			b = 1 + ring * segs + (seg + 1) % segs
			c = 1 + (ring + 1) * segs + (seg + 1) % segs
			d = 1 + (ring + 1) * segs + seg
			faces.append((a, b, c, d))
	mesh.from_pydata(verts, [], faces)
	mesh.update()
	uv_planar(mesh, tangent, bitangent)
	for poly in mesh.polygons:
		poly.use_smooth = True
	obj = new_object(col, "CollectorSolar", mesh, parent)
	obj.data.materials.append(material)
	# A dark rim where the panels meet the orange hull.
	bezel = bpy.data.meshes.new("Facility Solar Bezel")
	major = math.sin(ang) * 1.012
	minor = 0.02
	bverts = []
	bfaces = []
	bsegs = 48
	btube = 8
	center = axis * math.cos(ang) * 1.012
	for i in range(bsegs):
		a = math.tau * i / bsegs
		arm = tangent * math.cos(a) * major + bitangent * math.sin(a) * major
		normal = (tangent * math.cos(a) + bitangent * math.sin(a)).normalized()
		for j in range(btube):
			b = math.tau * j / btube
			point = center + arm + normal * math.cos(b) * minor + axis * math.sin(b) * minor
			bverts.append(point)
	for i in range(bsegs):
		for j in range(btube):
			a0 = i * btube + j
			b0 = i * btube + (j + 1) % btube
			c0 = ((i + 1) % bsegs) * btube + (j + 1) % btube
			d0 = ((i + 1) % bsegs) * btube + j
			bfaces.append((a0, d0, c0, b0))
	bezel.from_pydata(bverts, [], bfaces)
	bezel.update()
	for poly in bezel.polygons:
		poly.use_smooth = True
	ring = new_object(col, "CollectorSolarBezel", bezel, parent)
	ring.data.materials.append(bezel_mat)
	return obj


def build():
	purge()
	col = collection()
	carbon = save_image("Facility Carbon", 512, 512, carbon_pixels(512))
	orange = save_image("Facility Orange", 512, 512, orange_pixels(512))
	solar = save_image("Facility Solar", 512, 512, solar_pixels(512))
	mats = {
		"carbon": image_material("Facility Carbon", carbon, 0.25, 0.42, emission=0.04, uv_scale=1.15),
		"orange": image_material("Facility Orange", orange, 0.08, 0.48, emission=0.12, uv_scale=1.0),
		"solar": image_material("Facility Solar", solar, 0.55, 0.28, emission=0.04, uv_scale=1),
		"cuff": principled("Facility Cuff", (0.034, 0.040, 0.050), 0.45, 0.36, emission=0.02),
		"iris": principled("Facility Iris", (0.045, 0.048, 0.052), 0.35, 0.55, emission=0.0),
		"throat": principled("Facility Throat", (0.012, 0.013, 0.015), 0.2, 0.7, emission=0.0),
		"accent": principled("Mine Accent", (0.78, 0.42, 0.22), 0.55, 0.32, emission=0.4),
	}
	collar_mesh, collar_inner, collar_outer, collar_half = collar_source()
	# The copied mesh keeps the ranger material slot. Object assignment overrides it.
	if len(collar_mesh.materials) == 0:
		collar_mesh.materials.append(mats["cuff"])

	def facility(name, location):
		display = new_object(col, name, None, None)
		display.empty_display_type = "PLAIN_AXES"
		display.empty_display_size = 0.4
		display.location = location
		display.scale = (PREVIEW_RADIUS, PREVIEW_RADIUS, PREVIEW_RADIUS)
		model = new_object(col, f"{name}Model", None, display)
		return display, model

	mine_root, mine = facility("Mine", Vector((-24, 0, 0)))
	bore = Vector((-1, 0, 0))
	port = Vector((0, 1, 0))
	starboard = Vector((0, -1, 0))
	# Side mouths are open through the hull. The shutter lives behind them.
	sphere(col, "MineBody", mine, mats["carbon"], ((port, PORT_INNER * PORT_MOUTH), (starboard, PORT_INNER * PORT_MOUTH)))
	add_aperture(col, mine, "MineBore", bore, BORE_INNER, collar_mesh, collar_inner, collar_half, mats, True)
	add_aperture(col, mine, "MinePort", port, PORT_INNER, collar_mesh, collar_inner, collar_half, mats, True, inside=True)
	add_aperture(col, mine, "MineStarboard", starboard, PORT_INNER, collar_mesh, collar_inner, collar_half, mats, True, inside=True)
	# The accent sits on the hull side of the bore cuff, a band of the mined color.
	accent_ring(col, mine, bore, BORE_INNER + 0.16, FACE_PROUD - 0.12, mats["accent"])

	collector_root, collector = facility("Collector", Vector((24, 0, 0)))
	sphere(col, "CollectorBody", collector, mats["orange"], ((port, PORT_INNER * PORT_MOUTH), (starboard, PORT_INNER * PORT_MOUTH)))
	solar_cap(col, collector, mats["solar"], mats["cuff"])
	# Same facing empty as a mine so the game aims the panel at the sun.
	empty(col, "CollectorBorePivot", collector, bore * IRIS_DISTANCE, map_rotation(Vector((0, 0, 1)), bore))
	add_aperture(col, collector, "CollectorPort", port, PORT_INNER, collar_mesh, collar_inner, collar_half, mats, True, inside=True)
	add_aperture(col, collector, "CollectorStarboard", starboard, PORT_INNER, collar_mesh, collar_inner, collar_half, mats, True, inside=True)

	bpy.context.view_layer.update()
	print(f"preview radius {PREVIEW_RADIUS:.3f}")
	print("built mines and collectors")
	return mine, collector


def export_model(model, path):
	saved_parent = model.parent
	saved_local = model.matrix_local.copy()
	model.parent = None
	model.matrix_world = Matrix.Identity(4)
	bpy.context.view_layer.update()

	def select(obj):
		obj.select_set(True)
		for child in obj.children:
			select(child)

	for obj in bpy.context.view_layer.objects:
		obj.select_set(False)
	select(model)
	bpy.context.view_layer.objects.active = model
	os.makedirs(os.path.dirname(path), exist_ok=True)
	bpy.ops.export_scene.gltf(
		filepath=path,
		export_format="GLB",
		use_selection=True,
		export_apply=True,
		export_yup=True,
		export_extras=True,
		export_materials="EXPORT",
		export_image_format="AUTO",
	)
	model.parent = saved_parent
	model.matrix_local = saved_local
	bpy.context.view_layer.update()
	print("exported", path)


def exports(mine, collector):
	export_model(mine, os.path.join(APP_MODELS, "mine.glb"))
	export_model(mine, os.path.join(WWW_MODELS, "mine.glb"))
	export_model(collector, os.path.join(APP_MODELS, "collector.glb"))
	export_model(collector, os.path.join(WWW_MODELS, "collector.glb"))
	bpy.ops.wm.save_as_mainfile(filepath=BLEND_COPY, copy=True)
	print("saved", BLEND_COPY)


if __name__ == "__main__":
	mine, collector = build()
	exports(mine, collector)
