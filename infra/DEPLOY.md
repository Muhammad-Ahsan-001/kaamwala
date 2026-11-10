# Deploying KaamWala

KaamWala runs on the existing DigitalOcean droplet, next to other production apps. These steps add only KaamWala's own pieces.

| Piece | Location on the droplet |
|---|---|
| API service | systemd unit `kaamwala-api`, private port 3002 |
| API releases | `/opt/kaamwala/releases`, active one at `/opt/kaamwala/current` |
| Web releases | `/var/www/kaamwala/releases`, active one at `/var/www/kaamwala/current` |
| Secrets | `/etc/kaamwala/api.env` |
| Uploaded files | `/var/lib/kaamwala/uploads` |
| Database | Postgres role and database `kaamwala` |
| Caddy | `/etc/caddy/kaamwala.caddy`, imported once from the main Caddyfile |

Nothing else on the droplet is modified or restarted. Ports 3000 and 3001 and the existing Caddy blocks are left alone.

## What you need to provide

1. **Droplet IP address.**
2. **SSH access from this computer** with a key: either `root`, or a user with passwordless sudo. The deploy runs without prompts, so if your key has a passphrase, load it into `ssh-agent` first.
3. **The domain** at Namecheap, with access to its Advanced DNS page.
4. **A Gemini API key**, added on the server in step 4. Don't put it in the repo or in chat.

The droplet needs Ubuntu with Caddy, PostgreSQL and system-wide Node 24, as your prompt describes. The setup script checks for each and stops with a clear message if one is missing.

## Steps

Run the `bash` commands from the repo root in Git Bash.

### 1. Add the DNS records

In Namecheap, go to **Domain List → Manage → Advanced DNS → Add New Record** and add both:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `kaamwala` | your droplet IP | Automatic |
| A Record | `api.kaamwala` | your droplet IP | Automatic |

Check that both names resolve to the droplet IP before you continue. Caddy can't get HTTPS certificates until they do.

```bash
nslookup kaamwala.yourdomain.com
```

```bash
nslookup api.kaamwala.yourdomain.com
```

### 2. Fill in the connection settings

```bash
cp infra/deploy.env.example infra/deploy.env
```

Then edit `infra/deploy.env` and set `DROPLET_HOST`, `DROPLET_USER` and `DOMAIN`. This file is git-ignored.

### 3. Run the one-time setup

```bash
bash deploy.sh --setup
```

This checks that port 3002 is free and stops if it isn't. It then creates the Postgres role and database, the `kaamwala` service user, the directories, the secrets file and the systemd unit. Last, it adds the Caddy import, runs `caddy validate`, and reloads Caddy. If validation fails, it restores the previous files and does not reload.

It's safe to run again. It never overwrites `/etc/kaamwala/api.env`, so your keys survive a re-run.

### 4. Add the API keys on the server

Generate the push notification keys on your computer:

```bash
npx web-push generate-vapid-keys
```

Open `/etc/kaamwala/api.env` on the droplet (for example `sudo nano /etc/kaamwala/api.env`) and set:

```
GEMINI_API_KEY=your key
VAPID_PUBLIC_KEY=the public key
VAPID_PRIVATE_KEY=the private key
```

### 5. First deploy, with the demo data

```bash
bash deploy.sh --seed
```

Use `--seed` only on this first deploy, unless you intend to load the demo data again.

### 6. Later deploys

```bash
bash deploy.sh
```

Each deploy builds locally, uploads a new release, runs `prisma migrate deploy`, restarts only `kaamwala-api`, and checks that it responds. If the new API doesn't become healthy, the script restores the previous release automatically. Database migrations are not rolled back. The last five releases are kept.

If you change a key in `/etc/kaamwala/api.env`, restart the API so it takes effect:

```bash
sudo systemctl restart kaamwala-api
```

## Checking and troubleshooting

Follow the API logs:

```bash
sudo journalctl -u kaamwala-api -f
```

Check the service:

```bash
sudo systemctl status kaamwala-api
```

Voice recording, push notifications and installing the app all need HTTPS, so test them on the real `https://kaamwala.<DOMAIN>` address.
