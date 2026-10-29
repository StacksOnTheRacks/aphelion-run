import { Constants } from "@babylonjs/core/Engines/constants";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ProceduralTexture } from "@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Invented moon terrain, generated on the GPU once per moon.
 *
 * Each moon's surface is a small GLSL recipe built from shared parts: crater fields whose sizes follow
 * the real count-versus-size curve, named basins, canyons, long fracture bands, and patches of a second
 * terrain. The recipe is sampled from the sphere's own 3D directions, so the maps have no seam and no
 * pinching at the poles. Two maps come out: color with the large-scale shape in alpha, and the surface
 * normal in the moon's own space. The large-scale shape also moves the mesh, so lumpy moons and big
 * basins show at the edge of the disc.
 *
 * Feature placement uses each moon's real coordinates where the feature is real (Herschel, Odysseus,
 * Ithaca Chasma, Valhalla, Pele, Cassini Regio, the tiger stripes). Everything else is invented to look
 * like what that moon is made of.
 */

export type Sunlight = { color: Color3; strength: number; night: number };

export type TerrainMoon = {
	mesh: Mesh;
	/** Bakes the maps at full detail. Only the few most recently sharpened moons keep them. */
	sharpen: () => void;
};

type Terrain = {
	/** Radii toward the planet (x), along the pole (y), and along the orbit (z), with the longest at 1. */
	axes?: [number, number, number];
	/** Largest height the shape map holds, as a share of the radius. */
	shapeRange?: number;
	/** Scales the small-scale relief that only reaches the lighting. */
	relief?: number;
	/**
	 * 0 is dark dusty rock, which looks evenly bright across a full disc. 1 is bright ice, which
	 * darkens toward the edge like a matte ball.
	 */
	ice: number;
	/** How far light reaches past the terminator. Haze bends light around Titan. */
	wrap?: number;
	haze?: boolean;
	/** GLSL defining `void paint(vec3 d)`, plus any helpers it needs. */
	paint: string;
};

/** Equirectangular width while a moon is far. Height is half of this. */
const LOW_RES = 1024;
/**
 * Equirectangular width for the moon in view. Crater classes and noise octaves stay at the
 * sizes the old map kept; the extra texels only draw those features more cleanly.
 */
const HIGH_RES = 4096;
const SHARP_KEEP = 3;
const MESH_SEGMENTS = 96;
const HAZE_SCALE = 1.25;

export function createMoonTerrain(scene: Scene, sunlight: Sunlight) {
	const sharp: { name: string; release: () => void }[] = [];

	const build = (name: string, diameter: number): TerrainMoon | null => {
		const terrain = TERRAIN[name];
		if (!terrain) {
			return null;
		}
		const source = bakeSource(terrain);
		const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: MESH_SEGMENTS }, scene);
		const material = new ShaderMaterial(
			name,
			scene,
			{ vertexSource: MOON_VERTEX, fragmentSource: MOON_FRAGMENT },
			{
				attributes: ["position", "uv"],
				uniforms: [
					"world",
					"viewProjection",
					"axes",
					"shapeRange",
					"sunColor",
					"sunlight",
					"nightSide",
					"ice",
					"wrap",
					"horizonSoftness",
					"sunObject",
					"sunCenter",
					"mapTexel",
					"shadows",
				],
				samplers: ["surfaceMap", "normalMap"],
			},
		);
		const axes = terrain.axes ?? [1, 1, 1];
		material.setVector3("axes", new Vector3(...axes));
		material.setFloat("shapeRange", terrain.shapeRange ?? DEFAULT_SHAPE_RANGE);
		material.setColor3("sunColor", sunlight.color);
		material.setFloat("sunlight", sunlight.strength);
		material.setFloat("nightSide", sunlight.night);
		material.setFloat("ice", terrain.ice);
		material.setFloat("wrap", terrain.wrap ?? 0);
		// A lumpy moon's own bulges decide where night falls, so the sphere-based cutoff stays loose.
		material.setFloat("horizonSoftness", Math.min(...axes) < 0.9 ? 0.4 : 0.15);
		material.setFloat("shadows", (terrain.relief ?? 1) > 0 ? 1 : 0);
		mesh.material = material;

		const inverseWorld = new Matrix();
		const sunObject = new Vector3();
		const sunCenter = new Vector3();
		scene.onBeforeRenderObservable.add(() => {
			if (!mesh.isEnabled() || !mesh.isVisible) {
				return;
			}
			mesh.getWorldMatrix().invertToRef(inverseWorld);
			Vector3.TransformNormalToRef(mesh.getAbsolutePosition().negate(), inverseWorld, sunObject);
			material.setVector3("sunObject", sunObject.normalize());
			// The scene is drawn around the camera, so the Sun is not at the rendered origin.
			const offset = scene.floatingOriginOffset;
			material.setVector3("sunCenter", sunCenter.set(-offset.x, -offset.y, -offset.z));
		});

		const low = bake(scene, name, source, LOW_RES);
		const use = (maps: Maps) => {
			material.setTexture("surfaceMap", maps.surface);
			material.setTexture("normalMap", maps.normals);
			material.setFloat("mapTexel", maps.texelAngle);
		};
		use(low);

		if (terrain.haze) {
			buildHaze(scene, mesh, diameter / 2, sunlight);
		}

		const sharpen = () => {
			const index = sharp.findIndex((entry) => entry.name === name);
			if (index >= 0) {
				sharp.push(...sharp.splice(index, 1));
				return;
			}
			const high = bake(scene, name, source, HIGH_RES);
			let pending = 2;
			let released = false;
			const done = () => {
				pending -= 1;
				if (pending === 0 && !released) {
					use(high);
				}
			};
			high.surface.onGeneratedObservable.addOnce(done);
			high.normals.onGeneratedObservable.addOnce(done);
			sharp.push({
				name,
				release: () => {
					released = true;
					use(low);
					high.surface.dispose();
					high.normals.dispose();
				},
			});
			while (sharp.length > SHARP_KEEP) {
				sharp.shift()?.release();
			}
		};

		return { mesh, sharpen };
	};

	return { build };
}

type Maps = { surface: ProceduralTexture; normals: ProceduralTexture; texelAngle: number };

function bake(scene: Scene, name: string, source: string, width: number): Maps {
	const texelAngle = Math.PI / (width / 2);
	// Heights ride in the normal map's alpha, and craters a few texels wide need more than 8 bits.
	const make = (kind: string, mode: number, type: number) => {
		const texture = new ProceduralTexture(
			`${name}-${kind}-${width}`,
			{ width, height: width / 2 },
			{ fragmentSource: source },
			scene,
			null,
			true,
			false,
			type,
		);
		texture.refreshRate = 0;
		texture.setFloat("mode", mode);
		texture.setFloat("texelAngle", texelAngle);
		texture.wrapU = Texture.WRAP_ADDRESSMODE;
		texture.wrapV = Texture.CLAMP_ADDRESSMODE;
		texture.anisotropicFilteringLevel = 16;
		// Blending left on by an earlier draw would mix the shape height in alpha into the colors.
		texture.onBeforeGenerationObservable.add(() => scene.getEngine().setAlphaMode(Constants.ALPHA_DISABLE));
		return texture;
	};
	return {
		surface: make("surface", 0, Constants.TEXTURETYPE_UNSIGNED_BYTE),
		normals: make("normals", 1, Constants.TEXTURETYPE_HALF_FLOAT),
		texelAngle,
	};
}

const DEFAULT_SHAPE_RANGE = 0.1;

function bakeSource(terrain: Terrain): string {
	const axes = terrain.axes ?? [1, 1, 1];
	return `${BAKE_LIBRARY}
const vec3 AXES = vec3(${glsl(axes[0])}, ${glsl(axes[1])}, ${glsl(axes[2])});
const float SHAPE_RANGE = ${glsl(terrain.shapeRange ?? DEFAULT_SHAPE_RANGE)};
const float RELIEF = ${glsl(terrain.relief ?? 1)};
${terrain.paint}
${BAKE_MAIN}`;
}

function glsl(value: number): string {
	return value.toFixed(5);
}

/**
 * Titan's haze, seen from outside: a glow that falls off with height above the limb, a thin bluish
 * layer detached above it, and light carried a little way past the terminator. It glows brightest
 * when the Sun is behind Titan.
 */
function buildHaze(scene: Scene, moon: Mesh, radius: number, sunlight: Sunlight): void {
	const shell = MeshBuilder.CreateSphere(`${moon.name}-haze`, { diameter: radius * 2 * HAZE_SCALE, segments: 48 }, scene);
	const material = new ShaderMaterial(
		`${moon.name}-haze`,
		scene,
		{ vertexSource: HAZE_VERTEX, fragmentSource: HAZE_FRAGMENT },
		{
			attributes: ["position"],
			uniforms: ["world", "viewProjection", "cameraPosition", "centre", "radius", "sunColor"],
			needAlphaBlending: true,
		},
	);
	material.setFloat("radius", radius);
	material.setColor3("sunColor", sunlight.color.scale(sunlight.strength));
	material.setVector3("centre", moon.position);
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	shell.material = material;
	shell.parent = moon;
	shell.isPickable = false;
}

const MOON_VERTEX = `
	precision highp float;
	attribute vec3 position;
	attribute vec2 uv;
	uniform mat4 world;
	uniform mat4 viewProjection;
	uniform sampler2D surfaceMap;
	uniform vec3 axes;
	uniform float shapeRange;
	varying vec2 vUV;
	varying vec3 vPositionW;
	varying vec3 vRoundW;
	varying vec3 vDirection;
	void main() {
		vec3 d = normalize(position);
		float ellipse = 1.0 / length(d / axes);
		float lift = (texture2D(surfaceMap, uv).a * 2.0 - 1.0) * shapeRange;
		vec4 worldPosition = world * vec4(position * ellipse * (1.0 + lift), 1.0);
		vPositionW = worldPosition.xyz;
		vRoundW = mat3(world) * (d / (axes * axes));
		vDirection = d;
		vUV = uv;
		gl_Position = viewProjection * worldPosition;
	}
`;

/**
 * Lighting for airless bodies. Dark regolith scatters light back the way it came (Lommel-Seeliger),
 * so a full disc looks flat rather than shaded like a ball. Bright ice is closer to a matte surface.
 */
const MOON_FRAGMENT = `
	precision highp float;
	uniform mat4 world;
	uniform sampler2D surfaceMap;
	uniform sampler2D normalMap;
	uniform vec3 sunColor;
	uniform float sunlight;
	uniform float nightSide;
	uniform float ice;
	uniform float wrap;
	uniform float horizonSoftness;
	uniform vec3 sunObject;
	uniform vec3 sunCenter;
	uniform float mapTexel;
	uniform float shadows;
	varying vec2 vUV;
	varying vec3 vPositionW;
	varying vec3 vRoundW;
	varying vec3 vDirection;

	const float PI = 3.14159265359;

	// Offsets the map coordinates from this pixel's own, so they never jump at the seam or the mip choice with them.
	float heightAt(vec3 d, vec3 p) {
		float around = atan(-p.z, p.x) - atan(-d.z, d.x);
		around -= 2.0 * PI * floor(around / (2.0 * PI) + 0.5);
		float down = acos(clamp(p.y, -1.0, 1.0)) - acos(clamp(d.y, -1.0, 1.0));
		return texture2D(normalMap, vUV + vec2(around / (2.0 * PI), down / PI)).a;
	}

	// Walks toward the Sun over the height map. Rims and peaks that rise above the ray cast shadows,
	// softened as though the Sun were a few degrees wide so nothing shimmers.
	float shadow(vec3 d, float h0) {
		float up = dot(sunObject, d);
		vec3 along = sunObject - d * up;
		float level = length(along);
		if (up <= 0.0 || level < 0.0001) return 1.0;
		vec3 east = along / level;
		float slope = up / level;
		float lit = 1.0;
		float s = mapTexel;
		for (int i = 0; i < 48; i++) {
			if (s > 0.35) break;
			vec3 p = d * cos(s) + east * sin(s);
			float ray = h0 + s * slope + 0.5 * s * s;
			lit = min(lit, smoothstep(-1.0, 1.0, (ray - heightAt(d, p)) / (s * 0.05)));
			if (lit <= 0.0) break;
			s *= 1.14;
		}
		return lit;
	}

	void main() {
		vec3 albedo = texture2D(surfaceMap, vUV).rgb;
		vec4 normalHeight = texture2D(normalMap, vUV);
		vec3 normal = normalize(mat3(world) * (normalHeight.xyz * 2.0 - 1.0));
		// The scene is drawn around the camera. -vPositionW is the view direction; the Sun sits at sunCenter.
		vec3 toSun = normalize(sunCenter - vPositionW);
		vec3 toEye = normalize(-vPositionW);
		float incidence = clamp((dot(normal, toSun) + wrap) / (1.0 + wrap), 0.0, 1.0);
		float emission = max(dot(normal, toEye), 0.0);
		float dusty = 2.0 * incidence / (incidence + emission + 0.1);
		float light = min(mix(dusty, incidence, ice), 1.3);
		// Bumps can tilt toward the Sun, but not ground the body's own curve has turned into night.
		float horizon = smoothstep(-horizonSoftness, 0.08, dot(normalize(vRoundW), toSun) + wrap);
		// A low sun skims the surface and hits every rim, so the march marks that whole side
		// as shadowed. Fade the cast shadow out there and let the body's shading carry it.
		float sunUp = dot(sunObject, normalize(vDirection));
		if (shadows > 0.5 && incidence * horizon > 0.0) {
			light *= mix(1.0, shadow(normalize(vDirection), normalHeight.a), smoothstep(0.08, 0.4, sunUp));
		}
		gl_FragColor = vec4(albedo * (sunColor * sunlight * light * horizon + nightSide), 1.0);
	}
`;

const HAZE_VERTEX = `
	precision highp float;
	attribute vec3 position;
	uniform mat4 world;
	uniform mat4 viewProjection;
	varying vec3 vPositionW;
	void main() {
		vec4 worldPosition = world * vec4(position, 1.0);
		vPositionW = worldPosition.xyz;
		gl_Position = viewProjection * worldPosition;
	}
`;

const HAZE_FRAGMENT = `
	precision highp float;
	uniform vec3 cameraPosition;
	uniform vec3 centre;
	uniform float radius;
	uniform vec3 sunColor;
	varying vec3 vPositionW;
	void main() {
		vec3 ray = normalize(vPositionW - cameraPosition);
		vec3 closest = cameraPosition + ray * dot(centre - cameraPosition, ray);
		float miss = length(closest - centre) / radius;
		vec3 up = normalize(closest - centre);
		vec3 toSun = normalize(-closest);
		float lit = smoothstep(-0.3, 0.25, dot(up, toSun));
		float backlit = pow(max(dot(ray, toSun), 0.0), 6.0);
		float height = max(miss - 1.0, 0.0);
		float overDisc = miss < 1.0 ? smoothstep(0.8, 1.0, miss) : 1.0;
		float main = exp(-height / 0.03) * overDisc;
		float detached = exp(-pow((height - 0.11) / 0.018, 2.0)) * overDisc;
		vec3 glow = vec3(0.86, 0.56, 0.26) * main * 0.5 + vec3(0.46, 0.62, 0.9) * detached * 0.3;
		gl_FragColor = vec4(glow * sunColor * (lit + 1.5 * backlit), 1.0);
	}
`;

/**
 * Shared GLSL for the bake. The moon's own frame: -X faces the planet, +Y is north, +Z leads along
 * the orbit. `at(westLongitude, latitude)` uses the planetary convention, where 0° faces the planet
 * and 90°W is the middle of the leading side.
 */
const BAKE_LIBRARY = `
precision highp float;
varying vec2 vUV;
uniform float mode;
uniform float texelAngle;

const float PI = 3.14159265359;
const vec3 NORTH = vec3(0.0, 1.0, 0.0);
const vec3 NEAR = vec3(-1.0, 0.0, 0.0);
const vec3 LEADING = vec3(0.0, 0.0, 1.0);

vec3 albedo;
float detail;
float shape;
float craterHeight;
float craterBright;
float craterFloor;

#define rgb(r, g, b) (vec3(r, g, b) / 255.0)

vec3 at(float lonW, float lat) {
	float l = radians(lonW);
	float b = radians(lat);
	return vec3(-cos(b) * cos(l), sin(b), cos(b) * sin(l));
}

vec3 hash33(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

float grad(vec3 cell, vec3 corner, vec3 f) {
	return dot(hash33(cell + corner) * 2.0 - 1.0, f - corner);
}

float noise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	return mix(
		mix(
			mix(grad(i, vec3(0.0, 0.0, 0.0), f), grad(i, vec3(1.0, 0.0, 0.0), f), u.x),
			mix(grad(i, vec3(0.0, 1.0, 0.0), f), grad(i, vec3(1.0, 1.0, 0.0), f), u.x),
			u.y
		),
		mix(
			mix(grad(i, vec3(0.0, 0.0, 1.0), f), grad(i, vec3(1.0, 0.0, 1.0), f), u.x),
			mix(grad(i, vec3(0.0, 1.0, 1.0), f), grad(i, vec3(1.0, 1.0, 1.0), f), u.x),
			u.y
		),
		u.z
	);
}

// Smallest feature the 2048 map kept, in radians. Anything finer shades as a black speck.
const float MIN_FEATURE = 0.0046;

// 1 once a feature is broad enough to read as terrain, fading to 0 as it shrinks to MIN_FEATURE.
float resolvable(float size) {
	return smoothstep(MIN_FEATURE, MIN_FEATURE * 2.67, size);
}

float fbm(vec3 d, float scale, float octaves) {
	float sum = 0.0;
	float amp = 0.5;
	float f = scale;
	for (int i = 0; i < 10; i++) {
		if (float(i) >= octaves) break;
		sum += amp * resolvable(1.0 / f) * noise(d * f + float(i) * 7.31);
		f *= 2.07;
		amp *= 0.5;
	}
	return sum;
}

float ridged(vec3 d, float scale, float octaves) {
	float sum = 0.0;
	float amp = 0.5;
	float f = scale;
	for (int i = 0; i < 10; i++) {
		if (float(i) >= octaves) break;
		float n = 1.0 - abs(noise(d * f + float(i) * 3.17));
		sum += amp * resolvable(1.0 / f) * n * n;
		f *= 2.07;
		amp *= 0.5;
	}
	return sum;
}

float smin(float a, float b, float k) {
	float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
	return mix(b, a, h) - k * h * (1.0 - h);
}

float smax(float a, float b, float k) {
	return -smin(-a, -b, k);
}

float angleTo(vec3 d, vec3 centre) {
	return acos(clamp(dot(d, normalize(centre)), -1.0, 1.0));
}

// Height across a crater, in crater depths: a bowl (flat-floored when large), a raised rim, nothing past
// 1.7 radii. 'soft' rounds the rim crest and the floor edge: sharp when fresh, slumped when old.
float craterShape(float rr, float floorLevel, float peak, float soft) {
	float cavity = rr * rr - 1.0;
	float rimX = min(rr - 1.7, 0.0);
	float rim = 0.55 * rimX * rimX;
	float h = smin(cavity, rim, soft);
	h = smax(h, floorLevel, soft * 0.8);
	return h + peak * exp(-rr * rr * 25.0);
}

// One size class of craters. Each 3D cell may hold one crater whose reach stays inside half a cell,
// so only the 8 nearest cells can touch a point.
void craterLayer(vec3 d, float freq, float seed, float density, float fresh) {
	vec3 p = d * freq;
	vec3 base = floor(p - 0.5);
	float fade = resolvable(0.2 / freq);
	for (int i = 0; i < 8; i++) {
		vec3 corner = vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
		vec3 cell = base + corner;
		vec3 r = hash33(cell + seed);
		if (r.x > density) continue;
		vec3 c = cell + hash33(cell.zxy * 1.37 + seed + 11.0);
		float lift = length(c) - freq;
		float reach2 = 0.25 - lift * lift;
		if (reach2 <= 0.0) continue;
		vec3 centre = normalize(c) * freq;
		vec3 offset = p - centre;
		float dist = length(offset);
		float reach = sqrt(reach2);
		if (dist >= reach) continue;
		float radius = reach * mix(0.3, 0.55, r.y);
		float rad = radius / freq;
		// Most craters on an old surface are worn; only a few keep sharp rims.
		float age = sqrt(r.z);
		float big = smoothstep(0.025, 0.1, rad);
		float depth = 0.45 * rad * mix(1.0, 0.4, big) * mix(1.0, 0.3, age * age);
		float rr = dist / radius * (1.0 + 0.07 * noise(p * 2.5 + seed));
		craterHeight += fade * depth * craterShape(rr, mix(-0.95, -0.55, big), 0.4 * big * (1.0 - age), mix(0.05, 0.45, age));
		craterFloor = max(craterFloor, fade * (1.0 - smoothstep(0.6, 1.0, rr)));
		float young = 1.0 - smoothstep(0.0, max(fresh, 0.0001), r.z);
		if (young > 0.0) {
			vec3 axis = normalize(centre);
			vec3 t1 = normalize(cross(axis, abs(axis.y) < 0.9 ? NORTH : LEADING));
			vec3 t2 = cross(axis, t1);
			float az = atan(dot(offset, t2), dot(offset, t1));
			float streak = smoothstep(0.2, 0.75, noise(vec3(cos(az), sin(az), 0.0) * 4.0 + r * 50.0));
			float blanket = 1.0 - smoothstep(0.95, 2.0, rr);
			float rays = streak * (1.0 - smoothstep(1.0, reach / radius, rr));
			craterBright = max(craterBright, fade * young * max(blanket, rays * 0.65));
		}
	}
}

// Craters from the largest class down to MIN_FEATURE. Finer classes shade as black specks.
// Each class is 1.45 times smaller and, at a fixed chance per cell, about twice as common.
void craters(vec3 d, float largest, float density, float fresh, float seed) {
	float freq = largest;
	for (int layer = 0; layer < 16; layer++) {
		if (0.2 / freq < MIN_FEATURE) break;
		craterLayer(d, freq, seed + float(layer) * 17.0, density, fresh);
		freq *= 1.45;
	}
}

void applyCraters(float amount, vec3 freshColor, float freshShare) {
	detail += craterHeight * amount;
	albedo = mix(albedo, freshColor, craterBright * amount * freshShare);
}

// A large named crater or multi-ring basin. It goes into the shape, so it shows at the limb.
// Returns the distance from its centre in basin radii.
float basin(vec3 d, vec3 centre, float radius, float depth, float floorLevel, float peak, float rings) {
	float rr = angleTo(d, centre) / radius;
	float outer = 1.0 + rings * 0.5;
	if (rr > max(1.8, outer + 0.3)) return rr;
	float wobbly = rr * (1.0 + 0.05 * noise(d * 3.0 / radius));
	float h = craterShape(wobbly, floorLevel, peak, 0.2);
	if (rings > 0.0) {
		float zone = smoothstep(1.0, 1.4, rr) * (1.0 - smoothstep(outer - 0.6, outer + 0.3, rr));
		h += zone * 0.15 * sin((rr - 1.0) * 2.0 * PI);
	}
	shape += depth * h;
	return rr;
}

// A young crater with a bright blanket and long rays. Returns the brightening, 0 to 1.
float rayCrater(vec3 d, vec3 centre, float radius, float reach, float seed) {
	vec3 c = normalize(centre);
	float angle = angleTo(d, c);
	if (angle > reach) return 0.0;
	float rr = angle / radius;
	detail += 0.4 * radius * craterShape(rr, -0.9, 0.0, 0.06);
	vec3 t1 = normalize(cross(c, abs(c.y) < 0.9 ? NORTH : LEADING));
	vec3 t2 = cross(c, t1);
	float az = atan(dot(d, t2), dot(d, t1));
	float rays = smoothstep(0.15, 0.7, noise(vec3(cos(az) * 6.0, sin(az) * 6.0, seed)));
	rays *= pow(1.0 - angle / reach, 1.5) * (0.6 + 0.4 * noise(d * 40.0));
	float blanket = 1.0 - smoothstep(1.0, 2.5, rr);
	return max(blanket, rays);
}

// A flat-floored canyon with raised shoulders, along the great circle from 'from' toward 'toward'.
void chasm(vec3 d, vec3 from, vec3 toward, float span, float width, float depth) {
	vec3 pole = normalize(cross(from, toward));
	vec3 start = normalize(from);
	float off = asin(clamp(dot(d, pole), -1.0, 1.0));
	if (abs(off) > width * 2.5) return;
	vec3 level = normalize(d - pole * dot(d, pole));
	float along = atan(dot(level, cross(pole, start)), dot(level, start));
	if (along < 0.0) along += 2.0 * PI;
	float taper = smoothstep(0.0, 0.25, along) * (1.0 - smoothstep(span - 0.25, span, along));
	if (taper <= 0.0) return;
	float x = abs(off + 0.35 * width * noise(d * 7.0)) / (width * mix(0.5, 1.0, taper));
	float floorH = -(1.0 - smoothstep(0.75, 1.0, x));
	float shoulder = 0.25 * exp(-pow((x - 1.2) / 0.25, 2.0));
	shape += depth * taper * (floorH + shoulder);
}

// Long narrow bands along great circles, broken into arcs. Returns the band (1 inside), and the
// centre line in 'core'. Poles lean toward 'bias' by 'focus', so with focus the bands run roughly parallel.
float lineae(vec3 d, float count, float seed, vec3 bias, float focus, float wMin, float wMax, out float core) {
	float band = 0.0;
	core = 0.0;
	for (int i = 0; i < 48; i++) {
		if (float(i) >= count) break;
		vec3 h = hash33(vec3(float(i), seed, 3.7));
		vec3 pole = normalize(mix(h * 2.0 - 1.0, bias, focus));
		float w = mix(wMin, wMax, h.z * h.z);
		float off = abs(dot(d, pole) + w * 1.5 * noise(d * 9.0 + h * 20.0));
		if (off > w * 2.0) continue;
		float arc = smoothstep(-0.1, 0.15, noise(d * 1.6 + h * 13.0)) * resolvable(w * 2.0);
		band = max(band, arc * (1.0 - smoothstep(0.5, 1.0, off / w)));
		core = max(core, arc * exp(-pow(off / (0.25 * w), 2.0)));
	}
	return band;
}

// Distances to the nearest and second-nearest scattered point, and the nearest point's cell.
vec2 worley(vec3 p, out vec3 nearest) {
	vec3 base = floor(p);
	float f1 = 8.0;
	float f2 = 8.0;
	nearest = base;
	for (int x = -1; x <= 1; x++) {
		for (int y = -1; y <= 1; y++) {
			for (int z = -1; z <= 1; z++) {
				vec3 cell = base + vec3(float(x), float(y), float(z));
				float dist = length(p - cell - hash33(cell * 1.91 + 4.3));
				if (dist < f1) {
					f2 = f1;
					f1 = dist;
					nearest = cell;
				} else if (dist < f2) {
					f2 = dist;
				}
			}
		}
	}
	return vec2(f1, f2);
}

float ring(vec3 d, vec3 centre, float radius, float width) {
	return exp(-pow((angleTo(d, centre) - radius) / width, 2.0));
}

float spot(vec3 d, vec3 centre, float radius) {
	return 1.0 - smoothstep(radius * 0.6, radius, angleTo(d, centre));
}

// Broad patches of a second terrain covering about 'share' of the surface. Returns the mask.
float patches(vec3 d, float scale, float share, float seed) {
	float n = fbm(d + seed, scale, 6.0);
	float t = (0.5 - share) * 0.35;
	return smoothstep(t - 0.05, t + 0.05, n);
}

// Tints the leading face and the trailing face, where the planet's magnetosphere and dust land.
void hemispheres(vec3 d, vec3 leadTint, vec3 trailTint) {
	albedo *= mix(trailTint, leadTint, smoothstep(-0.7, 0.7, dot(d, LEADING)));
}

// Rolling ground that grows steeper at smaller scales, like real regolith.
void hills(vec3 d, float amount) {
	float sum = 0.0;
	float amp = 0.5;
	float f = 3.0;
	for (int i = 0; i < 10; i++) {
		sum += amp * resolvable(1.0 / f) * noise(d * f + 3.1 + float(i) * 7.31);
		f *= 2.07;
		amp *= 0.62;
	}
	detail += amount * sum;
}

void grain(vec3 d, float amount) {
	albedo *= 1.0 + amount * 1.4 * fbm(d + 9.7, 24.0, 7.0);
}
`;

const BAKE_MAIN = `
vec3 direction(vec2 uv) {
	float polar = uv.y * PI;
	float around = uv.x * 2.0 * PI;
	return vec3(sin(polar) * cos(around), cos(polar), -sin(polar) * sin(around));
}

void evaluate(vec3 d) {
	albedo = vec3(0.5);
	detail = 0.0;
	shape = 0.0;
	craterHeight = 0.0;
	craterBright = 0.0;
	craterFloor = 0.0;
	paint(d);
}

float height(vec3 d) {
	evaluate(d);
	return clamp(shape, -SHAPE_RANGE, SHAPE_RANGE) + RELIEF * detail;
}

vec3 surfacePoint(vec3 d) {
	return d / length(d / AXES) * (1.0 + height(d));
}

void main() {
	vec3 d = direction(vUV);
	if (mode < 0.5) {
		evaluate(d);
		gl_FragColor = vec4(clamp(albedo, 0.0, 1.0), clamp(shape / SHAPE_RANGE * 0.5 + 0.5, 0.0, 1.0));
		return;
	}
	vec3 t1 = normalize(cross(abs(d.y) < 0.9 ? NORTH : vec3(1.0, 0.0, 0.0), d));
	vec3 t2 = cross(d, t1);
	float h0 = height(d);
	vec3 p0 = d / length(d / AXES) * (1.0 + h0);
	vec3 p1 = surfacePoint(normalize(d + t1 * texelAngle));
	vec3 p2 = surfacePoint(normalize(d + t2 * texelAngle));
	vec3 normal = normalize(cross(p1 - p0, p2 - p0));
	if (dot(normal, d) < 0.0) normal = -normal;
	gl_FragColor = vec4(normal * 0.5 + 0.5, h0);
}
`;

/**
 * One recipe per moon. Colors follow what each is made of. Sizes are in radians on the moon's surface
 * and heights are shares of its radius, taken from the real features where they exist. Voyager saw
 * only the southern halves of Uranus's moons, so their northern halves are wholly invented.
 */
const TERRAIN: Record<string, Terrain> = {
	phobos: {
		axes: [1, 0.7, 0.88],
		shapeRange: 0.3,
		relief: 1.2,
		ice: 0,
		paint: `
void paint(vec3 d) {
	albedo = rgb(86, 74, 66);
	albedo = mix(albedo, rgb(74, 70, 68), patches(d, 2.0, 0.4, 1.0));
	shape += 0.1 * fbm(d, 1.2, 3.0);
	// Stickney, a crater nearly half as wide as the moon, with brighter, bluer ejecta.
	float rr = basin(d, at(49.0, 1.0), 0.42, 0.22, -0.6, 0.0, 0.0);
	albedo = mix(albedo, rgb(108, 104, 102), (1.0 - smoothstep(0.8, 1.7, rr)) * 0.6);
	// Grooves: parallel troughs circling the leading side, missing around the trailing apex.
	vec3 a1 = normalize(LEADING + vec3(0.0, 0.25, 0.1));
	vec3 a2 = normalize(LEADING + vec3(0.2, -0.3, 0.0));
	float x1 = dot(d, a1) * 14.0 + 0.6 * noise(d * 3.0);
	float x2 = dot(d, a2) * 11.0 + 0.6 * noise(d * 3.0 + 5.0);
	float g1 = (1.0 - smoothstep(0.0, 0.1, abs(fract(x1) - 0.5))) * smoothstep(-0.05, 0.25, noise(d * 5.0));
	float g2 = (1.0 - smoothstep(0.0, 0.09, abs(fract(x2) - 0.5))) * smoothstep(-0.05, 0.25, noise(d * 5.0 + 9.0));
	float trough = max(g1, g2) * smoothstep(-0.8, -0.45, dot(d, LEADING)) * resolvable(0.012);
	detail -= 0.006 * trough;
	albedo *= 1.0 - 0.15 * trough;
	craters(d, 4.0, 0.55, 0.05, 1.0);
	applyCraters(1.0, rgb(112, 102, 94), 0.5);
	hills(d, 0.012);
	grain(d, 0.08);
}`,
	},
	deimos: {
		axes: [1, 0.73, 0.81],
		shapeRange: 0.25,
		ice: 0,
		paint: `
void paint(vec3 d) {
	albedo = rgb(116, 104, 94);
	shape += 0.12 * fbm(d, 1.0, 3.0);
	basin(d, at(0.0, -70.0), 0.55, 0.12, -0.4, 0.0, 0.0);
	// Loose regolith has filled and softened most craters.
	craters(d, 5.0, 0.5, 0.08, 2.0);
	applyCraters(0.45, rgb(150, 138, 124), 0.8);
	// Brighter streaks where dust has slid downslope.
	albedo = mix(albedo, rgb(140, 128, 116), smoothstep(0.55, 0.75, ridged(d * vec3(1.0, 3.0, 1.0), 4.0, 4.0)) * 0.5);
	hills(d, 0.004);
	grain(d, 0.05);
}`,
	},
	io: {
		ice: 0.3,
		relief: 1.5,
		paint: `
// Volcanic pits: dark lava floors with steep rims, darker halos, and some with plume rings of red or white.
void paterae(vec3 d, float freq, float density, float seed) {
	vec3 p = d * freq;
	vec3 base = floor(p - 0.5);
	for (int i = 0; i < 8; i++) {
		vec3 corner = vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
		vec3 cell = base + corner;
		vec3 r = hash33(cell + seed);
		if (r.x > density) continue;
		vec3 c = cell + hash33(cell.zxy * 1.37 + seed + 11.0);
		float lift = length(c) - freq;
		float reach2 = 0.25 - lift * lift;
		if (reach2 <= 0.0) continue;
		vec3 centre = normalize(c) * freq;
		float dist = length(p - centre);
		float reach = sqrt(reach2);
		if (dist >= reach) continue;
		float radius = reach * mix(0.12, 0.32, r.y * r.y);
		float rr = dist / radius * (1.0 + 0.35 * noise(p * 3.0 + seed));
		float pit = 1.0 - smoothstep(0.85, 1.0, rr);
		float halo = 1.0 - smoothstep(1.0, 2.6, rr);
		float plume = r.z > 0.55 ? exp(-pow((dist / reach - 0.72) / 0.12, 2.0)) : 0.0;
		vec3 lava = mix(rgb(36, 28, 22), rgb(96, 74, 42), hash13(cell + seed + 2.0));
		vec3 deposit = r.z > 0.8 ? rgb(178, 72, 40) : rgb(234, 228, 204);
		albedo = mix(albedo, albedo * rgb(196, 156, 116), halo * 0.5);
		albedo = mix(albedo, deposit, plume * 0.55 * (1.0 - halo));
		albedo = mix(albedo, lava, pit);
		detail -= pit * radius / freq * 0.15;
	}
}

// Isolated mountains, some taller than Everest, standing out of the plains.
void massifs(vec3 d, float freq, float density, float seed) {
	vec3 p = d * freq;
	vec3 base = floor(p - 0.5);
	for (int i = 0; i < 8; i++) {
		vec3 corner = vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
		vec3 cell = base + corner;
		vec3 r = hash33(cell + seed);
		if (r.x > density) continue;
		vec3 c = cell + hash33(cell.zxy * 1.37 + seed + 11.0);
		float lift = length(c) - freq;
		float reach2 = 0.25 - lift * lift;
		if (reach2 <= 0.0) continue;
		vec3 centre = normalize(c) * freq;
		float rr = length(p - centre) / sqrt(reach2) * (1.0 + 0.4 * noise(p * 2.0 + seed));
		detail += 0.012 * r.y * exp(-rr * rr * 6.0) * (0.7 + 0.3 * ridged(d, 40.0, 4.0));
	}
}

void paint(vec3 d) {
	float b = abs(d.y);
	float n1 = fbm(d, 2.0, 7.0);
	float n2 = fbm(d + 7.0, 4.0, 6.0);
	albedo = mix(rgb(222, 196, 98), rgb(204, 142, 62), smoothstep(-0.05, 0.25, n1));
	// White sulfur-dioxide frost across the equator; darker, redder poles.
	albedo = mix(albedo, rgb(236, 230, 206), smoothstep(0.0, 0.25, n2) * (1.0 - smoothstep(0.35, 0.75, b)));
	albedo = mix(albedo, rgb(140, 104, 72), smoothstep(0.6, 0.95, b + 0.3 * n1));
	albedo *= 1.0 + 0.12 * fbm(d, 20.0, 6.0);
	paterae(d, 5.0, 0.55, 1.0);
	paterae(d, 11.0, 0.4, 5.0);
	paterae(d, 23.0, 0.25, 9.0);
	// Pele's great red plume ring, and Loki, the largest lava lake.
	albedo = mix(albedo, rgb(186, 70, 40), 0.6 * ring(d, at(255.0, -19.0), 0.32, 0.06) * (0.7 + 0.3 * noise(d * 20.0)));
	albedo = mix(albedo, rgb(28, 24, 20), spot(d, at(309.0, 13.0), 0.1));
	massifs(d, 4.0, 0.3, 3.0);
	hills(d, 0.003);
}`,
	},
	europa: {
		ice: 0.8,
		relief: 1.4,
		paint: `
void paint(vec3 d) {
	vec3 ice = rgb(232, 224, 208);
	vec3 brown = rgb(150, 104, 72);
	albedo = ice;
	// The trailing side is darker and redder, stained by sulfur from Io.
	hemispheres(d, vec3(1.02, 1.02, 1.03), vec3(0.88, 0.82, 0.76));
	// Chaos terrain: ice rafts broken up and refrozen in brownish matrix.
	float chaos = patches(d, 3.0, 0.25, 2.0);
	albedo = mix(albedo, mix(brown, ice, 0.5 + 0.3 * fbm(d, 60.0, 5.0)), chaos * 0.8);
	detail += chaos * 0.004 * ridged(d, 40.0, 5.0);
	// Lineae: long reddish bands with a bright centre line, raised as double ridges.
	float core;
	float bands = lineae(d, 40.0, 1.0, NORTH, 0.0, 0.003, 0.012, core);
	albedo = mix(albedo, brown, bands * 0.7);
	albedo = mix(albedo, ice, core * 0.6);
	detail += 0.003 * (bands - core);
	// Ridged plains: crossing sets of fine ridges.
	for (int k = 0; k < 3; k++) {
		vec3 axis = normalize(hash33(vec3(float(k), 9.0, 2.0)) * 2.0 - 1.0);
		float x = dot(d, axis) * 180.0 + 2.0 * noise(d * 12.0 + float(k));
		float ridge = exp(-pow((fract(x) - 0.5) / 0.1, 2.0)) * smoothstep(0.0, 0.25, noise(d * 3.0 + float(k) * 5.0));
		ridge *= resolvable(0.004);
		detail += 0.0008 * ridge;
		albedo *= 1.0 - 0.1 * ridge;
	}
	craters(d, 3.0, 0.04, 0.6, 3.0);
	applyCraters(1.0, rgb(245, 242, 235), 0.8);
	// Pwyll, a young crater whose rays cross a quarter of the moon.
	albedo = mix(albedo, rgb(246, 244, 240), 0.7 * rayCrater(d, at(271.0, -25.0), 0.017, 0.6, 2.0));
	albedo *= 1.0 + 0.06 * fbm(d, 30.0, 6.0);
	hills(d, 0.0015);
}`,
	},
	ganymede: {
		ice: 0.6,
		paint: `
void paint(vec3 d) {
	vec3 dark = rgb(104, 94, 84);
	vec3 light = rgb(178, 170, 160);
	// Old dark polygons, split by younger bright lanes of grooved terrain.
	vec3 region;
	vec2 f = worley(d * 1.7 + 3.0, region);
	float isDark = step(hash13(region + 1.0), 0.38);
	// Galileo Regio, the largest dark region.
	isDark = max(isDark, 1.0 - smoothstep(0.5, 0.6, angleTo(d, at(145.0, 20.0)) + 0.08 * noise(d * 4.0)));
	float darkMask = isDark * smoothstep(0.02, 0.1, f.y - f.x);
	float bright = 1.0 - darkMask;
	vec3 swath;
	worley(d * 4.5 + 9.0, swath);
	vec3 axis = normalize(hash33(swath * 2.3) * 2.0 - 1.0);
	float x = dot(d, axis);
	float groove = 0.5 + 0.5 * sin(x * 140.0 + 3.0 * noise(d * 8.0));
	float fine = 0.5 + 0.5 * sin(x * 420.0);
	detail += bright * (0.0025 * groove * resolvable(0.01) + 0.0008 * fine * resolvable(0.004));
	albedo = mix(dark, light * (0.92 + 0.12 * hash13(swath)), bright);
	albedo *= 1.0 + bright * 0.08 * (groove - 0.5) * resolvable(0.01);
	// Furrows: old arcs left by an ancient impact, across the dark terrain.
	float furrow = exp(-pow((fract(angleTo(d, at(170.0, -20.0)) * 22.0) - 0.5) / 0.1, 2.0));
	detail -= darkMask * 0.002 * furrow * resolvable(0.02);
	// Frost caps above about 40 degrees.
	albedo = mix(albedo, rgb(214, 210, 204), smoothstep(0.62, 0.85, abs(d.y) + 0.1 * noise(d * 6.0)) * 0.7);
	craters(d, 2.5, 0.35, 0.12, 4.0);
	applyCraters(mix(0.4, 1.0, darkMask), rgb(222, 218, 210), 0.9);
	albedo = mix(albedo, rgb(236, 234, 228), 0.8 * rayCrater(d, at(166.0, -38.0), 0.026, 0.45, 4.0));
	grain(d, 0.07);
	hills(d, 0.002);
}`,
	},
	callisto: {
		ice: 0.3,
		paint: `
void paint(vec3 d) {
	albedo = rgb(100, 92, 82);
	albedo = mix(albedo, rgb(80, 72, 64), patches(d, 3.0, 0.4, 1.0) * 0.6);
	// Valhalla and Asgard: bright centres ringed by concentric troughs.
	float valhalla = basin(d, at(56.0, 14.0), 0.13, 0.008, -0.3, 0.0, 9.0);
	albedo = mix(albedo, rgb(152, 142, 128), (1.0 - smoothstep(0.7, 1.3, valhalla)) * 0.7);
	float asgard = basin(d, at(140.0, 32.0), 0.08, 0.008, -0.3, 0.0, 6.0);
	albedo = mix(albedo, rgb(142, 132, 120), (1.0 - smoothstep(0.7, 1.3, asgard)) * 0.6);
	// Saturated with craters; fresh ones dig through the dark dust to bright ice.
	craters(d, 2.6, 0.95, 0.12, 5.0);
	applyCraters(1.0, rgb(198, 190, 178), 0.85);
	grain(d, 0.08);
	hills(d, 0.002);
}`,
	},
	mimas: {
		axes: [1, 0.92, 0.95],
		ice: 0.7,
		relief: 1.2,
		paint: `
void paint(vec3 d) {
	albedo = rgb(200, 198, 194);
	// Herschel: a third of the moon wide, 10 km deep, with a central peak.
	float rr = basin(d, at(248.0, -1.4), 0.35, 0.075, -0.7, 0.55, 0.0);
	albedo *= mix(0.93, 1.0, smoothstep(0.3, 1.0, rr));
	craters(d, 3.0, 0.9, 0.03, 6.0);
	applyCraters(1.0, rgb(230, 230, 228), 0.5);
	hills(d, 0.004);
	grain(d, 0.05);
}`,
	},
	enceladus: {
		axes: [1, 0.97, 0.98],
		ice: 0.9,
		paint: `
void paint(vec3 d) {
	float lat = asin(d.y);
	albedo = rgb(242, 244, 246);
	// Old cratered ground in the north and along the planet-facing meridians; young plains elsewhere.
	float old = smoothstep(0.1, 0.4, d.y + 0.25 * abs(d.x) + 0.15 * noise(d * 3.0));
	craters(d, 4.0, 0.8, 0.0, 7.0);
	applyCraters(old * 0.6, albedo, 0.0);
	// Ridged plains: domains of parallel ridges and troughs.
	vec3 domain;
	worley(d * 3.0, domain);
	vec3 axis = normalize(hash33(domain * 1.7) * 2.0 - 1.0);
	float plains = (1.0 - old) * smoothstep(-1.0, -0.85, lat);
	detail += plains * 0.003 * (1.0 - abs(sin(dot(d, axis) * 90.0 + 2.0 * noise(d * 6.0)))) * resolvable(0.01);
	// South polar terrain, ringed by folded ridges near 55 degrees south.
	float spt = 1.0 - smoothstep(-0.98, -0.9, lat + 0.03 * noise(d * 8.0));
	detail += 0.004 * exp(-pow((lat + 0.96) / 0.03, 2.0)) * (0.5 + 0.5 * sin(atan(d.z, d.x) * 14.0));
	albedo = mix(albedo, rgb(226, 236, 242), spt * 0.4);
	// Tiger stripes: four parallel fractures about 35 km apart and 130 km long, venting the plumes.
	vec2 q = mat2(0.878, -0.479, 0.479, 0.878) * d.xz;
	float stripes = 0.0;
	float flanks = 0.0;
	for (int k = 0; k < 4; k++) {
		float y = (float(k) - 1.5) * 0.14 + 0.04 * sin(q.x * 9.0 + float(k));
		float along = 1.0 - smoothstep(0.2, 0.28, abs(q.x + 0.03 * float(k)));
		stripes = max(stripes, exp(-pow((q.y - y) / 0.012, 2.0)) * along);
		flanks = max(flanks, exp(-pow((abs(q.y - y) - 0.022) / 0.008, 2.0)) * along);
	}
	stripes *= spt;
	flanks *= spt;
	albedo = mix(albedo, rgb(150, 178, 192), stripes * 0.8);
	detail += 0.002 * flanks - 0.004 * stripes;
	grain(d, 0.02);
	hills(d, 0.002);
}`,
	},
	tethys: {
		ice: 0.8,
		paint: `
void paint(vec3 d) {
	vec3 odysseus = at(128.9, 32.8);
	albedo = rgb(214, 212, 208);
	// A darker, bluish lens along the equator of the leading side.
	float lens = smoothstep(0.2, 0.75, dot(d, LEADING)) * (1.0 - smoothstep(0.15, 0.4, abs(d.y)));
	albedo = mix(albedo, rgb(178, 184, 194), lens * 0.6);
	hemispheres(d, vec3(1.0), vec3(0.94, 0.92, 0.9));
	// Odysseus: two-fifths of the moon wide, its floor long since relaxed flat.
	basin(d, odysseus, 0.42, 0.03, -0.25, 0.25, 0.0);
	// Ithaca Chasma runs three-quarters of the way around, on the great circle 90 degrees from Odysseus.
	vec3 from = normalize(cross(odysseus, NORTH));
	chasm(d, from, normalize(cross(odysseus, from)), 4.7, 0.09, 0.008);
	craters(d, 3.0, 0.85, 0.03, 8.0);
	applyCraters(1.0, rgb(236, 236, 234), 0.5);
	hills(d, 0.003);
	grain(d, 0.04);
}`,
	},
	dione: {
		ice: 0.7,
		paint: `
void paint(vec3 d) {
	albedo = rgb(200, 198, 194);
	float trailing = smoothstep(0.1, -0.5, dot(d, LEADING));
	albedo *= mix(1.0, 0.82, trailing);
	// The wispy terrain: bright ice cliffs along subparallel fractures across the trailing side.
	float core;
	float cliffs = lineae(d, 28.0, 2.0, NEAR, 0.75, 0.002, 0.007, core);
	albedo = mix(albedo, rgb(244, 244, 240), max(cliffs * 0.5, core) * trailing);
	detail -= 0.003 * cliffs * trailing;
	craters(d, 3.0, 0.85, 0.04, 9.0);
	applyCraters(mix(1.0, 0.55, trailing), rgb(232, 232, 228), 0.5);
	// Evander, a broad relaxed basin near the south pole.
	basin(d, at(145.0, -57.0), 0.31, 0.02, -0.3, 0.2, 0.0);
	hills(d, 0.003);
	grain(d, 0.05);
}`,
	},
	rhea: {
		ice: 0.7,
		paint: `
void paint(vec3 d) {
	albedo = rgb(178, 176, 172);
	float trailing = smoothstep(0.1, -0.5, dot(d, LEADING));
	albedo *= mix(1.0, 0.85, trailing);
	float core;
	float cliffs = lineae(d, 18.0, 6.0, NEAR, 0.7, 0.002, 0.006, core);
	albedo = mix(albedo, rgb(228, 228, 224), max(cliffs * 0.35, core * 0.7) * trailing);
	craters(d, 2.6, 0.95, 0.03, 10.0);
	applyCraters(1.0, rgb(220, 218, 214), 0.6);
	// Tirawa, an old basin, and Inktomi, a young crater with bright rays.
	basin(d, at(151.0, 34.0), 0.28, 0.015, -0.35, 0.2, 0.0);
	albedo = mix(albedo, rgb(240, 240, 236), 0.85 * rayCrater(d, at(112.0, -14.0), 0.031, 0.5, 6.0));
	hills(d, 0.003);
	grain(d, 0.05);
}`,
	},
	titan: {
		ice: 1,
		wrap: 0.3,
		relief: 0,
		haze: true,
		paint: `
void paint(vec3 d) {
	float lat = asin(d.y);
	albedo = rgb(206, 140, 66);
	// Soft bands in the haze, a darker hood over the north pole, and a brighter southern half.
	albedo *= 1.0 + 0.04 * sin(lat * 7.0 + 0.6 * noise(d * 2.0));
	albedo = mix(albedo, rgb(150, 100, 56), smoothstep(0.85, 1.15, lat) * 0.6);
	albedo *= 1.0 + 0.04 * smoothstep(0.2, -0.8, d.y);
	// The faintest hint of the ground: bright Xanadu and the dark equatorial dune seas.
	float ground = 0.05 * (1.0 - smoothstep(0.35, 0.6, angleTo(d, at(100.0, -10.0))));
	ground -= 0.04 * (1.0 - smoothstep(0.2, 0.45, abs(d.y))) * smoothstep(0.0, 0.2, fbm(d, 2.0, 4.0));
	albedo *= 1.0 + ground;
}`,
	},
	iapetus: {
		axes: [1, 0.955, 1],
		ice: 0.5,
		paint: `
void paint(vec3 d) {
	float lat = asin(d.y);
	float lead = dot(d, LEADING);
	craters(d, 2.4, 0.85, 0.02, 11.0);
	// Cassini Regio: dark, reddish-brown dust swept onto the leading side, stretched along the equator.
	float m = lead - pow(abs(lat) / 0.9, 2.0) * 0.55 + 0.18 * fbm(d, 3.0, 4.0) + 0.1 * fbm(d, 14.0, 5.0);
	float core = smoothstep(0.1, 0.18, m);
	// Across the boundary, dark material collects in crater floors and patches.
	float transition = smoothstep(-0.35, 0.12, m) * (1.0 - core);
	float spots = transition * max(craterFloor, smoothstep(0.1, 0.35, fbm(d, 25.0, 4.0)));
	albedo = mix(rgb(222, 214, 196), rgb(64, 44, 30) * (0.9 + 0.2 * noise(d * 40.0)), max(core, spots));
	applyCraters(1.0, albedo, 0.0);
	// The equatorial ridge, up to 20 km high, in broken segments.
	float ridge = exp(-pow((lat + 0.01 * noise(d * 10.0)) / 0.02, 2.0)) * smoothstep(-0.5, 0.0, lead);
	shape += 0.02 * ridge * (0.6 + 0.4 * smoothstep(-0.2, 0.3, noise(d * 6.0)));
	// Turgis and Engelier, two of its great basins.
	basin(d, at(28.0, 17.0), 0.39, 0.03, -0.4, 0.15, 0.0);
	basin(d, at(264.0, -43.0), 0.34, 0.025, -0.4, 0.15, 0.0);
	hills(d, 0.004);
}`,
	},
	miranda: {
		ice: 0.7,
		relief: 1.3,
		paint: `
// A corona: an oval or chevron-shaped block ringed by parallel ridges and grooves in light and dark bands.
float corona(vec3 d, vec3 centre, vec3 major, float a, float b, float chevron, float freq) {
	vec3 c = normalize(centre);
	if (dot(d, c) < 0.3) return 0.0;
	vec3 t1 = normalize(major - c * dot(major, c));
	vec3 t2 = cross(c, t1);
	vec2 q = vec2(dot(d, t1), dot(d, t2)) / vec2(a, b);
	float e = mix(length(q), (abs(q.x) + abs(q.y)) * 0.8, chevron) * (1.0 + 0.04 * noise(d * 10.0));
	float inside = 1.0 - smoothstep(0.96, 1.04, e);
	float belt = smoothstep(0.4, 0.6, e) * inside;
	float bands = sin(e * freq);
	albedo *= 1.0 + belt * 0.28 * bands;
	detail += belt * 0.004 * bands;
	albedo *= 1.0 + (1.0 - belt) * inside * 0.12 * noise(d * 30.0);
	float vee = exp(-pow((q.y + 0.7 * abs(q.x) - 0.15) / 0.08, 2.0)) * inside * chevron;
	albedo = mix(albedo, rgb(236, 234, 228), vee * 0.7);
	return inside;
}

void paint(vec3 d) {
	albedo = rgb(180, 176, 170);
	craters(d, 3.0, 0.7, 0.02, 12.0);
	float inside = corona(d, at(90.0, -20.0), NORTH, 0.55, 0.38, 0.0, 26.0);
	inside = max(inside, corona(d, at(270.0, -15.0), NORTH, 0.5, 0.35, 0.0, 22.0));
	inside = max(inside, corona(d, at(30.0, -60.0), LEADING, 0.42, 0.42, 1.0, 18.0));
	applyCraters(1.0 - inside * 0.8, rgb(210, 206, 200), 0.4);
	// Verona Rupes, a cliff about 20 km high.
	chasm(d, at(350.0, -20.0), at(10.0, -45.0), 0.6, 0.03, 0.05);
	hills(d, 0.006);
}`,
	},
	ariel: {
		ice: 0.75,
		paint: `
void paint(vec3 d) {
	albedo = rgb(204, 198, 190);
	craters(d, 4.0, 0.5, 0.06, 13.0);
	applyCraters(0.8, rgb(232, 228, 222), 0.6);
	// A network of wide, flat-floored rift valleys with ridges down their middles.
	float core;
	float graben = lineae(d, 12.0, 4.0, NORTH, 0.0, 0.015, 0.04, core);
	detail -= 0.006 * graben;
	detail += 0.003 * core;
	albedo = mix(albedo, rgb(186, 182, 176), graben * 0.4);
	hills(d, 0.004);
	grain(d, 0.04);
}`,
	},
	umbriel: {
		ice: 0.3,
		paint: `
void paint(vec3 d) {
	albedo = rgb(84, 82, 80);
	craters(d, 2.6, 0.95, 0.02, 14.0);
	applyCraters(1.0, rgb(112, 110, 106), 0.5);
	// Wunda, a crater with a bright ring on its floor, the brightest thing on the moon.
	basin(d, at(86.0, -8.0), 0.11, 0.012, -0.6, 0.0, 0.0);
	albedo = mix(albedo, rgb(204, 198, 182), 0.85 * ring(d, at(86.0, -8.0), 0.075, 0.015));
	hills(d, 0.003);
	grain(d, 0.05);
}`,
	},
	titania: {
		ice: 0.6,
		paint: `
void paint(vec3 d) {
	albedo = rgb(166, 158, 150);
	craters(d, 3.2, 0.7, 0.08, 15.0);
	applyCraters(1.0, rgb(210, 204, 196), 0.7);
	// Messina Chasma runs 1500 km; smaller rifts cross it.
	chasm(d, at(330.0, -30.0), at(20.0, -5.0), 1.9, 0.05, 0.006);
	chasm(d, at(40.0, -60.0), at(80.0, -20.0), 1.0, 0.03, 0.004);
	// Gertrude, the largest basin.
	basin(d, at(73.0, 16.0), 0.2, 0.012, -0.3, 0.2, 0.0);
	hills(d, 0.004);
	grain(d, 0.05);
}`,
	},
	oberon: {
		ice: 0.35,
		paint: `
void paint(vec3 d) {
	albedo = rgb(140, 128, 118);
	craters(d, 2.8, 0.9, 0.08, 16.0);
	// Many crater floors are flooded with dark material.
	albedo = mix(albedo, rgb(70, 62, 58), craterFloor * 0.55);
	applyCraters(1.0, rgb(196, 188, 178), 0.8);
	// Hamlet, with bright rays, and Mommur Chasma.
	albedo = mix(albedo, rgb(214, 208, 198), 0.8 * rayCrater(d, at(316.0, -46.0), 0.074, 0.45, 9.0));
	chasm(d, at(300.0, -16.0), at(340.0, -30.0), 0.9, 0.03, 0.005);
	hills(d, 0.004);
	grain(d, 0.05);
}`,
	},
	proteus: {
		axes: [1, 0.92, 0.93],
		shapeRange: 0.3,
		ice: 0,
		paint: `
void paint(vec3 d) {
	albedo = rgb(70, 66, 62);
	shape += 0.14 * fbm(d, 1.1, 3.0);
	// Pharos, a crater wider than the moon's radius, and older basins that give it its boxy outline.
	basin(d, at(70.0, 10.0), 0.55, 0.12, -0.5, 0.0, 0.0);
	basin(d, at(200.0, 40.0), 0.45, 0.08, -0.5, 0.0, 0.0);
	basin(d, at(300.0, -35.0), 0.5, 0.08, -0.5, 0.0, 0.0);
	craters(d, 3.0, 0.8, 0.02, 17.0);
	applyCraters(1.0, rgb(96, 92, 88), 0.4);
	hills(d, 0.008);
	grain(d, 0.06);
}`,
	},
	triton: {
		ice: 0.85,
		paint: `
// Dark plume deposits: streaks blown northeast from geysers on the polar cap.
float streaks(vec3 d, float freq, float density, float seed) {
	vec3 p = d * freq;
	vec3 base = floor(p - 0.5);
	float best = 0.0;
	for (int i = 0; i < 8; i++) {
		vec3 corner = vec3(mod(float(i), 2.0), mod(floor(float(i) * 0.5), 2.0), floor(float(i) * 0.25));
		vec3 cell = base + corner;
		vec3 r = hash33(cell + seed);
		if (r.x > density) continue;
		vec3 c = cell + hash33(cell.zxy * 1.37 + seed + 11.0);
		float lift = length(c) - freq;
		float reach2 = 0.25 - lift * lift;
		if (reach2 <= 0.0) continue;
		vec3 n = normalize(c);
		vec3 east = normalize(cross(NORTH, n));
		vec3 dir = normalize(east + cross(n, east));
		vec3 off = (p - n * freq) / sqrt(reach2);
		float along = dot(off, dir);
		float across = dot(off, cross(n, dir));
		float s = exp(-pow(across / 0.08, 2.0)) * smoothstep(-0.1, 0.0, along) * (1.0 - smoothstep(0.2, 0.9, along));
		best = max(best, s * (0.5 + 0.5 * r.y));
	}
	return best;
}

void paint(vec3 d) {
	float lat = asin(d.y);
	// The southern polar cap of pinkish nitrogen frost, with a ragged edge.
	float edge = -0.2 + 0.15 * fbm(d, 4.0, 5.0);
	float cap = 1.0 - smoothstep(edge - 0.04, edge + 0.04, lat);
	albedo = mix(rgb(196, 184, 180), rgb(234, 208, 198), cap);
	albedo = mix(albedo, rgb(176, 186, 184), exp(-pow((lat - edge - 0.12) / 0.08, 2.0)) * 0.6);
	albedo = mix(albedo, rgb(92, 70, 68), streaks(d, 14.0, 0.5, 3.0) * cap * 0.75);
	// Cantaloupe terrain: dimpled cells with raised rims, crossed by double ridges.
	float cant = (1.0 - cap) * (1.0 - smoothstep(0.6, 0.85, angleTo(d, at(345.0, 20.0)) + 0.2 * noise(d * 3.0)));
	vec3 cell;
	vec2 f = worley(d * 40.0, cell);
	float rim = 1.0 - smoothstep(0.0, 0.12, f.y - f.x);
	detail += cant * (0.0025 * rim - 0.003 * f.x * f.x) * resolvable(0.025);
	albedo *= 1.0 - cant * 0.06 * rim;
	float core;
	float lines = lineae(d, 10.0, 7.0, NORTH, 0.0, 0.004, 0.008, core);
	detail += (lines - core) * 0.002 * (1.0 - cap);
	albedo *= 1.0 - 0.1 * lines * (1.0 - cap);
	craters(d, 5.0, 0.06, 0.2, 18.0);
	applyCraters(1.0, rgb(240, 232, 228), 0.4);
	hills(d, 0.0015);
}`,
	},
	nereid: {
		axes: [1, 0.88, 0.92],
		shapeRange: 0.15,
		ice: 0.2,
		paint: `
void paint(vec3 d) {
	albedo = rgb(92, 88, 84);
	shape += 0.08 * fbm(d, 1.3, 3.0);
	craters(d, 3.0, 0.75, 0.04, 19.0);
	applyCraters(1.0, rgb(130, 126, 120), 0.5);
	hills(d, 0.006);
	grain(d, 0.05);
}`,
	},
};
