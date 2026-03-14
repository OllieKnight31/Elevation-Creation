# Elevation Creation

Shared workspace for **Alexander Thompson** and **Ollie Knight**.

## Structure

```
Elevation-Creation/
├── Alexander-Thompson/
│   └── skills/
│       └── deploy-to-repo.sh    # Alex's deploy script
├── Ollie-Knight/
│   └── skills/
│       └── deploy-to-repo.sh    # Ollie's deploy script
└── README.md
```

## How to deploy

Each person has their own `deploy-to-repo.sh` script in their `skills/` folder.

From any local project directory, run:

```bash
bash deploy-to-repo.sh "Your commit message here"
```

This will push the contents of your current directory into your personal folder in this repo.
