# Deployment Guide — Build & publish facilitator images (manual)

This guide explains how to manually build, tag, sign, push, and deploy the `facilitator-amoy` Docker image. It covers both GitHub Container Registry (GHCR) and Google Artifact Registry (GCP), plus examples for running locally (docker/dcompose) and on Kubernetes. Use manual publishing when you want explicit control over when images are released.

Prerequisites
- Docker installed and running
- git access to repo
- (For GHCR) a GitHub account and a Personal Access Token (PAT) with `write:packages` scope
- (For GCP) a service account key with Artifact Registry permissions
- cosign installed (optional, for signing images)

Repository layout
- Dockerfile: `demo/facilitator-amoy.Dockerfile`
- App sources: `demo/a2a/facilitator-amoy/`

1) Build the image locally

From the repository root:

```bash
# Build image locally and tag with commit SHA
SHA=$(git rev-parse --short HEAD)
docker build -f demo/facilitator-amoy.Dockerfile -t x402/facilitator-amoy:${SHA} .
```

2) Tag semver (optional)

Decide a semver tag (e.g., `v1.2.3`) when you want to publish a release.

```bash
docker tag x402/facilitator-amoy:${SHA} ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
docker tag x402/facilitator-amoy:${SHA} ghcr.io/<OWNER>/x402-facilitator-amoy:sha-${SHA}
```

3) Sign the image (optional but recommended)

Using cosign:

```bash
# keyless (OIDC) or with key:
cosign sign ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
# Or with local key
cosign sign --key cosign.key ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
```

4a) Push to GitHub Container Registry (GHCR)

Login and push:

```bash
# login (personal PAT) - recommended to store in a credential helper
echo $GHCR_PAT | docker login ghcr.io -u <GH_USER> --password-stdin

docker push ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
docker push ghcr.io/<OWNER>/x402-facilitator-amoy:sha-${SHA}
```

4b) Push to Google Artifact Registry (GCP)

```bash
# Authenticate gcloud first (or use service account key)
gcloud auth activate-service-account --key-file=sa-key.json
gcloud auth configure-docker --quiet ${REGION}-docker.pkg.dev

docker tag x402/facilitator-amoy:${SHA} ${REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPOSITORY}/x402-facilitator-amoy:v1.2.3
docker push ${REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPOSITORY}/x402-facilitator-amoy:v1.2.3
```

5) Verify pushed image and digest

GHCR example:
```bash
docker manifest inspect ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
```

GCP example:
```bash
gcloud artifacts docker images list ${REGION}-docker.pkg.dev/${GCP_PROJECT}/${REPOSITORY} --include-tags
```

6) Deploy (examples)

- Docker run (local testing):
```bash
docker run -d --name facilitator-prod \
  -e FACILITATOR_PRIVATE_KEY="<KEY>" \
  -e AMOY_RPC_URL="https://rpc-amoy..." \
  -e AMOY_USDC_ADDRESS="0x..." \
  -e REAL_SETTLE=true \
  -p 5401:5401 ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
```

- Docker Compose (single host):
```yaml
version: '3.8'
services:
  facilitator:
    image: ghcr.io/<OWNER>/x402-facilitator-amoy:v1.2.3
    restart: unless-stopped
    environment:
      - FACILITATOR_PRIVATE_KEY=${FACILITATOR_PRIVATE_KEY}
      - AMOY_RPC_URL=${AMOY_RPC_URL}
      - AMOY_USDC_ADDRESS=${AMOY_USDC_ADDRESS}
      - REAL_SETTLE=true
    ports:
      - "5401:5401"
```

- Kubernetes (Deployment example):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: facilitator
spec:
  replicas: 2
  selector:
    matchLabels:
      app: facilitator
  template:
    metadata:
      labels:
        app: facilitator
    spec:
      containers:
        - name: facilitator
          image: ${IMAGE_URI}
          env:
            - name: FACILITATOR_PRIVATE_KEY
              valueFrom:
                secretKeyRef:
                  name: facilitator-secrets
                  key: FACILITATOR_PRIVATE_KEY
            - name: AMOY_RPC_URL
              value: ${AMOY_RPC_URL}
          ports:
            - containerPort: 5401
```

Use immutable tags in your manifests (e.g., `v1.2.3` or `sha-...`) — do not use `latest` in production.

7) Rollback
- To roll back, update the deployment image reference to a previous tag and redeploy:

```bash
kubectl set image deployment/facilitator facilitator=${IMAGE_URI}:v1.2.2 -n facilitator-namespace
```

8) CI integration (manual publish policy)
- Keep CI builds/tests running on push/PR, but change publish workflow to run only on `workflow_dispatch` or on tag pushes (we already updated `.github/workflows/facilitator-build.yml` in this repo to use tag + manual).

9) Security & best practices
- Never commit secrets (private keys, RPC tokens) to the repo. Use repo secrets or cloud secret manager.
- Sign images using cosign; enable scanning in the registry.
- Keep images immutable and record release notes (image tags → commit SHA → changelog).

10) Helpful commands
- Build: `docker build -f demo/facilitator-amoy.Dockerfile -t x402/facilitator-amoy:local .`
- Tag: `docker tag <src> <dst>`
- Push: `docker push <dst>`
- Inspect: `docker manifest inspect <image>` or `gcloud artifacts docker images list ...`
- Remove local image: `docker rmi <image>`

---

If you want I can:
- Add a `scripts/release.sh` to automate build/tag/push for either GHCR or GCP, or
- Create a `RELEASES.md` template to track published image URIs and digests. 

## Versioning, release process and deployment policy

This section documents our recommended versioning and release procedure so images are built and published only when explicitly released.

1) Versioning policy
- Use Semantic Versioning for public releases (vMAJOR.MINOR.PATCH), e.g. `v1.2.3`.
- Also publish an immutable short-SHA tag (e.g., `sha-0245b74`) for traceability.

2) Release process (manual + CI)
- Prepare changes and run tests locally. Update `CHANGELOG.md` with release notes.
- Create an annotated git tag for the release:
  ```bash
  git tag -a v1.2.3 -m "release(v1.2.3): short summary"
  git push origin v1.2.3
  ```
- Pushing a `v*.*.*` tag triggers the publish workflow (our build/publish workflow is restricted to semver tags and manual dispatch). The workflow will:
  - build the image from the exact commit referenced by the tag
  - tag images with the semver tag and the short SHA
  - sign the image with cosign (if configured) and push to the registry

3) Manual publish (workflow dispatch)
- For ad-hoc publishing without tagging, use the GitHub Actions manual dispatch UI on the `Build and publish facilitator image` workflow. This requires an authorized user to manually trigger and approve the publish.

4) Protecting publish credentials
- Store registry credentials (GHCR PAT or GCP service account key) in GitHub Secrets and restrict their usage to the publish workflow only. Use environments and required reviewers for extra protection.

5) Deployment policy
- Deploy by referencing immutable tags (semver or sha) in your compose or k8s manifests — never `latest`.
- Use a staging environment before production and run automated integration tests against the staged image.
- When ready, update production manifests to the new tag and deploy.

6) Rollback policy
- Maintain a `RELEASES.md` (or GitHub Releases) mapping tags → image URIs → digests → changelog. To rollback, update your deployment to the previous tag and redeploy.

7) Automation scripts (optional)
- `scripts/release.sh` (developer-run) - automates local tests, creates tag, pushes tag to origin.
- `scripts/publish.sh` (CI-run) - builds and pushes image given a tag or SHA.

8) Audit & monitoring
- Enable registry vulnerability scanning and image immutability where possible.
- Monitor facilitator health (`/healthz`), logs, and on‑chain settlement failures (alert on 5xx responses or low balances).

This policy ensures images are only published when explicitly requested (via tag or manual workflow dispatch), reducing accidental publishes on regular code pushes. 