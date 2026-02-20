import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as service from "@pulumi/pulumiservice";

const config = new pulumi.Config();

// In most cases, it's safe to assume that this stack is run in the same Pulumi
// org in which the OIDC environment is being configured. If not, set the
// escEnvOrg config to the name of the org where the environment is going to be
// configured.
const escEnvOrg = config.get("escEnvOrg") || pulumi.getOrganization();
const escEnvProject = config.get("escEnvProject") || "gcloud";
const issuer = config.get("issuer") || "https://api.pulumi.com/oidc";

// Get the list of GCP projects from config
const gcpProjectsConfig = config.requireObject<string[]>("gcpProjectIds");

let environments = [];

// Iterate over each GCP project and create resources
gcpProjectsConfig.forEach((gcpProjectId) => {
    // Main ESC env for OIDC - one per project
    const escEnvName = config.get("escEnvName") || `${gcpProjectId}-admin`;

    // We use a shorter name for the Workload Identity Pool and Service Account IDs
    // because they have character limits of 30 and 32 respectively
    const workloadIdentityPoolId = `${gcpProjectId}`;
    const serviceAccountId = workloadIdentityPoolId.replace(/-/g, "").substring(0, 30);

    const randomSuffix = new random.RandomString(`${workloadIdentityPoolId}-randomSuffix`, {
        length: 5,
        lower: true,
        upper: false,
        special: false
    });

    // The Workload Identity Pool id uses a random suffix so that this stack can be
    // brought up and down repeatably: Workload Identity Pools only soft deletes and
    // will auto-purge after 30 days. It is not possible to force a hard delete
    const identityPool = new gcp.iam.WorkloadIdentityPool(`${workloadIdentityPoolId}-pool`, {
        workloadIdentityPoolId:  pulumi.interpolate`${workloadIdentityPoolId}-${randomSuffix.result}`.apply(s => s.substring(0,31)),
        project: gcpProjectId
    });

    const oidcProvider = new gcp.iam.WorkloadIdentityPoolProvider(`${workloadIdentityPoolId}-oidcProvider`, {
        workloadIdentityPoolId: identityPool.workloadIdentityPoolId,
        workloadIdentityPoolProviderId: `pulumi-cloud-${escEnvOrg}-oidc`,
        project: gcpProjectId,
        oidc: {
            issuerUri: issuer,
            allowedAudiences: [
                `gcp:${escEnvOrg}`
            ]
        },
        attributeMapping: {
            "google.subject": "assertion.sub"
        }
    });

    // Enable IAM Credentials API (required for workload identity)
    const enableIamCredsApi = new gcp.projects.Service(`${workloadIdentityPoolId}-enableIamCredentialsApi`, {
        service: "iamcredentials.googleapis.com",
        project: gcpProjectId,
    }, { retainOnDelete: true });

    const serviceAccount = new gcp.serviceaccount.Account(`${workloadIdentityPoolId}-serviceAccount`, {
        accountId: serviceAccountId,
        project: gcpProjectId
    });

    const iamMember = new gcp.projects.IAMMember(`${workloadIdentityPoolId}-iamMember`, {
        member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
        role: "roles/admin",
        project: gcpProjectId
    });

    const iamPolicyBinding = new gcp.serviceaccount.IAMBinding(`${workloadIdentityPoolId}-iambinding`, {
        serviceAccountId: serviceAccount.id,
        role: "roles/iam.workloadIdentityUser",
        members: [pulumi.interpolate`principalSet://iam.googleapis.com/${identityPool.name}/*`]
    });

    // fn::open::gcp-login requires project number instead of project name and needs it to be a number in the YAML
    const projectNumber = gcp.projects.getProjectOutput({
        filter: `name:${gcpProjectId}`
    }).projects[0].number
        .apply(projectNumber => +projectNumber); // this casts it from string to a number

    const envYaml = pulumi.interpolate`
values:
  gcp:
    login:
      fn::open::gcp-login:
        project: ${projectNumber}
        oidc:
          workloadPoolId: ${oidcProvider.workloadIdentityPoolId}
          providerId: ${oidcProvider.workloadIdentityPoolProviderId}
          serviceAccount: ${serviceAccount.email}
        subjectAttributes:
          - currentEnvironment.name
    pulumiConfig:
      gcp:project: \${gcp.login.project}
    environmentVariables:
      GOOGLE_CLOUD_PROJECT: \${gcp.login.project}
      CLOUDSDK_CORE_PROJECT: ${gcpProjectId}
      GOOGLE_OAUTH_ACCESS_TOKEN: \${gcp.login.accessToken}
      CLOUDSDK_AUTH_ACCESS_TOKEN: \${gcp.login.accessToken}
      USE_GKE_GCLOUD_AUTH_PLUGIN: True
`;

    envYaml.apply(s => console.log(JSON.stringify(s)))

    // Create the ESC environment using the Pulumi Service Provider
    const escEnvironment = new service.Environment(`${workloadIdentityPoolId}-escEnv`, {
        organization: escEnvOrg,
        project: escEnvProject,
        name: escEnvName,
        yaml: envYaml
    });
});
