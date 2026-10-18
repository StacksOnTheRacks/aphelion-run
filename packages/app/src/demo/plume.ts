import { Constants } from "@babylonjs/core/Engines/constants";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

/** A plume's size in its parent's units, at full burn. */
export type PlumeShape = { length: number; radius: number };

export type Plume = {
	/** Aim its +Z down the exhaust. Everything else hangs off it. */
	root: TransformNode;
	/** How hard it is firing, from 0 to 1, and whether it may show at all. */
	set: (intensity: number, shown: boolean) => void;
};

/** Below this the engine reads as off. */
const LIT = 0.04;
/** The shaders' clock wraps this often, in seconds, so it keeps its precision on the GPU. */
const CLOCK_WRAP = 600;

const WHITE_HOT = Color3.FromHexString("#FFF8EC");
const GOLD = Color3.FromHexString("#E9C993");
const EMBER = Color3.FromHexString("#E07A2E");

/**
 * Everything is drawn in view space, so it holds up in the mirrored aft views and when the world is
 * drawn around the camera. The meshes are cones along +Z with the nozzle at the origin.
 */
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
 * Light with depth: bright where the cone faces the eye and gone at its silhouette, white at the
 * nozzle and cooling to amber at the tip, with shock bands running outward and a fast flicker.
 */
const FLAME_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 warm;
	uniform vec3 cool;
	uniform float intensity;
	uniform float time;
	uniform float seed;
	uniform float softness;
	varying float vT;
	varying vec3 vViewPosition;
	varying vec3 vViewNormal;
	void main() {
		float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
		float body = pow(facing, softness);
		float tail = pow(1.0 - vT, 1.4) * smoothstep(0.0, 0.12, vT);
		float shock = 0.7 + 0.3 * pow(0.5 + 0.5 * sin(vT * 42.0 - time * 48.0 + seed), 3.0);
		float flicker = 0.88 + 0.12 * sin(time * 37.0 + seed * 5.1) * sin(time * 23.0 + seed);
		vec3 color = mix(hot, warm, smoothstep(0.0, 0.3, vT));
		color = mix(color, cool, smoothstep(0.3, 1.0, vT));
		gl_FragColor = vec4(color * body * tail * shock * flicker * intensity, 1.0);
	}
`;

/**
 * Sparks thrown out of the nozzle. The cone is cut into lanes around its axis; some lanes carry a
 * spark at a time, each streaking outward at its own speed with a short tail and dimming as it goes.
 * The near and far walls carry different lanes, so the sparks read as a spray, not a sheet.
 */
const SPARK_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 cool;
	uniform float intensity;
	uniform float time;
	uniform float seed;
	varying float vT;
	varying vec2 vAcross;
	float hash(float n) {
		return fract(sin(n) * 43758.5453);
	}
	void main() {
		float around = atan(vAcross.y, vAcross.x) / 6.2831853 + 0.5;
		float light = 0.0;
		for (int k = 0; k < 3; k++) {
			float lanes = 14.0 + float(k) * 9.0;
			float lane = floor(around * lanes);
			float id = lane + float(k) * 57.0 + seed * 13.0;
			float live = step(0.45, hash(id + 7.3));
			float speed = 1.4 + 2.2 * hash(id);
			float head = fract(time * speed + hash(id + 3.1));
			float behind = head - vT;
			float trail = step(0.0, behind) * exp(-behind * 26.0);
			float across = fract(around * lanes) - 0.5;
			float thin = exp(-across * across * 160.0);
			light += live * trail * thin * (1.0 - head);
		}
		float ends = smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.7, 1.0, vT));
		vec3 color = mix(hot, cool, smoothstep(0.0, 0.9, vT));
		gl_FragColor = vec4(color * light * ends * intensity * 2.4, 1.0);
	}
`;

/** A quad turned to face the eye in the shader, so every camera sees it square on. */
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

/** The nozzle's glare: a hot point, a soft halo, and a turning star of rays. */
const FLARE_FRAGMENT = `
	precision highp float;
	uniform vec3 hot;
	uniform vec3 warm;
	uniform float intensity;
	uniform float time;
	uniform float seed;
	varying vec2 vCorner;
	void main() {
		float d = length(vCorner);
		float core = exp(-d * d * 18.0);
		float halo = exp(-d * d * 3.5) * 0.35;
		float a = atan(vCorner.y, vCorner.x) + time * 0.4 + seed;
		float rays = pow(abs(cos(a * 2.0)), 48.0) * exp(-d * 2.6) * 0.8;
		rays += pow(abs(cos(a * 3.0 + 0.6)), 80.0) * exp(-d * 4.5) * 0.35;
		float pulse = 0.85 + 0.15 * sin(time * 29.0 + seed * 3.0);
		float edge = 1.0 - smoothstep(0.8, 1.0, d);
		vec3 color = mix(hot, warm, smoothstep(0.0, 0.6, d));
		gl_FragColor = vec4(color * (core + halo + rays) * pulse * edge * intensity, 1.0);
	}
`;

/**
 * An engine's exhaust: a white-hot core inside a wider amber sheath, sparks spraying out past both,
 * and a glare on the nozzle. It is all light, so it adds onto whatever is behind it and never hides it.
 */
export function createPlume(scene: Scene, name: string, shape: PlumeShape, layerMask: number): Plume {
	const root = new TransformNode(`${name}-plume`, scene);
	const seed = Math.random() * 10;

	const finish = (mesh: Mesh, material: ShaderMaterial) => {
		material.backFaceCulling = false;
		material.alphaMode = Constants.ALPHA_ADD;
		material.disableDepthWrite = true;
		material.setFloat("seed", seed);
		mesh.material = material;
		mesh.parent = root;
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.layerMask = layerMask;
		return mesh;
	};

	const flame = (part: string, length: number, nozzle: number, tip: number, softness: number, colors: Color3[]) => {
		const material = new ShaderMaterial(
			`${name}-${part}`,
			scene,
			{ vertexSource: CONE_VERTEX, fragmentSource: FLAME_FRAGMENT },
			{
				attributes: ["position", "normal"],
				uniforms: ["worldView", "worldViewProjection", "span", "hot", "warm", "cool", "intensity", "time", "seed", "softness"],
				needAlphaBlending: true,
			}
		);
		material.setFloat("span", length);
		material.setFloat("softness", softness);
		material.setColor3("hot", colors[0]);
		material.setColor3("warm", colors[1]);
		material.setColor3("cool", colors[2]);
		return { mesh: finish(cone(scene, `${name}-${part}`, length, nozzle, tip), material), material };
	};

	const { length, radius } = shape;
	const core = flame("core", length * 0.55, radius * 0.3, radius * 0.06, 2, [WHITE_HOT, WHITE_HOT, GOLD]);
	const sheath = flame("sheath", length, radius * 0.6, radius * 0.2, 1.2, [WHITE_HOT, GOLD, EMBER]);

	const sparkLength = length * 1.3;
	const sparkMaterial = new ShaderMaterial(
		`${name}-sparks`,
		scene,
		{ vertexSource: CONE_VERTEX, fragmentSource: SPARK_FRAGMENT },
		{
			attributes: ["position", "normal"],
			uniforms: ["worldView", "worldViewProjection", "span", "hot", "cool", "intensity", "time", "seed"],
			needAlphaBlending: true,
		}
	);
	sparkMaterial.setFloat("span", sparkLength);
	sparkMaterial.setColor3("hot", WHITE_HOT);
	sparkMaterial.setColor3("cool", EMBER);
	const sparks = finish(cone(scene, `${name}-sparks`, sparkLength, radius * 0.3, radius * 1.6), sparkMaterial);

	const flareMaterial = new ShaderMaterial(
		`${name}-flare`,
		scene,
		{ vertexSource: FLARE_VERTEX, fragmentSource: FLARE_FRAGMENT },
		{
			attributes: ["position"],
			uniforms: ["worldView", "projection", "size", "hot", "warm", "intensity", "time", "seed"],
			needAlphaBlending: true,
		}
	);
	flareMaterial.setColor3("hot", WHITE_HOT);
	flareMaterial.setColor3("warm", GOLD);
	const flare = finish(MeshBuilder.CreatePlane(`${name}-flare`, { size: 1 }, scene), flareMaterial);

	const meshes = [core.mesh, sheath.mesh, sparks, flare];
	const materials = [core.material, sheath.material, sparkMaterial, flareMaterial];
	const born = performance.now();
	let lit: boolean | null = null;

	return {
		root,
		set(intensity, shown) {
			const on = shown && intensity > LIT;
			if (on !== lit) {
				lit = on;
				for (const mesh of meshes) {
					mesh.setEnabled(on);
				}
			}
			if (!on) {
				return;
			}
			const time = ((performance.now() - born) / 1000) % CLOCK_WRAP;
			for (const material of materials) {
				material.setFloat("time", time);
				material.setFloat("intensity", intensity);
			}
			const width = 0.55 + 0.45 * intensity;
			const reach = Math.max(0.08, intensity);
			core.mesh.scaling.set(width, width, reach);
			sheath.mesh.scaling.set(width, width, reach);
			sparks.scaling.set(width, width, 0.4 + 0.6 * intensity);
			flareMaterial.setFloat("size", radius * (1.6 + 1.4 * intensity));
		},
	};
}

/** An open cone along +Z, `nozzle` wide at the origin and `tip` wide at `length`. */
function cone(scene: Scene, name: string, length: number, nozzle: number, tip: number): Mesh {
	const mesh = MeshBuilder.CreateCylinder(
		name,
		{ height: length, diameterBottom: nozzle * 2, diameterTop: tip * 2, tessellation: 24, cap: Mesh.NO_CAP },
		scene
	);
	mesh.bakeTransformIntoVertices(Matrix.Translation(0, length / 2, 0).multiply(Matrix.RotationX(Math.PI / 2)));
	return mesh;
}
