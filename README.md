# Aphelion Run

An asynchronous space strategy game. The description of the game is in [BRIEF.md](BRIEF.md). How this version is built is in [STRATEGY.md](STRATEGY.md). Sources and licenses for the planet maps are in [CREDITS.md](CREDITS.md).

## Packages

- `@aphelion/app` — the game. It opens on the galaxy; selecting Sol loads the solar system. It runs on its own here.
- `@aphelion/www` — the proving ground. The game is at `/`, the story at `/story`, the rules at `/rules`, the style bible at `/style`, and the glossary at `/glossary`.
- `@aphelion/infra` — the CDK stack that publishes the site to [aphelionrun.com](https://aphelionrun.com).

## Develop

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The game by itself is `npm run dev:app` on port 3001.

## Test

```bash
npm test
```

## Deploy

A push to `main` runs **Deploy Aphelion Run**. It builds the site and deploys `AphelionSite-prod`.

The workflow needs `AWS_DEPLOY_ROLE_ARN` (and optional `AWS_REGION`, default `us-east-1`) on the repo `production` environment. The role must trust `repo:StacksOnTheRacks/aphelion-run:*`. The account needs a CDK bootstrap for qualifier `aphln` and toolkit stack `AphelionToolkit` before the first deploy.

The hosted zone `aphelionrun.com` (`Z00920882C0R9WXBKRWCB`) already exists. The stack does not create it.
