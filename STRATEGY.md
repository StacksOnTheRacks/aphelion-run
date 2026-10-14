# Aphelion Run

Strategy for this version. The game itself is described in [BRIEF.md](BRIEF.md).

## Client

The first client is the website. A phone and a desk both play the whole game: flying, trading, repairing, plotting, and watching a fight. A tall layout and a wide layout are two arrangements of the same places.

The server owns the ships, the burns, and the fights. The client shows the place the player is in. A later installed app can be another view of those same orders.

## Platform

This version runs on AWS serverless. The rules stay in TypeScript, shared with the client, and run inside Lambda.

- **Lambda** takes commands, serves a place, and resolves a due event.
- **EventBridge Scheduler** holds one-time schedules for arrivals and the other moments that must resolve with nobody watching. A recall deletes the schedule. A resolver is safe to run twice, because a schedule can fire again.
- **DynamoDB** stores the world: ships, orders, and places. A fight writes both ships in one transaction.
- **ElastiCache Serverless** caches a place snapshot so many open clients read one copy.
- **API Gateway** serves the HTTP API and a WebSocket that tells an open client its place changed.
- **Cognito** is the player identity.
- **SQS** is the dead-letter queue when a resolver fails.
- **CloudFront and S3** serve the website, as they do now.

Other AWS services get added when a feature needs one. The game rules are not one of those services.

## Loads

The game is larger than one view. Only the place on screen is held on the device. Crossing a load boundary releases that place, shows a loading screen, and brings the next place up. The rest of the universe stays on the server until the player goes there.

[BRIEF.md](BRIEF.md) lists the places. The galaxy and the system are separate loads. Which of the others are separate loads, and which share a view, is not decided. The sky built so far is the navigation we have. It is not yet a commitment about where those boundaries fall.

## Scale

Another body, station, or system is another place that can be loaded on its own. It does not have to sit in memory beside the one on screen. The setting remains the one solar system in the brief until the brief says otherwise.

## Success

Success is a game that keeps growing: further seasons, further places, and players who stay. The commercial peers are the browser strategy games that load one place at a time. OGame is the closest.
