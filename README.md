# GCP OIDC Multi-Project Setup

This Pulumi program automates the configuration of OpenID Connect (OIDC) authentication between Pulumi Cloud and multiple Google Cloud Platform (GCP) projects. It creates Workload Identity Pools, Service Accounts, and Pulumi ESC environments for each specified GCP project.

## Prerequisites

- Node.js and npm installed
- Pulumi CLI installed
- Authenticated to Pulumi Cloud (`pulumi login`)
- GCP credentials with permissions to:
  - Create Workload Identity Pools
  - Create Service Accounts
  - Manage IAM bindings
  - Enable APIs

## Configuration

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure GCP Projects

The program requires a list of GCP project IDs. Configure them using one of these methods:

#### Option A: Using Pulumi Config (Local Configuration)

```bash
# Add a single project
pulumi config set gcpProjectIds '["my-gcp-project-1"]'

# Add multiple projects
pulumi config set gcpProjectIds '["my-gcp-project-1", "my-gcp-project-2", "my-gcp-project-3"]'
```

#### Option B: Edit Stack Config File Directly

Edit `Pulumi.<stack-name>.yaml`:

```yaml
config:
  gcp-oidc-multi:gcpProjectIds:
    - my-gcp-project-1
    - my-gcp-project-2
    - my-gcp-project-3
```

### 3. Optional Configuration

Customize additional settings:

```bash
# Set custom ESC organization (defaults to current org)
pulumi config set escEnvOrg my-pulumi-org

# Set custom ESC project (defaults to "gcloud")
pulumi config set escEnvProject my-esc-project

# Set custom OIDC issuer (defaults to Pulumi Cloud)
pulumi config set issuer https://api.pulumi.com/oidc

# Set custom ESC environment name pattern (defaults to "{gcpProjectId}-admin")
pulumi config set escEnvName custom-env-name
```

## Running the Program

### Deploy All Resources

```bash
pulumi up
```

This will:
1. Create a Workload Identity Pool for each GCP project
2. Create an OIDC provider linked to Pulumi Cloud
3. Create a service account with admin role
4. Configure IAM bindings for workload identity
5. Enable the IAM Credentials API
6. Create a Pulumi ESC environment with OIDC configuration

### Preview Changes

```bash
pulumi preview
```

### Destroy Resources

```bash
pulumi destroy
```

**Note:** Workload Identity Pools are soft-deleted and auto-purge after 30 days. The program uses random suffixes to allow repeated deployments.

## Converting to Pulumi ESC

You can migrate your local stack configuration to Pulumi ESC (Environments, Secrets, and Configuration) for centralized configuration management.

### Using `pulumi config env init`

The `pulumi config env init` command automatically converts your local configuration to an ESC environment:

```bash
# Create an ESC environment from your current stack config
pulumi config env init my-org/my-project/my-environment

# The command will:
# 1. Create a new ESC environment at the specified path
# 2. Convert all stack config values to ESC format
# 3. Link the environment to your stack
```

### Manual ESC Conversion

Alternatively, create an ESC environment manually:

1. **Create the ESC environment:**

```bash
pulumi env init my-org/gcp-config/multi-project
```

2. **Edit the environment:**

```bash
pulumi env edit my-org/gcp-config/multi-project
```

3. **Add your configuration:**

```yaml
values:
  gcpProjectIds:
    - my-gcp-project-1
    - my-gcp-project-2
    - my-gcp-project-3
  escEnvOrg: my-pulumi-org
  escEnvProject: gcloud
  pulumiConfig:
    gcp-oidc-multi:gcpProjectIds: ${gcpProjectIds}
    gcp-oidc-multi:escEnvOrg: ${escEnvOrg}
    gcp-oidc-multi:escEnvProject: ${escEnvProject}
```

4. **Import the environment in your stack:**

Edit `Pulumi.<stack-name>.yaml`:

```yaml
environment:
  - my-org/gcp-config/multi-project
```

5. **Remove local config values:**

```bash
pulumi config rm gcpProjectIds
pulumi config rm escEnvOrg
pulumi config rm escEnvProject
```

### Benefits of Using ESC

- **Centralized Configuration:** Share configuration across multiple stacks
- **Secret Management:** Securely store sensitive values
- **Dynamic Values:** Use ESC functions for computed values
- **Version Control:** Track configuration changes separately from code
- **RBAC:** Control access to sensitive configuration

## Output Resources

For each GCP project, the program creates:

- **Workload Identity Pool:** `{projectId}-pool-{randomSuffix}`
- **OIDC Provider:** `pulumi-cloud-{orgName}-oidc`
- **Service Account:** `{projectId}` (with hyphens removed, truncated to 30 chars)
- **ESC Environment:** `{projectId}-admin` (or custom name)

## Example Workflow

```bash
# 1. Clone and setup
git clone <repo-url>
cd gcp-oidc
npm install

# 2. Configure projects
pulumi config set gcpProjectIds '["project-alpha", "project-beta"]'

# 3. Deploy
pulumi up

# 4. (Optional) Migrate to ESC
pulumi config env init my-org/gcp-config/production

# 5. Verify ESC environments were created
# Check Pulumi Cloud console or use:
esc env ls
```

## Troubleshooting

### Permission Errors

Ensure your GCP credentials have the following roles:
- `roles/iam.workloadIdentityPoolAdmin`
- `roles/iam.serviceAccountAdmin`
- `roles/resourcemanager.projectIamAdmin`
- `roles/serviceusage.serviceUsageAdmin`

### Workload Identity Pool Already Exists

If you get a "already exists" error, it may be soft-deleted. Wait 30 days or use a different project. The random suffix helps avoid this issue.

### ESC Environment Creation Failed

Ensure you have permissions in the Pulumi organization to create ESC environments.

## Additional Resources

- [Pulumi ESC Documentation](https://www.pulumi.com/docs/esc/)
- [GCP Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation)
- [Pulumi OIDC Trust](https://www.pulumi.com/docs/pulumi-cloud/oidc/)
