# SonarQube Server Setup Guide

This guide covers installing and configuring a SonarQube server for use with the OpenCode SonarQube Plugin.

## Table of Contents

- [Quick Start with Docker](#quick-start-with-docker)
- [Production Installation](#production-installation)
- [Initial Configuration](#initial-configuration)
- [Quality Gates Setup](#quality-gates-setup)
- [User & Token Management](#user--token-management)
- [Troubleshooting](#troubleshooting)

## Quick Start with Docker

The fastest way to get SonarQube running for development:

```bash
# Create a network
docker network create sonarqube

# Start SonarQube (Community Edition)
docker run -d \
  --name sonarqube \
  --network sonarqube \
  -p 9000:9000 \
  -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:lts-community

# Wait for startup (can take 1-2 minutes)
sleep 60

# Check if it's running
curl -s http://localhost:9000/api/system/status | jq .status
# Should return "UP"
```

Default credentials: `admin` / `admin`

## Production Installation

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disk | 10 GB | 50+ GB SSD |
| Java | JRE 17 | JRE 17 |
| Database | PostgreSQL 13+ | PostgreSQL 15+ |

### Docker Compose Setup

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  sonarqube:
    image: sonarqube:lts-community
    container_name: sonarqube
    depends_on:
      - db
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonar
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonar
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_extensions:/opt/sonarqube/extensions
      - sonarqube_logs:/opt/sonarqube/logs
    ports:
      - "9000:9000"
    restart: unless-stopped

  db:
    image: postgres:15
    container_name: sonarqube-db
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonar
      POSTGRES_DB: sonar
    volumes:
      - postgresql_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  sonarqube_data:
  sonarqube_extensions:
  sonarqube_logs:
  postgresql_data:
```

Start with:

```bash
docker-compose up -d
```

### Linux System Tuning

SonarQube requires specific kernel parameters:

```bash
# Add to /etc/sysctl.conf
vm.max_map_count=524288
fs.file-max=131072

# Apply immediately
sudo sysctl -w vm.max_map_count=524288
sudo sysctl -w fs.file-max=131072

# Add to /etc/security/limits.conf
sonarqube   -   nofile   131072
sonarqube   -   nproc    8192
```

### Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name sonarqube.example.com;

    ssl_certificate /etc/letsencrypt/live/sonarqube.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sonarqube.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Initial Configuration

### 1. Change Admin Password

```bash
# Via API
curl -X POST -u admin:admin \
  "http://localhost:9000/api/users/change_password" \
  -d "login=admin&previousPassword=admin&password=YourSecurePassword123!"
```

Or via UI: Administration > Security > Users > admin > Change Password

### 2. Configure Base URL

```bash
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/settings/set" \
  -d "key=sonar.core.serverBaseURL&value=https://sonarqube.example.com"
```

### 3. Install Language Plugins

For TypeScript/JavaScript (included by default). Additional languages:

```bash
# Via Administration > Marketplace, or CLI:
# Python
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/plugins/install?key=python"

# Restart required after plugin installation
docker restart sonarqube
```

## Quality Gates Setup

The plugin can auto-create quality gates, but you can also set them up manually.

### Enterprise Quality Gate (Strictest)

```bash
# Create quality gate
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create" \
  -d "name=Enterprise"

# Get the gate ID
GATE_ID=$(curl -s -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/list" | jq '.qualitygates[] | select(.name=="Enterprise") | .id')

# Add conditions
# Coverage >= 80%
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=coverage&op=LT&error=80"

# Duplications <= 0%
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=duplicated_lines_density&op=GT&error=0"

# Bugs = 0
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=bugs&op=GT&error=0"

# Vulnerabilities = 0
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=vulnerabilities&op=GT&error=0"

# Code Smells = 0
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=code_smells&op=GT&error=0"

# Reliability Rating = A
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=reliability_rating&op=GT&error=1"

# Security Rating = A
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=security_rating&op=GT&error=1"

# Maintainability Rating = A
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Enterprise&metric=sqale_rating&op=GT&error=1"
```

### Standard Quality Gate

```bash
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create" \
  -d "name=Standard"

# Coverage >= 70%
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Standard&metric=coverage&op=LT&error=70"

# Duplications <= 3%
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Standard&metric=duplicated_lines_density&op=GT&error=3"

# Bugs = 0
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Standard&metric=bugs&op=GT&error=0"

# Vulnerabilities = 0
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/qualitygates/create_condition" \
  -d "gateName=Standard&metric=vulnerabilities&op=GT&error=0"
```

## User & Token Management

### Create Service Account

```bash
# Create user for CI/CD
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/users/create" \
  -d "login=opencode-service&name=OpenCode Service&password=ServicePassword123!"

# Grant permissions
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/permissions/add_user" \
  -d "login=opencode-service&permission=scan"

curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/permissions/add_user" \
  -d "login=opencode-service&permission=provisioning"
```

### Generate Tokens

```bash
# Global analysis token
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/user_tokens/generate" \
  -d "name=opencode-global&type=GLOBAL_ANALYSIS_TOKEN" | jq .token

# Project-specific token (created automatically by plugin)
curl -X POST -u admin:YourPassword \
  "http://localhost:9000/api/user_tokens/generate" \
  -d "name=my-project-token&type=PROJECT_ANALYSIS_TOKEN&projectKey=my-project" | jq .token
```

### Token Best Practices

1. **Use project tokens** - More secure than global tokens
2. **Set expiration** - Rotate tokens regularly
3. **Store securely** - Use environment variables or secrets manager
4. **Audit regularly** - Review token usage in Administration > Security > Users

## Environment Variables

Configure the plugin using these environment variables:

```bash
# Required
export SONAR_HOST_URL="https://sonarqube.example.com"
export SONAR_USER="admin"
export SONAR_PASSWORD="YourSecurePassword"

# Or use token authentication
export SONAR_TOKEN="sqp_xxxxxxxxxxxxx"

# Optional
export SONAR_PROJECT_KEY="my-project"
export SONAR_SOURCES="src"
```

## Troubleshooting

### SonarQube Won't Start

```bash
# Check logs
docker logs sonarqube

# Common issue: Elasticsearch heap
# Add to docker-compose.yml environment:
# SONAR_SEARCH_JAVAADDITIONALOPTS: "-Dnode.store.allow_mmap=false"
```

### Out of Memory

```bash
# Increase heap in docker-compose.yml
environment:
  SONAR_WEB_JAVAOPTS: "-Xmx1G -Xms512m"
  SONAR_CE_JAVAOPTS: "-Xmx1G -Xms512m"
  SONAR_SEARCH_JAVAOPTS: "-Xmx1G -Xms512m"
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker logs sonarqube-db

# Test connection
docker exec -it sonarqube-db psql -U sonar -d sonar -c "SELECT 1"
```

### Scanner Can't Connect

```bash
# Verify connectivity
curl -s http://localhost:9000/api/system/status

# Check firewall
sudo ufw status
sudo ufw allow 9000/tcp
```

### Analysis Takes Too Long

1. Increase scanner memory: `SONAR_SCANNER_OPTS="-Xmx2G"`
2. Exclude unnecessary files in `sonar-project.properties`
3. Use incremental analysis for PRs

## Backup & Restore

### Backup

```bash
# Stop SonarQube
docker-compose stop sonarqube

# Backup database
docker exec sonarqube-db pg_dump -U sonar sonar > sonar_backup.sql

# Backup volumes
docker run --rm -v sonarqube_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/sonarqube_data.tar.gz /data

# Restart
docker-compose start sonarqube
```

### Restore

```bash
# Stop SonarQube
docker-compose stop sonarqube

# Restore database
cat sonar_backup.sql | docker exec -i sonarqube-db psql -U sonar sonar

# Restore volumes
docker run --rm -v sonarqube_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/sonarqube_data.tar.gz -C /

# Restart
docker-compose start sonarqube
```

## Security Hardening

1. **Enable HTTPS** - Use reverse proxy with TLS
2. **Change default credentials** - Immediately after installation
3. **Restrict network access** - Firewall rules
4. **Regular updates** - Keep SonarQube updated
5. **Audit logs** - Monitor Administration > System > Logs
6. **LDAP/SAML** - Integrate with enterprise identity provider

## Resources

- [SonarQube Documentation](https://docs.sonarqube.org/)
- [SonarScanner Documentation](https://docs.sonarqube.org/latest/analyzing-source-code/scanners/sonarscanner/)
- [Quality Gates](https://docs.sonarqube.org/latest/user-guide/quality-gates/)
- [SonarQube API](https://next.sonarqube.com/sonarqube/web_api)
