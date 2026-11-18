# Free private GreyMatter server on Oracle Cloud

This setup serves GreyMatter over HTTPS behind a login. The app container is not exposed directly to the internet; Caddy handles HTTPS and HTTP Basic Authentication. The login protects the app, API, audio, and artwork routes.

## Before starting

- Create an Oracle Cloud Free Tier account and an Always Free Ubuntu VM. Keep the account on Free Tier; do not provision paid resources or upgrade to a paid plan. Oracle says Always Free services continue after the 30-day trial, subject to limits.
- Use the Ampere A1 Always Free shape (ARM64), 1 OCPU and 6 GB memory, with the default 50 GB boot volume. Oracle lists up to 2 OCPUs, 12 GB memory, and 200 GB total Always Free block storage including boot volumes.
- Create a free DuckDNS hostname and point it at the VM's public IPv4 address. Caddy uses the hostname to request and renew a trusted HTTPS certificate.
- In the VM's Oracle network security list, allow inbound TCP 22 from your own current public IP, and TCP 80 and 443 from the internet. Do not open port 8000.
- The free-tier instance may be reclaimed if Oracle considers it idle, and free capacity may not be available in every region. This is a no-cost option, not a guaranteed uptime service.

## Copy GreyMatter to the VM

On the Ubuntu VM, install Docker, Compose, and rsync, then create the destination directory:

```sh
sudo apt update
sudo apt install -y docker.io docker-compose-v2 rsync
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/greymatter
sudo chown ubuntu:ubuntu /opt/greymatter
```

Disconnect and SSH back in so the Docker group change takes effect. From a terminal on the Mac, replace `VM_IP` and `SSH_KEY` with the VM's public IP and the private SSH key created for the VM:

```sh
rsync -av \
  --exclude 'backend/venv/' \
  --exclude 'backend/__pycache__/' \
  --exclude 'backend/music.db' \
  --exclude 'music/' \
  --exclude 'artwork/' \
  --exclude '.git/' \
  -e "ssh -i SSH_KEY" \
  "$HOME/Desktop/mymusic-demo/" \
  ubuntu@VM_IP:/opt/greymatter/
```

This copies only the app code, not the song library. Then SSH to the VM and enter the deployment folder:

```sh
ssh -i SSH_KEY ubuntu@VM_IP
cd /opt/greymatter/deploy/oracle-cloud
chmod +x setup-auth.sh
./setup-auth.sh
```

Enter your DuckDNS hostname and choose a strong password. The script stores only a password hash in the private `.env` file. Do not commit or share that file.

## Library data

This demo copy starts with an empty library. Its database, imported music, and artwork are not part of the GitHub source. Tracks imported after deployment are stored in `deploy/oracle-cloud/data/` on the VM. Back up that directory separately if you want to keep them.

## Start GreyMatter

Back on the VM:

```sh
cd /opt/greymatter/deploy/oracle-cloud
docker compose up -d --build
docker compose ps
```

Open `https://YOUR-HOSTNAME.duckdns.org` on your iPhone and sign in with the username and password you chose. You can add it to the Home Screen from Safari. Your Mac can be off after the transfer is complete.

## Backups and cost guardrails

- Keep only Always Free resources. Oracle says free resources continue after the 30-day trial, but capacity and idle-instance policies apply. Check the OCI usage/cost page periodically and do not create resources marked paid.
- Your data lives in `deploy/oracle-cloud/data/` on the VM. Back up that folder somewhere you control; this setup persists it across app rebuilds, but a VM or volume loss can still lose data.
- To deploy code updates, copy the updated source to `/opt/greymatter/` and run `docker compose up -d --build` again.
- To stop the service without deleting the library, run `docker compose down`. Do not use `docker compose down -v` unless you intend to remove Caddy's saved certificate/configuration volumes.
