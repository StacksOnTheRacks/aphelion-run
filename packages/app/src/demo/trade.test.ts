import { PLACES } from "./environment";
import { SYSTEM_TRADE, bodyName, tradeForBody } from "./trade";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

for (const place of PLACES) {
	for (const subject of place.subjects) {
		const name = bodyName(place.label, subject.label);
		const line = tradeForBody(name);
		expect(Boolean(line), `${place.label} / ${subject.label} (${name}) has a trade line`);
		if (!line) {
			continue;
		}
		expect(subject.stops.length > 0, `${name} has a view`);
	}
}

const europa = tradeForBody("Europa") ?? "";
expect(!/hydrogen metal/i.test(europa), "Europa does not yield hydrogen metal");
expect(/shields/i.test(europa), "Europa feeds shields");

const mercury = tradeForBody("Mercury") ?? "";
expect(!/hydrogen metal/i.test(mercury), "Mercury does not yield hydrogen metal");
expect(/hull, armor, and guns/i.test(mercury), "Mercury feeds hull, armor, and guns");

const jupiter = tradeForBody("Jupiter") ?? "";
expect(/hydrogen metal/i.test(jupiter), "Jupiter yields hydrogen metal");
expect(/scooped from orbit/i.test(jupiter), "Jupiter's metal is scooped");

for (const name of ["Sun", "Earth"] as const) {
	const line = tradeForBody(name) ?? "";
	expect(!/own material/i.test(line), `${name} is not described as yielding a material`);
	expect(!/hydrogen metal|helium rain|mantle ice|storm tar/i.test(line), `${name} names no giant mineral`);
}

expect(/mined from the satellites/i.test(tradeForBody("Sun") ?? ""), "the Sun is mined for energy");
expect(/nothing is mined/i.test(tradeForBody("Earth") ?? ""), "Earth is not mined");
expect(/sold at the pilot's own faction station/i.test(tradeForBody("Earth") ?? ""), "Earth sells energy");
expect(SYSTEM_TRADE.includes("yields one material"), "the system view states the rule");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("trade lines cover every body");
