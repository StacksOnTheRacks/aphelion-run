import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/**
 * The mining laser, in the same light as the engine plumes: white at the muzzle, gold through the
 * body, ember where it meets the target. A wide cone washes forward and a thin beam pulses down
 * its middle. Sparks streak out of the muzzle, and a flare sits at each end.
 *
 * The meshes are on the world layer, not the hull's. The windscreen does not draw the ship, and the
 * beam is the thing ahead of the glass. It is drawn in view space, so a mirrored camera still sees it.
 */

/** Radii in world units. The cone is narrow at the muzzle and wider where it lands. */
export type BeamShape = { core: number; coneNear: number; coneFar: number; flare: number };

/** How often a mine's own laser repeats, and how long each burst lasts. */
export const MINE_FIRE_PERIOD = 5;
export const MINE_FIRE_SECONDS = 3;

/**
 * Whether a mine is in the firing part of its cycle. `phase` staggers one mine from the next,
 * in seconds. Siphoning is not part of this: the caller holds the beam off while a ship draws.
 */
export function mineFiring(elapsed: number, phase: number): boolean {
	const period = MINE_FIRE_PERIOD;
	const turn = (elapsed + phase) % period;
	const wrapped = turn < 0 ? turn + period : turn;
	return wrapped < MINE_FIRE_SECONDS;
}

/**
 * The mine's own shot, from the face toward the body to the body's surface.
 * `mine` and `body` are centers. Null when the mine is not outside the surface.
 */
export function mineBeamSpan(
	mine: Vector3,
	body: Vector3,
	bodyRadius: number,
	faceInset: number
): { from: Vector3; to: Vector3 } | null {
	if (bodyRadius <= 0 || faceInset < 0) {
		return null;
	}
	const toward = body.subtract(mine);
	const distance = toward.length();
	const gap = distance - bodyRadius - faceInset;
	if (distance < 1e-6 || gap < 1e-4) {
		return null;
	}
	const dir = toward.scale(1 / distance);
	return {
		from: mine.add(dir.scale(faceInset)),
		to: body.subtract(dir.scale(bodyRadius)),
	};
}

export type SiphonBeam = {
	/** Ease toward on or off. `from` is the muzzle and `to` is the face it hits, both in world space. */
	set: (on: boolean, from: Vector3, to: Vector3, deltaSeconds: number) => void;
};

/** Below this the laser reads as off, the same threshold as a plume. */
const LIT = 0.04;
/** The shaders' clock wraps this often, in seconds, so it keeps its precision on the GPU. */
const CLOCK_WRAP = 600;

const WHITE_HOT = Color3.FromHexString("#FFF8EC");
const GOLD = Color3.FromHexString("#E9C993");
const EMBER = Color3.FromHexString("#E07A2E");

/**
 * Where the beam stops. `forward` points from the ship toward the block, and the face sits `inset`
 * back from `center` along that direction. Null when the muzzle is not in front of that face.
 */
export function beamEnd(from: Vector3, center: Vector3, forward: Vector3, inset: number): Vector3 | null {
	const length = forward.length();
	if (length < 1e-8 || inset < 0) {
		return null;
	}
	const normal = forward.scale(1 / length);
	const face = center.subtract(normal.scale(inset));
	const reach = face.subtract(from);
	if (Vector3.Dot(reach, normal) < 1e-4 || reach.lengthSquared() < 1e-8) {
		return null;
	}
	return face;
}

/** Everything is drawn in view space. The cones run along +Z with the muzzle at the origin. */
const CONE_VERTEX = `
	precision highp float;
	attribute vec3 position;
	attribute vec3 normal;
	uniform mat4 worldView;
	uniform mat4 worldViewProjection;
	uniform float span;
	varying float vT;
	varying vec2 vAcross;
	varying vec3 vViewPosition;
	varying vec3 vViewNormal;
	void main() {
		gl_Position = worldViewProjection * vec4(position, 1.0);
		vT = clamp(position.z / span, 0.0, 1.0);
		vAcross = position.xy;
		vViewPosition = (worldView * vec4(position, 1.0)).xyz;
		vViewNormal = mat3(worldView) * normal;
	}
`;

/**
 * The wash: bright where the cone faces the eye, white at the muzzle and cooling to ember at the
 * target, with a slow breathe. Wider and softer than the beam down its middle.
 */
const CONE_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 warm;
	uniform vec3 cool;
	uniform float intensity;
	uniform float time;
	varying float vT;
	varying vec3 vViewPosition;
	varying vec3 vViewNormal;
	void main() {
		float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
		float body = pow(facing, 1.15);
		float along = pow(1.0 - vT, 0.65) * smoothstep(0.0, 0.04, vT);
		float breathe = 0.82 + 0.18 * sin(time * 3.2);
		vec3 color = mix(hot, warm, smoothstep(0.0, 0.35, vT));
		color = mix(color, cool, smoothstep(0.45, 1.0, vT));
		gl_FragColor = vec4(color * body * along * breathe * intensity * 0.55, 1.0);
	}
`;

/** The beam itself: a tight core, packets of light running forward, and a pulse that reads as one beat. */
const BEAM_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 warm;
	uniform float intensity;
	uniform float time;
	varying float vT;
	varying vec3 vViewPosition;
	varying vec3 vViewNormal;
	void main() {
		float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
		float body = pow(facing, 2.6);
		float along = smoothstep(0.0, 0.02, vT);
		float packet = pow(0.5 + 0.5 * sin(vT * 34.0 - time * 18.0), 6.0);
		float pulse = 0.42 + 0.58 * pow(0.5 + 0.5 * sin(time * 7.5), 1.5);
		vec3 color = mix(hot, warm, smoothstep(0.72, 1.0, vT));
		float light = body * along * (0.72 + 0.28 * packet) * pulse;
		gl_FragColor = vec4(color * light * intensity, 1.0);
	}
`;

/** Sparks leaving the muzzle and dying as they reach the target. Narrower than an engine's spray. */
const SPARK_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 cool;
	uniform float intensity;
	uniform float time;
	varying float vT;
	varying vec2 vAcross;
	float hash(float n) {
		return fract(sin(n) * 43758.5453);
	}
	void main() {
		float around = atan(vAcross.y, vAcross.x) / 6.2831853 + 0.5;
		float light = 0.0;
		for (int k = 0; k < 2; k++) {
			float lanes = 10.0 + float(k) * 7.0;
			float lane = floor(around * lanes);
			float id = lane + float(k) * 41.0;
			float live = step(0.55, hash(id + 2.0));
			float speed = 1.1 + 1.6 * hash(id + 4.0);
			float head = fract(time * speed + hash(id + 1.7));
			float behind = head - vT;
			float trail = step(0.0, behind) * exp(-behind * 22.0);
			float across = fract(around * lanes) - 0.5;
			float thin = exp(-across * across * 220.0);
			light += live * trail * thin * (1.0 - head);
		}
		float ends = smoothstep(0.0, 0.05, vT) * (1.0 - smoothstep(0.82, 1.0, vT));
		vec3 color = mix(hot, cool, smoothstep(0.15, 1.0, vT));
		gl_FragColor = vec4(color * light * ends * intensity * 1.8, 1.0);
	}
`;

/** A quad turned to face the eye, so the flare stays round from every camera. */
const FLARE_VERTEX = `
	precision highp float;
	attribute vec3 position;
	uniform mat4 worldView;
	uniform mat4 projection;
	uniform float size;
	varying vec2 vCorner;
	void main() {
		float unit = length(mat3(worldView)[0]);
		vec4 center = worldView * vec4(0.0, 0.0, 0.0, 1.0);
		vCorner = position.xy * 2.0;
		gl_Position = projection * vec4(center.xyz + vec3(position.xy * size * unit, 0.0), 1.0);
	}
`;

/** The same nozzle glare as an engine: a hot point, a soft halo, and a slow star of rays. */
const FLARE_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 warm;
	uniform float intensity;
	uniform float time;
	uniform float pulseRate;
	varying vec2 vCorner;
	void main() {
		float d = length(vCorner);
		float core = exp(-d * d * 18.0);
		float halo = exp(-d * d * 3.2) * 0.4;
		float a = atan(vCorner.y, vCorner.x) + time * 0.35;
		float rays = pow(abs(cos(a * 2.0)), 48.0) * exp(-d * 2.6) * 0.7;
		float pulse = 0.78 + 0.22 * sin(time * pulseRate);
		float edge = 1.0 - smoothstep(0.8, 1.0, d);
		vec3 color = mix(hot, warm, smoothstep(0.0, 0.55, d));
		gl_FragColor = vec4(color * (core + halo + rays) * pulse * edge * intensity, 1.0);
	}
`;

export function createSiphonBeam(scene: Scene, shape: BeamShape, name = "siphon"): SiphonBeam {
	const root = new TransformNode(`${name}-beam`, scene);
	root.rotationQuaternion = new Quaternion();

	const finish = (mesh: Mesh, material: ShaderMaterial) => {
		material.backFaceCulling = false;
		material.alphaMode = Constants.ALPHA_ADD;
		material.disableDepthWrite = true;
		mesh.material = material;
		mesh.parent = root;
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;
		return mesh;
	};

	const coneMesh = cone(scene, `${name}-cone`, 1, shape.coneNear, shape.coneFar);
	const coneMaterial = new ShaderMaterial(
		`${name}-cone`,
		scene,
		{ vertexSource: CONE_VERTEX, fragmentSource: CONE_FRAGMENT },
		{
			attributes: ["position", "normal"],
			uniforms: ["worldView", "worldViewProjection", "span", "hot", "warm", "cool", "intensity", "time"],
			needAlphaBlending: true,
		}
	);
	coneMaterial.setFloat("span", 1);
	coneMaterial.setColor3("hot", WHITE_HOT);
	coneMaterial.setColor3("warm", GOLD);
	coneMaterial.setColor3("cool", EMBER);
	finish(coneMesh, coneMaterial);

	const beamMesh = cone(scene, `${name}-core`, 1, shape.core, shape.core * 0.75);
	const beamMaterial = new ShaderMaterial(
		`${name}-core`,
		scene,
		{ vertexSource: CONE_VERTEX, fragmentSource: BEAM_FRAGMENT },
		{
			attributes: ["position", "normal"],
			uniforms: ["worldView", "worldViewProjection", "span", "hot", "warm", "intensity", "time"],
			needAlphaBlending: true,
		}
	);
	beamMaterial.setFloat("span", 1);
	beamMaterial.setColor3("hot", WHITE_HOT);
	beamMaterial.setColor3("warm", GOLD);
	finish(beamMesh, beamMaterial);

	const sparkMesh = cone(scene, `${name}-sparks`, 1, shape.core * 1.4, shape.coneFar * 0.55);
	const sparkMaterial = new ShaderMaterial(
		`${name}-sparks`,
		scene,
		{ vertexSource: CONE_VERTEX, fragmentSource: SPARK_FRAGMENT },
		{
			attributes: ["position", "normal"],
			uniforms: ["worldView", "worldViewProjection", "span", "hot", "cool", "intensity", "time"],
			needAlphaBlending: true,
		}
	);
	sparkMaterial.setFloat("span", 1);
	sparkMaterial.setColor3("hot", WHITE_HOT);
	sparkMaterial.setColor3("cool", EMBER);
	finish(sparkMesh, sparkMaterial);

	const flare = (name: string, at: number, size: number, pulseRate: number) => {
		const material = new ShaderMaterial(
			name,
			scene,
			{ vertexSource: FLARE_VERTEX, fragmentSource: FLARE_FRAGMENT },
			{
				attributes: ["position"],
				uniforms: ["worldView", "projection", "size", "hot", "warm", "intensity", "time", "pulseRate"],
				needAlphaBlending: true,
			}
		);
		material.setColor3("hot", WHITE_HOT);
		material.setColor3("warm", GOLD);
		material.setFloat("pulseRate", pulseRate);
		material.setFloat("size", size);
		const mesh = finish(MeshBuilder.CreatePlane(name, { size: 1 }, scene), material);
		mesh.position.z = at;
		return { mesh, material };
	};
	const muzzleFlare = flare(`${name}-muzzle`, 0, shape.flare, 7.5);
	const impactFlare = flare(`${name}-impact`, 1, shape.flare * 1.35, 7.5);

	const meshes = [coneMesh, beamMesh, sparkMesh, muzzleFlare.mesh, impactFlare.mesh];
	const materials = [coneMaterial, beamMaterial, sparkMaterial, muzzleFlare.material, impactFlare.material];
	for (const mesh of meshes) {
		mesh.setEnabled(false);
	}
	const born = performance.now();
	const direction = new Vector3();
	const lastFrom = new Vector3();
	const lastTo = new Vector3();
	let hasSpan = false;
	let intensity = 0;
	let lit: boolean | null = null;

	return {
		set(on, from, to, deltaSeconds) {
			direction.copyFrom(to).subtractInPlace(from);
			if (direction.lengthSquared() > 1e-8) {
				lastFrom.copyFrom(from);
				lastTo.copyFrom(to);
				hasSpan = true;
			}
			direction.copyFrom(hasSpan ? lastTo : to).subtractInPlace(hasSpan ? lastFrom : from);
			const reach = direction.length();
			const live = on && reach > 1e-4;
			const follow = deltaSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds * 10);
			intensity += ((live ? 1 : 0) - intensity) * follow;
			const shown = intensity > LIT && reach > 1e-4;
			if (shown !== lit) {
				lit = shown;
				for (const mesh of meshes) {
					mesh.setEnabled(shown);
				}
			}
			if (!shown) {
				return;
			}
			direction.scaleInPlace(1 / reach);
			root.position.copyFrom(hasSpan ? lastFrom : from);
			root.rotationQuaternion = beamRotation(direction);
			root.scaling.set(1, 1, reach);
			const time = ((performance.now() - born) / 1000) % CLOCK_WRAP;
			const width = 0.72 + 0.28 * intensity;
			coneMesh.scaling.set(width, width, 1);
			beamMesh.scaling.set(width, width, 1);
			for (const material of materials) {
				material.setFloat("time", time);
				material.setFloat("intensity", intensity);
			}
			muzzleFlare.material.setFloat("size", shape.flare * (0.85 + 0.35 * intensity));
			impactFlare.material.setFloat("size", shape.flare * 1.35 * (0.85 + 0.35 * intensity));
		},
	};
}

/** Points the cone's +Z along `direction`. The left-handed look turns that axis the other way. */
export function beamRotation(direction: Vector3): Quaternion {
	const hint = Math.abs(direction.y) > 0.85 ? Vector3.Right() : Vector3.Up();
	return Quaternion.FromLookDirectionRH(direction, hint);
}

/** An open cone along +Z, `nozzle` wide at the origin and `tip` wide at `length`. */
function cone(scene: Scene, name: string, length: number, nozzle: number, tip: number): Mesh {
	const mesh = MeshBuilder.CreateCylinder(
		name,
		{ height: length, diameterBottom: nozzle * 2, diameterTop: tip * 2, tessellation: 20, cap: Mesh.NO_CAP },
		scene
	);
	mesh.bakeTransformIntoVertices(Matrix.Translation(0, length / 2, 0).multiply(Matrix.RotationX(Math.PI / 2)));
	return mesh;
}
