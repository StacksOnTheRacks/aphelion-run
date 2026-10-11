const BOUGHT =
	"A base here receives that yield free. A docked ship can buy it for cash, and nothing else. The base does not hand over energy.";

function ownYield(part: string): string {
	return `This body yields its own material, for ${part}. ${BOUGHT}`;
}

function scooped(mineral: string, part: string): string {
	return `${mineral}, scooped from orbit, for ${part}. ${BOUGHT}`;
}

const LINES: Record<string, string> = {
	Sun: "Energy is mined from the satellites here. Nothing is bought, and the Sun yields no material.",
	Earth: "Nothing is mined and nothing is bought. Energy is sold at the pilot's own faction station. Earth yields no material.",
	Jupiter: scooped("Hydrogen metal", "hull, armor, and guns"),
	Saturn: scooped("Helium rain", "siphon modules"),
	Uranus: scooped("Mantle ice", "shields"),
	Neptune: scooped("Storm tar", "electronic warfare"),
	Mercury: ownYield("hull, armor, and guns"),
	Mars: ownYield("hull, armor, and guns"),
	Phobos: ownYield("hull, armor, and guns"),
	Deimos: ownYield("hull, armor, and guns"),
	Moon: ownYield("siphon modules"),
	Ganymede: ownYield("siphon modules"),
	Proteus: ownYield("siphon modules"),
	Europa: ownYield("shields"),
	Callisto: ownYield("shields"),
	Mimas: ownYield("shields"),
	Enceladus: ownYield("shields"),
	Tethys: ownYield("shields"),
	Dione: ownYield("shields"),
	Rhea: ownYield("shields"),
	Miranda: ownYield("shields"),
	Ariel: ownYield("shields"),
	Umbriel: ownYield("shields"),
	Titania: ownYield("shields"),
	Oberon: ownYield("shields"),
	Nereid: ownYield("shields"),
	Venus: ownYield("energy tanks"),
	Io: ownYield("energy tanks"),
	Titan: ownYield("electronic warfare"),
	Iapetus: ownYield("electronic warfare"),
	Triton: ownYield("electronic warfare"),
};

/** Shown on the whole-system view, which is not one body. */
export const SYSTEM_TRADE =
	"The Sun is mined for energy and sells nothing. Earth sells energy and yields nothing. Every other body yields one material: a base there receives it free, and a visiting ship can buy it.";

/** Place name when the camera labels the planet itself "Planet"; otherwise the subject. */
export function bodyName(placeLabel: string, subjectLabel: string): string {
	return subjectLabel === "Planet" ? placeLabel : subjectLabel;
}

export function tradeForBody(name: string): string | undefined {
	return LINES[name];
}
