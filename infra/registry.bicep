// ---------------------------------------------------------------------------
// Phase 1 of the deployment: the container registry only.
//
// It is split out because the image has to exist before the Container App that
// runs it can be created. scripts/deploy-azure.sh deploys this, builds the
// image into it with `az acr build`, and only then deploys main.bicep.
// ---------------------------------------------------------------------------

@description('Prefix for generated resource names. Lower-case letters and digits.')
@minLength(3)
@maxLength(17)
param namePrefix string = 'balticsummit'

@description('Azure region for all resources.')
param location string = resourceGroup().location

// namePrefix is 3-17 characters and uniqueString() returns 13, so the result is
// always 19-33 characters — inside the 5-50 range a registry name allows.
var registryName = toLower(replace('${namePrefix}acr${uniqueString(resourceGroup().id)}', '-', ''))

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: registryName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    // The Container App pulls with these credentials. To use a managed identity
    // instead, set this to false and grant the app's identity AcrPull — see the
    // "Hardening" section of the README.
    adminUserEnabled: true
  }
}

output registryName string = registry.name
output registryLoginServer string = registry.properties.loginServer
