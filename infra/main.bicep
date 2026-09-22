// ---------------------------------------------------------------------------
// Baltic Summit ticketing — Azure infrastructure.
//
// Creates:
//   * Log Analytics workspace           (Container Apps logs)
//   * Container Apps managed environment
//   * PostgreSQL Flexible Server + database
//   * Container App running the API, the MCP server and the web UI
//
// The container registry is created separately by infra/registry.bicep so the
// image exists before this template runs. See scripts/deploy-azure.sh.
// ---------------------------------------------------------------------------

@description('Prefix for generated resource names. Lower-case letters and digits.')
@minLength(3)
@maxLength(17)
param namePrefix string = 'balticsummit'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Name of the existing container registry (output of registry.bicep).')
param registryName string

@description('Fully qualified image reference, e.g. myacr.azurecr.io/baltic-tickets:2026-09-22.')
param containerImage string

@description('PostgreSQL administrator login.')
param postgresAdminUser string = 'balticadmin'

@description('PostgreSQL administrator password. Minimum 8 characters.')
@secure()
@minLength(8)
param postgresAdminPassword string

@description('Optional shared secret for the /mcp endpoint. Leave empty to keep MCP open (no authentication).')
@secure()
param mcpApiKey string = ''

@description('Prefix used for printed ticket numbers, e.g. BS26 gives BS26-00042.')
param ticketPrefix string = 'BS26'

@description('Minimum replicas. Keep at 1 so agents never hit a cold start on the MCP endpoint; 0 is cheaper but adds latency to the first call.')
@minValue(0)
@maxValue(10)
param minReplicas int = 1

@description('Maximum replicas. The MCP endpoint is stateless, so it scales out safely.')
@minValue(1)
@maxValue(30)
param maxReplicas int = 3

@description('PostgreSQL compute tier. Burstable B1ms is the cheapest option that fits this workload.')
param postgresSkuName string = 'Standard_B1ms'

var suffix = uniqueString(resourceGroup().id)
var postgresServerName = take(toLower('${namePrefix}-pg-${suffix}'), 60)
var databaseName = 'baltic_tickets'
var containerAppName = take(toLower('${namePrefix}-tickets'), 32)

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: take('${namePrefix}-logs-${suffix}', 63)
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: postgresAdminUser
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// Lets the Container App (and other Azure services) reach the server. This is
// the 0.0.0.0 sentinel rule, which means "Azure services", not "the internet".
resource allowAzureServices 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAllAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Container Apps
// ---------------------------------------------------------------------------
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: registryName
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: take('${namePrefix}-env-${suffix}', 60)
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// uriComponent() escapes characters that would otherwise break the connection
// string, so the admin password does not have to be URL-safe.
var databaseUrl = 'postgresql://${postgresAdminUser}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${databaseName}?sslmode=require'

// The MCP secret and its env var are only emitted when a key was supplied.
// Container Apps rejects a secret with an empty value, so the open, no-auth
// deployment must not declare one at all.
var hasMcpApiKey = !empty(mcpApiKey)

var mcpApiKeySecret = hasMcpApiKey
  ? [
      {
        name: 'mcp-api-key'
        value: mcpApiKey
      }
    ]
  : []

var mcpApiKeyEnv = hasMcpApiKey
  ? [
      {
        name: 'MCP_API_KEY'
        secretRef: 'mcp-api-key'
      }
    ]
  : []

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: containerAppName
  location: location
  dependsOn: [
    database
    allowAzureServices
  ]
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
        allowInsecure: false
        traffic: [
          {
            latestRevision: true
            weight: 100
          }
        ]
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      secrets: concat(
        [
          {
            name: 'database-url'
            value: databaseUrl
          }
          {
            name: 'registry-password'
            value: registry.listCredentials().passwords[0].value
          }
        ],
        mcpApiKeySecret
      )
      registries: [
        {
          server: registry.properties.loginServer
          username: registry.listCredentials().username
          passwordSecretRef: 'registry-password'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'ticketing'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat([
            {
              name: 'DATABASE_URL'
              secretRef: 'database-url'
            }
            {
              name: 'PORT'
              value: '8080'
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'TICKET_PREFIX'
              value: ticketPrefix
            }
            {
              name: 'CORS_ORIGINS'
              value: '*'
            }
            {
              name: 'PUBLIC_BASE_URL'
              value: 'https://${containerAppName}.${containerEnv.properties.defaultDomain}'
            }
          ], mcpApiKeyEnv)
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: 8080
              }
              initialDelaySeconds: 15
              periodSeconds: 30
              failureThreshold: 3
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/readyz'
                port: 8080
              }
              initialDelaySeconds: 10
              periodSeconds: 15
              failureThreshold: 6
            }
          ]
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: maxReplicas
        rules: [
          {
            name: 'http-concurrency'
            http: {
              metadata: {
                concurrentRequests: '40'
              }
            }
          }
        ]
      }
    }
  }
}

@description('Public base URL of the deployed application.')
output appUrl string = 'https://${containerApp.properties.configuration.ingress.fqdn}'

@description('MCP endpoint to register in Copilot Studio and Azure AI Foundry.')
output mcpEndpoint string = 'https://${containerApp.properties.configuration.ingress.fqdn}/mcp'

@description('Host name only — needed for the Copilot Studio custom connector.')
output mcpHost string = containerApp.properties.configuration.ingress.fqdn

@description('PostgreSQL server FQDN.')
output postgresHost string = postgres.properties.fullyQualifiedDomainName

@description('Whether the MCP endpoint requires an API key.')
output mcpAuthMode string = hasMcpApiKey ? 'api-key' : 'open'
