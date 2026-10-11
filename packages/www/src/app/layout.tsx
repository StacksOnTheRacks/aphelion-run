import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
	title: "Aphelion Run",
	description:
		"An asynchronous space strategy game. Haul solar energy across a living solar system, and build a ship from what the planets yield.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
