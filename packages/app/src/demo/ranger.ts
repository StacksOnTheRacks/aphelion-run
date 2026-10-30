import type { Camera } from "@babylonjs/core/Cameras/camera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Space } from "@babylonjs/core/Maths/math.axis";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ReflectionProbe } from "@babylonjs/core/Probes/reflectionProbe";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";
import type { Scene } from "@babylonjs/core/scene";

import "@babylonjs/loaders/glTF";

import { beamEnd, createSiphonBeam } from "./laser";
import { createPlume, type Plume } from "./plume";
import { plumesFor, type Drive, type Plumes } from "./thrust";

/**
 * Length of the ranger, in world units. About a twelfth of the smallest moon, and a little
 * shorter than a dock, so the hull reads as a craft sitting on the pad. The cockpit cameras are sized
 * in hull lengths, so the pilot's view keeps the same framing.
 */
export const HULL_LENGTH = 0.04;

/**
 * The hull, its plumes, and its beacon are drawn on this layer and nothing else is. The aft views
 * draw the ship with their own near plane, over the world. The windscreen draws none of it: the
 * nose would fill the seat, and the canopy on this layer is the opaque shell.
 */
export const SHIP_LAYER = 0x10000000;
/**
 * The dash, the deck, and the seat's copy of the canopy. The windscreen draws this and not the
 * hull. The world near plane is too far out for a panel in front of the eye, and the nose would
 * fill the seat. The canopy here is a rim over the picture of space, not the shell outside.
 */
export const COCKPIT_LAYER = 0x80000000;

/**
 * Mounts are in the ship's own units: the nose is +Z, starboard is +X, and the hull is about 17 long.
 * The eye is the middle of the pilot's visor.
 *
 * Each aft camera sits outboard of the hull, above and a little ahead of its side thruster, and looks
 * aft past it. That puts the thruster's plume across the frame when it fires.
 */
const AFT_CAMERA = { out: 0.5, up: 0.9, ahead: 3.5 };
/** The aft cameras splay outboard this far, in radians, so the hull fills only the inside edge. */
const AFT_SPLAY = 0.14;
const AFT_PITCH = 0.06;
/** Fill on the hull while piloting. The Sun rakes across it from the side and leaves the aft views black. */
const AFT_FILL = 0.6;
/**
 * Painted metal, not polished: every surface is at least this rough and at most this metallic. Glossy
 * panels caught the Sun in glints that strobed across the aft views whenever the ship turned.
 * The canopy is the exception. It is the dark metal from the Blender file, and the sky shows in it.
 */
const HULL_ROUGHNESS = 0.8;
const HULL_METALLIC = 0.2;
const CANOPY_COLOR = new Color3(0.22, 0.23, 0.25);
const CANOPY_ROUGHNESS = 0.1;
/**
 * How the seat's glass shows itself. `faceAlpha` is looking straight through the pane, `rimAlpha`
 * is a grazing edge, and `rimPower` is how fast that edge comes on. The shader uses these same
 * numbers. The picture of space is not bent, and the color is only the rim.
 */
export const CANOPY_GLASS = { faceAlpha: 0.035, rimAlpha: 0.32, rimPower: 3 };
/** A dim cool gray. Multiplied by the Fresnel, so the middle of the pane adds no color. */
const CANOPY_RIM = new Color3(0.45, 0.5, 0.56);
/** No sun reaches the seat. This lift keeps the plastic from going pure black. */
const COCKPIT_LIFT = 0.04;
/**
 * Opacity of the seat's canopy. `facing` is 1 looking straight through the pane and 0 along a
 * grazing edge. The glass shader is this same mix.
 */
export function canopyGlassAlpha(facing: number): number {
	const clamped = Math.min(1, Math.max(0, facing));
	const fresnel = (1 - clamped) ** CANOPY_GLASS.rimPower;
	return CANOPY_GLASS.faceAlpha + (CANOPY_GLASS.rimAlpha - CANOPY_GLASS.faceAlpha) * fresnel;
}
/** One face of the sky cube. Taken once, so this cost is paid a single time. */
const SKY_REFLECTION_SIZE = 256;
/**
 * The starfield sits thousands of units out. The aft cameras that draw the hull clip at one unit,
 * and a capture taken with that clip is an empty cube.
 */
const SKY_REFLECTION_NEAR = 0.1;
const SKY_REFLECTION_FAR = 9000;
/** Turns of the main fan each second at full burn. Slow enough that the blades still read. */
const FAN_TURNS = 1.5;

/** The hull replaces the beacon once it covers this many pixels, and comes back below the lower one. */
const HULL_PIXELS_ON = 8;
const HULL_PIXELS_OFF = 6;
/** The distant marker stays this many pixels across, whatever the zoom. */
const BEACON_PIXELS = 5;

const BONE = Color3.FromHexString("#E8E4D9");

/** A heading step larger than this in one frame is a cut to a new course, not a turn. */
const CUT_ANGLE = 0.35;

type Hardpoint = "MainEngine" | "Port" | "Starboard" | "Dorsal" | "Ventral";

/**
 * Exhaust in the ship's space: the nose is +Z, starboard is +X, and up is +Y.
 * Each directional nozzle rakes outward and aft, 45° off the hull, the same angle as its vanes.
 */
const OUT_AND_AFT = Math.SQRT1_2;
const EXHAUST: Record<Hardpoint, Vector3> = {
	MainEngine: new Vector3(0, 0, -1),
	Port: new Vector3(-OUT_AND_AFT, 0, -OUT_AND_AFT),
	Starboard: new Vector3(OUT_AND_AFT, 0, -OUT_AND_AFT),
	Dorsal: new Vector3(0, OUT_AND_AFT, -OUT_AND_AFT),
	Ventral: new Vector3(0, -OUT_AND_AFT, -OUT_AND_AFT),
};

const PLUME_SHAPE: Record<Hardpoint, { length: number; radius: number }> = {
	MainEngine: { length: 16, radius: 1.6 },
	Port: { length: 5, radius: 0.8 },
	Starboard: { length: 5, radius: 0.8 },
	Dorsal: { length: 5, radius: 0.8 },
	Ventral: { length: 5, radius: 0.8 },
};

export type ShipModel = {
	/** Where the hull sits, in world space. */
	readonly position: Vector3;
	place: (position: Vector3, heading: Vector3, deltaSeconds: number) => void;
	/**
	 * Impulse is inner orbit, the climb, and a dock: side thrusters only, main engine dark.
	 * Photon is the cruise and the drop after it. `burn` is how hard that engine is thrusting, from 0 to 1.
	 * A photon leg at 0 is the engine idling: the fan keeps turning and the bell stays lit, with no exhaust.
	 */
	drive: (leg: Drive, burn: number) => void;
	/** Radius of the beacon in CSS pixels while it is drawn. Null while the hull is showing. */
	beacon: () => number | null;
	/**
	 * Muzzle tip, in world units, along the ship's axes. The nose is +Z, starboard is +X,
	 * and up is +Y. A docked mine or collector shifts the hull by this so the gun meets the port.
	 */
	readonly muzzle: Vector3;
};

/** Nodes on the hull that a camera can ride. Each looks along its own +Z. */
export type ShipMounts = {
	/** The pilot's eyes, looking out the windscreen. */
	eye: TransformNode;
	/** Beside the port side thruster, looking aft. */
	port: TransformNode;
	/** Beside the starboard side thruster, looking aft. */
	starboard: TransformNode;
	/** Middle of the hull, in the ship's space. The exterior camera looks here. */
	hullCenter: Vector3;
};

export type Ranger = ShipModel & {
	readonly mounts: ShipMounts;
	/** From the cockpit the hull always shows in the aft views, under a fill light. */
	setPiloted: (on: boolean) => void;
	/**
	 * The mining laser. `center` is the block and `forward` points from the ship toward it.
	 * The beam runs from the muzzle to the face `inset` in front of that center.
	 */
	beam: (firing: boolean, center: Vector3 | null, forward: Vector3 | null, inset: number, deltaSeconds: number) => void;
};

/**
 * The dash is exported in the Ranger empty's own space, with that empty's scale already on each node
 * and no extra rotation. It is parented beside the hull so the scale is not applied twice. The floor
 * and the coaming travel with it.
 */

/** Painted cabin plastic. The sun does not reach it, so a faint emissive keeps the shape. */
function cockpitPlastic(scene: Scene, name: string, color: Color3, metallic: number): PBRMaterial {
	const material = new PBRMaterial(name, scene);
	material.albedoColor.copyFrom(color);
	material.metallic = metallic;
	material.roughness = HULL_ROUGHNESS;
	material.emissiveColor.copyFrom(color);
	material.emissiveIntensity = COCKPIT_LIFT;
	material.usePhysicalLightFalloff = false;
	material.backFaceCulling = false;
	return material;
}

function meshByName(meshes: AbstractMesh[], name: string): AbstractMesh {
	const found = meshes.find((mesh) => mesh.name === name);
	if (!found) {
		throw new Error(`The ranger is missing ${name}.`);
	}
	return found;
}

/** A copy on the cockpit layer. The original stays on the ship, so the exterior hull is unchanged. */
function duplicateForSeat(mesh: AbstractMesh, name: string): AbstractMesh {
	const copy = mesh.clone(name, mesh.parent);
	if (!copy) {
		throw new Error(`The ranger could not copy ${mesh.name}.`);
	}
	copy.isPickable = false;
	copy.alwaysSelectAsActiveMesh = true;
	copy.layerMask = COCKPIT_LAYER;
	return copy;
}

/**
 * The seat looks through a copy of the canopy. The frame is the opening. The glass is an unlit
 * Fresnel rim: clear through the middle, visible where the pane turns away. It does not refract,
 * and it does not catch the sun.
 */
function seatCanopy(scene: Scene, meshes: AbstractMesh[]): void {
	const frameMesh = meshByName(meshes, "Ranger Canopy Frame Export");
	const glassMesh = meshByName(meshes, "Ranger Canopy Glass");
	const frame = duplicateForSeat(frameMesh, "cockpit-canopy-frame");
	const trim = frameMesh.material instanceof PBRMaterial ? frameMesh.material.albedoColor : CANOPY_COLOR;
	frame.material = cockpitPlastic(scene, "cockpit-canopy-frame", trim, HULL_METALLIC);
	const glass = duplicateForSeat(glassMesh, "cockpit-canopy-glass");
	glass.material = canopyGlassMaterial(scene);
}

/**
 * The sun never reaches the seat. A copy of the cabin plastic glows a little with its own color,
 * and the original material on the hull is left alone.
 */
function liftForSeat(material: Material): Material {
	if (!(material instanceof PBRMaterial)) {
		return material;
	}
	const next = material.clone(`${material.name} seat`);
	if (!next) {
		return material;
	}
	next.emissiveColor.copyFrom(next.albedoColor);
	next.emissiveTexture = next.albedoTexture;
	next.emissiveIntensity = COCKPIT_LIFT;
	next.backFaceCulling = false;
	return next;
}

function liftTree(material: Material | null): Material | null {
	if (!material) {
		return null;
	}
	if (material instanceof MultiMaterial) {
		const lifted = new MultiMaterial(`${material.name} seat`, material.getScene());
		lifted.subMaterials = material.subMaterials.map((sub) => (sub ? liftForSeat(sub) : null));
		return lifted;
	}
	return liftForSeat(material);
}

/**
 * The cabin is part of the hull, and the windscreen does not draw the hull. Without a copy here the
 * starfield stays in every gap the deck plate does not cover. A node with several materials arrives
 * as one mesh per material, named from the node. The shell and the hull's inner skin are drawn with
 * the dash. The outside of the hull stays on the ship.
 */
function seatCabin(meshes: AbstractMesh[]): void {
	const shell = meshes.filter((mesh) => mesh.name === "Ranger Cockpit" || mesh.name.startsWith("Ranger Cockpit_primitive"));
	if (shell.length === 0) {
		throw new Error("The ranger is missing the cockpit.");
	}
	for (const mesh of shell) {
		const copy = duplicateForSeat(mesh, `cockpit-cabin-${mesh.name}`);
		copy.material = liftTree(mesh.material);
	}
	const lining = meshes.filter(
		(mesh) =>
			(mesh.name === "Ranger Hull" || mesh.name.startsWith("Ranger Hull_primitive")) &&
			mesh.material instanceof PBRMaterial &&
			mesh.material.name === "Ranger Interior"
	);
	if (lining.length === 0) {
		throw new Error("The ranger hull has no interior.");
	}
	for (const mesh of lining) {
		const copy = duplicateForSeat(mesh, `cockpit-lining-${mesh.name}`);
		copy.material = liftForSeat(mesh.material as PBRMaterial);
	}
}

/** Unlit, so a bright body crossing the bow cannot lay a highlight on the pane. */
function canopyGlassMaterial(scene: Scene): ShaderMaterial {
	const material = new ShaderMaterial(
		"cockpit-canopy-glass",
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				attribute vec3 normal;
				uniform mat4 worldView;
				uniform mat4 worldViewProjection;
				varying vec3 vNormalView;
				varying vec3 vPositionView;
				void main() {
					vec4 viewPosition = worldView * vec4(position, 1.0);
					vPositionView = viewPosition.xyz;
					vNormalView = mat3(worldView) * normal;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`,
			fragmentSource: `
				precision highp float;
				uniform float faceAlpha;
				uniform float rimAlpha;
				uniform float rimPower;
				uniform vec3 rimColor;
				varying vec3 vNormalView;
				varying vec3 vPositionView;
				void main() {
					vec3 normal = normalize(vNormalView);
					vec3 viewDir = normalize(-vPositionView);
					float facing = abs(dot(normal, viewDir));
					float fresnel = pow(1.0 - facing, rimPower);
					float alpha = mix(faceAlpha, rimAlpha, fresnel);
					// Alpha already carries the Fresnel. The blend applies it once, so the rim stays
					// a dim gray and the middle of the pane does not pick up a second darkening.
					gl_FragColor = vec4(rimColor, alpha);
				}
			`,
		},
		{
			attributes: ["position", "normal"],
			uniforms: ["worldView", "worldViewProjection", "faceAlpha", "rimAlpha", "rimPower", "rimColor"],
			needAlphaBlending: true,
		}
	);
	material.setFloat("faceAlpha", CANOPY_GLASS.faceAlpha);
	material.setFloat("rimAlpha", CANOPY_GLASS.rimAlpha);
	material.setFloat("rimPower", CANOPY_GLASS.rimPower);
	material.setColor3("rimColor", CANOPY_RIM);
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
	material.alphaMode = Constants.ALPHA_COMBINE;
	return material;
}

async function attachCockpit(scene: Scene, facing: TransformNode): Promise<void> {
	const container = await LoadAssetContainerAsync("/models/cockpit.glb", scene);
	container.addAllToScene();
	for (const mesh of container.meshes) {
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;
		mesh.layerMask = COCKPIT_LAYER;
		if (mesh.getTotalVertices() === 0) {
			continue;
		}
		// No sun reaches the seat. A faint glow keeps the plastic from going pure black. The grain
		// can disappear into that shadow; the screens carry their own light.
		const material = mesh.material;
		if (material instanceof PBRMaterial && material.name !== "Cockpit Screen") {
			material.emissiveColor.copyFrom(material.albedoColor);
			material.emissiveTexture = material.albedoTexture;
			material.emissiveIntensity = COCKPIT_LIFT;
		}
		if (material instanceof PBRMaterial && material.name === "Cockpit Screen") {
			// A flat quad against the curved coaming shares pixels. Pull the glass toward the eye
			// so a remaining kiss still loses to the screen.
			material.zOffset = 2;
		}
	}
	for (const node of container.rootNodes) {
		node.parent = facing;
	}
	// The sun never reaches the seat, and the hull fill is on the ship layer. These ride the ship
	// and stay dim: a little shape on the coaming, not a lit cabin.
	const fill = new HemisphericLight("cockpit-fill", new Vector3(0, 1, 0), scene);
	fill.parent = facing;
	fill.includeOnlyWithLayerMask = COCKPIT_LAYER;
	fill.intensity = 0.05;
	fill.diffuse = new Color3(0.72, 0.74, 0.78);
	fill.groundColor = new Color3(0.02, 0.02, 0.025);
	fill.specular = new Color3(0.02, 0.02, 0.02);
	const skim = new DirectionalLight("cockpit-skim", new Vector3(0.15, -0.8, 0.55).normalize(), scene);
	skim.parent = facing;
	skim.includeOnlyWithLayerMask = COCKPIT_LAYER;
	skim.intensity = 0.08;
	skim.diffuse = new Color3(0.55, 0.56, 0.58);
	skim.specular = new Color3(0.08, 0.08, 0.09);
}

/**
 * The ranger from the Blender file. The glTF is geometry and materials only: scene lights are
 * dropped. The bell stays dark until the cruise engine is lit. A burn draws the plume here; a coast
 * leaves the fan turning and the bell glowing, with no exhaust.
 * The nose is turned onto +Z so `lookAt` points it along the heading.
 */
export async function loadRanger(scene: Scene, camera: Camera): Promise<Ranger> {
	// The published site serves this from its own public folder. The copy beside this package is for the game dev server.
	const container = await LoadAssetContainerAsync("/models/ranger.glb", scene);
	container.addAllToScene();
	for (const light of container.lights) {
		light.dispose();
	}
	const engineGlow: { material: PBRMaterial; color: Color3; intensity: number }[] = [];
	for (const material of container.materials) {
		if (!(material instanceof PBRMaterial)) {
			continue;
		}
		// PBR inverse-square falloff leaves the hull black at planetary distances. The sun point
		// light is what shades the rest of the system, so the hull uses that same falloff.
		material.usePhysicalLightFalloff = false;
		if (material.name === "Ranger Canopy") {
			// Dark metal, as authored. Mirroring the whole system redrew every body six times a frame,
			// so the cube is the starfield only, captured once.
			material.albedoColor.copyFrom(CANOPY_COLOR);
			material.metallic = 1;
			material.roughness = CANOPY_ROUGHNESS;
			material.alpha = 1;
			material.transparencyMode = Material.MATERIAL_OPAQUE;
			material.backFaceCulling = false;
			reflectSky(scene, material);
		} else {
			material.roughness = Math.max(material.roughness ?? 1, HULL_ROUGHNESS);
			material.metallic = Math.min(material.metallic ?? 1, HULL_METALLIC);
		}
		if (material.name !== "Ranger Engine Glow" && material.name !== "Ranger Intake Glow") {
			continue;
		}
		// The bell's authored glow. A coast lights it again. The intake glow stays dark.
		if (material.name === "Ranger Engine Glow") {
			engineGlow.push({
				material,
				color: material.emissiveColor.clone(),
				intensity: material.emissiveIntensity > 0 ? material.emissiveIntensity : 1,
			});
		}
		material.emissiveColor.set(0, 0, 0);
		material.emissiveIntensity = 0;
	}
	for (const mesh of container.meshes) {
		mesh.isPickable = false;
		mesh.layerMask = SHIP_LAYER;
		// The loader's mirrored root puts the world bounds off the mesh, and a close camera then
		// culls a hull that is sitting in frame.
		mesh.alwaysSelectAsActiveMesh = true;
	}
	const pilotBody = container.meshes.filter((mesh) => mesh.name.startsWith("Ranger Pilot"));

	const ship = new TransformNode("player-ship", scene);
	// The loader mirrors Z and turns the model around so the glTF axes match a left-handed scene.
	// That leaves the nose on -Z. This node turns it onto +Z without touching the loader's root.
	const facing = new TransformNode("ranger-facing", scene);
	facing.parent = ship;
	facing.rotation.y = Math.PI;
	const root = container.rootNodes[0];
	if (!root) {
		throw new Error("The ranger model is empty.");
	}
	root.parent = facing;

	facing.computeWorldMatrix(true);
	const bounds = facing.getHierarchyBoundingVectors(true);
	const length = bounds.max.z - bounds.min.z;
	if (length < 1e-3) {
		throw new Error("The ranger hull has no length.");
	}
	ship.scaling.setAll(HULL_LENGTH / length);
	await attachCockpit(scene, facing);
	seatCanopy(scene, container.meshes);
	seatCabin(container.meshes);

	const fan = mountEngineFan(scene, container.meshes);
	const plumes = new Map<Hardpoint, Plume>();
	for (const name of Object.keys(EXHAUST) as Hardpoint[]) {
		const hardpoint = scene.getTransformNodeByName(name);
		if (!hardpoint) {
			throw new Error(`The ranger is missing the ${name} hardpoint.`);
		}
		const plume = createPlume(scene, name, PLUME_SHAPE[name], SHIP_LAYER);
		plume.root.parent = hardpoint;
		aimPlume(plume.root, hardpoint, EXHAUST[name]);
		plume.set(0, false);
		plumes.set(name, plume);
	}

	const beaconMaterial = new StandardMaterial("ranger-beacon", scene);
	beaconMaterial.emissiveColor = BONE;
	beaconMaterial.diffuseColor = BONE;
	beaconMaterial.specularColor = Color3.Black();
	beaconMaterial.disableLighting = true;
	const beacon = MeshBuilder.CreateSphere("ranger-beacon", { diameter: 1, segments: 8 }, scene);
	beacon.material = beaconMaterial;
	beacon.parent = ship;
	beacon.isPickable = false;
	beacon.alwaysSelectAsActiveMesh = true;
	beacon.layerMask = SHIP_LAYER;

	const mounts = buildMounts(scene, ship, container.meshes, pilotBody);
	const muzzleLocal = muzzleTip(ship, container.meshes);
	const siphon = createSiphonBeam(scene, {
		core: HULL_LENGTH * 0.035,
		coneNear: HULL_LENGTH * 0.055,
		coneFar: HULL_LENGTH * 0.18,
		flare: HULL_LENGTH * 0.22,
	});
	const muzzleWorld = new Vector3();

	// Only reaches the ship. It stays in the scene at zero, so turning it up does not rebuild shaders.
	const fillLight = new HemisphericLight("ranger-fill", Vector3.Up(), scene);
	fillLight.includeOnlyWithLayerMask = SHIP_LAYER;
	fillLight.diffuse = BONE;
	fillLight.groundColor = Color3.FromHexString("#3A3630");
	fillLight.specular = Color3.Black();
	fillLight.intensity = 0;

	const engine = scene.getEngine();
	const shown: Plumes = { main: 0, port: 0, starboard: 0, dorsal: 0, ventral: 0 };
	/** 1 while the cruise engine is lit, including a coast. Eases off when that leg ends. */
	let spool = 0;
	const previous = new Vector3();
	let hasPrevious = false;
	let leg: Drive = "impulse";
	let burn = 0;
	let hullOn = false;
	let piloted = false;
	const aim = new Vector3();

	const worldPerPixel = (position: Vector3) => {
		const cssHeight = Math.max(1, engine.getRenderHeight() * engine.getHardwareScalingLevel());
		return (2 * Vector3.Distance(camera.globalPosition, position) * Math.tan(camera.fov / 2)) / cssHeight;
	};

	const pairs: { hardpoint: Hardpoint; field: keyof Plumes }[] = [
		{ hardpoint: "MainEngine", field: "main" },
		{ hardpoint: "Port", field: "port" },
		{ hardpoint: "Starboard", field: "starboard" },
		{ hardpoint: "Dorsal", field: "dorsal" },
		{ hardpoint: "Ventral", field: "ventral" },
	];

	const applyPlumes = (target: Plumes, deltaSeconds: number) => {
		const follow = deltaSeconds <= 0 ? 1 : 1 - Math.exp(-deltaSeconds * 10);
		for (const pair of pairs) {
			shown[pair.field] += (target[pair.field] - shown[pair.field]) * follow;
			const plume = plumes.get(pair.hardpoint);
			if (!plume) {
				continue;
			}
			plume.set(shown[pair.field], hullOn);
		}
		// The cruise keeps the fan turning and the bell lit after the plume is gone. A coast is that
		// state: photon drive, no burn, so `shown.main` eases to 0 and the exhaust goes with it.
		const lit = leg === "photon" ? 1 : 0;
		spool += (lit - spool) * follow;
		if (deltaSeconds > 0 && spool > 1e-3) {
			fan.hub.rotate(fan.axis, spool * FAN_TURNS * Math.PI * 2 * deltaSeconds, Space.LOCAL);
		}
		for (const glow of engineGlow) {
			glow.material.emissiveColor.copyFrom(glow.color);
			glow.material.emissiveIntensity = glow.intensity * spool;
		}
	};

	const present = () => {
		const pixels = HULL_LENGTH / worldPerPixel(ship.getAbsolutePosition());
		if (piloted) {
			hullOn = true;
		} else if (hullOn) {
			if (pixels < HULL_PIXELS_OFF) {
				hullOn = false;
			}
		} else if (pixels >= HULL_PIXELS_ON) {
			hullOn = true;
		}
		facing.setEnabled(hullOn);
		beacon.setEnabled(!hullOn);
		if (!hullOn) {
			const parentScale = Math.abs(ship.scaling.x) || 1;
			beacon.scaling.setAll((BEACON_PIXELS * worldPerPixel(ship.getAbsolutePosition())) / parentScale);
		}
	};

	return {
		get position() {
			return ship.position;
		},
		drive(next, strength) {
			leg = next;
			burn = strength;
		},
		place(position, heading, deltaSeconds) {
			let yawRate = 0;
			let pitchRate = 0;
			if (hasPrevious && deltaSeconds > 1e-4) {
				const step = yawAngle(previous, heading);
				const pitch = heading.y - previous.y;
				if (Math.abs(step) <= CUT_ANGLE && Math.abs(pitch) <= CUT_ANGLE) {
					yawRate = step / deltaSeconds;
					pitchRate = pitch / deltaSeconds;
				}
			}
			hasPrevious = true;
			previous.copyFrom(heading);
			ship.position.copyFrom(position);
			aim.copyFrom(position).addInPlace(heading);
			if (Vector3.DistanceSquared(aim, position) > 1e-8) {
				ship.lookAt(aim);
			}
			present();
			applyPlumes(plumesFor(leg, yawRate, pitchRate, burn), deltaSeconds);
		},
		beacon() {
			return hullOn ? null : BEACON_PIXELS / 2;
		},
		// The tip is measured in the hull's own units. The dock offset is in world units, the same
		// space the berth is placed in. Leaving it unscaled parks the ship a hull-model above the port.
		muzzle: muzzleLocal.scale(Math.abs(ship.scaling.x)),
		mounts,
		setPiloted(on) {
			piloted = on;
			fillLight.intensity = on ? AFT_FILL : 0;
			present();
		},
		beam(firing, center, forward, inset, deltaSeconds) {
			if (!center || !forward) {
				siphon.set(false, muzzleWorld, muzzleWorld, deltaSeconds);
				return;
			}
			Vector3.TransformCoordinatesToRef(muzzleLocal, ship.getWorldMatrix(), muzzleWorld);
			const face = beamEnd(muzzleWorld, center, forward, inset);
			if (!face) {
				siphon.set(false, muzzleWorld, muzzleWorld, deltaSeconds);
				return;
			}
			siphon.set(firing && hullOn, muzzleWorld, face, deltaSeconds);
		},
	};
}

type EngineFan = {
	hub: TransformNode;
	/** The shaft, in the hub's own space. The fan is a disc, so this is its thin axis. */
	axis: Vector3;
};

/**
 * The fan's geometry sits at the nozzle, but its origin is the ship's origin. Spinning the mesh
 * itself would swing it around the hull. The hub sits on the fan's center and turns on the shaft.
 * The loader splits the fan into one mesh per material, so every part turns together.
 */
function mountEngineFan(scene: Scene, meshes: AbstractMesh[]): EngineFan {
	const parts = meshes.filter((mesh) => mesh.name.startsWith("Ranger Engine Fan"));
	const first = parts[0];
	if (!first) {
		throw new Error("The ranger is missing the engine fan.");
	}
	const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
	const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
	for (const part of parts) {
		const box = part.getBoundingInfo().boundingBox;
		min.minimizeInPlace(box.minimum.add(part.position));
		max.maximizeInPlace(box.maximum.add(part.position));
	}
	const center = min.add(max).scale(0.5);
	const holder = first.parent;
	const whole =
		holder instanceof TransformNode && holder.name === "Ranger Engine Fan" && parts.every((part) => part.parent === holder);
	const hub = new TransformNode("ranger-fan-hub", scene);
	if (whole && holder) {
		hub.parent = holder.parent;
		hub.position.copyFrom(holder.position).addInPlace(center);
		holder.parent = hub;
		holder.position.copyFrom(center.scale(-1));
	} else {
		hub.parent = holder;
		hub.position.copyFrom(center);
		for (const part of parts) {
			part.parent = hub;
			part.position.subtractInPlace(center);
		}
	}
	return { hub, axis: fanAxis(max.subtract(min)) };
}

/** The shaft runs through the disc, which is the fan's shortest side. */
function fanAxis(extent: Vector3): Vector3 {
	if (extent.x <= extent.y && extent.x <= extent.z) {
		return Vector3.Right().clone();
	}
	if (extent.y <= extent.z) {
		return Vector3.Up().clone();
	}
	return Vector3.Forward().clone();
}

/**
 * Puts the starfield into the canopy. The cube is world-aligned and the sky never turns, so one
 * capture stays right as the ship moves. It is taken from the camera, because that is where the
 * sky is drawn, and with a far plane that reaches the stars.
 */
function reflectSky(scene: Scene, material: PBRMaterial): void {
	const sky: AbstractMesh[] = [];
	for (const name of ["stars", "milky-way"]) {
		const mesh = scene.getMeshByName(name);
		if (mesh) {
			sky.push(mesh);
		}
	}
	if (sky.length === 0) {
		return;
	}
	const probe = new ReflectionProbe("canopy-sky", SKY_REFLECTION_SIZE, scene, true, false, true);
	probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
	probe.renderList = sky;
	// The probe copies the active camera's clip, and an aft camera's far plane is closer than the stars.
	// The saved clip is put back once the cube is done, so that camera still draws the hull as before.
	const clip: { near: number; far: number; camera: { minZ: number; maxZ: number } | null } = {
		near: 0,
		far: 0,
		camera: null,
	};
	probe.cubeTexture.onBeforeRenderObservable.add(() => {
		const camera = scene.activeCamera;
		if (!camera) {
			return;
		}
		if (clip.camera !== camera) {
			clip.camera = camera;
			clip.near = camera.minZ;
			clip.far = camera.maxZ;
		}
		camera.minZ = SKY_REFLECTION_NEAR;
		camera.maxZ = SKY_REFLECTION_FAR;
		// The sky is drawn around this camera. Floating origin keeps that near the origin, not at the
		// ship's real position, so the capture has to use the same point.
		const center = camera.getWorldMatrix().m;
		probe.position.set(center[12] ?? 0, center[13] ?? 0, center[14] ?? 0);
	}, -1, true);
	probe.cubeTexture.onAfterUnbindObservable.add(() => {
		const camera = clip.camera;
		if (!camera) {
			return;
		}
		camera.minZ = clip.near;
		camera.maxZ = clip.far;
		clip.camera = null;
	});
	material.reflectionTexture = probe.cubeTexture;
}

/**
 * The eye goes where the pilot's visor is, and each aft camera goes beside its side thruster. Both are
 * measured off the model, so they follow it if the hull is rebuilt.
 */
function buildMounts(
	scene: Scene,
	ship: TransformNode,
	hull: AbstractMesh[],
	pilotBody: AbstractMesh[]
): ShipMounts {
	ship.computeWorldMatrix(true);
	const toShip = ship.getWorldMatrix().clone().invert();
	const local = (world: Vector3) => Vector3.TransformCoordinates(world, toShip);
	// The hull was just scaled, so every matrix from the ship down is stale until it is recomputed in order.
	const refresh = (node: Node) => {
		const chain: Node[] = [];
		for (let at: Node | null = node; at; at = at.parent) {
			chain.unshift(at);
		}
		for (const link of chain) {
			if (link instanceof TransformNode) {
				link.computeWorldMatrix(true);
			}
		}
	};
	const spanOf = (meshes: AbstractMesh[]) => {
		const min = new Vector3(Infinity, Infinity, Infinity);
		const max = new Vector3(-Infinity, -Infinity, -Infinity);
		let counted = 0;
		for (const mesh of meshes) {
			if (mesh.getTotalVertices() === 0) {
				continue;
			}
			refresh(mesh);
			const box = mesh.getBoundingInfo().boundingBox;
			min.minimizeInPlace(local(box.minimumWorld));
			max.maximizeInPlace(local(box.maximumWorld));
			counted += 1;
		}
		return counted === 0 ? null : min.add(max).scale(0.5);
	};

	const visor = pilotBody.filter((mesh) => mesh.name.startsWith("Ranger Pilot Visor"));
	const center = spanOf(visor);
	if (!center) {
		throw new Error("The ranger is missing the pilot's visor.");
	}
	const hullCenter = spanOf(hull);
	if (!hullCenter) {
		throw new Error("The ranger hull has no bounds.");
	}

	const eye = new TransformNode("ranger-eye", scene);
	eye.parent = ship;
	eye.position.copyFrom(center);
	eye.position.x = 0;

	const aft = (name: "Port" | "Starboard", side: number) => {
		const hardpoint = scene.getTransformNodeByName(name);
		if (!hardpoint) {
			throw new Error(`The ranger is missing the ${name} hardpoint.`);
		}
		refresh(hardpoint);
		const at = local(hardpoint.getAbsolutePosition());
		const mount = new TransformNode(`ranger-aft-${name.toLowerCase()}`, scene);
		mount.parent = ship;
		mount.position.set(at.x + side * AFT_CAMERA.out, at.y + AFT_CAMERA.up, at.z + AFT_CAMERA.ahead);
		mount.rotation.set(AFT_PITCH, Math.PI - side * AFT_SPLAY, 0);
		return mount;
	};

	return { eye, port: aft("Port", -1), starboard: aft("Starboard", 1), hullCenter };
}

/**
 * The forward face of the muzzle, in the ship's space. The nose is +Z, so the tip is the muzzle's
 * greatest Z. Measured after the hull is scaled, the same way the cockpit mounts are.
 */
function muzzleTip(ship: TransformNode, meshes: AbstractMesh[]): Vector3 {
	ship.computeWorldMatrix(true);
	const toShip = ship.getWorldMatrix().clone().invert();
	const min = new Vector3(Infinity, Infinity, Infinity);
	const max = new Vector3(-Infinity, -Infinity, -Infinity);
	let found = false;
	for (const mesh of meshes) {
		if (mesh.material?.name !== "Ranger Muzzle") {
			continue;
		}
		const chain: Node[] = [];
		for (let at: Node | null = mesh; at; at = at.parent) {
			chain.unshift(at);
		}
		for (const link of chain) {
			if (link instanceof TransformNode) {
				link.computeWorldMatrix(true);
			}
		}
		const box = mesh.getBoundingInfo().boundingBox;
		for (const corner of box.vectorsWorld) {
			const local = Vector3.TransformCoordinates(corner, toShip);
			min.minimizeInPlace(local);
			max.maximizeInPlace(local);
		}
		found = true;
	}
	if (!found) {
		throw new Error("The ranger is missing the laser muzzle.");
	}
	return new Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, max.z);
}

/** Signed angle from `previous` to `next` about Y. Positive swings the nose to starboard. */
function yawAngle(previous: Vector3, next: Vector3): number {
	const forward = new Vector3(previous.x, 0, previous.z);
	const ahead = new Vector3(next.x, 0, next.z);
	if (forward.lengthSquared() < 1e-8 || ahead.lengthSquared() < 1e-8) {
		return 0;
	}
	forward.normalize();
	ahead.normalize();
	const right = Vector3.Cross(Vector3.Up(), forward);
	return Math.atan2(Vector3.Dot(ahead, right), Vector3.Dot(ahead, forward));
}

/**
 * Points the plume's +Z along `exhaust` in ship space.
 * The glTF root mirrors Z, and a child rotation is applied before that mirror, so the direction
 * solved from the inverse world matrix points back into the hull. Negating it sends the cone out the nozzle.
 */
function aimPlume(plume: TransformNode, hardpoint: TransformNode, exhaust: Vector3): void {
	hardpoint.computeWorldMatrix(true);
	const inverse = new Matrix();
	hardpoint.getWorldMatrix().invertToRef(inverse);
	const local = Vector3.TransformNormal(exhaust.scale(-1), inverse).normalize();
	const hint = Math.abs(Vector3.Dot(local, Vector3.Up())) > 0.85 ? Vector3.Forward() : Vector3.Up();
	plume.rotationQuaternion = Quaternion.FromLookDirectionLH(local, hint);
}
